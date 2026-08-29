from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = "20260829-10"
DISPLAY = "v0.10.0"


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def write(name: str, text: str) -> None:
    (ROOT / name).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"required pattern not found: {label}")
    return text.replace(old, new, 1)


def replace_function(text: str, name: str, replacement: str) -> str:
    marker = f"function {name}("
    start = text.find(marker)
    if start < 0:
        raise RuntimeError(f"function not found: {name}")
    brace = text.find("{", start)
    if brace < 0:
        raise RuntimeError(f"function brace not found: {name}")

    depth = 0
    quote = None
    escape = False
    line_comment = False
    block_comment = False
    i = brace
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
                continue
            i += 1
            continue
        if quote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                return text[:start] + replacement + text[end:]
        i += 1
    raise RuntimeError(f"unterminated function: {name}")


def refactor_index() -> None:
    text = read("index.html")
    text = re.sub(r"<title>.*?</title>", "<title>LyricTube</title>", text, count=1, flags=re.S)
    text = re.sub(
        r'<link rel="icon" type="image/webp" href="data:image/webp;base64,[^"]+">',
        '<link rel="icon" type="image/svg+xml" href="assets/lyrictube-icon.svg">',
        text,
        count=1,
    )
    text = re.sub(
        r'<link rel="apple-touch-icon" href="data:image/webp;base64,[^"]+">',
        '<link rel="apple-touch-icon" href="assets/lyrictube-icon.svg">',
        text,
        count=1,
    )
    text = re.sub(r'<img src="data:image/webp;base64,[^"]+"', '<img src="assets/lyrictube-icon.svg"', text)

    text = re.sub(r'\n\s*<link rel="stylesheet" href="local-audio\.css\?v=[^"]+">', "", text)
    for asset in ("styles.css", "mobile.css", "guest.css", "tags.css"):
        text = re.sub(rf'{re.escape(asset)}\?v=[^"\']+', f"{asset}?v={BUILD}", text)

    if "auth-ui.css" not in text:
        text = replace_once(
            text,
            f'<link rel="stylesheet" href="guest.css?v={BUILD}">',
            f'<link rel="stylesheet" href="guest.css?v={BUILD}">\n  <link rel="stylesheet" href="auth-ui.css?v={BUILD}">',
            "auth css insertion",
        )

    text = re.sub(r">GH v\d+(?:\.\d+)*<", f">{DISPLAY}<", text)
    text = text.replace("Synced lyrics player for YouTube", "YouTube & Local Media · Synced Lyrics")

    profile_tag = re.search(r'<script src="profile-data\.js\?v=[^"]+"></script>', text)
    if not profile_tag:
        raise RuntimeError("profile-data script tag not found")
    bootstrap = (
        f'<script src="version.js?v={BUILD}"></script>\n'
        f'  <script src="library-schema.js?v={BUILD}"></script>\n'
        f'  <script src="profile-data.js?v={BUILD}"></script>'
    )
    text = text[: profile_tag.start()] + bootstrap + text[profile_tag.end() :]

    text = re.sub(r'<script src="cloud-sync\.js\?v=[^"]+"></script>', f'<script src="cloud-sync.js?v={BUILD}"></script>', text)
    text = re.sub(r'<script src="site-shell\.js\?v=[^"]+"></script>', f'<script src="site-shell.js?v={BUILD}"></script>', text)
    text = re.sub(r'\n\s*<script src="local-audio\.js\?v=[^"]+"></script>', "", text)
    text = re.sub(r'<script src="tags\.js\?v=[^"]+"></script>', f'<script src="tags.js?v={BUILD}"></script>', text)

    site_tag = f'<script src="site-shell.js?v={BUILD}"></script>'
    extension_tags = (
        site_tag
        + f'\n  <script src="lyrics-providers.js?v={BUILD}"></script>'
        + f'\n  <script src="local-media.js?v={BUILD}"></script>'
    )
    if "lyrics-providers.js" not in text:
        text = replace_once(text, site_tag, extension_tags, "extension scripts")
    elif "local-media.js" not in text:
        text = replace_once(text, site_tag, site_tag + f'\n  <script src="local-media.js?v={BUILD}"></script>', "local media script")

    write("index.html", text)


