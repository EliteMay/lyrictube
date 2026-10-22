const assert = require("node:assert/strict");
const fs = require("node:fs");
const policy = require("../core/password-policy.js");

assert.equal(policy.newPasswordError("12345678"), "");
assert.equal(policy.newPasswordError("a".repeat(72)), "");
assert.match(policy.newPasswordError("a".repeat(73)), /72バイト/);
assert.match(policy.newPasswordError("短い"), /8〜128文字/);
assert.equal(policy.newPasswordError("あ".repeat(24)), "");
assert.match(policy.newPasswordError("あ".repeat(25)), /72バイト/);
assert.equal(policy.newPasswordError("😀".repeat(18)), "");
assert.match(policy.newPasswordError("😀".repeat(19)), /72バイト/);
assert.match(policy.newPasswordError("x".repeat(129)), /8〜128文字/);

const shell = fs.readFileSync("site-shell.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
assert(html.includes('core/password-policy.js'), "password policy must load before the site shell");
assert(html.indexOf('core/password-policy.js') < html.indexOf('site-shell.js'), "policy must load before auth forms");
assert(shell.includes('LyricTubePasswordPolicy.newPasswordError(password)'), "registration and admin create must validate new passwords");
assert(shell.includes('LyricTubePasswordPolicy.newPasswordError(password)'), "registration, admin creation and password dialog must validate new passwords");
assert(shell.includes('currentInput.type = "password"'), "sensitive-action reauthentication must be masked");
// Login intentionally must not reject previously registered long passwords.
assert(shell.includes('const data = await api("login", { username, password })'), "legacy login path must remain supported");
console.log("password UTF-8 byte boundary regression guards passed");
