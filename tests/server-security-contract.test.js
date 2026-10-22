const assert = require("node:assert/strict");
const fs = require("node:fs");

const edge = fs.readFileSync("supabase/functions/lyrictube-api/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261022_password_utf8_boundary.sql", "utf8");
const shell = fs.readFileSync("site-shell.js", "utf8");

for (const name of ["lyrictube_create_account", "lyrictube_register_account", "lyrictube_set_password"]) {
  assert(migration.includes(`FUNCTION public.${name}`), "migration missing " + name);
}
assert.equal((migration.match(/octet_length\(convert_to\(/g) || []).length, 3, "every password writer needs a server-side byte check");
assert.match(migration, /REVOKE ALL ON FUNCTION public.lyrictube_set_password/);
assert.match(edge, /LYRICTUBE_SIGNUP_KEY_SHA256/);
assert(!/const SIGNUP_KEY_SHA256 = "[0-9a-f]{64}"/.test(edge), "do not commit the private signup-key digest");
assert.match(edge, /new TextEncoder\(\)\.encode\(value\)\.byteLength > 72/);
assert.match(edge, /await readJsonBounded\(req\)/);
assert.match(edge, /MAX_JSON_BYTES = 4 \* 1024 \* 1024/);
assert.match(edge, /if \(invalidPassword\) return fail\(invalidPassword\)/);
assert.match(edge, /reauthenticate\(account, body\?\.currentPassword\)/);
assert.match(edge, /p_username: account\.username/);
assert.match(edge, /lyrictube_login_check/);
assert.match(shell, /promptForSensitivePassword\(/);
assert.match(shell, /currentPassword: input\.currentPassword/);
assert.match(shell, /currentInput\.type = "password"/);
assert.match(shell, /nextInput\.type = "password"/);
assert(!shell.includes("const next = prompt("), "new password must not use a visible browser prompt");
assert.match(edge, /action === "login"/);
assert.match(edge, /const password = String\(body\?\.password \|\| ""\);/);
console.log("Supabase Edge / database security regression contracts passed");
