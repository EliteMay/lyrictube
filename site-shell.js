(() => {
  "use strict";

  const STORAGE_KEY = "lyrictube.library.v3";
  const LEGACY_KEY = "lyrictube.songs.v1";
  const ACCESS_SESSION_KEY = "lyrictube.simpleAccess.v2";
  const CLOUD_SESSION_KEY = "lyrictube.cloudSession.v1";
  const CONFIG_URL = "data/site-config.json";
  const GUEST_LIBRARY_URL = "data/library.json";
  const API_URL = "https://ctktkyxuzkrsigwoswoc.supabase.co/functions/v1/lyrictube-api";
  const VERSION = window.LyricTubeVersion?.build || "20260830-4";

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const make = (tag, className = "", text = "") => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };

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

  function profiles() {
    return window.LyricTubeProfiles || null;
  }

  function setCloudSession(value) {
    if (value) sessionStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(CLOUD_SESSION_KEY);
  }

  function getCloudSession() {
    try {
      const raw = sessionStorage.getItem(CLOUD_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function api(action, payload = {}) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...payload })
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  function prepareAssets() {
    document.title = "LyricTube";
    const mobile = qs('link[href^="mobile.css"]');
    if (mobile) mobile.href = `mobile.css?v=${VERSION}`;
    if (!qs("#cloudAccountStyle")) {
      const style = document.createElement("style");
      style.id = "cloudAccountStyle";
      style.textContent = `
        .access-account-row{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:10px}.access-account-row input{width:100%}
        .cloud-account-badge{margin-left:auto;display:flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid hsl(var(--accent-h,258) 68% 64% / .24);border-radius:999px;background:var(--accentSoft);font-size:10px;font-weight:800}.cloud-account-badge::before{content:"";width:7px;height:7px;border-radius:50%;background:#46d17a;box-shadow:0 0 0 3px rgba(70,209,122,.12)}
        .account-setting,.cloud-sync-setting{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0;padding:12px 13px;border:1px solid var(--border);border-radius:12px;background:var(--panel2)}
        .account-setting-copy,.cloud-sync-copy{display:grid;gap:3px}.account-setting-copy strong,.cloud-sync-copy strong{font-size:12px}.account-setting-copy span,.cloud-sync-copy span{font-size:10px;color:var(--muted);line-height:1.45}
        .account-manager-dialog{width:min(680px,calc(100vw - 24px));max-height:min(82vh,760px)}.account-manager-list{display:grid;gap:8px;max-height:300px;overflow:auto;margin-top:12px}.account-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--panel2)}.account-row-main{display:grid;gap:2px}.account-row-main strong{font-size:12px}.account-row-main span{font-size:10px;color:var(--muted)}.account-row-actions{display:flex;gap:6px;flex-wrap:wrap}.account-create-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.account-create-grid input{min-width:0}.account-manager-status{min-height:18px;margin-top:8px;font-size:10px;color:var(--muted)}
        @media(max-width:620px){.account-setting,.cloud-sync-setting{align-items:flex-start;flex-direction:column}.account-create-grid{grid-template-columns:1fr}.account-row{grid-template-columns:1fr}.cloud-account-badge{font-size:9px}}
      `;
      document.head.appendChild(style);
    }
  }

  function createAccessGate() {
    const gate = make("div", "access-gate");
    gate.id = "accessGate";
    gate.innerHTML = `
      <div class="access-card" role="dialog" aria-modal="true" aria-labelledby="accessTitle">
        <div class="access-mark">♫</div>
        <p class="access-eyebrow">CLOUD LIBRARY</p>
        <h1 id="accessTitle">LyricTube</h1>
        <p class="access-copy">アカウントごとに曲データをクラウド保存します。登録済みのアカウント名とパスワードでログインしてください。</p>
        <form id="accessForm" autocomplete="off">
          <div class="access-account-row">
            <label class="access-label" for="accessUsername">ACCOUNT</label>
            <input id="accessUsername" type="text" autocomplete="username" placeholder="アカウント名" disabled>
          </div>
          <label class="access-label" for="accessPassword">PASSWORD</label>
          <div class="access-input-row">
            <input id="accessPassword" type="password" autocomplete="current-password" placeholder="パスワード" disabled>
            <button id="accessSubmit" type="submit" disabled>ログイン</button>
          </div>
          <p id="accessStatus" class="access-status">接続を確認しています…</p>
        </form>
        <div class="access-divider"><span>or</span></div>
        <button id="guestAccessBtn" class="guest-access-btn" type="button" disabled>
          <span class="guest-access-icon">◎</span>
          <span><strong>ゲストで入る</strong><small>端末内だけのゲストデータ</small></span>
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
      return { enabled: data?.enabled !== false, sharedLibrary: data?.sharedLibrary !== false };
    } catch {
      return { enabled: true, sharedLibrary: true };
    }
  }

  async function validateStoredCloudSession() {
    const session = getCloudSession();
    if (!session?.token) return null;
    try {
      const data = await api("load_library", { token: session.token });
      return { session, library: data.library, account: data.account };
    } catch {
      setCloudSession(null);
      sessionStorage.removeItem(ACCESS_SESSION_KEY);
      return null;
    }
  }

  function libraryLooksUsable(data) {
    return data && typeof data === "object" && Array.isArray(data.songs) && Array.isArray(data.playlists || []);
  }

  async function maybeMigratePrimaryLibrary(cloudLibrary, session) {
    if (session?.account?.isAdmin !== true) return cloudLibrary;
    const emptyCloud = !cloudLibrary?.songs?.length && !(cloudLibrary?.playlists || []).length;
    if (!emptyCloud) return cloudLibrary;

    const p = profiles();
    const candidates = [];
    if (p?.nativeGetItem && p?.ownerLocalKey) {
      const ownerRaw = p.nativeGetItem(localStorage, p.ownerLocalKey);
      if (ownerRaw) candidates.push(ownerRaw);
    }
    for (const raw of candidates) {
      try {
        const parsed = JSON.parse(raw);
        if (libraryLooksUsable(parsed) && (parsed.songs.length || parsed.playlists.length)) {
          await api("save_library", { token: session.token, library: parsed });
          return parsed;
        }
      } catch {}
    }

    try {
      const url = p?.ownerLibraryUrl || "data/library-owner.json";
      const res = await fetch(`${url}?v=${VERSION}&t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const parsed = await res.json();
        if (libraryLooksUsable(parsed) && (parsed.songs.length || parsed.playlists.length)) {
          await api("save_library", { token: session.token, library: parsed });
          return parsed;
        }
      }
    } catch {}
    return cloudLibrary;
  }

  function storeActiveLibrary(library) {
    const p = profiles();
    if (p?.nativeSetItem && p?.roleStorageKey) {
      p.nativeSetItem(localStorage, p.roleStorageKey(), JSON.stringify(library));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    }
    localStorage.removeItem(LEGACY_KEY);
  }

  async function unlockSite(gate, config) {
    const storedGuest = sessionStorage.getItem(ACCESS_SESSION_KEY) === "guest";
    if (storedGuest) {
      gate.remove();
      return { role: "guest", config };
    }

    const existing = await validateStoredCloudSession();
    if (existing) {
      const library = await maybeMigratePrimaryLibrary(existing.library, existing.session);
      storeActiveLibrary(library);
      gate.remove();
      return { role: "cloud", config, session: existing.session };
    }

    return new Promise(resolve => {
      const form = qs("#accessForm", gate);
      const usernameInput = qs("#accessUsername", gate);
      const passwordInput = qs("#accessPassword", gate);
      const submit = qs("#accessSubmit", gate);
      const guest = qs("#guestAccessBtn", gate);
      const status = qs("#accessStatus", gate);
      usernameInput.disabled = false;
      passwordInput.disabled = false;
      submit.disabled = false;
      guest.disabled = false;
      status.textContent = "";
      if (!applyRememberedAccount(gate, usernameInput, passwordInput)) passwordInput.focus();

      form.addEventListener("submit", async event => {
        event.preventDefault();
        const password = passwordInput.value;
        const username = usernameInput.value.trim();
        if (!username || !password) {
          status.textContent = "アカウント名とパスワードを入力してください。";
          return;
        }
        submit.disabled = true;
        status.textContent = "ログイン中…";
        try {
          const data = await api("login", { username, password });
          rememberAccount(data?.account?.username || username);
          const session = { token: data.token, account: data.account };
          setCloudSession(session);
          sessionStorage.setItem(ACCESS_SESSION_KEY, "cloud");
          const loaded = await api("load_library", { token: session.token });
          const library = await maybeMigratePrimaryLibrary(loaded.library, session);
          storeActiveLibrary(library);
          gate.classList.add("unlocking");
          setTimeout(() => { gate.remove(); resolve({ role: "cloud", config, session }); }, 170);
        } catch (error) {
          status.textContent = error.message || "ログインできませんでした。";
          passwordInput.value = "";
          submit.disabled = false;
          passwordInput.focus();
        }
      });

      guest.addEventListener("click", () => {
        setCloudSession(null);
        sessionStorage.setItem(ACCESS_SESSION_KEY, "guest");
        gate.classList.add("unlocking");
        setTimeout(() => { gate.remove(); resolve({ role: "guest", config }); }, 170);
      });
    });
  }

  async function seedGuestLibraryIfEmpty(enabled) {
    if (!enabled) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    try {
      const res = await fetch(`${GUEST_LIBRARY_URL}?v=${VERSION}&t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (!libraryLooksUsable(data)) return;
      storeActiveLibrary(data);
    } catch {}
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

  function initCloudSync(role, session) {
    // cloud-sync.js is the single writer. site-shell only announces that a valid
    // cloud session is ready; this prevents full-library and delta writers racing.
    if (role === "cloud" && session?.token) {
      document.dispatchEvent(new CustomEvent("lyrictube:cloud-session-ready"));
    }
  }

  function closeMobileSidebar() {
    document.body.classList.remove("mobile-sidebar-open");
    qs("#mobileMenuBtn")?.setAttribute("aria-expanded", "false");
  }

  function initMobileNavigation() {
    const topbar = qs(".topbar");
    const sidebar = qs(".sidebar");
    const brandRow = qs(".brand-row");
    if (!topbar || !sidebar || qs("#mobileMenuBtn")) return;
    const menu = make("button", "mobile-menu-btn", "☰");
    menu.id = "mobileMenuBtn"; menu.type = "button"; menu.setAttribute("aria-expanded", "false");
    sidebar.id = sidebar.id || "mobileSidebar";
    topbar.prepend(menu);
    const close = make("button", "mobile-sidebar-close", "×"); close.type = "button"; brandRow?.appendChild(close);
    const backdrop = make("button", "mobile-sidebar-backdrop"); backdrop.type = "button"; document.body.appendChild(backdrop);
    menu.addEventListener("click", () => document.body.classList.toggle("mobile-sidebar-open"));
    close.addEventListener("click", closeMobileSidebar);
    backdrop.addEventListener("click", closeMobileSidebar);
    sidebar.addEventListener("click", event => {
      if (window.matchMedia("(max-width: 900px)").matches && event.target.closest(".song-item,.view-btn,.playlist-item,.page-switch-btn")) setTimeout(closeMobileSidebar, 40);
    });
    window.addEventListener("keydown", e => { if (e.key === "Escape") closeMobileSidebar(); });
  }

  function applyGuestMode(role) {
    document.documentElement.dataset.accessRole = role;
    if (role !== "guest") return;
    document.body.classList.add("guest-mode");
    ["#addSongBtn","#browseAddSongBtn","#editSongBtn","#deleteSongBtn","#addVersionBtn","#editVersionBtn","#deleteVersionBtn","#setStartBtn","#setEndBtn","#resetRangeBtn","#markSkipStartBtn","#markSkipEndBtn","#openSyncEditorBtn","#offsetMinus","#offsetPlus","#offsetInput","#autoSkipToggle","#importInput"].forEach(selector => {
      const el = qs(selector); if (!el) return; (el.matches("input") ? el.closest("label") : el)?.classList.add("guest-hidden");
    });
    const topbar = qs(".topbar");
    if (topbar && !qs("#guestModeBadge")) { const badge = make("span", "guest-mode-badge", "GUEST"); badge.id = "guestModeBadge"; topbar.appendChild(badge); }
  }

  function addCloudBadge(role, session) {
    if (role !== "cloud" || !session?.account) return;
    const topbar = qs(".topbar");
    if (!topbar || qs("#cloudAccountBadge")) return;
    const badge = make("span", "cloud-account-badge", session.account.displayName || session.account.username);
    badge.id = "cloudAccountBadge";
    topbar.appendChild(badge);
  }

  async function logout(session) {
    try { if (session?.token) await api("logout", { token: session.token }); } catch {}
    setCloudSession(null);
    sessionStorage.removeItem(ACCESS_SESSION_KEY);
    location.reload();
  }

  function createAccountManagerDialog(session) {
    if (qs("#accountManagerDialog")) return qs("#accountManagerDialog");
    const dialog = document.createElement("dialog");
    dialog.id = "accountManagerDialog";
    dialog.className = "dialog account-manager-dialog";
    dialog.innerHTML = `
      <div class="dialog-head"><div><h2>アカウント管理</h2><p>友達用アカウントをここから追加できます。</p></div><button id="closeAccountManager" class="icon-btn" type="button">×</button></div>
      <div class="dialog-body">
        <div class="account-create-grid">
          <input id="newAccountUsername" type="text" placeholder="アカウント名">
          <input id="newAccountDisplayName" type="text" placeholder="表示名（省略可）">
          <input id="newAccountPassword" type="password" placeholder="パスワード">
          <label class="setting-check"><input id="newAccountClone" type="checkbox"><span>今のライブラリを複製</span></label>
        </div>
        <button id="createAccountBtn" class="primary-btn" type="button" style="margin-top:10px">アカウントを作成</button>
        <div id="accountManagerStatus" class="account-manager-status"></div>
        <div id="accountManagerList" class="account-manager-list"></div>
      </div>`;
    document.body.appendChild(dialog);
    qs("#closeAccountManager", dialog).addEventListener("click", () => dialog.close());
    qs("#createAccountBtn", dialog).addEventListener("click", async () => {
      const username = qs("#newAccountUsername", dialog).value.trim();
      const displayName = qs("#newAccountDisplayName", dialog).value.trim();
      const password = qs("#newAccountPassword", dialog).value;
      const cloneCurrent = qs("#newAccountClone", dialog).checked;
      const status = qs("#accountManagerStatus", dialog);
      if (!username || !password) { status.textContent = "アカウント名とパスワードを入力してください。"; return; }
      status.textContent = "作成中…";
      try {
        await api("create_account", { token: session.token, username, displayName, password, cloneCurrent });
        qs("#newAccountUsername", dialog).value = "";
        qs("#newAccountDisplayName", dialog).value = "";
        qs("#newAccountPassword", dialog).value = "";
        qs("#newAccountClone", dialog).checked = false;
        status.textContent = "作成しました。";
        await refreshAccountList(dialog, session);
      } catch (error) { status.textContent = error.message; }
    });
    return dialog;
  }

  async function refreshAccountList(dialog, session) {
    const list = qs("#accountManagerList", dialog);
    list.textContent = "読み込み中…";
    try {
      const data = await api("list_accounts", { token: session.token });
      list.innerHTML = "";
      for (const account of data.accounts || []) {
        const row = make("div", "account-row");
        const main = make("div", "account-row-main");
        main.innerHTML = `<strong>${escapeHtml(account.display_name || account.username)}${account.is_admin ? " · ADMIN" : ""}</strong><span>${escapeHtml(account.username)}</span>`;
        const actions = make("div", "account-row-actions");
        const pass = make("button", "ghost-btn", "パスワード変更"); pass.type = "button";
        pass.addEventListener("click", async () => {
          const next = prompt(`${account.username} の新しいパスワード`);
          if (!next) return;
          try { await api("change_password", { token: session.token, accountId: account.id, password: next }); alert("変更しました。"); } catch (error) { alert(error.message); }
        });
        actions.appendChild(pass);
        if (!account.is_admin) {
          const del = make("button", "danger-btn", "削除"); del.type = "button";
          del.addEventListener("click", async () => {
            if (!confirm(`${account.username} を削除しますか？曲データも削除されます。`)) return;
            try { await api("delete_account", { token: session.token, accountId: account.id }); await refreshAccountList(dialog, session); } catch (error) { alert(error.message); }
          });
          actions.appendChild(del);
        }
        row.append(main, actions); list.appendChild(row);
      }
    } catch (error) { list.textContent = error.message; }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  }

  function initCloudSettings(role, session) {
    const settingsDialog = qs("#settingsDialog");
    const versionInfo = qs(".version-info", settingsDialog || document);
    if (!settingsDialog || !versionInfo) return;

    if (role === "cloud") {
      const syncWrap = make("div", "cloud-sync-setting");
      const copy = make("div", "cloud-sync-copy");
      copy.innerHTML = `<strong>クラウド同期</strong><span>${escapeHtml(session.account.displayName || session.account.username)} のライブラリをSupabaseへ自動保存します。</span>`;
      const reload = make("button", "ghost-btn", "クラウドから再読み込み"); reload.type = "button";
      reload.addEventListener("click", async () => {
        if (!confirm("未同期のローカル変更がある場合は上書きされます。再読み込みしますか？")) return;
        reload.disabled = true;
        try { const data = await api("load_library", { token: session.token }); storeActiveLibrary(data.library); location.reload(); } catch (error) { alert(error.message); reload.disabled = false; }
      });
      syncWrap.append(copy, reload); versionInfo.before(syncWrap);

      const accountWrap = make("div", "account-setting");
      const aCopy = make("div", "account-setting-copy");
      aCopy.innerHTML = `<strong>アカウント</strong><span>${escapeHtml(session.account.username)}${session.account.isAdmin ? " · 管理者" : ""}</span>`;
      const buttons = make("div", "account-row-actions");
      if (session.account.isAdmin) {
        const manage = make("button", "ghost-btn", "アカウント管理"); manage.type = "button";
        manage.addEventListener("click", async () => { const dialog = createAccountManagerDialog(session); await refreshAccountList(dialog, session); dialog.showModal?.(); if (!dialog.open) dialog.setAttribute("open", ""); });
        buttons.appendChild(manage);
      }
      const logoutBtn = make("button", "ghost-btn", "ログアウト"); logoutBtn.type = "button"; logoutBtn.addEventListener("click", () => logout(session));
      buttons.appendChild(logoutBtn); accountWrap.append(aCopy, buttons); versionInfo.before(accountWrap);
    } else {
      const guestWrap = make("div", "account-setting");
      const gCopy = make("div", "account-setting-copy"); gCopy.innerHTML = "<strong>ゲスト</strong><span>この端末内だけに保存されます。</span>";
      const logoutBtn = make("button", "ghost-btn", "ログアウト"); logoutBtn.type = "button"; logoutBtn.addEventListener("click", () => logout(null));
      guestWrap.append(gCopy, logoutBtn); versionInfo.before(guestWrap);
    }
  }

  async function start() {
    prepareAssets();
    const config = await readConfig();
    const gate = createAccessGate();
    const access = await unlockSite(gate, config);
    if (access.role === "guest") await seedGuestLibraryIfEmpty(config.sharedLibrary);
    // v34: cloud data uses v33 partial sync; device audio stays local in IndexedDB.
    try { await loadMainApp(); } catch (error) { console.error(error); alert("LyricTubeの読み込みに失敗しました。ページを再読み込みしてください。"); return; }
    initMobileNavigation();
    applyGuestMode(access.role);
    addCloudBadge(access.role, access.session);
    initCloudSettings(access.role, access.session);
    window.LyricTubeVersion?.applyUi?.();
  }

  start();
})();