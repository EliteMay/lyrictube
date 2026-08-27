(() => {
  "use strict";

  const STORAGE_KEY = "lyrictube.library.v3";
  const LEGACY_KEY = "lyrictube.songs.v1";
  const ACCESS_SESSION_KEY = "lyrictube.simpleAccess.v1";
  const SHARED_LIBRARY_URL = "data/library.json";
  const CONFIG_URL = "data/site-config.json";

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function make(tag, className = "", text = "") {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function createAccessGate() {
    const gate = make("div", "access-gate");
    gate.id = "accessGate";
    gate.innerHTML = `
      <div class="access-card" role="dialog" aria-modal="true" aria-labelledby="accessTitle">
        <div class="access-mark">♫</div>
        <p class="access-eyebrow">PRIVATE LIBRARY</p>
        <h1 id="accessTitle">LyricTube</h1>
        <p class="access-copy">パスワードを入力してください。</p>
        <form id="accessForm" autocomplete="off">
          <label class="access-label" for="accessPassword">PASSWORD</label>
          <div class="access-input-row">
            <input id="accessPassword" type="password" inputmode="text" autocomplete="current-password" placeholder="Password" disabled>
            <button id="accessSubmit" type="submit" disabled>開く</button>
          </div>
          <p id="accessStatus" class="access-status">設定を確認しています…</p>
        </form>
      </div>`;
    document.body.appendChild(gate);
    return gate;
  }

  async function readConfig() {
    try {
      const res = await fetch(`${CONFIG_URL}?v=31`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        enabled: data?.enabled !== false,
        password: String(data?.password || ""),
        rememberSession: data?.rememberSession !== false,
        sharedLibrary: data?.sharedLibrary !== false
      };
    } catch (error) {
      console.warn("[LyricTube] site-config load failed:", error);
      return { enabled: false, password: "", rememberSession: true, sharedLibrary: true };
    }
  }

  function waitForPassword(gate, config) {
    return new Promise(resolve => {
      const form = qs("#accessForm", gate);
      const input = qs("#accessPassword", gate);
      const submit = qs("#accessSubmit", gate);
      const status = qs("#accessStatus", gate);

      input.disabled = false;
      submit.disabled = false;
      status.textContent = "";
      setTimeout(() => input.focus(), 50);

      form.addEventListener("submit", event => {
        event.preventDefault();
        if (input.value === config.password) {
          if (config.rememberSession) sessionStorage.setItem(ACCESS_SESSION_KEY, "ok");
          gate.classList.add("unlocking");
          setTimeout(() => {
            gate.remove();
            resolve();
          }, 170);
          return;
        }
        input.value = "";
        input.classList.remove("shake");
        void input.offsetWidth;
        input.classList.add("shake");
        status.textContent = "パスワードが違います。";
        input.focus();
      });
    });
  }

  async function unlockSite() {
    const gate = createAccessGate();
    const config = await readConfig();

    if (!config.enabled || !config.password) {
      gate.remove();
      return config;
    }

    if (config.rememberSession && sessionStorage.getItem(ACCESS_SESSION_KEY) === "ok") {
      gate.remove();
      return config;
    }

    await waitForPassword(gate, config);
    return config;
  }

  function libraryLooksUsable(data) {
    return data && typeof data === "object" && Array.isArray(data.songs) && Array.isArray(data.playlists || []);
  }

  async function fetchSharedLibrary() {
    const res = await fetch(`${SHARED_LIBRARY_URL}?v=31&t=${Date.now()}`, { cache: "no-store" });
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
      script.src = "app.js?v=31";
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

    menu.addEventListener("click", () => {
      document.body.classList.contains("mobile-sidebar-open") ? closeMobileSidebar() : openMobileSidebar();
    });
    close.addEventListener("click", closeMobileSidebar);
    backdrop.addEventListener("click", closeMobileSidebar);

    sidebar.addEventListener("click", event => {
      if (!window.matchMedia("(max-width: 900px)").matches) return;
      if (event.target.closest(".song-item,.view-btn,.playlist-item,.page-switch-btn")) {
        setTimeout(closeMobileSidebar, 40);
      }
    });

    window.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMobileSidebar();
    });
    window.addEventListener("resize", () => {
      if (!window.matchMedia("(max-width: 900px)").matches) closeMobileSidebar();
    }, { passive: true });
  }

  function initSharedLibraryReloadButton(config) {
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
        location.reload();
      } catch (error) {
        console.error(error);
        alert("共有JSONを読み込めませんでした。data/library.json を確認してください。");
        button.disabled = false;
        button.textContent = "共有JSONを再読み込み";
      }
    });
  }

  function keepV31Label() {
    const apply = () => {
      const el = qs("#settingsAppVersion");
      if (el) el.textContent = "GH v31";
    };
    apply();
    document.addEventListener("click", event => {
      if (event.target.closest("#settingsBtn")) setTimeout(apply, 0);
    });
  }

  async function start() {
    const config = await unlockSite();
    await seedSharedLibraryIfEmpty(config.sharedLibrary);
    try {
      await loadMainApp();
    } catch (error) {
      console.error("[LyricTube] main app load failed:", error);
      alert("LyricTubeの読み込みに失敗しました。ページを再読み込みしてください。");
      return;
    }
    initMobileNavigation();
    initSharedLibraryReloadButton(config);
    keepV31Label();
  }

  start();
})();
