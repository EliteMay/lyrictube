(() => {
  "use strict";

  const BASE_LIBRARY_KEY = "lyrictube.library.v3";
  const OWNER_LIBRARY_KEY = "lyrictube.library.owner.v3";
  const GUEST_LIBRARY_KEY = "lyrictube.library.guest.v3";
  const LEGACY_KEY = "lyrictube.songs.v1";
  const ACCESS_SESSION_KEY = "lyrictube.simpleAccess.v2";
  const CLOUD_SESSION_KEY = "lyrictube.cloudSession.v1";
  const OWNER_LIBRARY_URL = "data/library-kaito.json";
  const GUEST_LIBRARY_URL = "data/library.json";
  const MIGRATION_KEY = "lyrictube.profileStorage.migrated.v1";

  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const nativeFetch = window.fetch.bind(window);

  function readCloudSession() {
    try {
      const raw = nativeGetItem.call(sessionStorage, CLOUD_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function currentRole() {
    const accessRole = nativeGetItem.call(sessionStorage, ACCESS_SESSION_KEY);
    if (accessRole === "guest") return "guest";
    const cloud = readCloudSession();
    if (cloud?.token && cloud?.account?.id) return "cloud";
    return accessRole === "owner" ? "owner" : null;
  }

  function cloudLibraryKey() {
    const cloud = readCloudSession();
    const id = String(cloud?.account?.id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
    return `lyrictube.library.cloud.${id}.v3`;
  }

  function roleStorageKey() {
    const role = currentRole();
    if (role === "guest") return GUEST_LIBRARY_KEY;
    if (role === "cloud") return cloudLibraryKey();
    return OWNER_LIBRARY_KEY;
  }

  function migrateExistingOwnerDataOnce() {
    if (nativeGetItem.call(localStorage, MIGRATION_KEY)) return;
    const ownerProfile = nativeGetItem.call(localStorage, OWNER_LIBRARY_KEY);
    const guestProfile = nativeGetItem.call(localStorage, GUEST_LIBRARY_KEY);
    if (!ownerProfile && !guestProfile) {
      const existing = nativeGetItem.call(localStorage, BASE_LIBRARY_KEY);
      if (existing) nativeSetItem.call(localStorage, OWNER_LIBRARY_KEY, existing);
    }
    nativeSetItem.call(localStorage, MIGRATION_KEY, new Date().toISOString());
  }

  migrateExistingOwnerDataOnce();

  Storage.prototype.getItem = function(key) {
    if (this === localStorage) {
      const stringKey = String(key);
      if (stringKey === LEGACY_KEY && currentRole() === "guest") return null;
      if (stringKey === BASE_LIBRARY_KEY && currentRole()) {
        return nativeGetItem.call(this, roleStorageKey());
      }
    }
    return nativeGetItem.call(this, key);
  };

  Storage.prototype.setItem = function(key, value) {
    if (this === localStorage && String(key) === BASE_LIBRARY_KEY && currentRole()) {
      const result = nativeSetItem.call(this, roleStorageKey(), value);
      if (currentRole() === "cloud") {
        queueMicrotask(() => document.dispatchEvent(new CustomEvent("lyrictube:cloud-library-changed")));
      }
      return result;
    }
    return nativeSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function(key) {
    if (this === localStorage && String(key) === BASE_LIBRARY_KEY && currentRole()) {
      const result = nativeRemoveItem.call(this, roleStorageKey());
      if (currentRole() === "cloud") {
        queueMicrotask(() => document.dispatchEvent(new CustomEvent("lyrictube:cloud-library-changed")));
      }
      return result;
    }
    return nativeRemoveItem.call(this, key);
  };

  function routedLibraryUrl(input) {
    if (typeof input !== "string") return input;
    if (!/(^|\/)data\/library\.json(?:[?#]|$)/.test(input)) return input;
    const role = currentRole();
    if (role !== "owner") return input;
    const queryIndex = input.search(/[?#]/);
    const suffix = queryIndex >= 0 ? input.slice(queryIndex) : "";
    return `${OWNER_LIBRARY_URL}${suffix}`;
  }

  window.fetch = function(input, init) {
    return nativeFetch(routedLibraryUrl(input), init);
  };

  window.LyricTubeProfiles = Object.freeze({
    baseLibraryKey: BASE_LIBRARY_KEY,
    ownerLocalKey: OWNER_LIBRARY_KEY,
    guestLocalKey: GUEST_LIBRARY_KEY,
    cloudSessionKey: CLOUD_SESSION_KEY,
    ownerLibraryUrl: OWNER_LIBRARY_URL,
    guestLibraryUrl: GUEST_LIBRARY_URL,
    currentRole,
    roleStorageKey,
    readCloudSession,
    nativeGetItem: (storage, key) => nativeGetItem.call(storage, key),
    nativeSetItem: (storage, key, value) => nativeSetItem.call(storage, key, value),
    nativeRemoveItem: (storage, key) => nativeRemoveItem.call(storage, key)
  });
})();