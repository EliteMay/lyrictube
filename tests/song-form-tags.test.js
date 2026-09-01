"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");

const app=fs.readFileSync("app.js","utf8");
const tags=fs.readFileSync("tags.js","utf8");
const css=fs.readFileSync("tags.css","utf8");
const index=fs.readFileSync("index.html","utf8");
const version=fs.readFileSync("version.js","utf8");
const defaults=JSON.parse(fs.readFileSync("data/defaults.json","utf8"));
const build=version.match(/build:\s*"([^"]+)"/)?.[1];

assert(build,"current build metadata missing");
assert.match(app,/emit\("dialog:song-open"/,"song dialog must expose an open lifecycle hook");
assert.match(app,/applyFilters\("song:before-save"/,"song save must expose a pre-save filter");
assert.match(tags,/function createSongFormTagSection\(/,"tags extension must create the embedded song-form tag UI");
assert.match(tags,/hooks\.on\("dialog:song-open"/,"tag draft must reset when the song dialog opens");
assert.match(tags,/hooks\.addFilter\("song:before-save"/,"selected tags must flow through the formal save hook");
assert.match(tags,/tagIds:\[\.\.\.songFormTagDraft\]/,"song form must preserve selected tag ids");
assert.match(css,/\.song-form-tag-section\{/,"song-form tag UI must have visual rules");
assert(index.includes(`tags.css?v=${build}`),"tag CSS cache revision must match current build");
assert(index.includes(`tags.js?v=${build}`),"tag JS cache revision must match current build");
assert.equal(defaults.dataSchemaVersion,4,"song-form tagging must not bump Data Schema");
assert.equal(defaults.features.songFormTagging,true,"machine-readable feature flag must be enabled");
console.log("song-form tag regression checks passed");
