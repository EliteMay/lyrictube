const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("library-schema.js", "utf8"), sandbox);
const api = sandbox.window.LyricTubeLibrarySchema;

const valid = { version: 3, settings: { tags: [{ id: "t1", name: "x" }] }, songs: [{ id: "s1", tagIds: ["t1"], versions: [{ id: "v1", startTime: 0, endTime: 10, skipSegments: [] }] }], playlists: [{ id: "p1", songIds: ["s1"] }] };
assert(api.validate(api.migrate(valid)).ok);

const duplicate = JSON.parse(JSON.stringify(valid));
duplicate.songs.push({ id: "s1", versions: [{ id: "v2" }] });
assert(!api.validate(api.migrate(duplicate)).ok);

const badRange = JSON.parse(JSON.stringify(valid));
badRange.songs[0].versions[0].endTime = -1;
assert(!api.validate(api.migrate(badRange)).ok);
console.log("library schema tests passed");
