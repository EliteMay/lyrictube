(() => {
  "use strict";

  const BASE_LIBRARY_KEY = "lyrictube.library.v3";
  const OWNER_LIBRARY_KEY = "lyrictube.library.owner.v3";
  const GUEST_LIBRARY_KEY = "lyrictube.library.guest.v3";
  const LEGACY_KEY = "lyrictube.songs.v1";
  const ACCESS_SESSION_KEY = "lyrictube.simpleAccess.v2";
  const OWNER_LIBRARY_URL = "data/library-kaito.json";
  const GUEST_LIBRARY_URL = "data/library.json";
  const MIGRATION_KEY = "lyrictube.profileStorage.migrated.v1";

  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const nativeFetch = window.fetch.bind(window);

  function currentRole() {
    const role = sessionStorage.getItem(ACCESS_SESSION_KEY);
    return role === "guest" ? "guest" : role === "owner" ? "owner" : null;
  }

  function roleStorageKey() {
    return currentRole() === "guest" ? GUEST_LIBRARY_KEY : OWNER_LIBRARY_KEY;
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
      return nativeSetItem.call(this, roleStorageKey(), value);
    }
    return nativeSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function(key) {
    if (this === localStorage && String(key) === BASE_LIBRARY_KEY && currentRole()) {
      return nativeRemoveItem.call(this, roleStorageKey());
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
    owner: {
      label: "かいと",
      storageKey: OWNER_LIBRARY_KEY,
      libraryUrl: OWNER_LIBRARY_URL
    },
    guest: {
      label: "ゲスト",
      storageKey: GUEST_LIBRARY_KEY,
      libraryUrl: GUEST_LIBRARY_URL
    }
  });
})();
