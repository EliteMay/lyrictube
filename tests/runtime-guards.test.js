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
assert(mobile.includes("38px minmax(0,1fr) minmax(0,1fr)!important"), "mobile sidebar tools must fit four controls");
assert(version.includes('version: "v0.12.0"'), "expected v0.12.0");
console.log("runtime regression guards passed");
