const fs=require("node:fs");
const assert=require("node:assert/strict");

const html=fs.readFileSync("index.html","utf8");
const app=fs.readFileSync("app.js","utf8");
const workspace=fs.readFileSync("workspace.css","utf8");
const sidebar=fs.readFileSync("sidebar.css","utf8");
const version=fs.readFileSync("version.js","utf8");

assert.match(html,/id="playerAddSongBtn"[^>]*type="button"/,"player empty state must offer a real button");
assert.match(html,/id="playerPlaceholder"[\s\S]*?id="playerAddSongBtn"/,"player action must be inside the empty player");
assert.match(app,/els\.playerAddSongBtn\.addEventListener\("click",\(\)=>openSongDialog\(\)\)/,"player action must open the existing add-song dialog");
assert.match(app,/els\.playerAddSongBtn\.hidden=has/,"selected tracks must not show first-song action");
assert.match(app,/action\.addEventListener\("click",\(\)=>openSongDialog\(song\|\|null\)\)/,"lyrics action must edit selected track or add a new one");
assert.match(app,/action\.textContent=song\?"歌詞を追加・検索":"＋ 曲を追加"/,"lyrics empty state should distinguish edit vs first use");
assert.match(workspace,/\.player-placeholder \.placeholder-add\[hidden\]\{display:none!important\}/,"hidden player action must stay hidden in CSS");
assert.match(workspace,/\.lyrics-view\.empty \.lyrics-empty-action/,"lyrics action must have theme-aware styling");
assert.match(sidebar,/workspace\.css\?v=20261019-4/,"workspace stylesheet must bypass the previous cache");
const build = version.match(/build:\\s*"([0-9]{8}-[0-9]+)"/)?.[1];
assert.ok(build, "version.js must declare the current cache revision");
assert.ok(html.includes('sidebar.css?v=' + build), "sidebar stylesheet must use the current build revision");
assert.ok(html.includes('version.js?v=' + build), "version script must use the current build revision");

console.log("empty-state CTA regression guards passed");
