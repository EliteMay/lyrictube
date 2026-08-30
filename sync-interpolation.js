(() => {
  "use strict";

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const finiteTime = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

  function normalizedAnchors(anchorIndices, length) {
    return [...new Set((anchorIndices || [])
      .map(Number)
      .filter(index => Number.isInteger(index) && index >= 0 && index < length))]
      .sort((a, b) => a - b);
  }

  function sourceSegmentIsUsable(baseTimes, start, end) {
    const first = finiteTime(baseTimes[start]);
    const last = finiteTime(baseTimes[end]);
    if (last - first < 0.05) return false;

    let previous = first;
    for (let i = start + 1; i <= end; i += 1) {
      const current = finiteTime(baseTimes[i]);
      if (current + 0.001 < previous) return false;
      previous = current;
    }
    return true;
  }

  function interpolateTimes(baseTimes, currentTimes, anchorIndices) {
    const source = Array.isArray(baseTimes) ? baseTimes.map(finiteTime) : [];
    const current = Array.isArray(currentTimes) ? currentTimes.map(finiteTime) : [];
    if (!current.length || source.length !== current.length) {
      throw new Error("同期データの長さが一致していません。");
    }

    const anchors = normalizedAnchors(anchorIndices, current.length);
    if (anchors.length < 2) {
      throw new Error("基準点を2個以上設定してください。");
    }

    for (let i = 1; i < anchors.length; i += 1) {
      if (current[anchors[i]] + 0.001 < current[anchors[i - 1]]) {
        throw new Error("後ろの基準点が前の基準点より早い時間になっています。");
      }
    }

    const output = [...current];
    let changedCount = 0;
    let sourceTimingSegments = 0;
    let equalSpacingSegments = 0;

    for (let segment = 0; segment < anchors.length - 1; segment += 1) {
      const start = anchors[segment];
      const end = anchors[segment + 1];
      if (end <= start) continue;

      const targetStart = current[start];
      const targetEnd = current[end];
      const useSourceTiming = sourceSegmentIsUsable(source, start, end);
      if (useSourceTiming) sourceTimingSegments += 1;
      else equalSpacingSegments += 1;

      const sourceStart = source[start];
      const sourceEnd = source[end];
      const sourceSpan = sourceEnd - sourceStart;
      const indexSpan = end - start;

      for (let index = start; index <= end; index += 1) {
        let ratio;
        if (useSourceTiming) {
          ratio = clamp01((source[index] - sourceStart) / sourceSpan);
        } else {
          ratio = indexSpan > 0 ? (index - start) / indexSpan : 0;
        }

        const next = Math.max(0, targetStart + (targetEnd - targetStart) * ratio);
        if (Math.abs(next - output[index]) > 0.0005) changedCount += 1;
        output[index] = next;
      }
    }

    // Numerical noise should never make lyric time move backwards inside the
    // interpolated region. Keep anchors exact and only normalize interior lines.
    const firstAnchor = anchors[0];
    const lastAnchor = anchors[anchors.length - 1];
    for (let index = firstAnchor + 1; index < lastAnchor; index += 1) {
      if (anchors.includes(index)) continue;
      output[index] = Math.max(output[index], output[index - 1]);
    }

    return {
      times: output,
      anchors,
      changedCount,
      segmentCount: anchors.length - 1,
      sourceTimingSegments,
      equalSpacingSegments
    };
  }

  const api = Object.freeze({ interpolateTimes });
  if (typeof window !== "undefined") window.LyricTubeSyncInterpolation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
