const fs = require("fs");
const assert = require("assert");

const ui = fs.readFileSync("a1-ui-guards.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const playback = fs.readFileSync("playback-a1.js", "utf8");
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

// A single click must have one autoplay control path. The old A1 guard retried
// play() for five seconds and could contend with the actual YouTube loader.
assert(app.includes('loadSelectedVideo(true);'), "autoplay selection must request media immediately");
assert(app.includes('let pendingYoutubeRequest = null'), "pending YouTube request state missing");
assert(app.includes('function applyPendingYoutubeRequest'), "pending YouTube request replay missing");
assert(app.includes('pendingYoutubeRequest=request'), "latest YouTube selection must be retained while player is not ready");
assert(app.includes('autoplay:initial?.autoplay?"1":"0"'), "initial iframe creation must preserve autoplay intent");
assert(app.includes('if(playerId===String(pending.videoId))'), "initial YouTube onReady must avoid reloading the same video");
assert(app.includes('let initialAutoplayProgressed=false'), "initial YouTube autoplay progress guard missing");
assert(app.includes('if(initial?.autoplay&&(e.data===3||e.data===1))initialAutoplayProgressed=true'), "initial autoplay progress must be observed before onReady fallback");
assert(app.includes('pending.autoplay&&!initialAutoplayProgressed'), "onReady must not restart autoplay after buffering already began");
assert(!ui.includes('maxWaitMs = 5000'), "five-second autoplay retry loop must not return");
assert(!ui.includes('function ensureAutoplayStarted'), "A1 UI must not own a second autoplay controller");
assert(!ui.includes('core.play?.()'), "A1 UI must not repeatedly call PlayerController.play");
assert(ui.includes('lyrictube.playbackDiagnostics.v2'), "local playback-start diagnostics missing");
assert(ui.includes('playbackDiagnosticPanel'), "visible playback diagnostic panel missing");
assert(ui.includes('PerformanceObserver'), "long-task playback diagnostics missing");
assert(ui.includes('script.src = "https://www.youtube.com/iframe_api"'), "YouTube API must warm during the access gate");
assert(ui.includes('https://www.youtube.com'), "YouTube preconnect is missing");
assert(ui.includes('https://i.ytimg.com'), "thumbnail origin preconnect is missing");
assert(ui.includes('https://www.youtube-nocookie.com'), "privacy-enhanced YouTube embed preconnect is missing");
assert(app.includes('const embedHost="https://www.youtube-nocookie.com"'), "YouTube player must use the official privacy-enhanced embed host");
assert(app.includes('iframe.referrerPolicy="strict-origin-when-cross-origin"'), "YouTube iframe must preserve recommended referrer identity");
assert(app.includes('enablejsapi:"1"'), "privacy-enhanced iframe must keep IFrame API control enabled");
assert(app.includes('origin:window.location.origin'), "privacy-enhanced iframe must identify the embedding origin");
assert(app.includes('embedHost:playerEmbedHostSafe()'), "YouTube diagnostics must record the actual embed host");
const wrappedSelect = playback.slice(playback.indexOf('window.selectSong = function'), playback.indexOf('window.selectVersion = function'));
assert(wrappedSelect.indexOf('original.selectSong(id, autoplay)') < wrappedSelect.indexOf('captureContext(id'), "A1 context persistence must happen after the media request");
assert(wrappedSelect.includes('deferEffects: Boolean(autoplay)'), "old-track finalization side effects must defer during autoplay");
assert(playback.includes('const delayedTransportTimers = new Set()'), "A1 delayed transport timers must be centrally tracked");
assert(playback.includes('function cancelDelayedTransport'), "A1 delayed transport cancellation helper missing");
assert(playback.includes('cancelDelayedTransport("select-song")'), "manual song selection must cancel stale restore/version timers");
assert(playback.includes('if (!sameRef(currentRef(), expectedRef)) return;'), "delayed restore/version transport must verify the current song/version");
assert(playback.includes('A1_RESTORE_SEEK'), "restore seek diagnostic breadcrumb missing");
assert(!playback.includes('setTimeout(() => {\n          if (asNumber(core.state()) === 1) core.pause();\n          core.seek(target, false);\n        }, delay);'), "unguarded restore seek retries must not return");
assert(ui.includes('const stageStartIndex = playbackStages.length'), "diagnostics must capture synchronous playback stages before selectSong");
assert(ui.includes('observePlaybackStart(songId, startedAt, syncMs, stageStartIndex)'), "diagnostic stage start must be passed through to the observer");
const bootstrap = app.slice(app.indexOf('function bootstrapCore()'), app.indexOf('// Stable façade'));
assert(bootstrap.indexOf('loadSelectedVideo(false)') < bootstrap.indexOf('renderAll()'), "initial YouTube player warm must begin before the first full render");

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
