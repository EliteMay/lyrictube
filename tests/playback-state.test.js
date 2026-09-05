const assert = require('assert');
const p = require('../core/playback-state.js');

{
  let queue = [];
  queue = p.addQueueEnd(queue, { songId: 'a', versionId: 'a1' }).queue;
  queue = p.addPlayNext(queue, { songId: 'x', versionId: 'x1' }).queue;
  queue = p.addPlayNext(queue, { songId: 'y', versionId: 'y1' }).queue;
  assert.deepStrictEqual(queue.map(x => x.songId), ['y', 'x', 'a']);
  const moved = p.moveQueueItem(queue, queue[2].id, -1);
  assert.deepStrictEqual(moved.map(x => x.songId), ['y', 'a', 'x']);
}

{
  const full = Array.from({ length: p.MAX_QUEUE_ITEMS }, (_, i) => p.makeQueueItem({ songId: `s${i}` }));
  const result = p.addQueueEnd(full, { songId: 'overflow' });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'queue-full');
  assert.strictEqual(result.queue.length, p.MAX_QUEUE_ITEMS);
}

{
  assert.strictEqual(p.playThresholdSeconds(50), 5);
  assert.strictEqual(p.playThresholdSeconds(500), 10);
  assert.strictEqual(p.isEligiblePlay(4.9, 50), false);
  assert.strictEqual(p.isEligiblePlay(5, 50), true);
  assert.strictEqual(p.isEligiblePlay(10, 500), true);
}

{
  const songs = [
    { id: 'never', playCount: 0, lastPlayedAt: null },
    { id: 'fresh', playCount: 2, lastPlayedAt: '2026-09-01T00:00:00.000Z' },
    { id: 'stale', playCount: 1, lastPlayedAt: '2026-07-01T00:00:00.000Z' },
  ];
  const now = Date.parse('2026-09-05T00:00:00.000Z');
  assert.deepStrictEqual(p.unplayedSongs(songs).map(x => x.id), ['never']);
  assert.deepStrictEqual(p.staleSongs(songs, 30, now).map(x => x.id), ['stale']);
}

{
  const now = Date.parse('2026-09-05T00:00:00.000Z');
  const valid = p.normalizeSession({ savedAt: '2026-09-04T00:00:00.000Z', songId: 's', manualQueue: [] }, { now });
  assert(valid);
  const expired = p.normalizeSession({ savedAt: '2026-07-01T00:00:00.000Z', songId: 's' }, { now });
  assert.strictEqual(expired, null);
}

{
  const merged = p.mergeHistory(
    [{ eventId: 'e1', songId: 'a', playedAt: '2026-09-05T01:00:00Z', playedSeconds: 20 }],
    [{ eventId: 'e1', songId: 'a', playedAt: '2026-09-05T01:00:00Z', playedSeconds: 10 }, { eventId: 'e2', songId: 'b', playedAt: '2026-09-04T01:00:00Z' }]
  );
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].playedSeconds, 20);
}

console.log('playback-state tests passed');
