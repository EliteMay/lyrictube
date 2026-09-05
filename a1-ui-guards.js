(() => {
  "use strict";

  let initialized = false;

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
    annotateSongRows();
    document.addEventListener("click", handlePrimarySongClick, true);
    window.LyricTubeHooks?.on?.("render:all", () => queueMicrotask(annotateSongRows));
  }

  if (window.LyricTubeCore) initialize();
  else document.addEventListener("lyrictube:app-ready", initialize, { once: true });
})();
