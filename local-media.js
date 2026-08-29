(() => {
  "use strict";

  const DB_NAME = "lyrictube.localMedia.v1";
  const DB_VERSION = 1;
  const STORE_NAME = "tracks";
  const MAX_FILE_BYTES = 1024 * 1024 * 1024;
  const ACCEPT = "audio/*,video/mp4,video/webm,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.mp4,.webm,.m4v";
  const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;
  const VIDEO_EXT = /\.(mp4|webm|m4v)$/i;

  const $ = id => document.getElementById(id);
  const records = new Map();
  let db = null;
  let activeKey = "";
  let activeUrl = "";
  let activeElement = null;
  let songSourceMode = "youtube";
  let versionSourceMode = "youtube";
  let patched = false;

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
  let originalRenderBottomPlayer = null;
  let originalOpenSongDialog = null;
  let originalOpenVersionDialog = null;

  const audio = document.createElement("audio");
  audio.id = "localMediaAudio";
  audio.preload = "metadata";
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  document.body.appendChild(audio);

  const video = document.createElement("video");
  video.id = "localMediaVideo";
  video.preload = "metadata";
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.controls = true;
  video.hidden = true;

  function toast(message) {
    try {
      if (typeof showToast === "function") showToast(message);
      else console.info(`[LyricTube LocalMedia] ${message}`);
    } catch {
      console.info(`[LyricTube LocalMedia] ${message}`);
    }
  }

  function accountScope() {
    const p = window.LyricTubeProfiles;
    const role = p?.currentRole?.() || "local";
    if (role === "cloud") {
      const session = p?.readCloudSession?.();
      return `cloud:${String(session?.account?.id || session?.account?.username || "unknown")}`;
    }
    return role;
  }

  function keyFor(song, version) {
    if (!song?.id || !version?.id) return "";
    return `${accountScope()}:${song.id}:${version.id}`;
  }

  function currentSong() {
    try { return typeof getSong === "function" ? getSong() : null; } catch { return null; }
  }

  function currentVersion(song = currentSong()) {
    try { return typeof getVersion === "function" ? getVersion(song) : null; } catch { return null; }
  }

  function isLocalMediaVersion(version = currentVersion()) {
    return version?.source === "localmedia";
  }

  function currentRow(song = currentSong(), version = currentVersion(song)) {
    const key = keyFor(song, version);
    return key ? records.get(key) || null : null;
  }

  function mediaKind(file) {
    const type = String(file?.type || "").toLowerCase();
    const name = String(file?.name || "");
    if (type.startsWith("video/") || VIDEO_EXT.test(name)) return "video";
    if (type.startsWith("audio/") || AUDIO_EXT.test(name)) return "audio";
    return "";
  }

  function validateFile(file) {
    if (!(file instanceof File)) throw new Error("MP3 / MP4などのファイルを選択してください。");
    const kind = mediaKind(file);
    if (!kind) throw new Error("対応形式はMP3・M4A・AAC・WAV・OGG・OPUS・FLAC・MP4・WebMです。");
    if (file.size <= 0) throw new Error("空のファイルは登録できません。");
    if (file.size > MAX_FILE_BYTES) throw new Error("1ファイル1GBまでにしてください。ブラウザの空き容量にも依存します。");
    return kind;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDBを利用できません。"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const next = request.result;
        if (!next.objectStoreNames.contains(STORE_NAME)) {
          const store = next.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("scope", "scope", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDBを開けませんでした。"));
    });
  }

  function tx(mode, callback) {
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error("端末ファイル保存の準備ができていません。"));
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try { result = callback(store); } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("端末ファイルの保存に失敗しました。"));
      transaction.onabort = () => reject(transaction.error || new Error("端末ファイルの保存が中断されました。"));
    });
  }

  async function loadRecords() {
    const scope = accountScope();
    const rows = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).index("scope").getAll(scope);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("端末ファイルを読み込めませんでした。"));
    });
    records.clear();
    for (const row of rows) if (row?.key && row?.blob instanceof Blob) records.set(row.key, row);
  }

  async function saveRecord(song, version, file) {
    const kind = validateFile(file);
    const key = keyFor(song, version);
    const row = {
      key,
      scope: accountScope(),
      songId: song.id,
      versionId: version.id,
      kind,
      fileName: file.name || (kind === "video" ? "video.mp4" : "audio.mp3"),
      mime: file.type || (kind === "video" ? "video/mp4" : "audio/mpeg"),
      size: Number(file.size) || 0,
      updatedAt: new Date().toISOString(),
      blob: file.slice(0, file.size, file.type || undefined)
    };
    await tx("readwrite", store => store.put(row));
    records.set(key, row);
    try { await navigator.storage?.persist?.(); } catch {}
    return row;
  }

  async function deleteRecord(song, version) {
    const key = keyFor(song, version);
    if (!key || !db) return;
    await tx("readwrite", store => store.delete(key));
    records.delete(key);
  }

  function releaseUrl() {
    if (activeUrl) {
      try { URL.revokeObjectURL(activeUrl); } catch {}
      activeUrl = "";
    }
  }

  function stopLocalMedia() {
    for (const el of [audio, video]) {
      try { el.pause(); } catch {}
      el.removeAttribute("src");
      try { el.load(); } catch {}
    }
    activeElement = null;
    activeKey = "";
    releaseUrl();
    video.hidden = true;
    $("localMediaStage")?.classList.add("hidden");
  }

  function hideBasePlayer() {
    const yt = $("player");
    const placeholder = $("playerPlaceholder");
    const legacyStage = $("localAudioStage");
    if (yt) yt.style.display = "none";
    placeholder?.classList.add("hidden");
    legacyStage?.classList.add("hidden");
  }

  function showLocalStage(missing = false, row = null) {
    const stage = $("localMediaStage");
    if (!stage) return;
    stage.classList.remove("hidden");
    stage.classList.toggle("missing", missing);
    $("localMediaStageTitle").textContent = missing ? "この端末にファイルがありません" : (currentSong()?.title || "端末ファイル");
    $("localMediaStageMeta").textContent = missing
      ? "別端末ではMP3 / MP4を再登録してください"
      : `${row?.fileName || "端末ファイル"} · この端末だけに保存`;
    const play = $("localMediaStagePlay");
    if (play) {
      play.disabled = missing || !activeElement;
      play.textContent = activeElement && !activeElement.paused ? "❚❚" : "▶";
    }
    const relink = $("localMediaRelinkBtn");
    if (relink) relink.textContent = missing ? "ファイルを再登録" : "ファイルを変更";
  }

  function refreshLocalSurface() {
    const row = currentRow();
    if (!row) {
      video.hidden = true;
      showLocalStage(true, null);
      return;
    }
    if (row.kind === "video") {
      $("localMediaStage")?.classList.add("hidden");
      video.hidden = false;
    } else {
      video.hidden = true;
      showLocalStage(false, row);
    }
  }

  function localMode() {
    const song = currentSong();
    const version = currentVersion(song);
    return Boolean(isLocalMediaVersion(version) && activeKey && activeKey === keyFor(song, version) && activeElement?.src);
  }

  function currentMedia() {
    return localMode() ? activeElement : null;
  }

  async function activateLocalMedia(autoplay = false) {
    const song = currentSong();
    const version = currentVersion(song);
    if (!song || !isLocalMediaVersion(version)) return false;

    const row = currentRow(song, version);
    if (!row) {
      stopLocalMedia();
      hideBasePlayer();
      refreshLocalSurface();
      try { updateBottomPlayer?.(); } catch {}
      updateSourceButton();
      return true;
    }

    const key = keyFor(song, version);
    if (activeKey !== key || !activeElement?.src) {
      stopLocalMedia();
      activeUrl = URL.createObjectURL(row.blob);
      activeElement = row.kind === "video" ? video : audio;
      activeElement.src = activeUrl;
      activeElement.volume = Math.max(0, Math.min(1, Number(library?.settings?.volume ?? 80) / 100));
      activeKey = key;
      const start = Math.max(0, Number(version.startTime) || 0);
      const seekStart = () => {
        try { activeElement.currentTime = start; } catch {}
      };
      if (activeElement.readyState >= 1) seekStart();
      else activeElement.addEventListener("loadedmetadata", seekStart, { once: true });
    }

    hideBasePlayer();
    refreshLocalSurface();
    try { resetLyricsViewport?.(); } catch {}
    try { updateBottomPlayer?.(); } catch {}
    updateSourceButton();

    if (autoplay) activeElement.play().catch(() => toast("再生ボタンを押して端末ファイルを再生してください。"));
    return true;
  }

  function applyPlaybackRules() {
    const el = currentMedia();
    const version = currentVersion();
    if (!el || !version || el.paused) return;
    const t = Number(el.currentTime) || 0;
    if (version.autoSkip !== false) {
      const seg = (version.skipSegments || []).find(item => item.enabled !== false && t >= Number(item.start) && t < Number(item.end) - 0.08);
      if (seg) {
        try { el.currentTime = Number(seg.end) + 0.02; } catch {}
        return;
      }
    }
    if (version.endTime !== null && Number(version.endTime) > Number(version.startTime || 0) && t >= Number(version.endTime) - 0.08) {
      try { handleTrackEnd?.("range"); } catch {}
    }
  }

  function togglePlayback() {
    const el = currentMedia();
    if (!isLocalMediaVersion(currentVersion())) return originalToggleMainPlayback?.();
    if (!el) return toast("この端末にMP3 / MP4を登録してください。");
    if (el.paused) el.play().catch(() => toast("再生できませんでした。ファイル形式を確認してください。"));
    else el.pause();
  }

  function restartLocal(autoplay = true) {
    const el = currentMedia();
    const version = currentVersion();
    if (!isLocalMediaVersion(version)) return originalRestartCurrent?.(autoplay);
    if (!el) return;
    try { el.currentTime = Math.max(0, Number(version.startTime) || 0); } catch {}
    if (autoplay) el.play().catch(() => {});
  }

  function seekLocal(target) {
    const el = currentMedia();
    if (!el) return false;
    try { el.currentTime = Math.max(0, Number(target) || 0); } catch {}
    return true;
  }

  function patchPlayback() {
    if (patched) return;
    patched = true;
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
    originalRenderBottomPlayer = renderBottomPlayer;
    originalOpenSongDialog = openSongDialog;
    originalOpenVersionDialog = openVersionDialog;

    loadSelectedVideo = function(autoplay = false) {
      const version = currentVersion();
      if (!isLocalMediaVersion(version)) {
        stopLocalMedia();
        const result = originalLoadSelectedVideo?.(autoplay);
        updateSourceButton();
        return result;
      }
      originalLoadSelectedVideo?.(false);
      return activateLocalMedia(autoplay);
    };
    currentPlayerTime = () => currentMedia() ? (Number(currentMedia().currentTime) || 0) : originalCurrentPlayerTime();
    playerDurationSafe = () => currentMedia() ? (Number(currentMedia().duration) || 0) : originalPlayerDurationSafe();
    playerStateSafe = () => currentMedia() ? (currentMedia().paused ? 2 : 1) : originalPlayerStateSafe();
    getPlayerDuration = () => currentMedia() ? (Number(currentMedia().duration) || 0) : originalGetPlayerDuration();
    toggleMainPlayback = togglePlayback;
    seekSyncPlayer = target => isLocalMediaVersion(currentVersion()) ? seekLocal(target) : originalSeekSyncPlayer(target);
    toggleSyncPlayback = () => isLocalMediaVersion(currentVersion()) ? togglePlayback() : originalToggleSyncPlayback();
    enforcePlaybackRules = () => isLocalMediaVersion(currentVersion()) ? applyPlaybackRules() : originalEnforcePlaybackRules();
    restartCurrent = restartLocal;
    renderBottomPlayer = function() {
      const result = originalRenderBottomPlayer();
      const version = currentVersion();
      if (isLocalMediaVersion(version)) {
        const row = currentRow();
        if ($("bottomSeek")) $("bottomSeek").disabled = !row;
        if ($("bottomArtist") && row) {
          const artist = currentSong()?.artist || "";
          $("bottomArtist").textContent = `${artist}${artist ? " · " : ""}${row.kind === "video" ? "端末動画" : "端末音源"}`;
        }
      }
      return result;
    };

    openSongDialog = function(song = null) {
      const result = originalOpenSongDialog(song);
      if (!song) switchSongSource("youtube", true);
      return result;
    };
    openVersionDialog = function(version = null) {
      const result = originalOpenVersionDialog(version);
      switchVersionSource(version?.source === "localmedia" ? "local" : "youtube", true);
      if (version?.source === "localmedia") {
        const row = records.get(keyFor(currentSong(), version));
        const status = $("versionLocalMediaStatus");
        if (status) status.textContent = row ? `登録済み: ${row.fileName}` : "この端末にはファイルがありません。必要なら再登録してください。";
      }
      return result;
    };
  }

  function styleUi() {
    if ($("localMediaStyle")) return;
    const style = document.createElement("style");
    style.id = "localMediaStyle";
    style.textContent = `
      .source-switch{display:flex;gap:8px;padding:8px;border:1px solid var(--border);border-radius:12px;background:var(--panel2);margin:10px 0 14px}.source-switch button{flex:1;border:0;border-radius:9px;padding:10px 12px;background:transparent;color:var(--muted);font-weight:800;cursor:pointer}.source-switch button.active{background:var(--accentSoft);color:var(--text);box-shadow:inset 0 0 0 1px hsl(var(--accent-h,258) 70% 60% / .28)}
      .local-media-fields{display:grid;gap:8px;margin:0 0 12px}.local-media-file-box{display:grid;gap:8px;padding:14px;border:1px dashed var(--border);border-radius:12px;background:var(--panel2)}.local-media-file-box strong{font-size:12px}.local-media-file-box small{color:var(--muted);line-height:1.45}.local-media-file-box input{width:100%}
      #localMediaVideo{position:absolute;inset:0;width:100%;height:100%;z-index:4;background:#000;object-fit:contain}
      #localMediaStage{position:absolute;inset:0;z-index:4;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 22% 20%,hsl(var(--accent-h,258) 75% 62% / .18),transparent 40%),linear-gradient(145deg,var(--panel2),var(--panel));text-align:center}#localMediaStage.hidden{display:none!important}
      .local-media-card{display:grid;gap:12px;justify-items:center;max-width:520px}.local-media-card .icon{width:92px;aspect-ratio:1;border-radius:24px;display:grid;place-items:center;font-size:34px;background:var(--accentSoft);border:1px solid var(--border)}.local-media-card strong{font-size:22px}.local-media-card span{font-size:12px;color:var(--muted);overflow-wrap:anywhere}.local-media-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}.local-media-play{width:54px;height:54px;border:0;border-radius:50%;background:var(--accent);color:#fff;font-size:19px;cursor:pointer}.local-media-play:disabled{opacity:.4}
      #localMediaAudio{position:fixed;width:1px;height:1px;opacity:.001;pointer-events:none;left:-10px;bottom:-10px}
      .local-media-source-btn{display:none}.local-media-source-btn.visible{display:inline-flex}
      @media(max-width:700px){.source-switch{display:grid;grid-template-columns:1fr 1fr}.local-media-card strong{font-size:18px}#localMediaStage{padding:18px}}
    `;
    document.head.appendChild(style);
  }

  function createPlayerUi() {
    const card = document.querySelector(".player-card");
    if (!card) return;
    if (!video.parentElement) card.appendChild(video);
    if (!$("localMediaStage")) {
      const stage = document.createElement("div");
      stage.id = "localMediaStage";
      stage.className = "hidden";
      stage.innerHTML = `
        <div class="local-media-card">
          <div class="icon">▣</div>
          <strong id="localMediaStageTitle">端末ファイル</strong>
          <span id="localMediaStageMeta"></span>
          <div class="local-media-actions">
            <button id="localMediaStagePlay" class="local-media-play" type="button">▶</button>
            <button id="localMediaRelinkBtn" class="ghost-btn" type="button">ファイルを変更</button>
          </div>
        </div>`;
      card.appendChild(stage);
      $("localMediaStagePlay").addEventListener("click", togglePlayback);
      $("localMediaRelinkBtn").addEventListener("click", relinkCurrentFile);
    }

    const actions = document.querySelector(".version-card .section-line .inline-actions");
    if (actions && !$("localMediaSourceBtn")) {
      const button = document.createElement("button");
      button.id = "localMediaSourceBtn";
      button.className = "ghost-btn local-media-source-btn";
      button.type = "button";
      button.textContent = "▣ 端末ファイル";
      button.addEventListener("click", relinkCurrentFile);
      actions.prepend(button);
    }
  }

  function updateSourceButton() {
    const button = $("localMediaSourceBtn");
    const legacy = $("localAudioSourceBtn");
    if (!button) return;
    const version = currentVersion();
    const local = isLocalMediaVersion(version);
    button.classList.toggle("visible", local);
    if (legacy) legacy.style.display = local ? "none" : "";
    if (local) {
      const row = currentRow();
      button.textContent = row ? `▣ ${row.kind === "video" ? "端末動画" : "端末音源"} ✓` : "▣ ファイルを再登録";
    }
  }

  function createSongSourceUi() {
    const section = $("initialVideoSection");
    const url = $("youtubeUrl");
    if (!section || !url || $("songSourceSwitch")) return;
    const titleStrong = section.querySelector(".form-section-title strong");
    if (titleStrong) titleStrong.textContent = "最初の再生ソース";
    const titleNote = section.querySelector(".form-section-title span");
    if (titleNote) titleNote.textContent = "YouTubeまたはMP3 / MP4を選べます";

    const sw = document.createElement("div");
    sw.id = "songSourceSwitch";
    sw.className = "source-switch";
    sw.innerHTML = '<button type="button" data-source="youtube" class="active">YouTube</button><button type="button" data-source="local">端末ファイル（MP3 / MP4）</button>';
    section.querySelector(".form-section-title")?.insertAdjacentElement("afterend", sw);

    const fields = document.createElement("div");
    fields.id = "songLocalMediaFields";
    fields.className = "local-media-fields hidden";
    fields.innerHTML = `<label class="local-media-file-box"><strong>端末ファイル</strong><input id="songLocalMediaFile" type="file" accept="${ACCEPT}"><small>MP3・M4A・WAV・FLACなどの音声、MP4・WebM動画に対応。ファイル本体はこの端末のブラウザにだけ保存します。</small></label>`;
    const youtubeLabel = url.closest("label");
    youtubeLabel?.insertAdjacentElement("afterend", fields);

    sw.addEventListener("click", event => {
      const button = event.target.closest("button[data-source]");
      if (button) switchSongSource(button.dataset.source);
    });
    $("songLocalMediaFile")?.addEventListener("change", autoFillFromFile);
  }

  function switchSongSource(mode, reset = false) {
    songSourceMode = mode === "local" ? "local" : "youtube";
    const sw = $("songSourceSwitch");
    sw?.querySelectorAll("button[data-source]").forEach(btn => btn.classList.toggle("active", btn.dataset.source === songSourceMode));
    const url = $("youtubeUrl");
    const youtubeLabel = url?.closest("label");
    if (youtubeLabel) youtubeLabel.hidden = songSourceMode === "local";
    $("songLocalMediaFields")?.classList.toggle("hidden", songSourceMode !== "local");
    if (url) url.required = songSourceMode === "youtube" && !$("editingSongId")?.value;
    if (reset && $("songLocalMediaFile")) $("songLocalMediaFile").value = "";
  }

  function createVersionSourceUi() {
    const form = $("versionForm");
    const url = $("versionYoutubeUrl");
    if (!form || !url || $("versionSourceSwitch")) return;
    const sw = document.createElement("div");
    sw.id = "versionSourceSwitch";
    sw.className = "source-switch";
    sw.innerHTML = '<button type="button" data-source="youtube" class="active">YouTube</button><button type="button" data-source="local">端末ファイル（MP3 / MP4）</button>';
    url.closest("label")?.insertAdjacentElement("beforebegin", sw);

    const fields = document.createElement("div");
    fields.id = "versionLocalMediaFields";
    fields.className = "local-media-fields hidden";
    fields.innerHTML = `<label class="local-media-file-box"><strong>端末ファイル</strong><input id="versionLocalMediaFile" type="file" accept="${ACCEPT}"><small id="versionLocalMediaStatus">MP3 / MP4を選択してください。編集時は未選択なら現在のファイルを維持します。</small></label>`;
    url.closest("label")?.insertAdjacentElement("afterend", fields);
    sw.addEventListener("click", event => {
      const button = event.target.closest("button[data-source]");
      if (button) switchVersionSource(button.dataset.source);
    });
  }

  function switchVersionSource(mode, reset = false) {
    versionSourceMode = mode === "local" ? "local" : "youtube";
    const sw = $("versionSourceSwitch");
    sw?.querySelectorAll("button[data-source]").forEach(btn => btn.classList.toggle("active", btn.dataset.source === versionSourceMode));
    const url = $("versionYoutubeUrl");
    const youtubeLabel = url?.closest("label");
    if (youtubeLabel) youtubeLabel.hidden = versionSourceMode === "local";
    $("versionLocalMediaFields")?.classList.toggle("hidden", versionSourceMode !== "local");
    if (url) url.required = versionSourceMode === "youtube";
    if (reset && $("versionLocalMediaFile")) $("versionLocalMediaFile").value = "";
  }

  function autoFillFromFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const base = file.name.replace(/\.[^.]+$/, "").trim();
    const title = $("trackTitle");
    const artist = $("artistName");
    const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (m) {
      if (artist && !artist.value.trim()) artist.value = m[1].trim();
      if (title && !title.value.trim()) title.value = m[2].trim();
    } else if (title && !title.value.trim()) {
      title.value = base;
    }
  }

  async function saveNewLocalSong(event) {
    if (songSourceMode !== "local" || $("editingSongId")?.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const file = $("songLocalMediaFile")?.files?.[0];
    const title = $("trackTitle")?.value.trim() || "";
    if (!file) return toast("MP3 / MP4などの端末ファイルを選択してください。");
    if (!title) return toast("原曲の曲名を入力してください。");

    try {
      const kind = validateFile(file);
      const raw = $("lyricsInput")?.value.trim() || "";
      const rawHasLrc = raw && typeof hasLrc === "function" ? hasLrc(raw) : false;
      const plain = raw ? (rawHasLrc && typeof plainFromLrc === "function" ? plainFromLrc(raw) : raw) : "";
      const version = makeVersion({
        type: $("initialVersionType")?.value || "original",
        performer: $("initialPerformer")?.value.trim() || "",
        label: kind === "video" ? "端末動画" : "端末音源"
      });
      version.source = "localmedia";
      version.localMediaKind = kind;
      version.localFileName = file.name;

      const song = {
        id: uid(),
        title,
        artist: $("artistName")?.value.trim() || "",
        plainLyrics: plain,
        syncedLyrics: rawHasLrc ? raw : "",
        lyricsSource: $("lyricsInput")?.dataset.lyricsSource || (raw ? "手動入力" : ""),
        lrclibId: $("lyricsInput")?.dataset.lrclibId || "",
        lyricsProvider: $("lyricsInput")?.dataset.lyricsProvider || "",
        lyricsProviderId: $("lyricsInput")?.dataset.lyricsProviderId || "",
        favorite: false,
        playCount: 0,
        lastPlayedAt: null,
        versions: [version],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      await saveRecord(song, version, file);
      library.songs.unshift(song);
      persistLibrary();
      selectedSongId = song.id;
      selectedVersionId = version.id;
      $("songDialog")?.close();
      renderAll();
      loadSelectedVideo(false);
      toast(kind === "video" ? "MP4 / WebM動画を曲として追加しました。" : "MP3などの端末音源を曲として追加しました。");
    } catch (error) {
      console.error(error);
      toast(error?.message || "端末ファイルを追加できませんでした。");
    }
  }

  async function saveLocalVersion(event) {
    if (versionSourceMode !== "local") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const song = currentSong();
    if (!song) return;

    const editingId = $("editingVersionId")?.value || "";
    const old = song.versions.find(v => v.id === editingId) || null;
    const file = $("versionLocalMediaFile")?.files?.[0] || null;
    const existingRow = old ? records.get(keyFor(song, old)) : null;
    if (!file && !existingRow) return toast("MP3 / MP4などの端末ファイルを選択してください。");

    try {
      let version = old;
      let row = existingRow;
      if (!version) {
        version = makeVersion({
          type: $("versionType")?.value || "original",
          performer: $("versionPerformer")?.value.trim() || "",
          label: $("versionLabel")?.value.trim() || ""
        });
        version.source = "localmedia";
        song.versions.push(version);
      } else {
        const changedSource = version.source !== "localmedia";
        version.type = $("versionType")?.value || "original";
        version.performer = $("versionPerformer")?.value.trim() || "";
        version.label = $("versionLabel")?.value.trim() || version.label || "";
        version.source = "localmedia";
        version.youtubeUrl = "";
        version.videoId = "";
        version.rawYoutubeTitle = "";
        version.rawYoutubeAuthor = "";
        if (changedSource) {
          version.startTime = 0;
          version.endTime = null;
          version.skipSegments = [];
          version.lyricsOffset = 0;
          version.customSyncedLyrics = "";
        }
      }

      if (file) row = await saveRecord(song, version, file);
      version.localMediaKind = row?.kind || version.localMediaKind || "audio";
      version.localFileName = row?.fileName || version.localFileName || "";
      version.updatedAt = nowIso();
      song.updatedAt = nowIso();
      selectedVersionId = version.id;
      persistLibrary();
      $("versionDialog")?.close();
      renderAll();
      loadSelectedVideo(false);
      toast(old ? "端末ファイルのバージョンを更新しました。" : "端末ファイルのバージョンを追加しました。");
    } catch (error) {
      console.error(error);
      toast(error?.message || "端末ファイルを保存できませんでした。");
    }
  }

  function finishYoutubeConversionAfterSubmit() {
    if (versionSourceMode !== "youtube") return;
    const song = currentSong();
    const editingId = $("editingVersionId")?.value || "";
    const before = song?.versions?.find(v => v.id === editingId) || null;
    if (!song || !before || before.source !== "localmedia") return;

    setTimeout(async () => {
      const converted = song.versions.find(v => v.id === editingId) || null;
      if (!converted?.videoId) return;
      try { await deleteRecord(song, converted); } catch {}
      delete converted.source;
      delete converted.localMediaKind;
      delete converted.localFileName;
      converted.updatedAt = nowIso();
      song.updatedAt = nowIso();
      persistLibrary();
      if (selectedVersionId === converted.id) loadSelectedVideo(false);
      updateSourceButton();
    }, 0);
  }

  async function relinkCurrentFile() {
    const song = currentSong();
    const version = currentVersion(song);
    if (!song || !isLocalMediaVersion(version)) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const row = await saveRecord(song, version, file);
        version.localMediaKind = row.kind;
        version.localFileName = row.fileName;
        version.updatedAt = nowIso();
        song.updatedAt = nowIso();
        persistLibrary();
        await activateLocalMedia(false);
        renderAll();
        updateSourceButton();
        toast("この端末のファイルを登録しました。");
      } catch (error) {
        toast(error?.message || "ファイルを登録できませんでした。");
      }
    }, { once: true });
    input.click();
  }

  function installHandlers() {
    $("songForm")?.addEventListener("submit", saveNewLocalSong, true);
    $("versionForm")?.addEventListener("submit", saveLocalVersion, true);
    $("versionForm")?.addEventListener("submit", finishYoutubeConversionAfterSubmit);

    $("bottomSeek")?.addEventListener("input", () => {
      if (localMode()) seekLocal(Number($("bottomSeek").value) || 0);
    });
    $("bottomSeek")?.addEventListener("pointerup", () => {
      if (localMode()) seekLocal(Number($("bottomSeek").value) || 0);
    });
    $("bottomVolume")?.addEventListener("input", () => {
      const el = currentMedia();
      if (el) el.volume = Math.max(0, Math.min(1, Number($("bottomVolume").value || 0) / 100));
    });

    document.addEventListener("click", event => {
      if (!localMode()) return;
      const line = event.target?.closest?.(".lyric-line");
      if (!line) return;
      const time = Number(line.dataset.time);
      if (Number.isFinite(time)) seekLocal(time + Number(currentVersion()?.lyricsOffset || 0));
    });

    for (const el of [audio, video]) {
      el.addEventListener("play", () => {
        try { markPlayed?.(); } catch {}
        refreshLocalSurface();
        try { updateBottomPlayer?.(); } catch {}
      });
      el.addEventListener("pause", () => {
        refreshLocalSurface();
        try { updateBottomPlayer?.(); } catch {}
      });
      el.addEventListener("timeupdate", () => {
        applyPlaybackRules();
        try { updateBottomPlayer?.(); } catch {}
      });
      el.addEventListener("ended", () => {
        try { handleTrackEnd?.("media-ended"); } catch {}
      });
      el.addEventListener("error", () => {
        if (isLocalMediaVersion(currentVersion())) toast("このファイルを再生できませんでした。MP4ならH.264/AAC、WebMならVP8/VP9系を試してください。");
      });
    }

    document.addEventListener("click", event => {
      if (event.target?.closest?.("#deleteVersionBtn,#deleteSongBtn")) setTimeout(cleanupOrphans, 500);
    }, true);
  }

  async function cleanupOrphans() {
    if (!db || typeof library === "undefined") return;
    const valid = new Set();
    for (const song of library.songs || []) {
      for (const version of song.versions || []) {
        if (isLocalMediaVersion(version)) valid.add(keyFor(song, version));
      }
    }
    for (const [key] of [...records]) {
      if (!valid.has(key)) {
        try { await tx("readwrite", store => store.delete(key)); } catch {}
        records.delete(key);
        if (activeKey === key) stopLocalMedia();
      }
    }
  }

  async function init() {
    styleUi();
    createPlayerUi();
    createSongSourceUi();
    createVersionSourceUi();
    patchPlayback();
    installHandlers();
    try {
      db = await openDb();
      await loadRecords();
      await cleanupOrphans();
    } catch (error) {
      console.warn("[LyricTube LocalMedia] IndexedDB unavailable", error);
      toast("端末ファイル保存を初期化できませんでした。ブラウザのサイトデータ設定を確認してください。");
    }
    updateSourceButton();
    document.documentElement.dataset.localMedia = "v36";
    console.info("[LyricTube] local media enabled: MP3 + MP4/WebM");
  }

  const timer = setInterval(() => {
    if (
      typeof getSong === "function" &&
      typeof loadSelectedVideo === "function" &&
      typeof makeVersion === "function" &&
      $("songForm") && $("versionForm") &&
      document.querySelector(".player-card") &&
      document.documentElement.dataset.localAudio
    ) {
      clearInterval(timer);
      init();
    }
  }, 60);
  setTimeout(() => clearInterval(timer), 30000);
})();