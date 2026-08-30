((root, factory) => {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LyricTubeAppUtils = Object.freeze(api);
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  function normalizeText(value = "") {
    return String(value).toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escText(value = "") {
    return String(value);
  }

  function typeName(type) {
    return ({
      original: "原曲 / MV",
      cover: "歌ってみた",
      firsttake: "FIRST TAKE",
      live: "Live",
      acoustic: "Acoustic",
      other: "その他"
    })[type] || "その他";
  }

  function versionDisplayName(version = {}) {
    return version.label?.trim()
      || (version.type === "cover" && version.performer ? `Cover · ${version.performer}` : "")
      || (version.type === "live" && version.performer ? `Live · ${version.performer}` : "")
      || typeName(version.type);
  }

  function formatTime(sec, { allowEmpty = false } = {}) {
    if (allowEmpty && (sec === null || sec === undefined || sec === "")) return "未設定";
    const n = Math.max(0, Number(sec) || 0);
    const m = Math.floor(n / 60);
    const s = Math.floor(n % 60);
    const cs = Math.floor((n - Math.floor(n)) * 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }

  function parseTimecode(value) {
    const match = String(value).trim().match(/^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/);
    if (!match) return 0;
    const fraction = match[3] ? Number(`0.${match[3].padEnd(2, "0").slice(0, 2)}`) : 0;
    return Number(match[1]) * 60 + Number(match[2]) + fraction;
  }

  function extractVideoId(input) {
    try {
      const url = new URL(String(input).trim());
      if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || "";
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || "";
      return url.searchParams.get("v") || "";
    } catch {
      const match = String(input).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
      return match ? match[1] : "";
    }
  }

  function thumbnailUrl(videoId) {
    return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : "";
  }

  function parseLrc(text = "") {
    const lines = [];
    for (const raw of String(text).split(/\r?\n/)) {
      const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
      if (!stamps.length) continue;
      const lyric = raw.replace(/\[[^\]]+\]/g, "").trim();
      for (const stamp of stamps) {
        const fraction = stamp[3] ? Number(`0.${stamp[3].padEnd(2, "0").slice(0, 2)}`) : 0;
        lines.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text: lyric || "♪" });
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  function plainFromLrc(text = "") {
    return parseLrc(text).map(item => item.text).join("\n");
  }

  function lyricTextLines(text = "") {
    return String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }

  function lyricLineKey(text = "") {
    return String(text)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[、。！？!?.,・…「」『』（）()【】[\]'"`~〜ー\-–—]/g, "")
      .trim();
  }

  function lcsLineMapping(oldLines, newLines) {
    const a = oldLines.map(lyricLineKey);
    const b = newLines.map(lyricLineKey);
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = (a[i] && a[i] === b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const map = new Map();
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] && a[i] === b[j]) {
        map.set(j, i);
        i += 1;
        j += 1;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        i += 1;
      } else {
        j += 1;
      }
    }
    return map;
  }

  function interpolateTimeForInsertedLine(newIndex, newCount, mapping, timedLines) {
    let prevNew = -1;
    let prevOld = -1;
    let nextNew = -1;
    let nextOld = -1;
    for (const [newIdx, oldIdx] of mapping) {
      if (newIdx < newIndex && newIdx > prevNew) { prevNew = newIdx; prevOld = oldIdx; }
      if (newIdx > newIndex && (nextNew < 0 || newIdx < nextNew)) { nextNew = newIdx; nextOld = oldIdx; }
    }
    const prevTime = prevOld >= 0 && timedLines[prevOld] ? Number(timedLines[prevOld].time) || 0 : null;
    const nextTime = nextOld >= 0 && timedLines[nextOld] ? Number(timedLines[nextOld].time) || 0 : null;
    if (prevTime !== null && nextTime !== null && nextNew > prevNew) {
      const ratio = (newIndex - prevNew) / (nextNew - prevNew);
      return Math.max(0, prevTime + (nextTime - prevTime) * ratio);
    }
    if (prevTime !== null) return Math.max(0, prevTime + 2 * Math.max(1, newIndex - prevNew));
    if (nextTime !== null) return Math.max(0, nextTime - 2 * Math.max(1, nextNew - newIndex));
    if (timedLines.length) {
      const ratio = newCount <= 1 ? 0 : newIndex / (newCount - 1);
      const last = Number(timedLines[timedLines.length - 1]?.time) || 0;
      return Math.max(0, last * ratio);
    }
    return 0;
  }

  function isSyncMarkerText(text = "") {
    return /^(?:♪|♫|♬|♩)(?:\s*間奏)?$/.test(String(text).normalize("NFKC").trim());
  }

  function mergePreservedSyncMarkers(lrcText, markers = []) {
    if (!markers.length) return lrcText || "";
    const lyricLines = parseLrc(lrcText || "").map((line, index) => ({ ...line, _kind: 1, _order: index }));
    const markerLines = markers.map((line, index) => ({ ...line, _kind: 0, _order: index }));
    return [...lyricLines, ...markerLines]
      .sort((a, b) => (a.time - b.time) || (a._kind - b._kind) || (a._order - b._order))
      .map(line => `[${formatTime(Math.max(0, Number(line.time) || 0))}]${line.text}`)
      .join("\n");
  }

  function rebaseLrcTextKeepingTimes(lrcText, oldPlainText, newPlainText) {
    const allTimed = parseLrc(lrcText || "");
    const preservedMarkers = allTimed.filter(line => isSyncMarkerText(line.text));
    const timed = allTimed.filter(line => !isSyncMarkerText(line.text));
    const oldLines = lyricTextLines(oldPlainText);
    const newLines = lyricTextLines(newPlainText);
    if (!timed.length || !newLines.length) return lrcText || "";
    const finish = body => mergePreservedSyncMarkers(body, preservedMarkers);
    if (timed.length === newLines.length) {
      return finish(timed.map((line, index) => `[${formatTime(line.time)}]${newLines[index]}`).join("\n"));
    }
    if (oldLines.length === timed.length) {
      const mapping = lcsLineMapping(oldLines, newLines);
      const mappedTimes = new Array(newLines.length).fill(null);
      for (const [newIndex, oldIndex] of mapping) {
        if (timed[oldIndex]) mappedTimes[newIndex] = Number(timed[oldIndex].time) || 0;
      }
      for (let i = 0; i < newLines.length; i++) {
        if (mappedTimes[i] === null) mappedTimes[i] = interpolateTimeForInsertedLine(i, newLines.length, mapping, timed);
      }
      for (let i = 1; i < mappedTimes.length; i++) {
        if (mappedTimes[i] < mappedTimes[i - 1]) mappedTimes[i] = mappedTimes[i - 1];
      }
      return finish(newLines.map((text, index) => `[${formatTime(mappedTimes[index])}]${text}`).join("\n"));
    }
    const out = [];
    for (let i = 0; i < newLines.length; i++) {
      const timeValue = i < timed.length
        ? Number(timed[i].time) || 0
        : (Number(timed[timed.length - 1]?.time) || 0) + 2 * (i - timed.length + 1);
      out.push(`[${formatTime(timeValue)}]${newLines[i]}`);
    }
    return finish(out.join("\n"));
  }

  return {
    normalizeText,
    clamp,
    escText,
    typeName,
    versionDisplayName,
    formatTime,
    parseTimecode,
    extractVideoId,
    thumbnailUrl,
    parseLrc,
    plainFromLrc,
    lyricTextLines,
    lyricLineKey,
    lcsLineMapping,
    interpolateTimeForInsertedLine,
    isSyncMarkerText,
    mergePreservedSyncMarkers,
    rebaseLrcTextKeepingTimes
  };
});
