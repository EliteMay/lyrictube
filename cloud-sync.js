(() => {
  "use strict";

  const API_URL = "https://ctktkyxuzkrsigwoswoc.supabase.co/functions/v1/lyrictube-api";
  const RETRY_MS = 3500;
  let timer = null;
  let retryTimer = null;
  let saving = false;

  const pending = {
    replaceLibrary: null,
    songs: new Map(),
    deletedSongs: new Set(),
    playlists: new Map(),
    deletedPlaylists: new Set(),
    state: null,
  };

  function profiles() {
    return window.LyricTubeProfiles || null;
  }

  function currentSession() {
    try { return profiles()?.readCloudSession?.() || null; } catch { return null; }
  }

  async function api(action, payload = {}) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...payload }),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  function mergeDelta(delta) {
    if (!delta || typeof delta !== "object") return;
    if (delta.replaceLibrary) {
      pending.replaceLibrary = delta.replaceLibrary;
      pending.songs.clear();
      pending.deletedSongs.clear();
      pending.playlists.clear();
      pending.deletedPlaylists.clear();
      pending.state = null;
      return;
    }

    if (pending.replaceLibrary) {
      const p = profiles();
      const raw = p?.nativeGetItem?.(localStorage, p.roleStorageKey?.());
      try { pending.replaceLibrary = raw ? JSON.parse(raw) : pending.replaceLibrary; } catch {}
      return;
    }

    for (const item of delta.upsertSongs || []) {
      const id = String(item?.song?.id || "");
      if (!id) continue;
      pending.songs.set(id, item);
      pending.deletedSongs.delete(id);
    }
    for (const idValue of delta.deleteSongIds || []) {
      const id = String(idValue || "");
      if (!id) continue;
      pending.songs.delete(id);
      pending.deletedSongs.add(id);
    }

    for (const item of delta.upsertPlaylists || []) {
      const id = String(item?.playlist?.id || "");
      if (!id) continue;
      pending.playlists.set(id, item);
      pending.deletedPlaylists.delete(id);
    }
    for (const idValue of delta.deletePlaylistIds || []) {
      const id = String(idValue || "");
      if (!id) continue;
      pending.playlists.delete(id);
      pending.deletedPlaylists.add(id);
    }

    if (delta.state) pending.state = delta.state;
  }

  function hasPending() {
    return !!pending.replaceLibrary || pending.songs.size > 0 || pending.deletedSongs.size > 0 || pending.playlists.size > 0 || pending.deletedPlaylists.size > 0 || !!pending.state;
  }

  function takePending() {
    if (pending.replaceLibrary) {
      const snapshot = { replaceLibrary: pending.replaceLibrary };
      pending.replaceLibrary = null;
      return snapshot;
    }
    const snapshot = {
      upsertSongs: [...pending.songs.values()],
      deleteSongIds: [...pending.deletedSongs],
      upsertPlaylists: [...pending.playlists.values()],
      deletePlaylistIds: [...pending.deletedPlaylists],
      state: pending.state,
    };
    pending.songs.clear();
    pending.deletedSongs.clear();
    pending.playlists.clear();
    pending.deletedPlaylists.clear();
    pending.state = null;
    return snapshot;
  }

  function restoreSnapshot(snapshot) {
    if (snapshot?.replaceLibrary) {
      pending.replaceLibrary = snapshot.replaceLibrary;
      return;
    }
    mergeDelta(snapshot);
  }

  function schedule(delay = 900) {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  async function flush() {
    if (saving || !hasPending()) return;
    const session = currentSession();
    if (!session?.token || profiles()?.currentRole?.() !== "cloud") return;

    const snapshot = takePending();
    saving = true;
    document.documentElement.dataset.cloudSync = "saving";
    try {
      if (snapshot.replaceLibrary) {
        await api("replace_library", { token: session.token, library: snapshot.replaceLibrary });
      } else {
        await api("sync_changes", { token: session.token, changes: snapshot });
      }
      document.documentElement.dataset.cloudSync = "saved";
      clearTimeout(retryTimer);
      if (hasPending()) schedule(250);
    } catch (error) {
      console.error("[LyricTube] partial cloud sync failed", error);
      restoreSnapshot(snapshot);
      document.documentElement.dataset.cloudSync = "error";
      clearTimeout(retryTimer);
      retryTimer = setTimeout(flush, RETRY_MS);
    } finally {
      saving = false;
    }
  }

  document.addEventListener("lyrictube:cloud-library-delta", event => {
    if (profiles()?.currentRole?.() !== "cloud") return;
    mergeDelta(event.detail);
    schedule();
  });

  window.addEventListener("online", () => { if (hasPending()) schedule(100); });
  window.addEventListener("pagehide", () => { if (hasPending()) flush(); });

  window.LyricTubeCloudSync = Object.freeze({ flush, hasPending });
})();