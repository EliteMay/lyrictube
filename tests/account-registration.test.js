const fs=require("fs");
const assert=require("assert");

const shell=fs.readFileSync("site-shell.js","utf8");
const authCss=fs.readFileSync("auth-ui.css","utf8");
const index=fs.readFileSync("index.html","utf8");
const version=fs.readFileSync("version.js","utf8");
const build=version.match(/build:\s*"([^"]+)"/)?.[1];

assert(build,"current build metadata missing");
assert(shell.includes('id="openRegisterBtn"'),"registration entry action missing");
assert(shell.includes('id="registerForm"'),"registration form missing");
assert(shell.includes('api("register_account", { username, displayName, password, creationKey })'),"registration API call missing");
assert(shell.includes('registerCreationKey.value = ""'),"registration key must be cleared after success");
assert(shell.includes('password !== passwordAgain'),"password confirmation guard missing");
assert(authCss.includes('.access-register-form[hidden]'),"registration form hidden-state CSS missing");
assert(authCss.includes('.access-register-actions'),"registration action layout missing");
assert(index.includes(`auth-ui.css?v=${build}`),"registration CSS cache revision must match current build");

const publicFiles=[shell,authCss,index,version].join("\n");
assert(!/LyricGate-[A-Za-z0-9!_-]{8,}/.test(publicFiles),"plain account creation key must not be committed to frontend files");

console.log("account registration regression guards passed");
