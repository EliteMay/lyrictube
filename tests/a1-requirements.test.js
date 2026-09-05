const fs = require("fs");
const assert = require("assert");

const ui = fs.readFileSync("a1-ui-guards.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const css = fs.readFileSync("playback-a1.css", "utf8");
const cloud = fs.readFileSync("cloud-sync.js", "utf8");
const lyrics = fs.readFileSync("lyrics-providers.js", "utf8");

// Sidebar main-row click must mean immediate playback, while auxiliary actions
// stay outside the .song-item click target.
assert(ui.includes('#songList .song-item'), "A1 main song-row click guard missing");
assert(ui.includes('window.selectSong(songId, true)'), "sidebar song row must autoplay immediately");
assert(ui.includes('event.stopImmediatePropagation()'), "legacy select-only row handler must be suppressed");
assert(ui.includes('row.dataset.a1SongId'), "song-row identity annotation missing");
assert(cloud.includes('a1-ui-guards.js'), "A1 UI guard bootstrap missing");

// Autoplay selections must issue media work before the expensive full rerender,
// and a click made while the YouTube iframe is still booting must not be lost.
assert(app.includes('loadSelectedVideo(true);'), "autoplay selection must request media immediately");
assert(app.includes('requestAnimationFrame(()=>{'), "full visual render must yield until after the media request");
assert(app.includes('let pendingYoutubeRequest = null'), "pending YouTube request state missing");
assert(app.includes('function applyPendingYoutubeRequest'), "pending YouTube request replay missing");
assert(app.includes('pendingYoutubeRequest=request'), "latest YouTube selection must be retained while player is not ready");
assert(app.includes('autoplay:initial?.autoplay?1:0'), "initial iframe creation must preserve autoplay intent");
assert(app.includes("if(document.querySelector('script[src*=\"youtube.com/iframe_api\"]'))return;"), "duplicate YouTube API loads must be prevented");
assert(ui.includes('script.src = "https://www.youtube.com/iframe_api"'), "YouTube API must warm during the access gate");
assert(ui.includes('https://www.youtube.com'), "YouTube preconnect is missing");
assert(ui.includes('https://i.ytimg.com'), "thumbnail origin preconnect is missing");

// The row has primary content + playlist action + More action on one line.
assert(/#songList \.song-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+30px\s+30px/i.test(css), "sidebar song row must reserve three horizontal columns");
assert(css.includes('text-overflow: ellipsis'), "long sidebar metadata must truncate instead of wrapping actions");
assert(css.includes('#songList .a1-song-menu-btn'), "subtle More action styling missing");
assert(/\.sidebar-tools \.ghost-btn,[\s\S]*\.sidebar-tools \.help-icon-btn[\s\S]*height:\s*38px\s*!important/i.test(css), "footer tools must share the same height");

// Lyrics searches need generation ownership and target checks before async UI writes.
assert(lyrics.includes('let searchGeneration = 0'), "lyrics search generation token missing");
assert(lyrics.includes('let activeSearch = null'), "active lyrics search ownership missing");
assert(lyrics.includes('function isSearchCurrent(context)'), "stale-result predicate missing");
assert(lyrics.includes('activeSearch === context'), "search UI ownership check missing");
assert(lyrics.includes('sameTarget(context)'), "song/title/artist target guard missing");
assert(lyrics.includes('activeSearch.controller?.abort()'), "superseded provider requests should be aborted when possible");
assert(lyrics.includes('invalidateActiveSearch("results-closed")'), "closing result dialog must invalidate automatic reopen");
assert(lyrics.includes('invalidateActiveSearch("origin-closed")'), "closing source dialog must invalidate delayed results");
assert(lyrics.includes('if (!isSearchCurrent(context)) return;'), "async provider results must be guarded before UI updates");
assert(lyrics.includes('pendingLyricsResults = typeof rankLyricsResults'), "guarded provider merge must update current result set");
assert(!lyrics.includes('let searchRunning = false'), "single-flight search lock prevents newer searches from superseding old ones");

console.log("A1 completed requirement regression guards passed");
