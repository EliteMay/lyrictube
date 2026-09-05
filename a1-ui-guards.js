(() => {
  "use strict";

  let initialized = false;
  let renderFrame = 0;
  let autoplayGeneration = 0;

  function warmYoutubeConnections() {
    for (const href of ["https://www.youtube.com", "https://i.ytimg.com"]) {
      if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
  }

  function visibleSongs() {
    try {
      return typeof window.viewSongs === "function" ? window.viewSongs() : [];
    } catch {
      return [];
    }
  }

  function annotateSongRows() {
    const songs = visibleSongs();
    document.querySelectorAll("#songList .song-row").forEach((row, index) => {
      const song = songs[index];
      if (!song?.id) return;
      row.dataset.a1SongId = String(song.id);
      const primary = row.querySelector(".song-item");
      if (!primary) return;
      primary.title = `「${song.title || "曲"}」を再生`;
      primary.setAttribute("aria-label", `${song.title || "曲"}を再生`);
    });
  }

  function scheduleDeferredFullRender() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      try { window.renderAll?.(); } catch (error) {
        console.warn("[LyricTube] deferred playback render failed", error);
      }
    });
  }

  function runAutoplaySelectionFirst(select, songId) {
    const renderAll = window.renderAll;
    let renderRequested = false;

    if (typeof renderAll !== "function") return select(songId, true);

    // app.js normally rebuilds Library, Browse and Lyrics before it tells the
    // player to load the new video. During autoplay selections, defer that
    // expensive visual work for one frame so the media request is issued first.
    window.renderAll = () => { renderRequested = true; };
    try {
      return select(songId, true);
    } finally {
      window.renderAll = renderAll;
      if (renderRequested) scheduleDeferredFullRender();
    }
  }

  function ensureAutoplayStarted(songId) {
    const generation = ++autoplayGeneration;
    const startedAt = performance.now();
    const maxWaitMs = 5000;

    const tryStart = () => {
      if (generation !== autoplayGeneration) return;
      const core = window.LyricTubeCore;
      const currentId = String(core?.getSong?.()?.id || "");
      if (!core || currentId !== String(songId || "")) return;
      if (Number(core.state?.()) === 1) return;

      // The first attempt still runs in the original click task when possible.
      // Later attempts cover the YouTube iframe becoming ready after the click.
      try { core.play?.(); } catch {}
      if (Number(core.state?.()) === 1) return;
      if (performance.now() - startedAt < maxWaitMs) setTimeout(tryStart, 120);
    };

    tryStart();
  }

  function installFastAutoplaySelect() {
    const select = window.selectSong;
    if (typeof select !== "function" || select.__lyricTubeFastAutoplay) return;

    const fastSelect = function(songId, autoplay = false) {
      if (!autoplay) return select(songId, autoplay);
      const result = runAutoplaySelectionFirst(select, songId);
      ensureAutoplayStarted(songId);
      return result;
    };
    Object.defineProperty(fastSelect, "__lyricTubeFastAutoplay", { value: true });
    window.selectSong = fastSelect;
  }

  function handlePrimarySongClick(event) {
    const primary = event.target?.closest?.("#songList .song-item");
    if (!primary) return;

    let row = primary.closest(".song-row");
    let songId = row?.dataset?.a1SongId || "";
    if (!songId) {
      annotateSongRows();
      row = primary.closest(".song-row");
      songId = row?.dataset?.a1SongId || "";
    }
    if (!songId || typeof window.selectSong !== "function") return;

    // The main row means "play now". Auxiliary actions are siblings of
    // .song-item and therefore never enter this handler.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.selectSong(songId, true);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    installFastAutoplaySelect();
    annotateSongRows();
    document.addEventListener("click", handlePrimarySongClick, true);
    window.LyricTubeHooks?.on?.("render:all", () => queueMicrotask(annotateSongRows));
  }

  warmYoutubeConnections();
  if (window.LyricTubeCore) initialize();
  else document.addEventListener("lyrictube:app-ready", initialize, { once: true });
})();
