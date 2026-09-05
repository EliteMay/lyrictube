((root, factory) => {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LyricTubePlaybackState = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  const MAX_QUEUE_ITEMS = 500;
  const MAX_HISTORY_ITEMS = 500;
  const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const STALE_DAYS = 30;

  function uid(prefix = "p") {
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function cloneQueue(queue) {
    return Array.isArray(queue) ? queue.filter(Boolean).map(item => ({ ...item })) : [];
  }

  function makeQueueItem(input = {}) {
    const songId = String(input.songId || "").trim();
    if (!songId) throw new TypeError("queue item songId is required");
    return {
      id: String(input.id || uid("q")),
      songId,
      versionId: String(input.versionId || ""),
      addedAt: input.addedAt || new Date().toISOString(),
      requestedAs: input.requestedAs === "next" ? "next" : "queue",
      runtimeUnavailable: Boolean(input.runtimeUnavailable),
      unavailableReason: String(input.unavailableReason || ""),
    };
  }

  function addPlayNext(queue, input, max = MAX_QUEUE_ITEMS) {
    const next = cloneQueue(queue);
    if (next.length >= max) return { ok: false, reason: "queue-full", queue: next };
    next.unshift(makeQueueItem({ ...input, requestedAs: "next" }));
    return { ok: true, queue: next };
  }

  function addQueueEnd(queue, input, max = MAX_QUEUE_ITEMS) {
    const next = cloneQueue(queue);
    if (next.length >= max) return { ok: false, reason: "queue-full", queue: next };
    next.push(makeQueueItem({ ...input, requestedAs: "queue" }));
    return { ok: true, queue: next };
  }

  function removeQueueItem(queue, itemId) {
    const id = String(itemId || "");
    return cloneQueue(queue).filter(item => String(item.id) !== id);
  }

  function moveQueueItem(queue, itemId, direction) {
    const next = cloneQueue(queue);
    const index = next.findIndex(item => String(item.id) === String(itemId || ""));
    if (index < 0) return next;
    const target = direction < 0 ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }

  function sanitizeQueue(queue, songs, max = MAX_QUEUE_ITEMS) {
    const songIds = new Set((Array.isArray(songs) ? songs : []).map(song => String(song?.id || "")).filter(Boolean));
    return cloneQueue(queue)
      .filter(item => item?.id && item?.songId && songIds.has(String(item.songId)))
      .slice(0, max)
      .map(item => makeQueueItem(item));
  }

  function playThresholdSeconds(duration) {
    const total = Number(duration);
    if (Number.isFinite(total) && total > 0) return Math.min(10, total * 0.1);
    return 10;
  }

  function isEligiblePlay(playedSeconds, duration) {
    const played = Math.max(0, Number(playedSeconds) || 0);
    return played + 1e-6 >= playThresholdSeconds(duration);
  }

  function trimHistory(history, max = MAX_HISTORY_ITEMS) {
    return (Array.isArray(history) ? history : [])
      .filter(entry => entry && entry.eventId && entry.songId)
      .map(entry => ({ ...entry }))
      .sort((a, b) => String(b.playedAt || "").localeCompare(String(a.playedAt || "")))
      .slice(0, max);
  }

  function mergeHistory(primary, secondary, max = MAX_HISTORY_ITEMS) {
    const byId = new Map();
    for (const entry of [...(Array.isArray(secondary) ? secondary : []), ...(Array.isArray(primary) ? primary : [])]) {
      if (!entry?.eventId || !entry?.songId) continue;
      byId.set(String(entry.eventId), { ...entry });
    }
    return trimHistory([...byId.values()], max);
  }

  function recentSongs(songs) {
    return [...(Array.isArray(songs) ? songs : [])]
      .filter(song => song?.lastPlayedAt)
      .sort((a, b) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)));
  }

  function unplayedSongs(songs) {
    return (Array.isArray(songs) ? songs : []).filter(song => (Number(song?.playCount) || 0) === 0);
  }

  function staleSongs(songs, days = STALE_DAYS, now = Date.now()) {
    const cutoff = Number(now) - Math.max(1, Number(days) || STALE_DAYS) * 24 * 60 * 60 * 1000;
    return (Array.isArray(songs) ? songs : []).filter(song => {
      if ((Number(song?.playCount) || 0) <= 0 || !song?.lastPlayedAt) return false;
      const playedAt = Date.parse(song.lastPlayedAt);
      return Number.isFinite(playedAt) && playedAt <= cutoff;
    });
  }

  function normalizeSession(value, options = {}) {
    if (!value || typeof value !== "object") return null;
    const savedAt = Date.parse(String(value.savedAt || ""));
    const now = Number(options.now ?? Date.now());
    const ttl = Math.max(0, Number(options.ttl ?? SESSION_TTL_MS));
    if (!Number.isFinite(savedAt) || savedAt > now + 60_000 || now - savedAt > ttl) return null;
    return {
      songId: String(value.songId || ""),
      versionId: String(value.versionId || ""),
      position: Math.max(0, Number(value.position) || 0),
      manualQueue: cloneQueue(value.manualQueue).slice(0, MAX_QUEUE_ITEMS),
      contextSnapshot: (Array.isArray(value.contextSnapshot) ? value.contextSnapshot : [])
        .map(item => typeof item === "string" ? { songId: item } : { songId: String(item?.songId || "") })
        .filter(item => item.songId),
      contextIndex: Number.isInteger(value.contextIndex) ? value.contextIndex : -1,
      shuffle: Boolean(value.shuffle),
      repeat: ["off", "all", "one"].includes(value.repeat) ? value.repeat : "off",
      versionPreferences: value.versionPreferences && typeof value.versionPreferences === "object" ? { ...value.versionPreferences } : {},
      navigationHistory: (Array.isArray(value.navigationHistory) ? value.navigationHistory : [])
        .filter(item => item?.songId)
        .map(item => ({ songId: String(item.songId), versionId: String(item.versionId || "") }))
        .slice(-100),
      savedAt: new Date(savedAt).toISOString(),
    };
  }

  function resolveVersionId(song, requestedVersionId = "", preferredVersionId = "") {
    const versions = Array.isArray(song?.versions) ? song.versions : [];
    if (!versions.length) return "";
    const requested = String(requestedVersionId || "");
    if (requested && versions.some(version => String(version?.id) === requested)) return requested;
    const preferred = String(preferredVersionId || song?.lastVersionId || song?.defaultVersionId || "");
    if (preferred && versions.some(version => String(version?.id) === preferred)) return preferred;
    return String(versions[0]?.id || "");
  }

  return Object.freeze({
    MAX_QUEUE_ITEMS,
    MAX_HISTORY_ITEMS,
    SESSION_TTL_MS,
    STALE_DAYS,
    uid,
    makeQueueItem,
    addPlayNext,
    addQueueEnd,
    removeQueueItem,
    moveQueueItem,
    sanitizeQueue,
    playThresholdSeconds,
    isEligiblePlay,
    trimHistory,
    mergeHistory,
    recentSongs,
    unplayedSongs,
    staleSongs,
    normalizeSession,
    resolveVersionId,
  });
});
