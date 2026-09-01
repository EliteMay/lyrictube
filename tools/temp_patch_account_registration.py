from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, got {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


site = "site-shell.js"
replace_once(site,
    'const VERSION = window.LyricTubeVersion?.build || "20260831-1";',
    'const VERSION = window.LyricTubeVersion?.build || "20260901-1";')

replace_once(site,
'''          <p id="accessStatus" class="access-status">接続を確認しています…</p>
        </form>
        <div class="access-divider"><span>or</span></div>''',
'''          <p id="accessStatus" class="access-status">接続を確認しています…</p>
        </form>
        <button id="openRegisterBtn" class="access-create-toggle" type="button" disabled>＋ 新しいアカウントを作る</button>
        <form id="registerForm" class="access-register-form" hidden autocomplete="off">
          <div class="access-register-head">
            <strong>新規アカウント作成</strong>
            <span>作成キーを知っている人だけ登録できます。作成後はこの端末でそのままログインします。</span>
          </div>
          <label>
            <span class="access-label">ACCOUNT</span>
            <input id="registerUsername" type="text" autocomplete="username" maxlength="24" placeholder="3〜24文字の英数字・._-">
          </label>
          <label>
            <span class="access-label">DISPLAY NAME <small>任意</small></span>
            <input id="registerDisplayName" type="text" maxlength="40" placeholder="表示名">
          </label>
          <label>
            <span class="access-label">PASSWORD</span>
            <input id="registerPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="8文字以上">
          </label>
          <label>
            <span class="access-label">PASSWORD AGAIN</span>
            <input id="registerPasswordAgain" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="もう一度入力">
          </label>
          <label>
            <span class="access-label">ACCOUNT CREATE KEY</span>
            <input id="registerCreationKey" type="password" autocomplete="off" placeholder="アカウント作成キー">
            <span class="access-register-hint">作成キーはこのブラウザへ保存しません。</span>
          </label>
          <div class="access-register-actions">
            <button id="cancelRegisterBtn" class="access-register-cancel" type="button">戻る</button>
            <button id="registerSubmit" class="access-register-submit" type="submit">作成してログイン</button>
          </div>
          <p id="registerStatus" class="access-register-status" aria-live="polite"></p>
        </form>
        <div class="access-divider"><span>or</span></div>''')

replace_once(site,
'''      const guest = qs("#guestAccessBtn", gate);
      const status = qs("#accessStatus", gate);
      usernameInput.disabled = false;
      passwordInput.disabled = false;
      submit.disabled = false;
      guest.disabled = false;
      status.textContent = "";
      if (!applyRememberedAccount(gate, usernameInput, passwordInput)) passwordInput.focus();''',
'''      const guest = qs("#guestAccessBtn", gate);
      const status = qs("#accessStatus", gate);
      const intro = qs(".access-copy", gate);
      const divider = qs(".access-divider", gate);
      const openRegister = qs("#openRegisterBtn", gate);
      const registerForm = qs("#registerForm", gate);
      const cancelRegister = qs("#cancelRegisterBtn", gate);
      const registerSubmit = qs("#registerSubmit", gate);
      const registerStatus = qs("#registerStatus", gate);
      const registerUsername = qs("#registerUsername", gate);
      const registerDisplayName = qs("#registerDisplayName", gate);
      const registerPassword = qs("#registerPassword", gate);
      const registerPasswordAgain = qs("#registerPasswordAgain", gate);
      const registerCreationKey = qs("#registerCreationKey", gate);
      usernameInput.disabled = false;
      passwordInput.disabled = false;
      submit.disabled = false;
      guest.disabled = false;
      openRegister.disabled = false;
      status.textContent = "";
      if (!applyRememberedAccount(gate, usernameInput, passwordInput)) passwordInput.focus();

      const setRegisterMode = enabled => {
        form.hidden = enabled;
        openRegister.hidden = enabled;
        divider.hidden = enabled;
        guest.hidden = enabled;
        registerForm.hidden = !enabled;
        registerStatus.textContent = "";
        registerStatus.classList.remove("success");
        if (enabled) {
          intro.textContent = "作成キーを使って、新しいクラウドアカウントを作成します。";
          if (!registerUsername.value) registerUsername.value = usernameInput.value.trim();
          registerUsername.focus();
        } else {
          intro.textContent = readRememberedAccount()
            ? "前回のアカウントを使います。パスワードだけ入力してください。"
            : "アカウント名とパスワードでログインします。";
          (usernameInput.value ? passwordInput : usernameInput).focus();
        }
      };
      openRegister.addEventListener("click", () => setRegisterMode(true));
      cancelRegister.addEventListener("click", () => setRegisterMode(false));''')

replace_once(site,
'''      guest.addEventListener("click", () => {
        setCloudSession(null);''',
'''      registerForm.addEventListener("submit", async event => {
        event.preventDefault();
        const username = registerUsername.value.trim();
        const displayName = registerDisplayName.value.trim();
        const password = registerPassword.value;
        const passwordAgain = registerPasswordAgain.value;
        const creationKey = registerCreationKey.value;
        registerStatus.classList.remove("success");
        if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username)) {
          registerStatus.textContent = "アカウント名は3〜24文字の英数字・._-で入力してください。";
          registerUsername.focus();
          return;
        }
        if (password.length < 8) {
          registerStatus.textContent = "パスワードは8文字以上にしてください。";
          registerPassword.focus();
          return;
        }
        if (password !== passwordAgain) {
          registerStatus.textContent = "確認用パスワードが一致していません。";
          registerPasswordAgain.focus();
          return;
        }
        if (!creationKey) {
          registerStatus.textContent = "アカウント作成キーを入力してください。";
          registerCreationKey.focus();
          return;
        }

        registerSubmit.disabled = true;
        registerStatus.textContent = "アカウントを作成しています…";
        try {
          const data = await api("register_account", { username, displayName, password, creationKey });
          rememberAccount(data?.account?.username || username);
          const session = { token: data.token, account: data.account };
          setCloudSession(session);
          sessionStorage.setItem(ACCESS_SESSION_KEY, "cloud");
          const loaded = await api("load_library", { token: session.token });
          storeActiveLibrary(loaded.library);
          registerCreationKey.value = "";
          registerStatus.textContent = "作成しました。ログインします…";
          registerStatus.classList.add("success");
          gate.classList.add("unlocking");
          setTimeout(() => { gate.remove(); resolve({ role: "cloud", config, session }); }, 170);
        } catch (error) {
          registerStatus.textContent = error.message || "アカウントを作成できませんでした。";
          registerSubmit.disabled = false;
        }
      });

      guest.addEventListener("click", () => {
        setCloudSession(null);''')

# Cache-bust the frontend as one build unit.
index = Path("index.html")
index_text = index.read_text(encoding="utf-8")
if "20260831-1" not in index_text:
    raise SystemExit("index.html: old build marker missing")
index.write_text(index_text.replace("20260831-1", "20260901-1"), encoding="utf-8")

version = Path("version.js")
version_text = version.read_text(encoding="utf-8")
if 'build: "20260831-1"' not in version_text:
    raise SystemExit("version.js: old build marker missing")
version.write_text(version_text.replace('build: "20260831-1"', 'build: "20260901-1"', 1), encoding="utf-8")

print("account registration patch applied")
