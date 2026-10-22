import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const fail = (message: string, status = 400) => json({ ok: false, error: message }, status);
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Plain registration key is never stored in the public frontend or repository.
// Only its SHA-256 digest is compared inside this server-side function.
const SIGNUP_KEY_SHA256 = Deno.env.get("LYRICTUBE_SIGNUP_KEY_SHA256") ?? "";
const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_BLOCK_MS = 15 * 60 * 1000;
const SIGNUP_MAX_FAILURES = 5;
const MAX_JSON_BYTES = 4 * 1024 * 1024;

function newPasswordError(value: string) {
  if (value.length < 8 || value.length > 128) return "パスワードは8〜128文字で入力してください";
  if (new TextEncoder().encode(value).byteLength > 72) return "パスワードはUTF-8で72バイト以内にしてください";
  return "";
}

async function readJsonBounded(req: Request): Promise<any> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > MAX_JSON_BYTES) throw new RangeError("payload too large");
  const reader = req.body?.getReader();
  if (!reader) throw new SyntaxError("missing json");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new RangeError("payload too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function reauthenticate(account: { id: string; username: string }, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || !password) return false;
  const { data, error } = await supabase.rpc("lyrictube_login_check", {
    p_username: account.username,
    p_password: password,
  });
  return !error && Array.isArray(data) && data.some((row: any) => row.id === account.id);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function usableLibrary(value: any) {
  return value && typeof value === "object" && Array.isArray(value.songs) && Array.isArray(value.playlists || []);
}
async function createSession(accountId: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const { error } = await supabase.from("lyrictube_sessions").insert({
    account_id: accountId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  });
  if (error) throw error;
  return token;
}
async function sessionAccount(token?: string) {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await supabase
    .from("lyrictube_sessions")
    .select("account_id, expires_at, lyrictube_accounts(id, username, display_name, is_admin)")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return (data as any).lyrictube_accounts;
}
async function loadLibrary(accountId: string) {
  const [songsRes, playlistsRes, stateRes] = await Promise.all([
    supabase.from("lyrictube_songs").select("song, sort_order").eq("account_id", accountId).order("sort_order", { ascending: true }),
    supabase.from("lyrictube_playlists").select("playlist, sort_order").eq("account_id", accountId).order("sort_order", { ascending: true }),
    supabase.from("lyrictube_account_state").select("library_version, settings, exported_at, updated_at").eq("account_id", accountId).maybeSingle(),
  ]);
  const error = songsRes.error || playlistsRes.error || stateRes.error;
  if (error) throw error;
  const state: any = stateRes.data || {};
  const library: any = {
    version: Number(state.library_version || 3),
    songs: (songsRes.data || []).map((row: any) => row.song),
    playlists: (playlistsRes.data || []).map((row: any) => row.playlist),
    settings: state.settings || {},
  };
  if (state.exported_at) library.exportedAt = state.exported_at;
  return { library, updatedAt: state.updated_at || null };
}
async function replaceLibrary(accountId: string, library: any) {
  if (!usableLibrary(library)) throw new Error("ライブラリ形式が不正です");
  const { error } = await supabase.rpc("lyrictube_replace_library", { p_account_id: accountId, p_library: library });
  if (error) throw error;
}
function requestIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return String(req.headers.get("cf-connecting-ip") || forwarded.split(",")[0] || "unknown").trim().slice(0, 128) || "unknown";
}
async function signupRateKey(req: Request) {
  return `signup:${await sha256(requestIp(req))}`;
}
async function signupRateAllowed(rateKey: string) {
  const { data, error } = await supabase
    .from("lyrictube_login_rate_limits")
    .select("attempts, window_started_at, blocked_until")
    .eq("rate_key", rateKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return true;
  const now = Date.now();
  const blockedUntil = data.blocked_until ? Date.parse(data.blocked_until) : 0;
  if (blockedUntil > now) return false;
  const started = Date.parse(data.window_started_at || "");
  if (!Number.isFinite(started) || started < now - SIGNUP_WINDOW_MS) {
    await supabase.from("lyrictube_login_rate_limits").delete().eq("rate_key", rateKey);
  }
  return true;
}
async function recordSignupFailure(rateKey: string) {
  const { data, error } = await supabase
    .from("lyrictube_login_rate_limits")
    .select("attempts, window_started_at, blocked_until")
    .eq("rate_key", rateKey)
    .maybeSingle();
  if (error) throw error;
  const now = Date.now();
  const started = data?.window_started_at ? Date.parse(data.window_started_at) : 0;
  const freshWindow = !data || !Number.isFinite(started) || started < now - SIGNUP_WINDOW_MS;
  const attempts = freshWindow ? 1 : Number(data?.attempts || 0) + 1;
  const windowStartedAt = freshWindow ? new Date(now).toISOString() : data!.window_started_at;
  const blockedUntil = attempts >= SIGNUP_MAX_FAILURES ? new Date(now + SIGNUP_BLOCK_MS).toISOString() : (freshWindow ? null : data?.blocked_until || null);
  const { error: upsertError } = await supabase.from("lyrictube_login_rate_limits").upsert({
    rate_key: rateKey,
    attempts,
    window_started_at: windowStartedAt,
    blocked_until: blockedUntil,
    updated_at: new Date(now).toISOString(),
  }, { onConflict: "rate_key" });
  if (upsertError) throw upsertError;
}
async function clearSignupFailures(rateKey: string) {
  const { error } = await supabase.from("lyrictube_login_rate_limits").delete().eq("rate_key", rateKey);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);

  let body: any;
  try { body = await readJsonBounded(req); }
  catch (error) {
    return error instanceof RangeError ? fail("リクエストが大きすぎます", 413) : fail("invalid json");
  }
  const action = String(body?.action || "");

  try {
    if (action === "login") {
      const username = String(body?.username || "").trim();
      const password = String(body?.password || "");
      if (!username || !password) return fail("ユーザー名とパスワードが必要です");
      const { data, error } = await supabase.rpc("lyrictube_login_check", { p_username: username, p_password: password });
      if (error || !Array.isArray(data) || !data.length) return fail("ユーザー名かパスワードが違います", 401);
      const account = data[0];
      const token = await createSession(account.id);
      return json({ ok: true, token, account: { id: account.id, username: account.username, displayName: account.display_name, isAdmin: account.is_admin } });
    }

    if (action === "register_account") {
      const username = String(body?.username || "").trim();
      const displayName = String(body?.displayName || "").trim();
      const password = String(body?.password || "");
      const creationKey = String(body?.creationKey || "");
      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username)) return fail("アカウント名は3〜24文字の英数字・._-で入力してください");
      if (displayName.length > 40) return fail("表示名は40文字以内にしてください");
      const invalidPassword = newPasswordError(password);
      if (invalidPassword) return fail(invalidPassword);
      if (!creationKey) return fail("アカウント作成キーが必要です");
      if (!/^[0-9a-f]{64}$/i.test(SIGNUP_KEY_SHA256)) return fail("登録設定を確認してください", 503);

      const rateKey = await signupRateKey(req);
      if (!(await signupRateAllowed(rateKey))) return fail("作成キーの試行回数が多すぎます。15分ほど待ってから試してください", 429);

      const suppliedHash = await sha256(creationKey);
      if (!safeEqual(suppliedHash, SIGNUP_KEY_SHA256)) {
        await recordSignupFailure(rateKey);
        return fail("アカウント作成キーが違います", 403);
      }
      await clearSignupFailures(rateKey);

      const { data, error } = await supabase.rpc("lyrictube_register_account", {
        p_username: username,
        p_display_name: displayName,
        p_password: password,
      });
      if (error || !data) {
        if ((error as any)?.code === "23505") return fail("そのアカウント名はすでに使われています", 409);
        console.error("[lyrictube-api] register_account rpc", error);
        return fail("アカウントを作成できませんでした", 500);
      }

      const newId = String(data);
      const token = await createSession(newId);
      return json({ ok: true, token, account: { id: newId, username, displayName: displayName || username, isAdmin: false }, created: true });
    }

    const account: any = await sessionAccount(String(body?.token || ""));
    if (!account) return fail("ログインが必要です", 401);

    if (action === "load_library") {
      const loaded = await loadLibrary(account.id);
      return json({ ok: true, ...loaded, account });
    }

    if (action === "save_library" || action === "replace_library") {
      await replaceLibrary(account.id, body?.library);
      return json({ ok: true, mode: "replace" });
    }

    if (action === "sync_changes") {
      const changes = body?.changes || {};
      const upsertSongs = Array.isArray(changes.upsertSongs) ? changes.upsertSongs : [];
      const deleteSongIds = Array.isArray(changes.deleteSongIds) ? changes.deleteSongIds.map(String).filter(Boolean) : [];
      const upsertPlaylists = Array.isArray(changes.upsertPlaylists) ? changes.upsertPlaylists : [];
      const deletePlaylistIds = Array.isArray(changes.deletePlaylistIds) ? changes.deletePlaylistIds.map(String).filter(Boolean) : [];
      const now = new Date().toISOString();
      const jobs: PromiseLike<any>[] = [];

      if (upsertSongs.length) {
        const rows = upsertSongs.map((item: any) => ({
          account_id: account.id,
          song_id: String(item?.song?.id || item?.id || ""),
          song: item?.song,
          sort_order: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : 0,
          updated_at: now,
        })).filter((row: any) => row.song_id && row.song && typeof row.song === "object");
        if (rows.length) jobs.push(supabase.from("lyrictube_songs").upsert(rows, { onConflict: "account_id,song_id" }));
      }
      if (deleteSongIds.length) jobs.push(supabase.from("lyrictube_songs").delete().eq("account_id", account.id).in("song_id", deleteSongIds));

      if (upsertPlaylists.length) {
        const rows = upsertPlaylists.map((item: any) => ({
          account_id: account.id,
          playlist_id: String(item?.playlist?.id || item?.id || ""),
          playlist: item?.playlist,
          sort_order: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : 0,
          updated_at: now,
        })).filter((row: any) => row.playlist_id && row.playlist && typeof row.playlist === "object");
        if (rows.length) jobs.push(supabase.from("lyrictube_playlists").upsert(rows, { onConflict: "account_id,playlist_id" }));
      }
      if (deletePlaylistIds.length) jobs.push(supabase.from("lyrictube_playlists").delete().eq("account_id", account.id).in("playlist_id", deletePlaylistIds));

      if (changes.state && typeof changes.state === "object") {
        jobs.push(supabase.rpc("lyrictube_touch_state", {
          p_account_id: account.id,
          p_version: Number(changes.state.version || 3),
          p_settings: changes.state.settings || {},
          p_exported_at: changes.state.exportedAt == null ? null : String(changes.state.exportedAt),
        }));
      }

      const results = await Promise.all(jobs);
      const firstError = results.find((result: any) => result?.error)?.error;
      if (firstError) throw firstError;
      return json({ ok: true, mode: "partial", counts: { songsUpserted: upsertSongs.length, songsDeleted: deleteSongIds.length, playlistsUpserted: upsertPlaylists.length, playlistsDeleted: deletePlaylistIds.length, stateUpdated: !!changes.state } });
    }

    if (action === "list_accounts") {
      if (!account.is_admin) return fail("管理者専用です", 403);
      const { data, error } = await supabase.from("lyrictube_accounts").select("id, username, display_name, is_admin, created_at, updated_at").order("created_at");
      if (error) throw error;
      return json({ ok: true, accounts: data || [] });
    }

    if (action === "create_account") {
      if (!account.is_admin) return fail("管理者専用です", 403);
      const username = String(body?.username || "").trim();
      const displayName = String(body?.displayName || username).trim();
      const password = String(body?.password || "");
      const cloneCurrent = body?.cloneCurrent === true;
      if (!username || username.length > 40 || !password) return fail("ユーザー名とパスワードを確認してください");
      const invalidPassword = newPasswordError(password);
      if (invalidPassword) return fail(invalidPassword);
      const { data, error } = await supabase.rpc("lyrictube_create_account", { p_username: username, p_display_name: displayName, p_password: password });
      if (error || !data) return fail("アカウントを作成できません。ユーザー名が重複している可能性があります");
      const newId = String(data);
      if (cloneCurrent) {
        const { error: cloneError } = await supabase.rpc("lyrictube_clone_library", { p_source_account_id: account.id, p_target_account_id: newId });
        if (cloneError) throw cloneError;
      } else {
        const { error: stateError } = await supabase.from("lyrictube_account_state").upsert({ account_id: newId, library_version: 3, settings: {}, updated_at: new Date().toISOString() });
        if (stateError) throw stateError;
      }
      return json({ ok: true, id: newId });
    }

    if (action === "change_password") {
      const targetId = String(body?.accountId || account.id);
      if (targetId !== account.id && !account.is_admin) return fail("権限がありません", 403);
      const password = String(body?.password || "");
      const invalidPassword = newPasswordError(password);
      if (invalidPassword) return fail(invalidPassword);
      if (!(await reauthenticate(account, body?.currentPassword))) return fail("現在のパスワードを確認できませんでした", 401);
      const { error } = await supabase.rpc("lyrictube_set_password", { p_account_id: targetId, p_password: password });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete_account") {
      if (!account.is_admin) return fail("管理者専用です", 403);
      const targetId = String(body?.accountId || "");
      if (!targetId || targetId === account.id) return fail("自分自身は削除できません");
      if (!(await reauthenticate(account, body?.currentPassword))) return fail("現在のパスワードを確認できませんでした", 401);
      const { error } = await supabase.from("lyrictube_accounts").delete().eq("id", targetId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "logout") {
      const tokenHash = await sha256(String(body?.token || ""));
      const { error } = await supabase.from("lyrictube_sessions").delete().eq("token_hash", tokenHash);
      if (error) throw error;
      return json({ ok: true });
    }

    return fail("unknown action", 404);
  } catch (error) {
    console.error("[lyrictube-api]", action, error);
    return fail("サーバー処理に失敗しました", 500);
  }
});