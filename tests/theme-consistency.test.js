const fs=require("fs");
const assert=require("assert");

const sidebar=fs.readFileSync("sidebar.css","utf8");
const theme=fs.readFileSync("theme.css","utf8");

assert(sidebar.startsWith('@import url("workspace.css?v=20260831-design1");\n@import url("theme.css?v=20260831-theme1");'),"canonical theme layer must load after workspace layer");
assert(!sidebar.includes('background:#0c0f13!important'),"sidebar must not be locked to the old dark color");
assert(sidebar.includes('background:var(--ui-nav-bg)!important'),"sidebar must consume the canonical nav token");

for(const name of ["dark","light","synthwave","midnight","sepia"]){
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

console.log("theme consistency regression guards passed");
