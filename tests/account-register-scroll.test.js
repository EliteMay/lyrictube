"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");

const css=fs.readFileSync("auth-ui.css","utf8");
const version=fs.readFileSync("version.js","utf8");
const index=fs.readFileSync("index.html","utf8");
const build=version.match(/build:\s*"([^"]+)"/)?.[1];

assert(build,"current build metadata missing");
assert.match(css,/\.access-card\s*\{[\s\S]*max-height:calc\(100dvh - 24px\)/,"access card must be capped to the dynamic viewport");
assert.match(css,/\.access-card\s*\{[\s\S]*overflow-y:auto/,"access card must scroll vertically when registration content is taller than the viewport");
assert.match(css,/overscroll-behavior-y:contain/,"registration scroll should stay inside the access card");
assert.match(css,/@supports not \(height:100dvh\)[\s\S]*100vh/,"100vh fallback is required for older browsers");
assert(index.includes(`auth-ui.css?v=${build}`),"auth UI cache revision must follow current build metadata");
console.log("account registration overflow regression guards passed");
