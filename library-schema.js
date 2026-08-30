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

    const songIds = new Set();
    const versionIds = new Set();
    const tagIds = new Set((input?.settings?.tags || []).map(tag => String(tag?.id || "")).filter(Boolean));

    for (const [index, song] of (input?.songs || []).entries()) {
      const songId = String(song?.id || "");
      if (!songId) errors.push(`songs[${index}].id is required`);
      else if (songIds.has(songId)) errors.push(`duplicate song id: ${songId}`);
      else songIds.add(songId);

      if (!Array.isArray(song?.versions)) {
        errors.push(`songs[${index}].versions must be an array`);
        continue;
      }
      for (const [vIndex, version] of song.versions.entries()) {
        const versionId = String(version?.id || "");
        if (!versionId) errors.push(`songs[${index}].versions[${vIndex}].id is required`);
        else if (versionIds.has(versionId)) errors.push(`duplicate version id: ${versionId}`);
        else versionIds.add(versionId);

        const start = Number(version?.startTime || 0);
        const end = version?.endTime;
        if (end !== null && end !== undefined && Number(end) < start) errors.push(`version ${versionId || vIndex}: endTime is before startTime`);
        for (const [sIndex, segment] of (version?.skipSegments || []).entries()) {
          if (Number(segment?.end) <= Number(segment?.start)) errors.push(`version ${versionId || vIndex} skipSegments[${sIndex}] has invalid range`);
        }
      }
      for (const tagId of song?.tagIds || []) {
        if (tagIds.size && !tagIds.has(String(tagId))) errors.push(`song ${songId || index} references missing tag: ${tagId}`);
      }
    }

    for (const [index, playlist] of (input?.playlists || []).entries()) {
      for (const songId of playlist?.songIds || []) {
        if (!songIds.has(String(songId))) errors.push(`playlists[${index}] references missing song: ${songId}`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  window.LyricTubeLibrarySchema = Object.freeze({
    current: CURRENT_SCHEMA,
    migrate,
    validate
  });
})();
