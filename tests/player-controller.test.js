const assert = require("assert");
const { createPlayerController } = require("../core/player-controller.js");

const player = createPlayerController();
let time = 0;
let playing = false;
player.register("a", {
  available: () => true,
  play: () => { playing = true; return true; },
  pause: () => { playing = false; return true; },
  seek: value => { time = value; return true; },
  currentTime: () => time,
  duration: () => 120,
  state: () => playing ? 1 : 2
});

assert.strictEqual(player.activate("a"), true);
assert.strictEqual(player.available(), true);
assert.strictEqual(player.play(), true);
assert.strictEqual(player.state(), 1);
assert.strictEqual(player.seek(42.5), true);
assert.strictEqual(player.currentTime(), 42.5);
assert.strictEqual(player.duration(), 120);
assert.strictEqual(player.toggle(), true);
assert.strictEqual(player.state(), 2);
assert.strictEqual(player.activate("missing"), false);

console.log("player controller tests passed");
