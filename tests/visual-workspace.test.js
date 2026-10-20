const fs=require("fs");
const assert=require("assert");

const workspace=fs.readFileSync("workspace.css","utf8");
const sidebar=fs.readFileSync("sidebar.css","utf8");

assert(/^@import url\("workspace\.css\?v=[^"]+"\);/.test(sidebar),"workspace visual layer must load from canonical sidebar entry");
assert(workspace.includes("media workspace"),"visual direction comment missing");
assert(workspace.includes(".browse-brand-art{display:none}"),"generic browse hero artwork should stay out of the library view");
assert(/\.browse-hero\{[\s\S]*?border:0;[\s\S]*?background:none;[\s\S]*?box-shadow:none;/.test(workspace),"browse header must remain a flat library header");
assert(/\.version-card,\.transport-card,\.range-card,\.sync-card\{[\s\S]*?background:transparent;[\s\S]*?border:0;/.test(workspace),"secondary player controls must not regress into equal-weight decorative cards");
assert(/\.lyrics-panel\{[\s\S]*?background:var\(--ui-surface\);[\s\S]*?box-shadow:none;/.test(workspace),"lyrics must remain a dedicated reading surface");
assert(workspace.includes("@media(prefers-reduced-motion:reduce)"),"reduced-motion guard missing");
assert(sidebar.includes("grid-template-rows:auto minmax(0,1fr) auto"),"persistent sidebar regions missing");
assert(sidebar.includes(".sidebar-tools"),"persistent sidebar actions missing");

const art=fs.readFileSync("visual-art.css","utf8");
const html=fs.readFileSync("index.html","utf8");
assert(html.includes('href="visual-art.css?v=20261019-4"'),"art stylesheet should load after the canonical theme layers");
assert(html.indexOf('href="visual-art.css')>html.indexOf('href="sidebar.css'),"art stylesheet must be the last visual layer");
assert(fs.statSync("assets/lyrictube-wave.webp").size<100000,"artwork should be lightweight");
assert(art.includes('url("assets/lyrictube-wave.webp")'),"artwork URL missing");
for(const theme of ["dark","midnight","synthwave","light","sepia"]){
  assert(art.includes(`body.theme-${theme} .browse-hero`),`browse artwork must support ${theme}`);
}
assert(art.includes("pointer-events:none"),"artwork must not capture user input");
assert(art.includes("linear-gradient"),"artwork needs a text contrast overlay");

console.log("visual workspace regression guards passed");
