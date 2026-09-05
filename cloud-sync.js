(() => {
  "use strict";

  const API_URL = "https://ctktkyxuzkrsigwoswoc.supabase.co/functions/v1/lyrictube-api";
  const RETRY_MS = 3500;
  const QUEUE_PREFIX = "lyrictube.cloudSyncQueue.v1.";
  let timer = null;
  let retryTimer = null;
  let saving = false;
  let hydratedFor = "";

  const pending = {
    replaceLibrary: null,
    songs: new Map(),
    deletedSongs: new Set(),
    playlists: new Map(),
    deletedPlaylists: new Set(),
    state: null,
    playHistory: new Map(),
  };

  function profiles() { return window.LyricTubeProfiles || null; }
  function currentSession() { try { return profiles()?.readCloudSession?.() || null; } catch { return null; } }
  function accountId() { return String(currentSession()?.account?.id || ""); }
  function queueKey() { const id = accountId(); return id ? `${QUEUE_PREFIX}${id}` : ""; }

  async function api(action, payload = {}, keepalive = false) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...payload }),
      keepalive,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  function snapshotPending() {
    return {
      replaceLibrary: pending.replaceLibrary,
      upsertSongs: [...pending.songs.values()],
      deleteSongIds: [...pending.deletedSongs],
      upsertPlaylists: [...pending.playlists.values()],
      deletePlaylistIds: [...pending.deletedPlaylists],
      state: pending.state,
      playHistory: [...pending.playHistory.values()],
    };
  }

  function hasPending() {
    return !!pending.replaceLibrary || pending.songs.size > 0 || pending.deletedSongs.size > 0 || pending.playlists.size > 0 || pending.deletedPlaylists.size > 0 || !!pending.state || pending.playHistory.size > 0;
  }

  function hasLibraryPending(snapshot) {
    return !!snapshot.replaceLibrary || snapshot.upsertSongs.length > 0 || snapshot.deleteSongIds.length > 0 || snapshot.upsertPlaylists.length > 0 || snapshot.deletePlaylistIds.length > 0 || !!snapshot.state;
  }

  function persistQueue() {
    const key = queueKey();
    if (!key) return;
    try {
      if (!hasPending()) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(snapshotPending()));
    } catch {}
  }

  function mergeHistory(events) {
    for (const item of events || []) {
      const eventId = String(item?.eventId || "");
      const songId = String(item?.songId || "");
      if (!eventId || !songId) continue;
      pending.playHistory.set(eventId, { ...(pending.playHistory.get(eventId) || {}), ...item, eventId, songId });
    }
  }

  function mergeDelta(delta, persist = true) {
    if (!delta || typeof delta !== "object") return;
    mergeHistory(delta.playHistory || delta.events || []);
    if (delta.replaceLibrary) {
      pending.replaceLibrary = delta.replaceLibrary;
      pending.songs.clear(); pending.deletedSongs.clear();
      pending.playlists.clear(); pending.deletedPlaylists.clear();
      pending.state = null;
      if (persist) persistQueue();
      return;
    }
    if (pending.replaceLibrary) {
      const p = profiles();
      const raw = p?.nativeGetItem?.(localStorage, p.roleStorageKey?.());
      try { if (raw) pending.replaceLibrary = JSON.parse(raw); } catch {}
      if (persist) persistQueue();
      return;
    }
    for (const item of delta.upsertSongs || []) {
      const id = String(item?.song?.id || "");
      if (!id) continue;
      pending.songs.set(id, item); pending.deletedSongs.delete(id);
    }
    for (const value of delta.deleteSongIds || []) {
      const id = String(value || "");
      if (!id) continue;
      pending.songs.delete(id); pending.deletedSongs.add(id);
    }
    for (const item of delta.upsertPlaylists || []) {
      const id = String(item?.playlist?.id || "");
      if (!id) continue;
      pending.playlists.set(id, item); pending.deletedPlaylists.delete(id);
    }
    for (const value of delta.deletePlaylistIds || []) {
      const id = String(value || "");
      if (!id) continue;
      pending.playlists.delete(id); pending.deletedPlaylists.add(id);
    }
    if (delta.state) pending.state = delta.state;
    if (persist) persistQueue();
  }

  function hydrateQueue() {
    const id = accountId();
    if (!id || hydratedFor === id) return;
    hydratedFor = id;
    try {
      const raw = localStorage.getItem(queueKey());
      if (raw) mergeDelta(JSON.parse(raw), false);
    } catch {}
  }

  function takePending() {
    const snapshot = snapshotPending();
    pending.replaceLibrary = null;
    pending.songs.clear(); pending.deletedSongs.clear();
    pending.playlists.clear(); pending.deletedPlaylists.clear();
    pending.state = null;
    pending.playHistory.clear();
    persistQueue();
    return snapshot;
  }

  function schedule(delay = 900) {
    clearTimeout(timer);
    timer = setTimeout(() => flush(false), delay);
  }

  async function flush(keepalive = false) {
    hydrateQueue();
    if (saving || !hasPending()) return;
    const session = currentSession();
    if (!session?.token || profiles()?.currentRole?.() !== "cloud") return;
    const snapshot = takePending();
    saving = true;
    document.documentElement.dataset.cloudSync = "saving";
    try {
      if (snapshot.replaceLibrary) await api("replace_library", { token: session.token, library: snapshot.replaceLibrary }, keepalive);
      else if (hasLibraryPending(snapshot)) await api("sync_changes", { token: session.token, changes: snapshot }, keepalive);
      if (snapshot.playHistory.length) await api("sync_play_history", { token: session.token, events: snapshot.playHistory }, keepalive);
      document.documentElement.dataset.cloudSync = "saved";
      clearTimeout(retryTimer);
      if (hasPending()) schedule(250);
    } catch (error) {
      console.error("[LyricTube] cloud sync failed", error);
      mergeDelta(snapshot);
      document.documentElement.dataset.cloudSync = "error";
      clearTimeout(retryTimer);
      if (!keepalive) retryTimer = setTimeout(() => flush(false), RETRY_MS);
    } finally {
      saving = false;
    }
  }

  async function loadPlaybackHistory() {
    const session = currentSession();
    if (!session?.token || profiles()?.currentRole?.() !== "cloud") return { history: [] };
    return api("load_play_history", { token: session.token });
  }

  async function clearPlaybackHistory({ resetStats = false } = {}) {
    const session = currentSession();
    if (!session?.token || profiles()?.currentRole?.() !== "cloud") return { ok: true, localOnly: true };
    const started = Date.now();
    while (saving && Date.now() - started < 8000) await new Promise(resolve => setTimeout(resolve, 50));
    pending.playHistory.clear();
    persistQueue();
    return api(resetStats ? "reset_play_history" : "clear_play_history", { token: session.token });
  }

  document.addEventListener("lyrictube:cloud-library-delta", event => {
    if (profiles()?.currentRole?.() !== "cloud") return;
    hydrateQueue(); mergeDelta(event.detail); schedule();
  });
  document.addEventListener("lyrictube:cloud-play-history-delta", event => {
    if (profiles()?.currentRole?.() !== "cloud") return;
    hydrateQueue(); mergeDelta({ playHistory: event.detail?.events || [] }); schedule(350);
  });
  document.addEventListener("lyrictube:cloud-session-ready", () => { hydrateQueue(); if (hasPending()) schedule(100); });
  window.addEventListener("online", () => { hydrateQueue(); if (hasPending()) schedule(100); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && hasPending()) flush(true); });
  window.addEventListener("pagehide", () => { if (hasPending()) flush(true); });

  window.LyricTubeCloudSync = Object.freeze({ flush: () => flush(false), hasPending, hydrateQueue, loadPlaybackHistory, clearPlaybackHistory });

  // A1 is loaded here so the existing HTML/bootstrap order remains unchanged.
  // The integration still waits for LyricTubeCore before patching playback.
  function loadPlaybackA1() {
    if (document.querySelector('script[data-lyrictube-playback-a1]')) return;
    const loadIntegration = () => {
      if (document.querySelector('script[data-lyrictube-playback-a1]')) return;
      const integration = document.createElement("script");
      integration.src = `playback-a1.js?v=${encodeURIComponent(window.LyricTubeVersion?.build || "a1")}`;
      integration.async = false;
      integration.dataset.lyrictubePlaybackA1 = "";
      document.body.appendChild(integration);
    };
    if (window.LyricTubePlaybackState) return loadIntegration();
    const state = document.createElement("script");
    state.src = `core/playback-state.js?v=${encodeURIComponent(window.LyricTubeVersion?.build || "a1")}`;
    state.async = false;
    state.onload = loadIntegration;
    document.body.appendChild(state);
  }
  loadPlaybackA1();
})();