def auth_helpers() -> str:
    return r'''
  const LAST_ACCOUNT_KEY = "lyrictube.lastCloudAccount.v1";
  function readRememberedAccount() {
    try { return String(localStorage.getItem(LAST_ACCOUNT_KEY) || "").trim(); } catch { return ""; }
  }
  function rememberAccount(username) {
    const value = String(username || "").trim();
    if (!value) return;
    try { localStorage.setItem(LAST_ACCOUNT_KEY, value); } catch {}
  }
  function forgetRememberedAccount() {
    try { localStorage.removeItem(LAST_ACCOUNT_KEY); } catch {}
  }
  function applyRememberedAccount(gate, usernameInput, passwordInput) {
    const accountRow = qs(".access-account-row", gate);
    const intro = qs(".access-copy", gate);
    const remembered = readRememberedAccount();
    if (!accountRow || !remembered) return false;
    usernameInput.value = remembered;
    accountRow.hidden = true;
    const row = make("div", "remembered-account-row");
    row.innerHTML = '<div class="remembered-account-copy"><span>ACCOUNT</span><strong></strong></div><button type="button" class="remembered-account-change">変更</button>';
    qs("strong", row).textContent = remembered;
    qs(".remembered-account-change", row).addEventListener("click", () => {
      forgetRememberedAccount();
      row.remove();
      accountRow.hidden = false;
      usernameInput.value = "";
      if (intro) intro.textContent = "アカウント名とパスワードでログインします。";
      usernameInput.focus();
    });
    accountRow.insertAdjacentElement("afterend", row);
    if (intro) intro.textContent = "前回のアカウントを使います。パスワードだけ入力してください。";
    passwordInput.focus();
    return true;
  }
'''


def refactor_site_shell() -> None:
    text = read("site-shell.js")
    text = re.sub(r'const VERSION = "35";', f'const VERSION = window.LyricTubeVersion?.build || "{BUILD}";', text, count=1)
    text = text.replace('document.title = "LyricTube GitHub v35";', 'document.title = "LyricTube";', 1)

    marker = '''  const make = (tag, className = "", text = "") => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
'''
    if "LAST_ACCOUNT_KEY" not in text:
        text = replace_once(text, marker, marker + auth_helpers(), "auth helper insertion")

    old = '''      guest.disabled = false;
      status.textContent = "";
      passwordInput.focus();
'''
    new = '''      guest.disabled = false;
      status.textContent = "";
      if (!applyRememberedAccount(gate, usernameInput, passwordInput)) passwordInput.focus();
'''
    text = replace_once(text, old, new, "remembered account apply")

    old_login = '''          const data = await api("login", { username, password });
          const session = { token: data.token, account: data.account };
          setCloudSession(session);
'''
    new_login = '''          const data = await api("login", { username, password });
          rememberAccount(data?.account?.username || username);
          const session = { token: data.token, account: data.account };
          setCloudSession(session);
'''
    text = replace_once(text, old_login, new_login, "remember account on login")

    replacement = '''function initCloudSync(role, session) {
    // cloud-sync.js is the single writer. site-shell only announces that a valid
    // cloud session is ready; this prevents full-library and delta writers racing.
    if (role === "cloud" && session?.token) {
      document.dispatchEvent(new CustomEvent("lyrictube:cloud-session-ready"));
    }
  }'''
    text = replace_function(text, "initCloudSync", replacement)
    write("site-shell.js", text)


def refactor_app() -> None:
    text = read("app.js")
    text = replace_once(
        text,
        'const APP_VERSION = "v35";',
        'const APP_VERSION = window.LyricTubeVersion?.version || "v0.10.0";',
        "app version",
    )
    text = text.replace('els.settingsAppVersion.textContent=`GH ${APP_VERSION}`;', 'els.settingsAppVersion.textContent=APP_VERSION;')
    if "window.LyricTubeCore" not in text:
        text += r'''

// Stable façade for feature modules. Existing functions remain compatible, while
// new modules no longer need to reach into raw global state for common operations.
window.LyricTubeCore = Object.freeze({
  getLibrary: () => library,
  getSong: () => getSong(),
  getVersion: song => getVersion(song),
  persist: () => persistLibrary(),
  render: () => renderAll(),
  toast: message => showToast(message),
  versionName: version => versionDisplayName(version),
  currentTime: () => currentPlayerTime(),
  duration: () => getPlayerDuration(),
});
document.dispatchEvent(new CustomEvent("lyrictube:app-ready"));
document.dispatchEvent(new CustomEvent("lyrictube:ui-ready"));
'''
    write("app.js", text)


