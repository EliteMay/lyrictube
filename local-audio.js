(() => {
  "use strict";

  const DB_NAME = "lyrictube.localAudio.v1";
  const DB_VERSION = 1;
  const STORE_NAME = "tracks";
  const MAX_FILE_BYTES = 250 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;

  let db = null;
  let ready = false;
  let activeKey = "";
  let activeUrl = "";
  let originalLoadSelectedVideo = null;
  let originalCurrentPlayerTime = null;
  let originalPlayerDurationSafe = null;
  let originalPlayerStateSafe = null;
  let originalGetPlayerDuration = null;
  let originalToggleMainPlayback = null;
  let originalSeekSyncPlayer = null;
  let originalToggleSyncPlayback = null;
  let originalEnforcePlaybackRules = null;
  let originalRestartCurrent = null;
  let originalTypeName = null;
  let originalRenderBottomPlayer = null;

  const records = new Map();
  const audio = document.createElement("audio");
  audio.id = "localAudioPlayer";
  audio.preload = "metadata";
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  document.body.appendChild(audio);

  const $ = id => document.getElementById(id);

  function showMessage(message) {
    try {
      if (typeof showToast === "function") showToast(message);
      else console.info(`[LyricTube] ${message}`);
    } catch {
      console.info(`[LyricTube] ${message}`);
    }
  }

  function accountScope() {
    const profiles = window.LyricTubeProfiles;
    const role = profiles?.currentRole?.() || "local";
    if (role === "cloud") {
      const session = profiles?.readCloudSession?.();
      return `cloud:${String(session?.account?.id || session?.account?.username || "unknown")}`;
    }
    return role;
  }

  function trackKey(song = safeSong(), version = safeVersion(song)) {
    if (!song?.id || !version?.id) return "";
    return `${accountScope()}:${song.id}:${version.id}`;
  }

  function safeSong() {
    try { return typeof getSong === "function" ? getSong() : null; } catch { return null; }
  }

  function safeVersion(song = safeSong()) {
    try { return typeof getVersion === "function" ? getVersion(song) : null; } catch { return null; }
  }

  function hasRecord(song = safeSong(), version = safeVersion(song)) {
    const key = trackKey(song, version);
    return key ? records.has(key) : false;
  }

  function currentRecord() {
    const key = trackKey();
    return key ? records.get(key) || null : null;
  }

  function isLocalOnlyVersion(version = safeVersion()) {
    return version?.type === "local";
  }

  function localMode() {
    const key = trackKey();
    return Boolean(key && activeKey === key && records.has(key) && audio.src);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const nextDb = request.result;
        if (!nextDb.objectStoreNames.contains(STORE_NAME)) {
          const store = nextDb.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("scope", "scope", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  function transaction(mode, callback) {
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error("IndexedDB not ready"));
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try { result = callback(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  }

  async function loadScopeRecords() {
    const scope = accountScope();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("scope");
      const request = index.getAll(scope);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("IndexedDB read failed"));
    });
    records.clear();
    for (const row of rows) {
      if (row?.key && row?.blob instanceof Blob) records.set(row.key, row);
    }
  }

  async function saveFile(song, version, file) {
    if (!song?.id || !version?.id) throw new Error("曲が選択されていません");
    if (!(file instanceof File)) throw new Error("音源ファイルを選択してください");
    const mimeOk = String(file.type || "").startsWith("audio/");
    if (!mimeOk && !SUPPORTED_EXTENSIONS.test(file.name || "")) throw new Error("MP3 / M4A などの音声ファイルを選択してください");
    if (file.size <= 0) throw new Error("空のファイルは登録できません");
    if (file.size > MAX_FILE_BYTES) throw new Error("1ファイル250MBまでにしてください");

    const key = trackKey(song, version);
    const row = {
      key,
      scope: accountScope(),
      songId: song.id,
      versionId: version.id,
      fileName: file.name || "audio",
      mime: file.type || "audio/mpeg",
      size: Number(file.size) || 0,
      updatedAt: new Date().toISOString(),
      blob: file.slice(0, file.size, file.type || "audio/mpeg")
    };
    await transaction("readwrite", store => store.put(row));
    records.set(key, row);
    try { await navigator.storage?.persist?.(); } catch {}
    return row;
  }

  async function removeFile(song = safeSong(), version = safeVersion(song)) {
    const key = trackKey(song, version);
    if (!key) return;
    await transaction("readwrite", store => store.delete(key));
    records.delete(key);
    if (activeKey === key) deactivateLocalAudio();
  }

  function releaseObjectUrl() {
    if (activeUrl) {
      try { URL.revokeObjectURL(activeUrl); } catch {}
      activeUrl = "";
    }
  }

  function pauseYoutube() {
    try { ytPlayer?.pauseVideo?.(); } catch {}
  }

  function setPlayerSurface(local, missing = false) {
    const yt = $("player");
    const placeholder = $("playerPlaceholder");
    const stage = $("localAudioStage");
    if (!stage) return;
    if (local || missing) {
      if (yt) yt.style.display = "none";
      placeholder?.classList.add("hidden");
      stage.classList.remove("hidden");
      stage.classList.toggle("missing", missing);
    } else {
      if (yt) yt.style.display = "";
      stage.classList.add("hidden");
      stage.classList.remove("missing");
    }
  }

  function updateStage() {
    const stage = $("localAudioStage");
    if (!stage) return;
    const song = safeSong();
    const version = safeVersion(song);
    const row = currentRecord();
    const missing = isLocalOnlyVersion(version) && !row;
    $("localStageTitle").textContent = missing ? "この端末に音源がありません" : (song?.title || "端末音源");
    $("localStageMeta").textContent = row
      ? `${row.fileName} · この端末に保存`
      : "音源ファイルを登録すると再生できます";
    const playBtn = $("localStagePlayBtn");
    if (playBtn) {
      playBtn.disabled = !row;
      playBtn.textContent = localMode() && !audio.paused ? "❚❚" : "▶";
    }
    const sourceBtn = $("localAudioSourceBtn");
    if (sourceBtn) {
      sourceBtn.disabled = !song || !version;
      sourceBtn.classList.toggle("attached", Boolean(row));
      sourceBtn.textContent = row ? "♫ 端末音源 ✓" : "♫ 端末音源";
    }
    const removeBtn = $("localRemoveBtn");
    if (removeBtn) removeBtn.disabled = !row;
  }

  function deactivateLocalAudio() {
    if (!activeKey && !audio.src) {
      setPlayerSurface(false);
      return;
    }
    try { audio.pause(); } catch {}
    audio.removeAttribute("src");
    try { audio.load(); } catch {}
    activeKey = "";
    releaseObjectUrl();
    setPlayerSurface(false);
    updateMediaSession(false);
    updateStage();
  }

  function activateLocalAudio(song, version, row, autoplay = false) {
    if (!row?.blob) return false;
    const key = trackKey(song, version);
    if (!key) return false;

    pauseYoutube();
    setPlayerSurface(true, false);
    if (activeKey !== key || !audio.src) {
      try { audio.pause(); } catch {}
      releaseObjectUrl();
      activeUrl = URL.createObjectURL(row.blob);
      audio.src = activeUrl;
      activeKey = key;
      audio.volume = Math.max(0, Math.min(1, Number(library?.settings?.volume ?? 80) / 100));
      const start = Math.max(0, Number(version?.startTime) || 0);
      const setStart = () => {
        try {
          if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Math.min(start, Math.max(0, audio.duration - 0.01));
          else audio.currentTime = start;
        } catch {}
      };
      if (audio.readyState >= 1) setStart();
      else audio.addEventListener("loadedmetadata", setStart, { once: true });
    }

    try { lyricVideoSwitchPending = false; } catch {}
    try { resetLyricsViewport?.(); } catch {}
    updateStage();
    updateMediaSession(true);
    try { updateBottomPlayer?.(); } catch {}

    if (autoplay) {
      const playPromise = audio.play();
      if (playPromise?.catch) {
        playPromise.catch(() => showMessage("端末音源を再生するには再生ボタンを押してください。"));
      }
    }
    return true;
  }

  function loadLocalOrYoutube(autoplay = false) {
    const song = safeSong();
    const version = safeVersion(song);
    const row = currentRecord();
    if (row) {
      activateLocalAudio(song, version, row, autoplay);
      return;
    }
    if (isLocalOnlyVersion(version)) {
      deactivateLocalAudio();
      pauseYoutube();
      setPlayerSurface(false, true);
      try { lyricVideoSwitchPending = false; } catch {}
      updateStage();
      try { updateBottomPlayer?.(); } catch {}
      return;
    }
    deactivateLocalAudio();
    setPlayerSurface(false);
    return originalLoadSelectedVideo?.(autoplay);
  }

  function updateMediaPosition() {
    if (!("mediaSession" in navigator) || !localMode()) return;
    try {
      const duration = Number(audio.duration);
      const position = Number(audio.currentTime);
      if (Number.isFinite(duration) && duration > 0 && Number.isFinite(position)) {
        navigator.mediaSession.setPositionState?.({
          duration,
          playbackRate: Number(audio.playbackRate) || 1,
          position: Math.min(Math.max(0, position), duration)
        });
      }
    } catch {}
  }

  function updateMediaSession(enabled = localMode()) {
    if (!("mediaSession" in navigator)) return;
    try {
      if (!enabled) {
        navigator.mediaSession.playbackState = "none";
        return;
      }
      const song = safeSong();
      const version = safeVersion(song);
      const artwork = version?.videoId && typeof thumbnailUrl === "function"
        ? [{ src: thumbnailUrl(version.videoId), sizes: "320x180", type: "image/jpeg" }]
        : [];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song?.title || "LyricTube",
        artist: song?.artist || version?.performer || "",
        album: "LyricTube",
        artwork
      });
      navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
      updateMediaPosition();
    } catch {}
  }

  function installMediaHandlers() {
    if (!("mediaSession" in navigator)) return;
    const safeHandler = (name, handler) => {
      try { navigator.mediaSession.setActionHandler(name, handler); } catch {}
    };
    safeHandler("play", () => { if (localMode()) audio.play().catch(() => {}); });
    safeHandler("pause", () => { if (localMode()) audio.pause(); });
    safeHandler("stop", () => { if (localMode()) { audio.pause(); try { audio.currentTime = 0; } catch {} } });
    safeHandler("previoustrack", () => { if (typeof playAdjacent === "function") playAdjacent(-1, true, false); });
    safeHandler("nexttrack", () => { if (typeof playAdjacent === "function") playAdjacent(1, true, false); });
    safeHandler("seekbackward", details => {
      if (!localMode()) return;
      audio.currentTime = Math.max(0, audio.currentTime - Number(details?.seekOffset || 10));
    });
    safeHandler("seekforward", details => {
      if (!localMode()) return;
      const end = Number.isFinite(audio.duration) ? audio.duration : Infinity;
      audio.currentTime = Math.min(end, audio.currentTime + Number(details?.seekOffset || 10));
    });
    safeHandler("seekto", details => {
      if (!localMode() || !Number.isFinite(Number(details?.seekTime))) return;
      if (details.fastSeek && typeof audio.fastSeek === "function") audio.fastSeek(Number(details.seekTime));
      else audio.currentTime = Number(details.seekTime);
    });
  }

  function toggleAudioPlayback() {
    if (!localMode()) return originalToggleMainPlayback?.();
    if (audio.paused) audio.play().catch(() => showMessage("再生ボタンをもう一度押してください。"));
    else audio.pause();
    setTimeout(() => { try { updateBottomPlayer?.(); } catch {} }, 40);
  }

  function enforceLocalRules() {
    if (!localMode()) return originalEnforcePlaybackRules?.();
    const version = safeVersion();
    if (!version || audio.paused) return;
    const t = Number(audio.currentTime) || 0;
    if (version.autoSkip !== false) {
      const seg = (version.skipSegments || []).find(item => item.enabled !== false && t >= Number(item.start) && t < Number(item.end) - 0.08);
      if (seg) {
        audio.currentTime = Number(seg.end) + 0.02;
        return;
      }
    }
    if (version.endTime !== null && Number(version.endTime) > Number(version.startTime || 0) && t >= Number(version.endTime) - 0.08) {
      try { handleTrackEnd?.("range"); } catch {}
    }
  }

  function restartLocal(autoplay = true) {
    if (!localMode()) return originalRestartCurrent?.(autoplay);
    const version = safeVersion();
    try { audio.currentTime = Math.max(0, Number(version?.startTime) || 0); } catch {}
    if (autoplay) audio.play().catch(() => {});
  }

  function seekLocal(sec) {
    if (!localMode()) return false;
    const duration = Number(audio.duration);
    const target = Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(duration, Number(sec) || 0))
      : Math.max(0, Number(sec) || 0);
    try { audio.currentTime = target; } catch {}
    updateMediaPosition();
    return true;
  }

  function installPlaybackPatches() {
    originalLoadSelectedVideo = loadSelectedVideo;
    originalCurrentPlayerTime = currentPlayerTime;
    originalPlayerDurationSafe = playerDurationSafe;
    originalPlayerStateSafe = playerStateSafe;
    originalGetPlayerDuration = getPlayerDuration;
    originalToggleMainPlayback = toggleMainPlayback;
    originalSeekSyncPlayer = seekSyncPlayer;
    originalToggleSyncPlayback = toggleSyncPlayback;
    originalEnforcePlaybackRules = enforcePlaybackRules;
    originalRestartCurrent = restartCurrent;
    originalTypeName = typeName;
    originalRenderBottomPlayer = renderBottomPlayer;

    loadSelectedVideo = loadLocalOrYoutube;
    currentPlayerTime = () => localMode() ? (Number(audio.currentTime) || 0) : originalCurrentPlayerTime();
    playerDurationSafe = () => localMode() ? (Number(audio.duration) || 0) : originalPlayerDurationSafe();
    playerStateSafe = () => localMode() ? (audio.paused ? 2 : 1) : originalPlayerStateSafe();
    getPlayerDuration = () => localMode() ? (Number(audio.duration) || 0) : originalGetPlayerDuration();
    toggleMainPlayback = toggleAudioPlayback;
    seekSyncPlayer = sec => { if (!seekLocal(sec)) originalSeekSyncPlayer(sec); };
    toggleSyncPlayback = () => { if (localMode()) toggleAudioPlayback(); else originalToggleSyncPlayback(); };
    enforcePlaybackRules = enforceLocalRules;
    restartCurrent = restartLocal;
    typeName = type => type === "local" ? "端末音源" : originalTypeName(type);

    renderBottomPlayer = (...args) => {
      const result = originalRenderBottomPlayer(...args);
      if (localMode() && $("bottomSeek")) $("bottomSeek").disabled = false;
      return result;
    };
  }

  function createUi() {
    const versionActions = document.querySelector(".version-card .section-line .inline-actions");
    if (versionActions && !$("localAudioSourceBtn")) {
      const button = document.createElement("button");
      button.id = "localAudioSourceBtn";
      button.className = "ghost-btn local-audio-source-btn";
      button.type = "button";
      button.textContent = "♫ 端末音源";
      button.addEventListener("click", openDialog);
      versionActions.prepend(button);
    }

    const playerCard = document.querySelector(".player-card");
    if (playerCard && !$("localAudioStage")) {
      const stage = document.createElement("div");
      stage.id = "localAudioStage";
      stage.className = "local-audio-stage hidden";
      stage.innerHTML = `
        <div class="local-audio-disc" aria-hidden="true"><span>♫</span></div>
        <div class="local-audio-stage-copy">
          <span class="local-audio-kicker">DEVICE AUDIO</span>
          <strong id="localStageTitle">端末音源</strong>
          <span id="localStageMeta">この端末に保存</span>
        </div>
        <div class="local-audio-stage-actions">
          <button id="localStagePlayBtn" class="local-stage-play" type="button">▶</button>
          <button id="localStageFileBtn" class="ghost-btn" type="button">音源を管理</button>
        </div>`;
      playerCard.appendChild(stage);
      $("localStagePlayBtn").addEventListener("click", toggleAudioPlayback);
      $("localStageFileBtn").addEventListener("click", openDialog);
    }

    if (!$("localAudioDialog")) {
      const dialog = document.createElement("dialog");
      dialog.id = "localAudioDialog";
      dialog.className = "dialog local-audio-dialog";
      dialog.innerHTML = `
        <div class="dialog-head">
          <div><p class="eyebrow">DEVICE AUDIO</p><h3>端末音源</h3></div>
          <button id="closeLocalAudioDialog" class="icon-btn subtle" type="button">×</button>
        </div>
        <div class="local-audio-dialog-body">
          <div class="local-audio-current">
            <span>選択中</span>
            <strong id="localDialogSong">曲を選択してください</strong>
            <small id="localDialogStatus">この端末に音源はありません</small>
          </div>
          <label class="local-file-picker">
            <span>MP3 / M4Aなどを選択</span>
            <input id="localAudioFile" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac">
          </label>
          <p class="muted small">音源ファイル本体はSupabaseへ送らず、この端末のIndexedDBだけに保存します。</p>
          <div class="dialog-actions local-current-actions">
            <button id="localRemoveBtn" class="danger-ghost" type="button">この端末の音源を解除</button>
            <button id="localAttachBtn" class="primary-btn" type="button">選択中の曲に登録</button>
          </div>
          <section id="localNewSongSection" class="local-new-song">
            <div class="local-new-head"><strong>新しい端末音源の曲を追加</strong><span>別端末では同じ音源ファイルを再登録してください。</span></div>
            <label>曲名<input id="localNewTitle" type="text" placeholder="曲名"></label>
            <label>アーティスト<input id="localNewArtist" type="text" placeholder="アーティスト"></label>
            <button id="localCreateSongBtn" class="primary-soft" type="button">＋ 新しい曲として追加</button>
          </section>
          <div class="local-storage-note" id="localStorageNote"></div>
        </div>`;
      document.body.appendChild(dialog);

      $("closeLocalAudioDialog").addEventListener("click", () => dialog.close());
      $("localAudioFile").addEventListener("change", onFileSelected);
      $("localAttachBtn").addEventListener("click", attachCurrent);
      $("localRemoveBtn").addEventListener("click", removeCurrent);
      $("localCreateSongBtn").addEventListener("click", createLocalSong);
      dialog.addEventListener("close", () => { $("localAudioFile").value = ""; });
    }
  }

  async function storageSummary() {
    const note = $("localStorageNote");
    if (!note) return;
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (!estimate?.quota) {
        note.textContent = "音源はこのブラウザ内に保存されます。";
        return;
      }
      const used = Number(estimate.usage || 0);
      const quota = Number(estimate.quota || 0);
      const mb = n => `${Math.round(n / 1024 / 1024)}MB`;
      note.textContent = `ブラウザ保存領域: ${mb(used)} / 約${mb(quota)} 使用中`;
    } catch {
      note.textContent = "音源はこのブラウザ内に保存されます。";
    }
  }

  function openDialog() {
    const dialog = $("localAudioDialog");
    if (!dialog) return;
    const song = safeSong();
    const version = safeVersion(song);
    const row = currentRecord();
    $("localDialogSong").textContent = song ? `${song.title} / ${versionDisplayName(version || {})}` : "曲を選択してください";
    $("localDialogStatus").textContent = row
      ? `${row.fileName} · ${Math.max(1, Math.round(row.size / 1024 / 1024))}MB`
      : "この端末に音源はありません";
    $("localAttachBtn").disabled = !song || !version;
    $("localRemoveBtn").disabled = !row;
    const guest = window.LyricTubeProfiles?.currentRole?.() === "guest";
    $("localNewSongSection").hidden = guest;
    storageSummary();
    dialog.showModal();
  }

  function onFileSelected() {
    const file = $("localAudioFile")?.files?.[0];
    if (!file) return;
    const titleInput = $("localNewTitle");
    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    }
  }

  async function attachCurrent() {
    const song = safeSong();
    const version = safeVersion(song);
    const file = $("localAudioFile")?.files?.[0];
    if (!song || !version) return showMessage("先に曲を選択してください。");
    if (!file) return showMessage("音源ファイルを選択してください。");
    const wasPlaying = localMode() ? !audio.paused : (typeof playerStateSafe === "function" && playerStateSafe() === 1);
    try {
      await saveFile(song, version, file);
      showMessage("この端末の音源として登録しました。");
      $("localAudioDialog")?.close();
      loadLocalOrYoutube(wasPlaying);
      updateStage();
    } catch (error) {
      showMessage(error?.message || "音源を保存できませんでした。");
    }
  }

  async function removeCurrent() {
    const song = safeSong();
    const version = safeVersion(song);
    if (!song || !version || !hasRecord(song, version)) return;
    if (!confirm("この端末に保存した音源だけを解除します。曲・歌詞・YouTube情報は消えません。")) return;
    try {
      await removeFile(song, version);
      showMessage("この端末の音源を解除しました。");
      $("localAudioDialog")?.close();
      loadLocalOrYoutube(false);
      updateStage();
    } catch {
      showMessage("音源を解除できませんでした。");
    }
  }

  async function createLocalSong() {
    if (window.LyricTubeProfiles?.currentRole?.() === "guest") return;
    const file = $("localAudioFile")?.files?.[0];
    const title = $("localNewTitle")?.value.trim();
    const artist = $("localNewArtist")?.value.trim();
    if (!file) return showMessage("音源ファイルを選択してください。");
    if (!title) return showMessage("曲名を入力してください。");

    try {
      const version = makeVersion({ type: "local", performer: artist, label: "端末音源" });
      const song = {
        id: uid(),
        title,
        artist,
        plainLyrics: "",
        syncedLyrics: "",
        lyricsSource: "",
        lrclibId: "",
        favorite: false,
        playCount: 0,
        lastPlayedAt: null,
        versions: [version],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      await saveFile(song, version, file);
      library.songs.push(song);
      persistLibrary();
      $("localAudioDialog")?.close();
      selectSong(song.id, false);
      showMessage("端末音源の曲を追加しました。");
    } catch (error) {
      showMessage(error?.message || "曲を追加できませんでした。");
    }
  }

  function setLocalRange(kind) {
    if (!localMode()) return false;
    const version = safeVersion();
    if (!version) return false;
    const t = Number(audio.currentTime) || 0;
    if (kind === "start") {
      version.startTime = Math.max(0, t);
      if (version.endTime !== null && Number(version.endTime) <= version.startTime) version.endTime = null;
      showMessage(`曲開始を ${formatTime(version.startTime)} に設定しました。`);
    } else {
      if (t <= Number(version.startTime || 0)) {
        showMessage("曲開始より後ろの位置で押してください。");
        return true;
      }
      version.endTime = t;
      showMessage(`曲終了を ${formatTime(version.endTime)} に設定しました。`);
    }
    version.updatedAt = nowIso();
    persistLibrary();
    renderVersionControls(version);
    return true;
  }

  function installDomHandlers() {
    const interceptLocalButton = (id, handler) => {
      $(id)?.addEventListener("click", event => {
        if (!localMode()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        handler();
      }, true);
    };

    interceptLocalButton("bottomPlayBtn", toggleAudioPlayback);
    interceptLocalButton("syncPlayPauseBtn", toggleAudioPlayback);
    interceptLocalButton("setStartBtn", () => setLocalRange("start"));
    interceptLocalButton("setEndBtn", () => setLocalRange("end"));
    $("bottomSeek")?.addEventListener("change", () => {
      if (localMode()) seekLocal(Number($("bottomSeek").value) || 0);
    });
    $("bottomSeek")?.addEventListener("pointerup", () => {
      if (localMode()) seekLocal(Number($("bottomSeek").value) || 0);
    });
    $("bottomVolume")?.addEventListener("input", () => {
      if (localMode()) audio.volume = Math.max(0, Math.min(1, Number($("bottomVolume").value || 0) / 100));
    });

    document.addEventListener("click", event => {
      if (!localMode()) return;
      const line = event.target?.closest?.(".lyric-line");
      if (line && $("lyricsView")?.contains(line)) {
        const index = Number(line.dataset.index);
        const version = safeVersion();
        const timed = typeof parseLrc === "function" && typeof effectiveLrc === "function" ? parseLrc(effectiveLrc()) : [];
        if (Number.isInteger(index) && timed[index]) {
          event.preventDefault();
          event.stopImmediatePropagation();
          seekLocal(Math.max(0, Number(version?.startTime || 0) + Number(timed[index].time || 0) + Number(version?.lyricsOffset || 0)));
          audio.play().catch(() => {});
        }
      }
    }, true);

    const interceptSkip = (id, handler) => {
      $(id)?.addEventListener("click", event => {
        if (!localMode()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        handler();
      }, true);
    };
    interceptSkip("markSkipStartBtn", () => {
      pendingSkipStart = Number(audio.currentTime) || 0;
      $("pendingSkipLabel").textContent = `開始 ${formatTime(pendingSkipStart)} を記録中 → 会話が終わった位置で「ここまでをスキップ」`;
      $("markSkipEndBtn").disabled = false;
    });
    interceptSkip("markSkipEndBtn", () => {
      const version = safeVersion();
      if (!version || pendingSkipStart === null) return;
      const end = Number(audio.currentTime) || 0;
      if (end <= pendingSkipStart + 0.1) return showMessage("開始位置より後ろで押してください。");
      version.skipSegments = Array.isArray(version.skipSegments) ? version.skipSegments : [];
      version.skipSegments.push({ id: uid(), start: pendingSkipStart, end, label: `スキップ ${version.skipSegments.length + 1}`, enabled: true });
      pendingSkipStart = null;
      $("pendingSkipLabel").textContent = "";
      $("markSkipEndBtn").disabled = true;
      persistLibrary();
      renderVersionControls(version);
      showMessage("スキップ区間を追加しました。");
    });

    window.addEventListener("keydown", event => {
      if (!localMode()) return;
      if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault(); event.stopImmediatePropagation(); toggleAudioPlayback();
      } else if (event.key === "ArrowRight" && !event.ctrlKey) {
        event.preventDefault(); event.stopImmediatePropagation(); seekLocal(audio.currentTime + 5);
      } else if (event.key === "ArrowLeft" && !event.ctrlKey) {
        event.preventDefault(); event.stopImmediatePropagation(); seekLocal(Math.max(0, audio.currentTime - 5));
      }
    }, true);
  }

  function installAudioEvents() {
    audio.addEventListener("play", () => {
      pauseYoutube();
      try { markPlayed?.(); } catch {}
      updateStage();
      updateMediaSession(true);
      try { updateBottomPlayer?.(); } catch {}
    });
    audio.addEventListener("pause", () => {
      updateStage();
      updateMediaSession(true);
      try { updateBottomPlayer?.(); } catch {}
    });
    audio.addEventListener("ended", () => {
      updateStage();
      updateMediaSession(true);
      try { handleTrackEnd?.("local"); } catch {}
    });
    audio.addEventListener("timeupdate", updateMediaPosition);
    audio.addEventListener("durationchange", () => {
      updateMediaPosition();
      try { updateBottomPlayer?.(); } catch {}
    });
    audio.addEventListener("error", () => {
      if (localMode()) showMessage("この端末の音源を再生できませんでした。別のファイルを登録してください。");
    });
  }

  async function init() {
    if (ready) return;
    ready = true;
    createUi();
    installPlaybackPatches();
    installDomHandlers();
    installAudioEvents();
    installMediaHandlers();

    try {
      db = await openDatabase();
      await loadScopeRecords();
      try { renderAll?.(); } catch {}
      updateStage();
      const song = safeSong();
      const version = safeVersion(song);
      if (hasRecord(song, version) || isLocalOnlyVersion(version)) loadLocalOrYoutube(false);
    } catch (error) {
      console.warn("[LyricTube] local audio unavailable", error);
      showMessage("このブラウザでは端末音源の保存を利用できません。");
      const button = $("localAudioSourceBtn");
      if (button) button.disabled = true;
    }

    document.documentElement.dataset.localAudio = "v34.1";
  }

  const timer = setInterval(() => {
    if (typeof getSong === "function" && typeof loadSelectedVideo === "function" && typeof updateBottomPlayer === "function" && document.querySelector(".player-card")) {
      clearInterval(timer);
      init();
    }
  }, 50);
  setTimeout(() => clearInterval(timer), 30000);
})();
