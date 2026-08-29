(() => {
  "use strict";

  const LAST_ACCOUNT_KEY = "lyrictube.lastCloudAccount.v1";
  const CLOUD_SESSION_KEY = "lyrictube.cloudSession.v1";
  const API_MARKER = "/functions/v1/lyrictube-api";

  function readRememberedAccount() {
    try { return String(localStorage.getItem(LAST_ACCOUNT_KEY) || "").trim(); }
    catch { return ""; }
  }

  function rememberAccount(username) {
    const value = String(username || "").trim();
    if (!value) return;
    try { localStorage.setItem(LAST_ACCOUNT_KEY, value); } catch {}
  }

  function forgetAccount() {
    try { localStorage.removeItem(LAST_ACCOUNT_KEY); } catch {}
  }

  function rememberCurrentSession() {
    try {
      const raw = sessionStorage.getItem(CLOUD_SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      rememberAccount(session?.account?.username);
    } catch {}
  }

  // If the user is already logged in when this patch arrives, migrate that account
  // into persistent local storage. Only the account name is saved; never the password.
  rememberCurrentSession();

  // Learn the account name only after the existing API confirms a successful login.
  // This keeps the server-side authentication rules unchanged.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    let attemptedUsername = "";
    try {
      const url = typeof input === "string" ? input : String(input?.url || "");
      if (url.includes(API_MARKER) && String(init?.method || "GET").toUpperCase() === "POST" && typeof init?.body === "string") {
        const body = JSON.parse(init.body);
        if (body?.action === "login") attemptedUsername = String(body?.username || "").trim();
      }
    } catch {}

    const response = await nativeFetch(input, init);

    if (attemptedUsername) {
      try {
        const data = await response.clone().json();
        if (response.ok && data?.ok) {
          rememberAccount(data?.account?.username || attemptedUsername);
        }
      } catch {}
    }
    return response;
  };

  function makeSavedAccountRow(username, accountRow, usernameInput, intro) {
    const row = document.createElement("div");
    row.className = "remembered-account-row";
    row.innerHTML = `
      <div class="remembered-account-copy">
        <span>ACCOUNT</span>
        <strong></strong>
      </div>
      <button type="button" class="remembered-account-change">変更</button>`;
    row.querySelector("strong").textContent = username;

    row.querySelector(".remembered-account-change").addEventListener("click", () => {
      forgetAccount();
      row.remove();
      accountRow.hidden = false;
      usernameInput.value = "";
      if (intro) intro.textContent = "アカウント名とパスワードでログインします。ログイン後、この端末ではアカウント名を記憶できます。";
      usernameInput.focus();
    });
    return row;
  }

  function enhanceAccessGate() {
    const gate = document.getElementById("accessGate");
    const form = document.getElementById("accessForm");
    const usernameInput = document.getElementById("accessUsername");
    const passwordInput = document.getElementById("accessPassword");
    const accountRow = gate?.querySelector(".access-account-row");
    const intro = gate?.querySelector(".access-copy");
    if (!gate || !form || !usernameInput || !passwordInput || !accountRow || form.dataset.accountMemoryReady === "true") return false;

    form.dataset.accountMemoryReady = "true";
    const remembered = readRememberedAccount();

    if (remembered) {
      usernameInput.value = remembered;
      accountRow.hidden = true;
      const savedRow = makeSavedAccountRow(remembered, accountRow, usernameInput, intro);
      accountRow.insertAdjacentElement("afterend", savedRow);
      if (intro) intro.textContent = "前回のアカウントを使います。パスワードだけでログインできます。";
      passwordInput.focus();
    } else if (intro) {
      intro.textContent = "初回はアカウント名とパスワードを入力します。次回から、この端末ではパスワードだけでログインできます。";
    }

    return true;
  }

  function installStyle() {
    if (document.getElementById("rememberedAccountStyle")) return;
    const style = document.createElement("style");
    style.id = "rememberedAccountStyle";
    style.textContent = `
      .remembered-account-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--panel2)}
      .remembered-account-copy{display:grid;gap:2px;min-width:0}.remembered-account-copy span{font-size:9px;font-weight:800;letter-spacing:.1em;color:var(--muted)}.remembered-account-copy strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .remembered-account-change{border:0;background:transparent;color:var(--muted);font-size:10px;font-weight:800;cursor:pointer;padding:6px 8px;border-radius:7px}.remembered-account-change:hover{background:var(--panel3,var(--panel));color:var(--text)}
    `;
    document.head.appendChild(style);
  }

  installStyle();
  if (!enhanceAccessGate()) {
    const observer = new MutationObserver(() => {
      if (enhanceAccessGate()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 30000);
  }

  console.info("[LyricTube] remembered-account login enabled (password is never stored)");
})();