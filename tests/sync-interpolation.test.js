const assert = require("node:assert/strict");
const { interpolateTimes } = require("../sync-interpolation.js");

{
  const result = interpolateTimes(
    [10, 12, 16, 20],
    [10, 12, 16, 30],
    [0, 3]
  );
  assert.deepEqual(result.times.map(v => Math.round(v * 100) / 100), [10, 14, 22, 30]);
  assert.equal(result.sourceTimingSegments, 1);
  assert.equal(result.equalSpacingSegments, 0);
}

{
  const result = interpolateTimes(
    [0, 0, 0, 0],
    [5, 0, 0, 20],
    [0, 3]
  );
  assert.deepEqual(result.times.map(v => Math.round(v * 100) / 100), [5, 10, 15, 20]);
  assert.equal(result.sourceTimingSegments, 0);
  assert.equal(result.equalSpacingSegments, 1);
}

{
  const result = interpolateTimes(
    [0, 4, 8, 12, 16],
    [2, 4, 11, 12, 22],
    [0, 2, 4]
  );
  assert.deepEqual(result.times.map(v => Math.round(v * 100) / 100), [2, 6.5, 11, 16.5, 22]);
  assert.equal(result.segmentCount, 2);
}

assert.throws(
  () => interpolateTimes([0, 1], [0, 1], [0]),
  /2個以上/
);

assert.throws(
  () => interpolateTimes([0, 1, 2], [5, 0, 3], [0, 2]),
  /早い時間/
);

console.log("sync interpolation tests passed");
