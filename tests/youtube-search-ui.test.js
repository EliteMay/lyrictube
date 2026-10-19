const fs=require("node:fs");
const assert=require("node:assert/strict");
const index=fs.readFileSync("index.html","utf8");
const app=fs.readFileSync("app.js","utf8");
const shell=fs.readFileSync("site-shell.js","utf8");
const source=fs.readFileSync("core/youtube-search.js","utf8");
const css=fs.readFileSync("workspace.css","utf8");
const defaults=JSON.parse(fs.readFileSync("data/defaults.json","utf8"));
const version=fs.readFileSync("version.js","utf8");

for(const id of ["searchYoutubeForSongBtn","searchYoutubeForVersionBtn","youtubeSearchDialog","youtubeSearchQuery","youtubeSearchApiKey","youtubeSearchSubmit","youtubeSearchResults","youtubeSearchExternal"]){
  assert(index.includes('id="'+id+'"'),"missing search UI: "+id);
}
assert(shell.includes('loadScript(`core/youtube-search.js?v=${VERSION}`'),"search module loads after app");
assert(shell.indexOf('loadScript(`core/youtube-search.js')>shell.indexOf('loadScript(`app.js'),"search initializes after core");
assert.match(app,/lyrictube:youtube-search:select/,"existing form receives selection");
assert.match(app,/blockDuplicateVideo\(detail\.videoId,exclude\)/,"duplicate video guard stays active");
assert.match(app,/applyYoutubeMetadata\(\{/,"existing title/artist parsing used");
assert(source.includes('sessionStorage.setItem(SESSION_KEY'),'only session-level key storage');
assert(!source.includes('localStorage.'),"do not save search key in synced profile data");
assert(!/key:\s*["']AIza/.test(source),"no hardcoded API key");
assert(source.includes("textContent = item.title"),"search titles must be plain text");
assert(source.includes('const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/'),"trusted video ID shape");
assert(css.includes(".youtube-search-dialog"),"dialog should be styled");
assert(css.includes("var(--ui-surface)"),"theme token");
assert.equal(defaults.appVersion,"v0.13.6");
assert.equal(defaults.dataSchemaVersion,4,"search must not change existing library schema");
assert(version.includes('version: "v0.13.6"'));
assert(index.includes("20261019-4"));
console.log("YouTube search UI contract tests passed");
