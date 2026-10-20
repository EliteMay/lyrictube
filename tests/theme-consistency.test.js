const fs=require("fs");
const assert=require("assert");

const sidebar=fs.readFileSync("sidebar.css","utf8");
const theme=fs.readFileSync("theme.css","utf8");

assert(/^@import url\("workspace\.css\?v=[^"]+"\);\r?\n@import url\("theme\.css\?v=[^"]+"\);/.test(sidebar),"canonical theme layer must load after workspace layer");
assert(!sidebar.includes('background:#0c0f13!important'),"sidebar must not be locked to the old dark color");
assert(sidebar.includes('background:var(--ui-nav-bg)!important'),"sidebar must consume the canonical nav token");

for(const name of ["dark","ocean","light","synthwave","midnight","sepia"]){
  assert(theme.includes(`body.theme-${name}{`),`theme token block missing: ${name}`);
}

for(const token of [
  "--ui-bg","--ui-nav-bg","--ui-topbar-bg","--ui-bottom-bg",
  "--ui-surface","--ui-surface-2","--ui-surface-3",
  "--ui-line","--ui-line-strong","--ui-text","--ui-text-2","--ui-text-3"
]){
  assert(theme.includes(token),`canonical theme token missing: ${token}`);
}

assert(theme.includes('background:var(--ui-bg)!important'),"main theme background normalization missing");
assert(theme.includes('background:transparent!important;\n  border-color:transparent!important;'),"secondary control cards must be flattened across themes");
assert(theme.includes('-webkit-text-fill-color:currentColor!important'),"legacy gradient lyric text must be reset");
assert(theme.includes('background:var(--ui-surface-3)!important'),"theme-aware hover surface guard missing");
assert(theme.includes('content:none!important'),"legacy ambient background layer guard missing");

function blockFor(name) {
  const start=theme.indexOf(`body.theme-${name}{`);
  assert(start>=0,`theme block missing: ${name}`);
  return theme.slice(start,theme.indexOf("\n}",start)+2);
}
const darkBlock=blockFor("dark");
const oceanBlock=blockFor("ocean");
const midnightBlock=blockFor("midnight");
assert(darkBlock.includes("--ui-bg:#090b0e"),"Dark should use a genuine dark surface");
assert(!darkBlock.includes("--ui-bg:#1c315f"),"Ocean colors must not leak into Dark");
assert(oceanBlock.includes("--ui-bg:#1c315f"),"Ocean should preserve the blue palette");
assert(oceanBlock.includes("--ui-surface:#294475"),"Ocean panel color should stay blue");
assert(midnightBlock.includes("--ui-bg:#050a15"),"Midnight should be untouched");
assert(theme.includes("body.theme-ocean .lyrics-panel"),"Ocean must share theme normalization with other themes");
assert(theme.includes("body.theme-ocean .bottom-player"),"Ocean must theme the mini player");
assert(theme.includes("body.theme-ocean .dialog"),"Ocean must theme dialogs consistently");

console.log("theme consistency regression guards passed");
