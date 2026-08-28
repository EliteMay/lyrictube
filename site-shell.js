(() => {
  "use strict";

  const STORAGE_KEY = "lyrictube.library.v3";
  const LEGACY_KEY = "lyrictube.songs.v1";
  const ACCESS_SESSION_KEY = "lyrictube.simpleAccess.v2";
  const SHARED_LIBRARY_URL = "data/library.json";
  const CONFIG_URL = "data/site-config.json";
  const OWNER_ACCESS_CODE = "2526";
  const VERSION = "31.2";

  const qs = (selector, root = document) => root.querySelector(selector);
  function make(tag, className = "", text = "") {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function prepareV311Assets() {
    document.title = "LyricTube GitHub v31.2";
    const mobile = qs('link[href^="mobile.css"]');
    if (mobile) mobile.href = `mobile.css?v=${VERSION}`;
    if (!qs('link[data-guest-style]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `guest.css?v=${VERSION}`;
      link.dataset.guestStyle = "true";
      document.head.appendChild(link);
    }
  }

  function createAccessGate() {
    const gate = make("div", "access-gate");
    gate.id = "accessGate";
    gate.innerHTML = `
      <div class="access-card" role="dialog" aria-modal="true" aria-labelledby="accessTitle">
        <div class="access-mark">♫</div>
        <p class="access-eyebrow">PRIVATE LIBRARY</p>
        <h1 id="accessTitle">LyricTube</h1>
        <p class="access-copy">通常モードはコードを入力。見るだけならゲストで入れます。</p>
        <form id="accessForm" autocomplete="off">
          <label class="access-label" for="accessPassword">ACCESS CODE</label>
          <div class="access-input-row">
            <input id="accessPassword" type="password" inputmode="numeric" autocomplete="off" placeholder="4桁コード" disabled>
            <button id="accessSubmit" type="submit" disabled>通常で入る</button>
          </div>
          <p id="accessStatus" class="access-status">設定を確認しています…</p>
        </form>
        <div class="access-divider"><span>or</span></div>
        <button id="guestAccessBtn" class="guest-access-btn" type="button" disabled>
          <span class="guest-access-icon">◎</span>
          <span><strong>ゲストで入る</strong><small>再生・歌詞・お気に入り・プレイリスト</small></span>
        </button>
      </div>`;
    document.body.appendChild(gate);
    return gate;
  }

  async function readConfig() {
    try {
      const res = await fetch(`${CONFIG_URL}?v=${VERSION}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        enabled: data?.enabled !== false,
        rememberSession: data?.rememberSession !== false,
        sharedLibrary: data?.sharedLibrary !== false
      };
    } catch (error) {
      console.warn("[LyricTube] site-config load failed:", error);
      return { enabled: true, rememberSession: true, sharedLibrary: true };
    }
  }

  function finishGate(gate, role, config, resolve) {
    if (config.rememberSession) sessionStorage.setItem(ACCESS_SESSION_KEY, role);
    gate.classList.add("unlocking");
    setTimeout(() => {
      gate.remove();
      resolve(role);
    }, 170);
  }

  function waitForAccess(gate, config) {
    return new Promise(resolve => {
      const form = qs("#accessForm", gate);
      const input = qs("#accessPassword", gate);
      const submit = qs("#accessSubmit", gate);
      const guest = qs("#guestAccessBtn", gate);
      const status = qs("#accessStatus", gate);
      input.disabled = false;
      submit.disabled = false;
      guest.disabled = false;
      status.textContent = "";
      setTimeout(() => input.focus(), 50);

      form.addEventListener("submit", event => {
        event.preventDefault();
        if (input.value.trim() === OWNER_ACCESS_CODE) {
          finishGate(gate, "owner", config, resolve);
          return;
        }
        input.value = "";
        input.classList.remove("shake");
        void input.offsetWidth;
        input.classList.add("shake");
        status.textContent = "コードが違います。";
        input.focus();
      });
      guest.addEventListener("click", () => finishGate(gate, "guest", config, resolve));
    });
  }

  async function unlockSite() {
    const gate = createAccessGate();
    const config = await readConfig();
    if (!config.enabled) {
      gate.remove();
      return { config, role: "owner" };
    }
    const storedRole = config.rememberSession ? sessionStorage.getItem(ACCESS_SESSION_KEY) : null;
    if (storedRole === "owner" || storedRole === "guest") {
      gate.remove();
      return { config, role: storedRole };
    }
    const role = await waitForAccess(gate, config);
    return { config, role };
  }

  function libraryLooksUsable(data) {
    return data && typeof data === "object" && Array.isArray(data.songs) && Array.isArray(data.playlists || []);
  }

  async function fetchSharedLibrary() {
    const res = await fetch(`${SHARED_LIBRARY_URL}?v=${VERSION}&t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!libraryLooksUsable(data)) throw new Error("library.json format error");
    return data;
  }

  async function seedSharedLibraryIfEmpty(enabled) {
    if (!enabled) return false;
    if (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY)) return false;
    try {
      const data = await fetchSharedLibrary();
      if (!data.songs.length && !(data.playlists || []).length) return false;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem("lyrictube.sharedSeed.v1", new Date().toISOString());
      return true;
    } catch (error) {
      console.warn("[LyricTube] shared library seed failed:", error);
      return false;
    }
  }

  function loadMainApp() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `app.js?v=${VERSION}`;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error("app.js load failed"));
      document.body.appendChild(script);
    });
  }

  function closeMobileSidebar() {
    document.body.classList.remove("mobile-sidebar-open");
    const button = qs("#mobileMenuBtn");
    if (button) button.setAttribute("aria-expanded", "false");
  }
  function openMobileSidebar() {
    document.body.classList.add("mobile-sidebar-open");
    const button = qs("#mobileMenuBtn");
    if (button) button.setAttribute("aria-expanded", "true");
  }

  function initMobileNavigation() {
    const topbar = qs(".topbar");
    const sidebar = qs(".sidebar");
    const brandRow = qs(".brand-row");
    if (!topbar || !sidebar || qs("#mobileMenuBtn")) return;
    const menu = make("button", "mobile-menu-btn", "☰");
    menu.id = "mobileMenuBtn";
    menu.type = "button";
    menu.title = "ライブラリを開く";
    menu.setAttribute("aria-label", "ライブラリを開く");
    menu.setAttribute("aria-controls", "mobileSidebar");
    menu.setAttribute("aria-expanded", "false");
    sidebar.id = sidebar.id || "mobileSidebar";
    topbar.prepend(menu);

    const close = make("button", "mobile-sidebar-close", "×");
    close.type = "button";
    close.title = "ライブラリを閉じる";
    close.setAttribute("aria-label", "ライブラリを閉じる");
    brandRow?.appendChild(close);

    const backdrop = make("button", "mobile-sidebar-backdrop");
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "ライブラリを閉じる");
    document.body.appendChild(backdrop);

    menu.addEventListener("click", () => document.body.classList.contains("mobile-sidebar-open") ? closeMobileSidebar() : openMobileSidebar());
    close.addEventListener("click", closeMobileSidebar);
    backdrop.addEventListener("click", closeMobileSidebar);
    sidebar.addEventListener("click", event => {
      if (!window.matchMedia("(max-width: 900px)").matches) return;
      if (event.target.closest(".song-item,.view-btn,.playlist-item,.page-switch-btn")) setTimeout(closeMobileSidebar, 40);
    });
    window.addEventListener("keydown", event => { if (event.key === "Escape") closeMobileSidebar(); });
    window.addEventListener("resize", () => { if (!window.matchMedia("(max-width: 900px)").matches) closeMobileSidebar(); }, { passive: true });
  }

  function initSharedLibraryReloadButton(config, role) {
    if (!config.sharedLibrary || qs("#reloadSharedLibraryBtn")) return;
    const settingsDialog = qs("#settingsDialog");
    const versionInfo = qs(".version-info", settingsDialog || document);
    if (!settingsDialog || !versionInfo) return;
    const wrap = make("div", "shared-library-setting");
    const copy = make("div", "shared-library-setting-copy");
    copy.innerHTML = `<strong>共有JSON</strong><span>data/library.json をこの端末へ読み込み直します。</span>`;
    const button = make("button", "ghost-btn", "共有JSONを再読み込み");
    button.id = "reloadSharedLibraryBtn";
    button.type = "button";
    wrap.append(copy, button);
    versionInfo.before(wrap);
    button.addEventListener("click", async () => {
      if (!confirm("この端末の曲・プレイリストを共有JSONで置き換えます。続けますか？")) return;
      button.disabled = true;
      button.textContent = "読み込み中…";
      try {
        const data = await fetchSharedLibrary();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        localStorage.removeItem(LEGACY_KEY);
        if (role === "guest") sessionStorage.setItem(ACCESS_SESSION_KEY, "guest");
        location.reload();
      } catch (error) {
        console.error(error);
        alert("共有JSONを読み込めませんでした。data/library.json を確認してください。");
        button.disabled = false;
        button.textContent = "共有JSONを再読み込み";
      }
    });
  }

  function applyGuestMode(role) {
    document.documentElement.dataset.accessRole = role;
    if (role !== "guest") return;
    document.body.classList.add("guest-mode");
    const hideSelectors = [
      "#addSongBtn", "#browseAddSongBtn", "#editSongBtn", "#deleteSongBtn",
      "#addVersionBtn", "#editVersionBtn", "#deleteVersionBtn",
      "#setStartBtn", "#setEndBtn", "#resetRangeBtn", "#markSkipStartBtn", "#markSkipEndBtn",
      "#openSyncEditorBtn", "#offsetMinus", "#offsetPlus", "#offsetInput", "#autoSkipToggle", "#importInput"
    ];
    hideSelectors.forEach(selector => {
      const el = qs(selector);
      if (!el) return;
      const host = el.matches("input") ? el.closest("label") : el;
      host?.classList.add("guest-hidden");
    });
    const topbar = qs(".topbar");
    if (topbar && !qs("#guestModeBadge")) {
      const badge = make("span", "guest-mode-badge", "GUEST");
      badge.id = "guestModeBadge";
      topbar.appendChild(badge);
    }
    const versionInfo = qs(".version-info");
    if (versionInfo && !qs("#guestModeNote")) {
      const note = make("div", "guest-mode-note");
      note.id = "guestModeNote";
      note.innerHTML = "<strong>ゲストモード</strong><span>曲・歌詞・同期設定の編集は無効です。お気に入りとプレイリストはこの端末に保存されます。</span>";
      versionInfo.before(note);
    }
  }

  function keepV311Labels() {
    const apply = () => {
      const settingVersion = qs("#settingsAppVersion");
      if (settingVersion) settingVersion.textContent = "GH v31.2";
      const badge = qs(".version-badge");
      if (badge) badge.textContent = "GH v31.2";
    };
    apply();
    document.addEventListener("click", event => {
      if (event.target.closest("#settingsBtn")) setTimeout(apply, 0);
    });
  }

  async function start() {
    prepareV311Assets();
    const { config, role } = await unlockSite();
    await seedSharedLibraryIfEmpty(config.sharedLibrary);
    try {
      await loadMainApp();
    } catch (error) {
      console.error("[LyricTube] main app load failed:", error);
      alert("LyricTubeの読み込みに失敗しました。ページを再読み込みしてください。");
      return;
    }
    initMobileNavigation();
    initSharedLibraryReloadButton(config, role);
    applyGuestMode(role);
    keepV311Labels();
  }

  start();
})();
