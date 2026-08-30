const assert = require("assert");
const { createHookBus } = require("../core/runtime-hooks.js");

const hooks = createHookBus();
let emitted = 0;
hooks.on("render", detail => { emitted += detail.count; });
hooks.emit("render", { count: 2 });
assert.strictEqual(emitted, 2);

hooks.addFilter("songs", list => list.filter(item => item.keep));
hooks.addFilter("songs", list => list.map(item => item.id));
assert.deepStrictEqual(hooks.applyFilters("songs", [
  { id: "a", keep: true },
  { id: "b", keep: false }
]), ["a"]);

hooks.handle("page", () => false);
hooks.handle("page", detail => detail.name === "tags");
assert.strictEqual(hooks.dispatchHandled("page", { name: "player" }), false);
assert.strictEqual(hooks.dispatchHandled("page", { name: "tags" }), true);

console.log("runtime hooks tests passed");
