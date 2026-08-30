((root, factory) => {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LyricTubeHooks = api.createHookBus();
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  function createHookBus() {
    const events = new Map();
    const filters = new Map();
    const handlers = new Map();

    const add = (map, name, fn) => {
      if (typeof fn !== "function") throw new TypeError("hook callback must be a function");
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => map.get(name)?.delete(fn);
    };

    return Object.freeze({
      on(name, fn) {
        return add(events, name, fn);
      },
      emit(name, detail) {
        for (const fn of [...(events.get(name) || [])]) {
          try { fn(detail); } catch (error) { console.error(`[LyricTubeHooks] ${name}`, error); }
        }
      },
      addFilter(name, fn) {
        return add(filters, name, fn);
      },
      applyFilters(name, value, context) {
        let next = value;
        for (const fn of [...(filters.get(name) || [])]) {
          try {
            const result = fn(next, context);
            if (result !== undefined) next = result;
          } catch (error) {
            console.error(`[LyricTubeHooks] filter ${name}`, error);
          }
        }
        return next;
      },
      handle(name, fn) {
        return add(handlers, name, fn);
      },
      dispatchHandled(name, detail) {
        for (const fn of [...(handlers.get(name) || [])]) {
          try {
            if (fn(detail) === true) return true;
          } catch (error) {
            console.error(`[LyricTubeHooks] handler ${name}`, error);
          }
        }
        return false;
      },
      listenerCount(name) {
        return (events.get(name)?.size || 0) + (filters.get(name)?.size || 0) + (handlers.get(name)?.size || 0);
      }
    });
  }

  return { createHookBus };
});
