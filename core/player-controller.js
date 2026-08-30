((root, factory) => {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LyricTubePlayer = api.createPlayerController();
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  function createPlayerController() {
    const adapters = new Map();
    let activeId = "";

    const safeCall = (method, fallback, ...args) => {
      const adapter = adapters.get(activeId);
      const fn = adapter?.[method];
      if (typeof fn !== "function") return fallback;
      try {
        const result = fn(...args);
        return result === undefined ? fallback : result;
      } catch (error) {
        console.error(`[LyricTubePlayer] ${activeId}.${method}`, error);
        return fallback;
      }
    };

    return Object.freeze({
      register(id, adapter) {
        const key = String(id || "").trim();
        if (!key) throw new TypeError("player adapter id is required");
        if (!adapter || typeof adapter !== "object") throw new TypeError("player adapter must be an object");
        adapters.set(key, adapter);
        if (!activeId) activeId = key;
        return () => {
          adapters.delete(key);
          if (activeId === key) activeId = adapters.keys().next().value || "";
        };
      },
      has(id) {
        return adapters.has(String(id || ""));
      },
      activate(id) {
        const key = String(id || "");
        if (!adapters.has(key)) return false;
        activeId = key;
        return true;
      },
      activeId() {
        return activeId;
      },
      available() {
        return Boolean(safeCall("available", false));
      },
      play() {
        return Boolean(safeCall("play", false));
      },
      pause() {
        return Boolean(safeCall("pause", false));
      },
      toggle() {
        return safeCall("state", -1) === 1 ? this.pause() : this.play();
      },
      seek(target) {
        return Boolean(safeCall("seek", false, Math.max(0, Number(target) || 0)));
      },
      currentTime() {
        return Math.max(0, Number(safeCall("currentTime", 0)) || 0);
      },
      duration() {
        return Math.max(0, Number(safeCall("duration", 0)) || 0);
      },
      state() {
        return Number(safeCall("state", -1));
      }
    });
  }

  return { createPlayerController };
});
