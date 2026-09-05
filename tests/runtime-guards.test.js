const fs = require("fs");
const assert = require("assert");

const read = file => fs.readFileSync(file, "utf8");
const app = read("app.js");
const shell = read("site-shell.js");
const local = read("local-media.js");
const tags = read("tags.js");
const mobile = read("mobile.css");
const version = read("version.js");

assert(!shell.includes("GH v35"), "legacy GH v35 writer must not return");
assert(!app.includes("lyrictube_v14_"), "legacy export filename must not return");
assert(!local.includes("clearInterval(timer), 30000"), "Local Media must not time out while waiting for login");
assert(!tags.includes("clearInterval(timer), 30000"), "Tags must not time out while waiting for login");
assert(app.includes("d.dataset.time=String(line.time)"), "synced lyric DOM must carry its timestamp");
assert(app.includes("seekMainPlayback(currentPlayerTime()+5)"), "keyboard seeking must use generic player path");
assert(app.includes("selectedLocalMediaStatus"), "app must understand local playback state");
assert(local.includes("playCurrent()"), "Local Media must expose playback contract");
assert(!local.includes("closest?.(\".lyric-line\")"), "Local Media must not install a second lyric click seeker");
assert(mobile.includes("38px minmax(0,1fr) minmax(0,1fr)!important"), "mobile sidebar tools must fit four controls");
assert(!app.includes('dataset.lyricTubeReady="v29"'), "legacy internal ready version must not return");
assert(app.includes("play: () => playMainPlayback()"), "core facade must expose generic playback");
assert(local.includes("await activateLocalMedia(false)"), "selected Local Media must activate after IndexedDB loads");
assert(version.includes('version: "v0.14.0"'), "expected v0.14.0");

assert(app.includes("window.LyricTubeAppUtils"), "app must consume extracted pure utilities");
assert(app.includes('applyFilters?.("songs:view"'), "viewSongs must expose the song filter hook");
assert(!tags.includes("originalViewSongs"), "Tags must not monkey-patch viewSongs");
assert(!tags.includes("originalRenderAll"), "Tags must not monkey-patch renderAll");
assert(tags.includes('hooks.addFilter("songs:view"'), "Tags must use the song filter hook");
assert(tags.includes('hooks.handle("render:main-page"'), "Tags page must use the page render hook");
const index = read("index.html");
assert(index.includes("core/app-utils.js"), "index must load app utilities");
assert(index.includes("core/runtime-hooks.js"), "index must load runtime hooks");


assert(app.includes("window.LyricTubePlayer"), "app must use the player controller");
assert(app.includes('playerController.register("youtube"'), "YouTube must register as a player adapter");
assert(local.includes('player.register("localmedia"'), "Local Media must register as a player adapter");
assert(!local.includes("originalCurrentPlayerTime"), "Local Media must not patch currentPlayerTime");
assert(!local.includes("originalPlayerDurationSafe"), "Local Media must not patch player duration");
assert(!local.includes("originalToggleMainPlayback"), "Local Media must not patch main playback");
assert(!local.includes("originalEnforcePlaybackRules"), "Local Media must not patch playback rules");
assert(!local.includes("function patchPlayback"), "legacy Local Media playback patch must be removed");
const index2 = read("index.html");
assert(index2.includes("core/player-controller.js"), "index must load player controller");

assert(!app.includes('try{ytPlayer?.seekTo?.(Number(els.bottomSeek.value)||0,true)}catch{}'), "bottom seek must not bypass PlayerController");
assert(!local.includes("function restartLocal"), "obsolete Local Media restart shim must be removed");
assert(!local.includes('$("bottomSeek")?.addEventListener("pointerup"'), "Local Media must not install duplicate bottom seek listeners");
console.log("runtime regression guards passed");
