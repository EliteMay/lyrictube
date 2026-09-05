(() => {
  "use strict";

  const DIAG_KEY = "lyrictube.playbackDiagnostics.v2";
  let initialized = false;
  let timingGeneration = 0;
  const longTasks = [];

  const STATE_NAMES = Object.freeze({
    [-1]: "UNSTARTED",
    0: "ENDED",
    1: "PLAYING",
    2: "PAUSED",
    3: "BUFFERING",
    5: "CUED",
  });

  function stateName(value) {
    return STATE_NAMES[value] || `STATE_${value}`;
  }

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

  function startLongTaskObserver() {
    if (!window.PerformanceObserver) return;
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
        if (longTasks.length > 200) longTasks.splice(0, longTasks.length - 200);
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {}
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

  function formatMs(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}ms` : "—";
  }

  function ensureDiagnosticPanel() {
    let panel = document.getElementById("playbackDiagnosticPanel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "playbackDiagnosticPanel";
    panel.hidden = true;
    panel.setAttribute("aria-live", "polite");
    Object.assign(panel.style, {
      position: "fixed",
      right: "12px",
      bottom: "96px",
      width: "min(360px, calc(100vw - 24px))",
      zIndex: "2147483000",
      border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "10px",
      padding: "10px 12px",
      background: "rgba(15,17,21,.96)",
      color: "#f5f7fa",
      boxShadow: "0 12px 32px rgba(0,0,0,.35)",
      font: "12px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    });

    const head = document.createElement("div");
    Object.assign(head.style, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" });
    const title = document.createElement("strong");
    title.textContent = "再生診断";
    title.style.marginRight = "auto";

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "コピー";
    Object.assign(copy.style, {
      border: "1px solid rgba(255,255,255,.18)", borderRadius: "6px", padding: "3px 7px",
      background: "transparent", color: "inherit", cursor: "pointer", font: "inherit"
    });
    copy.addEventListener("click", async () => {
      const latest = readDiagnostics()[0];
      if (!latest) return;
      const text = diagnosticText(latest);
      try {
        await navigator.clipboard?.writeText?.(text);
        copy.textContent = "コピー済み";
        setTimeout(() => { copy.textContent = "コピー"; }, 1200);
      } catch {
        copy.textContent = "コピー失敗";
      }
    });

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    Object.assign(close.style, {
      border: 0, padding: "2px 4px", background: "transparent", color: "inherit",
      cursor: "pointer", font: "700 16px/1 system-ui"
    });
    close.addEventListener("click", () => { panel.hidden = true; });

    const body = document.createElement("div");
    body.dataset.diagBody = "";
    body.style.whiteSpace = "pre-line";

    head.append(title, copy, close);
    panel.append(head, body);
    document.body.appendChild(panel);
    return panel;
  }

  function diagnosticText(entry) {
    const states = (entry.states || []).map(item => `${item.name} ${item.atMs}ms`).join(" → ") || "変化なし";
    return [
      `LyricTube playback diagnostic build=${entry.build || "unknown"}`,
      `曲クリック→PLAYING: ${formatMs(entry.elapsedMs)}`,
      `selectSong同期処理: ${formatMs(entry.syncMs)}`,
      `次の描画Frame: ${formatMs(entry.frameMs)}`,
      `Player状態: ${states}`,
      `Long Task合計: ${formatMs(entry.longTaskTotalMs)} / 最大: ${formatMs(entry.longTaskMaxMs)}`,
      `結果: ${entry.result || "unknown"}`,
    ].join("\n");
  }

  function renderLiveDiagnostic(data) {
    const panel = ensureDiagnosticPanel();
    panel.hidden = false;
    const body = panel.querySelector("[data-diag-body]");
    if (!body) return;
    const states = (data.states || []).map(item => `${item.name} ${item.atMs}ms`).join(" → ") || "待機中";
    body.textContent = [
      `クリック→現在: ${formatMs(data.elapsedMs)}`,
      `App同期処理: ${formatMs(data.syncMs)}`,
      `次の描画Frame: ${formatMs(data.frameMs)}`,
      `Player状態: ${states}`,
      `Long Task: ${formatMs(data.longTaskTotalMs)}（最大 ${formatMs(data.longTaskMaxMs)}）`,
      data.result ? `判定: ${data.result}` : "判定: 計測中…",
    ].join("\n");
  }

  function summarizeLongTasks(startedAt, endedAt) {
    const relevant = longTasks.filter(item => item.startTime >= startedAt && item.startTime <= endedAt);
    return {
      total: Math.round(relevant.reduce((sum, item) => sum + item.duration, 0)),
      max: Math.round(relevant.reduce((max, item) => Math.max(max, item.duration), 0)),
    };
  }

  function classifyTiming(entry) {
    if (entry.timeout) return "12秒以内にPLAYINGにならず";
    if ((entry.syncMs || 0) >= 250) return "Appの同期処理が遅い";
    if ((entry.frameMs || 0) >= 250 || (entry.longTaskTotalMs || 0) >= 500) return "Main Thread / 描画処理が遅い";
    const buffering = (entry.states || []).find(item => item.state === 3);
    if (buffering && entry.elapsedMs - buffering.atMs >= 1000) return "YouTube BUFFERING待ちが長い";
    if ((entry.elapsedMs || 0) >= 1000) return "YouTube Player側の開始待ちが長い";
    return "再生開始は正常範囲";
  }

  function recordPlaybackTiming(entry) {
    entry.result = classifyTiming(entry);
    const items = readDiagnostics();
    items.unshift(entry);
    try { localStorage.setItem(DIAG_KEY, JSON.stringify(items.slice(0, 20))); } catch {}
    document.documentElement.dataset.playbackStartMs = String(entry.elapsedMs || "");
    renderLiveDiagnostic(entry);
    console.info("[LyricTube] playback diagnostic", entry);
  }

  function observePlaybackStart(songId, startedAt, syncMs) {
    const generation = ++timingGeneration;
    const initialState = Number(window.LyricTubeCore?.state?.());
    let sawNonPlaying = initialState !== 1;
    let previousState = initialState;
    let frameMs = null;
    const states = [{ state: initialState, name: stateName(initialState), atMs: 0 }];

    requestAnimationFrame(() => {
      if (generation !== timingGeneration) return;
      frameMs = Math.round(performance.now() - startedAt);
    });

    const check = () => {
      if (generation !== timingGeneration) return;
      const core = window.LyricTubeCore;
      if (!core || String(core.getSong?.()?.id || "") !== String(songId || "")) return;

      const now = performance.now();
      const elapsed = now - startedAt;
      const state = Number(core.state?.());
      if (state !== previousState) {
        states.push({ state, name: stateName(state), atMs: Math.round(elapsed) });
        previousState = state;
      }
      if (state !== 1) sawNonPlaying = true;

      const long = summarizeLongTasks(startedAt, now);
      const live = {
        elapsedMs: Math.round(elapsed), syncMs: Math.round(syncMs), frameMs,
        states, longTaskTotalMs: long.total, longTaskMaxMs: long.max,
      };
      if (Math.round(elapsed) % 250 < 30) renderLiveDiagnostic(live);

      if (sawNonPlaying && state === 1) {
        recordPlaybackTiming({
          songId: String(songId || ""),
          elapsedMs: Math.round(elapsed),
          syncMs: Math.round(syncMs),
          frameMs,
          states,
          longTaskTotalMs: long.total,
          longTaskMaxMs: long.max,
          capturedAt: new Date().toISOString(),
          build: window.LyricTubeVersion?.build || "",
          timeout: false,
        });
        return;
      }

      if (elapsed >= 12000) {
        recordPlaybackTiming({
          songId: String(songId || ""),
          elapsedMs: Math.round(elapsed),
          syncMs: Math.round(syncMs),
          frameMs,
          states,
          longTaskTotalMs: long.total,
          longTaskMaxMs: long.max,
          capturedAt: new Date().toISOString(),
          build: window.LyricTubeVersion?.build || "",
          timeout: true,
        });
        return;
      }
      setTimeout(check, 25);
    };

    renderLiveDiagnostic({ elapsedMs: 0, syncMs, frameMs, states, longTaskTotalMs: 0, longTaskMaxMs: 0 });
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
    const syncMs = performance.now() - startedAt;
    observePlaybackStart(songId, startedAt, syncMs);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    annotateSongRows();
    startLongTaskObserver();
    document.addEventListener("click", handlePrimarySongClick, true);
    window.LyricTubeHooks?.on?.("render:all", () => queueMicrotask(annotateSongRows));
    window.LyricTubePlaybackDiagnostics = Object.freeze({
      recent: () => readDiagnostics().map(item => ({ ...item })),
      latestText: () => readDiagnostics()[0] ? diagnosticText(readDiagnostics()[0]) : "",
      show: () => {
        const latest = readDiagnostics()[0];
        if (latest) renderLiveDiagnostic(latest);
        else {
          const panel = ensureDiagnosticPanel();
          panel.hidden = false;
          const body = panel.querySelector("[data-diag-body]");
          if (body) body.textContent = "まだ診断データがありません。曲を1曲クリックしてください。";
        }
      },
      clear: () => { try { localStorage.removeItem(DIAG_KEY); } catch {} },
    });
  }

  warmYoutubeConnections();
  if (window.LyricTubeCore) initialize();
  else document.addEventListener("lyrictube:app-ready", initialize, { once: true });
})();
