(() => {
  "use strict";

  // Current production pgcrypto crypt(..., gen_salt('bf')) accepts at most 72 input BYTES.
  // This guards new credentials; existing credentials must remain login-compatible.
  const MAX_BCRYPT_BYTES = 72;

  function newPasswordError(value) {
    const password = String(value ?? "");
    if (password.length < 8 || password.length > 128) {
      return "パスワードは8〜128文字で入力してください。";
    }
    if (new TextEncoder().encode(password).byteLength > MAX_BCRYPT_BYTES) {
      return "パスワードはUTF-8で72バイト以内にしてください（日本語や絵文字は複数バイトになります）。";
    }
    return "";
  }

  const policy = Object.freeze({ MAX_BCRYPT_BYTES, newPasswordError });
  if (typeof module !== "undefined" && module.exports) module.exports = policy;
  if (typeof window !== "undefined") window.LyricTubePasswordPolicy = policy;
})();
