(() => {
  "use strict";

  const frame = document.getElementById("appFrame");
  const resultEl = document.getElementById("diagResult");
  const copyBtn = document.getElementById("copyDiag");
  const hintEl = document.getElementById("diagHint");
  const STATE_NAMES = { [-1]: "UNSTARTED", 0: "ENDED", 1: "PLAYING", 2: "PAUSED", 3: "BUFFERING", 5: "CUED" };

  let current = null;
  let latestText = "";
  let generation = 0;
  let child = null;
  let pollTimer = null;
  let longTaskObserver = null;

  function stateName(value) {
    return STATE_NAMES[value] || `STATE_${value}`;
  }

  function ms(value) {
    return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}ms` : "—";
  }

  function elapsed() {
    return current ? Math.round(performance.now() - current.startedAt) : 0;
  }

  function pushStage(name, detail = "") {
    if (!current) return;
    const item = { name, atMs: elapsed(), detail };
    const last = current.stages[current.stages.length - 1];
    if (last && last.name === item.name && last.detail === item.detail) return;
    current.stages.push(item);
    render();
  }

  function classify(data) {
    if (data.timeout) return "PLAYINGまで12秒以上: Player / 通信側を要確認";
    if ((data.selectReturnMs || 0) >= 250) return "selectSong内のApp処理が遅い";
    if ((data.frameMs || 0) >= 250 || (data.longTaskTotalMs || 0) >= 500) return "Main Thread / DOM描画が詰まっている";
    const load = data.stages.find(item => item.name === "loadVideoById");
    const buffering = data.stages.find(item => item.name === "BUFFERING");
    if (buffering && data.playingMs - buffering.atMs >= 1000) return "YouTube BUFFERINGが主な待ち時間";
    if (load && data.playingMs - load.atMs >= 1000) return "loadVideoById後のYouTube Player待ちが主因";
    if ((data.playingMs || 0) >= 1000) return "App処理は速いがYouTube Playerの状態遷移が遅い";
    return "再生開始は概ね正常";
  }

  function diagnosticText(data = current) {
    if (!data) return "診断データなし";
    const stages = data.stages.map(item => `${item.name} ${item.atMs}ms${item.detail ? ` (${item.detail})` : ""}`).join(" → ");
    const verdict = data.verdict || "計測中";
    return [
      `LyricTube playback diagnostic`,
      `build: ${data.build || "unknown"}`,
      `song: ${data.songTitle || data.songId || "unknown"}`,
      `クリック→PLAYING: ${data.playingMs != null ? ms(data.playingMs) : data.timeout ? "12秒超" : "計測中"}`,
      `selectSong返却: ${ms(data.selectReturnMs)}`,
      `次Frame: ${ms(data.frameMs)}`,
      `Long Task合計: ${ms(data.longTaskTotalMs)} / 最大: ${ms(data.longTaskMaxMs)}`,
      `Stages: ${stages || "待機中"}`,
      `判定: ${verdict}`,
    ].join("\n");
  }

  function render() {
    if (!current) return;
    latestText = diagnosticText(current);
    resultEl.textContent = latestText;
  }

  function finish({ timeout = false } = {}) {
    if (!current || current.finished) return;
    current.finished = true;
    current.timeout = timeout;
    current.verdict = classify(current);
    latestText = diagnosticText(current);
    resultEl.textContent = latestText;
    hintEl.textContent = "右上の「コピー」を押して、その内容をChatGPTへ送ってください。";
    try {
      localStorage.setItem("lyrictube.playbackDiagnostic.latest", JSON.stringify(current));
    } catch {}
  }

  function begin(songId, songTitle) {
    generation += 1;
    const gen = generation;
    clearTimeout(pollTimer);
    current = {
      generation: gen,
      songId: String(songId || ""),
      songTitle: String(songTitle || ""),
      build: child?.LyricTubeVersion?.build || "",
      startedAt: performance.now(),
      selectReturnMs: null,
      frameMs: null,
      playingMs: null,
      longTaskTotalMs: 0,
      longTaskMaxMs: 0,
      stages: [{ name: "CLICK", atMs: 0, detail: "" }],
      finished: false,
      timeout: false,
      verdict: "",
    };

    try {
      const initial = Number(child?.LyricTubeCore?.state?.());
      current.lastState = initial;
      current.sawNonPlaying = initial !== 1;
      current.stages.push({ name: stateName(initial), atMs: 0, detail: "initial" });
    } catch {
      current.lastState = null;
      current.sawNonPlaying = true;
    }

    hintEl.textContent = "計測中です。動画が流れ始めるまでそのまま待ってください。";
    render();

    try {
      child.requestAnimationFrame(() => {
        if (!current || current.generation !== gen || current.finished) return;
        current.frameMs = elapsed();
        pushStage("NEXT_FRAME");
      });
    } catch {}

    const poll = () => {
      if (!current || current.generation !== gen || current.finished) return;
      const e = elapsed();
      let state = null;
      try { state = Number(child?.LyricTubeCore?.state?.()); } catch {}
      if (state !== null && state !== current.lastState) {
        current.lastState = state;
        if (state !== 1) current.sawNonPlaying = true;
        pushStage(stateName(state));
      }
      if (current.sawNonPlaying && state === 1) {
        current.playingMs = e;
        finish();
        return;
      }
      if (e >= 12000) {
        finish({ timeout: true });
        return;
      }
      if (e % 250 < 30) render();
      pollTimer = setTimeout(poll, 20);
    };
    pollTimer = setTimeout(poll, 0);
  }

  function wrapMethod(target, name, label) {
    if (!target || typeof target[name] !== "function" || target[name].__lyricTubeDiagWrapped) return false;
    const original = target[name];
    function wrapped(...args) {
      if (current && !current.finished) {
        current.sawNonPlaying = true;
        const detail = args[0]?.videoId || (typeof args[0] === "string" ? args[0] : "");
        pushStage(label, detail ? String(detail) : "");
      }
      return original.apply(this, args);
    }
    wrapped.__lyricTubeDiagWrapped = true;
    target[name] = wrapped;
    return true;
  }

  function patchYoutubeMethods() {
    try {
      const proto = child?.YT?.Player?.prototype;
      if (!proto) return false;
      wrapMethod(proto, "loadVideoById", "loadVideoById");
      wrapMethod(proto, "cueVideoById", "cueVideoById");
      wrapMethod(proto, "playVideo", "playVideo");
      return true;
    } catch {
      return false;
    }
  }

  function patchSelectSong() {
    if (!child || typeof child.selectSong !== "function" || child.selectSong.__lyricTubeDiagWrapped) return;
    const original = child.selectSong;
    function wrapped(id, autoplay = false, ...rest) {
      const matches = current && String(current.songId) === String(id);
      if (matches) pushStage("selectSong ENTER", `autoplay=${Boolean(autoplay)}`);
      const started = performance.now();
      const value = original.call(this, id, autoplay, ...rest);
      if (matches && current && !current.finished) {
        current.selectReturnMs = Math.round(performance.now() - current.startedAt);
        pushStage("selectSong RETURN", `${Math.round(performance.now() - started)}ms inside`);
      }
      return value;
    }
    wrapped.__lyricTubeDiagWrapped = true;
    child.selectSong = wrapped;
  }

  function installLongTaskObserver() {
    try { longTaskObserver?.disconnect?.(); } catch {}
    try {
      longTaskObserver = new child.PerformanceObserver(list => {
        if (!current || current.finished) return;
        for (const entry of list.getEntries()) {
          current.longTaskTotalMs += Math.round(entry.duration);
          current.longTaskMaxMs = Math.max(current.longTaskMaxMs, Math.round(entry.duration));
          pushStage("LONG_TASK", `${Math.round(entry.duration)}ms`);
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: false });
    } catch {}
  }

  function findSongFromClick(event) {
    const button = event.target?.closest?.("#songList .song-item");
    if (!button) return null;
    const row = button.closest(".song-row");
    let songId = row?.dataset?.a1SongId || "";
    let title = button.querySelector("strong")?.textContent?.trim() || "";
    if (!songId) {
      try {
        const rows = [...child.document.querySelectorAll("#songList .song-row")];
        const index = rows.indexOf(row);
        const songs = typeof child.viewSongs === "function" ? child.viewSongs() : [];
        songId = songs[index]?.id || "";
        title = title || songs[index]?.title || "";
      } catch {}
    }
    return songId ? { songId, title } : null;
  }

  function install() {
    child = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!child || !doc) {
      resultEl.textContent = "検査画面を初期化できませんでした。";
      return;
    }

    const hideChildPanel = doc.createElement("style");
    hideChildPanel.textContent = "#playbackDiagnosticPanel{display:none!important}";
    doc.head.appendChild(hideChildPanel);

    const waitForApp = () => {
      if (!child.LyricTubeCore || typeof child.selectSong !== "function") {
        setTimeout(waitForApp, 100);
        return;
      }
      patchSelectSong();
      installLongTaskObserver();
      const patchTimer = setInterval(() => {
        patchSelectSong();
        if (patchYoutubeMethods()) clearInterval(patchTimer);
      }, 100);

      child.addEventListener("click", event => {
        const picked = findSongFromClick(event);
        if (!picked) return;
        begin(picked.songId, picked.title);
      }, true);

      resultEl.textContent = `準備完了 · build ${child.LyricTubeVersion?.build || "unknown"}\n左の曲一覧から、今とは別の曲を1回クリックしてください。`;
      hintEl.textContent = "再生開始までの各段階を自動計測します。";
    };
    waitForApp();
  }

  frame.addEventListener("load", install, { once: true });

  copyBtn.addEventListener("click", async () => {
    if (!latestText) latestText = resultEl.textContent || "";
    try {
      await navigator.clipboard.writeText(latestText);
      copyBtn.textContent = "コピー済み";
      setTimeout(() => { copyBtn.textContent = "コピー"; }, 1200);
    } catch {
      copyBtn.textContent = "コピー失敗";
    }
  });
})();
