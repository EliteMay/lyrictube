(() => {
  "use strict";

  const DIAG_KEY = "lyrictube.playbackDiagnostics.v1";
  let initialized = false;
  let timingGeneration = 0;

  function warmYoutubeConnections() {
    for (const href of ["https://www.youtube.com", "https://i.ytimg.com"]) {
      if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
    if (!window.YT?.Player && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.lyrictubeEarlyYoutubeApi = "";
      document.head.appendChild(script);
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

  function readDiagnostics() {
    try {
      const raw = JSON.parse(localStorage.getItem(DIAG_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function recordPlaybackTiming(entry) {
    const items = readDiagnostics();
    items.unshift(entry);
    try { localStorage.setItem(DIAG_KEY, JSON.stringify(items.slice(0, 20))); } catch {}
    document.documentElement.dataset.playbackStartMs = String(entry.elapsedMs);
    console.info(`[LyricTube] playback started in ${entry.elapsedMs}ms`);
  }

  function observePlaybackStart(songId, startedAt) {
    const generation = ++timingGeneration;
    let sawNonPlaying = Number(window.LyricTubeCore?.state?.()) !== 1;

    const check = () => {
      if (generation !== timingGeneration) return;
      const core = window.LyricTubeCore;
      if (!core || String(core.getSong?.()?.id || "") !== String(songId || "")) return;
      const state = Number(core.state?.());
      if (state !== 1) sawNonPlaying = true;
      const elapsed = performance.now() - startedAt;
      if (sawNonPlaying && state === 1) {
        recordPlaybackTiming({
          songId: String(songId || ""),
          elapsedMs: Math.round(elapsed),
          capturedAt: new Date().toISOString(),
          build: window.LyricTubeVersion?.build || "",
        });
        return;
      }
      if (elapsed < 12000) setTimeout(check, 50);
    };

    setTimeout(check, 0);
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

    event.preventDefault();
    event.stopImmediatePropagation();
    const startedAt = performance.now();
    window.selectSong(songId, true);
    observePlaybackStart(songId, startedAt);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    annotateSongRows();
    document.addEventListener("click", handlePrimarySongClick, true);
    window.LyricTubeHooks?.on?.("render:all", () => queueMicrotask(annotateSongRows));
    window.LyricTubePlaybackDiagnostics = Object.freeze({
      recent: () => readDiagnostics().map(item => ({ ...item })),
      clear: () => { try { localStorage.removeItem(DIAG_KEY); } catch {} },
    });
  }

  warmYoutubeConnections();
  if (window.LyricTubeCore) initialize();
  else document.addEventListener("lyrictube:app-ready", initialize, { once: true });
})();
