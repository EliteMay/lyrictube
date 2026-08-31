const fs=require("fs");
const assert=require("assert");

const workspace=fs.readFileSync("workspace.css","utf8");
const sidebar=fs.readFileSync("sidebar.css","utf8");

assert(sidebar.startsWith('@import url("workspace.css?v=20260831-design1");'),"workspace visual layer must load from canonical sidebar entry");
assert(workspace.includes("media workspace"),"visual direction comment missing");
assert(workspace.includes(".browse-brand-art{display:none}"),"generic browse hero artwork should stay out of the library view");
assert(/\.browse-hero\{[\s\S]*?border:0;[\s\S]*?background:none;[\s\S]*?box-shadow:none;/.test(workspace),"browse header must remain a flat library header");
assert(/\.version-card,\.transport-card,\.range-card,\.sync-card\{[\s\S]*?background:transparent;[\s\S]*?border:0;/.test(workspace),"secondary player controls must not regress into equal-weight decorative cards");
assert(/\.lyrics-panel\{[\s\S]*?background:var\(--ui-surface\);[\s\S]*?box-shadow:none;/.test(workspace),"lyrics must remain a dedicated reading surface");
assert(workspace.includes("@media(prefers-reduced-motion:reduce)"),"reduced-motion guard missing");
assert(sidebar.includes("grid-template-rows:auto minmax(0,1fr) auto"),"persistent sidebar regions missing");
assert(sidebar.includes(".sidebar-tools"),"persistent sidebar actions missing");

console.log("visual workspace regression guards passed");
