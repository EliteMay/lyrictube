(() => {
  "use strict";

  const CURRENT_SCHEMA = 4;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeVersion(version) {
    if (!version || typeof version !== "object") return null;
    const next = { ...version };
    if (!Array.isArray(next.skipSegments)) next.skipSegments = [];
    if (!Number.isFinite(Number(next.startTime))) next.startTime = 0;
    if (next.endTime !== null && next.endTime !== undefined && !Number.isFinite(Number(next.endTime))) next.endTime = null;
    if (!Number.isFinite(Number(next.lyricsOffset))) next.lyricsOffset = 0;
    if (next.source === "local") next.source = "localmedia";
    if (next.source === "localmedia") {
      next.youtubeUrl = "";
      next.videoId = "";
      if (!next.localMediaKind) next.localMediaKind = "audio";
    }
    return next;
  }

  function normalizeSong(song) {
    if (!song || typeof song !== "object") return null;
    const next = { ...song };
    next.versions = (Array.isArray(next.versions) ? next.versions : []).map(normalizeVersion).filter(Boolean);
    next.tagIds = Array.isArray(next.tagIds) ? [...new Set(next.tagIds.map(String).filter(Boolean))] : [];
    next.plainLyrics = String(next.plainLyrics || "");
    next.syncedLyrics = String(next.syncedLyrics || "");
    next.lyricsSource = String(next.lyricsSource || "");
    next.lyricsProvider = String(next.lyricsProvider || (next.lrclibId ? "lrclib" : ""));
    next.lyricsProviderId = String(next.lyricsProviderId || next.lrclibId || "");
    return next;
  }

  function migrate(input) {
    const library = clone(input) || {};
    library.version = Number(library.version || 3);
    library.songs = (Array.isArray(library.songs) ? library.songs : []).map(normalizeSong).filter(Boolean);
    library.playlists = Array.isArray(library.playlists) ? library.playlists : [];
    library.settings = library.settings && typeof library.settings === "object" ? library.settings : {};
    library.settings.dataSchemaVersion = CURRENT_SCHEMA;
    if (!Array.isArray(library.settings.tags)) library.settings.tags = [];
    return library;
  }

  function validate(input) {
    const errors = [];
    if (!input || typeof input !== "object") errors.push("library must be an object");
    if (!Array.isArray(input?.songs)) errors.push("songs must be an array");
    if (!Array.isArray(input?.playlists)) errors.push("playlists must be an array");
    for (const [index, song] of (input?.songs || []).entries()) {
      if (!song?.id) errors.push(`songs[${index}].id is required`);
      if (!Array.isArray(song?.versions)) errors.push(`songs[${index}].versions must be an array`);
    }
    return { ok: errors.length === 0, errors };
  }

  window.LyricTubeLibrarySchema = Object.freeze({
    current: CURRENT_SCHEMA,
    migrate,
    validate
  });
})();
