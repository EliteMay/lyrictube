const assert = require("assert");
const utils = require("../core/app-utils.js");

assert.deepStrictEqual(utils.parseLrc("[00:01.00]A\n[00:03.50]B"), [
  { time: 1, text: "A" },
  { time: 3.5, text: "B" }
]);
assert.strictEqual(utils.plainFromLrc("[00:01.00]A\n[00:03.50]B"), "A\nB");
assert.strictEqual(utils.parseTimecode("01:02.50"), 62.5);
assert.strictEqual(utils.extractVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
assert.strictEqual(utils.versionDisplayName({ type: "cover", performer: "Singer" }), "Cover · Singer");

const rebased = utils.rebaseLrcTextKeepingTimes(
  "[00:10.00]first\n[00:20.00]second",
  "first\nsecond",
  "first changed\nsecond changed"
);
assert.strictEqual(rebased, "[00:10.00]first changed\n[00:20.00]second changed");

const withMarker = utils.rebaseLrcTextKeepingTimes(
  "[00:05.00]A\n[00:08.00]♪\n[00:10.00]B",
  "A\nB",
  "A2\nB2"
);
assert(withMarker.includes("[00:08.00]♪"), "interlude markers must be preserved");

console.log("app utils tests passed");