def legacy_media_functions() -> str:
    return r'''
  async function readLegacyAudioRows() {
    if (!window.indexedDB) return [];
    try {
      if (typeof indexedDB.databases === "function") {
        const dbs = await indexedDB.databases();
        if (!dbs.some(item => item?.name === LEGACY_DB_NAME)) return [];
      }
    } catch {}

    return await new Promise(resolve => {
      let created = false;
      const request = indexedDB.open(LEGACY_DB_NAME, 1);
      request.onupgradeneeded = () => { created = true; };
      request.onerror = () => resolve([]);
      request.onsuccess = () => {
        const legacy = request.result;
        if (created || !legacy.objectStoreNames.contains("tracks")) {
          legacy.close();
          if (created) indexedDB.deleteDatabase(LEGACY_DB_NAME);
          resolve([]);
          return;
        }
        const txLegacy = legacy.transaction("tracks", "readonly");
        const getAll = txLegacy.objectStore("tracks").getAll();
        getAll.onerror = () => { legacy.close(); resolve([]); };
        getAll.onsuccess = () => { const rows = getAll.result || []; legacy.close(); resolve(rows); };
      };
    });
  }

  async function migrateLegacyAudio() {
    const rows = await readLegacyAudioRows();
    if (!rows.length) return 0;
    let copied = 0;
    for (const row of rows) {
      if (!row?.key || !(row.blob instanceof Blob)) continue;
      const migrated = {
        ...row,
        kind: "audio",
        fileName: row.fileName || "audio.mp3",
        mime: row.mime || "audio/mpeg",
        updatedAt: row.updatedAt || new Date().toISOString(),
      };
      await tx("readwrite", store => store.put(migrated));
      copied += 1;
    }

    let changed = false;
    try {
      for (const song of library?.songs || []) {
        for (const version of song.versions || []) {
          if (version.type !== "local" || version.source === "localmedia") continue;
          const row = rows.find(item => String(item?.versionId || "") === String(version.id));
          if (!row) continue;
          version.type = "other";
          version.source = "localmedia";
          version.localMediaKind = "audio";
          version.localFileName = row.fileName || "audio.mp3";
          version.youtubeUrl = "";
          version.videoId = "";
          changed = true;
        }
      }
      if (changed) persistLibrary();
    } catch (error) {
      console.warn("[LyricTube LocalMedia] legacy metadata migration failed", error);
    }

    try { indexedDB.deleteDatabase(LEGACY_DB_NAME); } catch {}
    console.info(`[LyricTube] migrated ${copied} legacy local-audio file(s)`);
    return copied;
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let n = value / 1024;
    let index = 0;
    while (n >= 1024 && index < units.length - 1) { n /= 1024; index += 1; }
    return `${n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${units[index]}`;
  }

  async function updateStorageSummary() {
    const el = $("localMediaStorageSummary");
    if (!el) return;
    const localBytes = [...records.values()].reduce((sum, row) => sum + (Number(row?.size) || 0), 0);
    let suffix = "";
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota) suffix = ` · ブラウザ使用 ${formatBytes(estimate.usage || 0)} / ${formatBytes(estimate.quota)}`;
    } catch {}
    el.textContent = `このアカウントの端末ファイル: ${formatBytes(localBytes)}${suffix}`;
  }

  function createStorageSettingsUi() {
    const dialog = $("settingsDialog");
    if (!dialog || $("localMediaStorageSetting")) return;
    const anchor = dialog.querySelector(".version-info");
    if (!anchor) return;
    const row = document.createElement("div");
    row.id = "localMediaStorageSetting";
    row.className = "local-media-storage-setting";
    row.innerHTML = '<div><strong>端末ファイル保存</strong><span id="localMediaStorageSummary">容量を確認中…</span></div><button id="localMediaStorageRefresh" class="ghost-btn" type="button">更新</button>';
    anchor.insertAdjacentElement("beforebegin", row);
    $("localMediaStorageRefresh")?.addEventListener("click", updateStorageSummary);
    updateStorageSummary();
  }
'''


