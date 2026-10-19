const assert=require("node:assert/strict");
const fs=require("node:fs");
const html=fs.readFileSync("index.html","utf8");
const app=fs.readFileSync("app.js","utf8");
const css=fs.readFileSync("workspace.css","utf8");
const shell=fs.readFileSync("sidebar.css","utf8");
const data=JSON.parse(fs.readFileSync("data/defaults.json","utf8"));

assert.match(html,/<details id="playbackAdvanced" class="playback-advanced">[\s\S]*?<section class="range-card">[\s\S]*?<section class="sync-card">/,"advanced controls stay inside collapsible panel");
assert.match(html,/<details id="songOptionalDetails" class="song-optional-details">[\s\S]*?class="lyrics-source-box"/,"lyrics editor must be optional when adding a song");
assert.match(app,/els\.songOptionalDetails\.open=Boolean\(song\)/,"editing an existing song must expand lyrics");
assert.match(html,/id="librarySort"/);
assert.match(html,/id="browseSort"/);
assert.match(app,/function sortedDisplaySongs\(songs\)\{[\s\S]*?currentView\.type==="playlist"/,"playlist order must not be sorted");
assert.match(app,/const songs=sortedDisplaySongs\(viewSongs\(\)\)/,"browse sorts its display only");
assert.match(app,/const filtered=sortedDisplaySongs\(viewSongs\(\)\)/,"sidebar sorts its display only");
assert.match(app,/changeLibrarySort\(els\.librarySort\.value\)/);
assert.match(app,/changeLibrarySort\(els\.browseSort\.value\)/);
assert.match(html,/core\/library-sort\.js\?v=20261019-2/);
assert.match(shell,/workspace\.css\?v=20261019-2/);
assert.equal(data.appVersion,"v0.13.4");
assert.equal(data.dataSchemaVersion,4,"this UI update must not migrate stored data");
for(const token of ["--ui-line","--ui-surface-2","--ui-text"]){
  assert(css.includes(token),"visual controls need theme tokens: "+token);
}
console.log("listening layout regression guards passed");