def refactor_local_media() -> None:
    text = read("local-media.js")
    if "LEGACY_DB_NAME" not in text:
        text = replace_once(
            text,
            '  const DB_NAME = "lyrictube.localMedia.v1";\n',
            '  const DB_NAME = "lyrictube.localMedia.v1";\n  const LEGACY_DB_NAME = "lyrictube.localAudio.v1";\n',
            "legacy db constant",
        )
    if "let lastUiTick" not in text:
        text = replace_once(text, "  let patched = false;\n", "  let patched = false;\n  let lastUiTick = 0;\n", "ui throttle state")
    if "async function readLegacyAudioRows" not in text:
        marker = "  async function loadRecords() {\n"
        text = replace_once(text, marker, legacy_media_functions() + "\n" + marker, "legacy migration functions")

    old_style = '''      #localMediaAudio{position:fixed;width:1px;height:1px;opacity:.001;pointer-events:none;left:-10px;bottom:-10px}
      .local-media-source-btn{display:none}.local-media-source-btn.visible{display:inline-flex}
'''
    new_style = '''      #localMediaAudio{position:fixed;width:1px;height:1px;opacity:.001;pointer-events:none;left:-10px;bottom:-10px}
      .local-media-source-btn{display:none}.local-media-source-btn.visible{display:inline-flex}
      .local-media-storage-setting{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0;padding:12px 13px;border:1px solid var(--border);border-radius:12px;background:var(--panel2)}.local-media-storage-setting>div{display:grid;gap:3px}.local-media-storage-setting strong{font-size:12px}.local-media-storage-setting span{font-size:10px;color:var(--muted);line-height:1.45}
'''
    if old_style in text:
        text = text.replace(old_style, new_style, 1)

    old_timeupdate = '''      el.addEventListener("timeupdate", () => {
        applyPlaybackRules();
        try { updateBottomPlayer?.(); } catch {}
      });
'''
    new_timeupdate = '''      el.addEventListener("timeupdate", () => {
        applyPlaybackRules();
        const now = performance.now();
        if (now - lastUiTick >= 125) {
          lastUiTick = now;
          try { updateBottomPlayer?.(); } catch {}
        }
      });
'''
    text = replace_once(text, old_timeupdate, new_timeupdate, "timeupdate throttle")

    init_old = '''    styleUi();
    createPlayerUi();
    createSongSourceUi();
    createVersionSourceUi();
    patchPlayback();
    installHandlers();
    try {
      db = await openDb();
      await loadRecords();
      await cleanupOrphans();
'''
    init_new = '''    styleUi();
    createPlayerUi();
    createSongSourceUi();
    createVersionSourceUi();
    createStorageSettingsUi();
    patchPlayback();
    installHandlers();
    try {
      db = await openDb();
      await migrateLegacyAudio();
      await loadRecords();
      await cleanupOrphans();
      await updateStorageSummary();
'''
    text = replace_once(text, init_old, init_new, "local media init")
    text = text.replace('document.documentElement.dataset.localMedia = "v36";', f'document.documentElement.dataset.localMedia = "{DISPLAY}";')
    text = text.replace("      document.documentElement.dataset.localAudio\n", "")

    if "window.LyricTubeLocalMedia" not in text:
        marker = "  async function init() {\n"
        api = r'''  window.LyricTubeLocalMedia = Object.freeze({
    status(song = currentSong(), version = currentVersion(song)) {
      if (!isLocalMediaVersion(version)) return { local: false, linked: false };
      const row = records.get(keyFor(song, version)) || null;
      return { local: true, linked: !!row, kind: row?.kind || version?.localMediaKind || "", fileName: row?.fileName || version?.localFileName || "" };
    },
    refreshStorage: updateStorageSummary,
    relinkCurrent: relinkCurrentFile,
  });

'''
        text = replace_once(text, marker, api + marker, "local media public api")

    write("local-media.js", text)


def refactor_tags() -> None:
    text = read("tags.js")
    text = text.replace('const TAG_VERSION = "v35";', 'const TAG_VERSION = window.LyricTubeVersion?.version || "v0.10.0";', 1)
    write("tags.js", text)


def main() -> None:
    refactor_index()
    refactor_site_shell()
    refactor_app()
    refactor_local_media()
    refactor_tags()
    print("LyricTube v0.10.0 foundation refactor complete")


if __name__ == "__main__":
    main()
