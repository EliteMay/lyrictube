(() => {
  "use strict";

  const BUILD = window.LyricTubeVersion?.build || "a1";
  const SESSION_PREFIX = "lyrictube.playbackSession.v1.";
  const HISTORY_PREFIX = "lyrictube.playHistory.v1.";
  const SESSION_SAVE_MS = 1500;
  const TRACK_TICK_MS = 400;

  let initialized = false;
  let helper = null;
  let core = null;
  let profiles = null;
  let original = null;
  let manualQueue = [];
  let playbackContext = [];
  let contextIndex = -1;
  let navigationHistory = [];
  let versionPreferences = {};
  let history = [];
  let tracker = null;
  let activeConsumedQueueItem = null;
  let sessionSaveTimer = null;
  let lastSessionWriteAt = 0;
  let activeSmartView = "";
  let restoring = false;
  let endingGuardUntil = 0;

  const $ = id => document.getElementById(id);
  const nowIso = () => new Date().toISOString();
  const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const safeText = value => String(value ?? "");

  function ensureStyle() {
    if (document.querySelector('link[data-lyrictube-playback-a1]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `playback-a1.css?v=${encodeURIComponent(BUILD)}`;
    link.dataset.lyrictubePlaybackA1 = "";
    document.head.appendChild(link);
  }

  function currentScope() {
    const role = profiles?.currentRole?.() || "owner";
    if (role === "cloud") {
      const account = profiles?.readCloudSession?.()?.account || {};
      const id = safeText(account.id || account.username || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
      return `cloud.${id || "unknown"}`;
    }
    return role === "guest" ? "guest" : "owner";
  }

  function sessionKey() { return `${SESSION_PREFIX}${currentScope()}`; }
  function historyKey() { return `${HISTORY_PREFIX}${currentScope()}`; }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function library() { return core?.getLibrary?.() || { songs: [], playlists: [], settings: {} }; }
  function currentSong() { return core?.getSong?.() || null; }
  function currentVersion(song = currentSong()) { return core?.getVersion?.(song) || null; }
  function songById(id) { return library().songs?.find(song => String(song?.id) === String(id || "")) || null; }

  function versionById(song, id) {
    return (song?.versions || []).find(version => String(version?.id) === String(id || "")) || null;
  }

  function currentRef() {
    const song = currentSong();
    const version = currentVersion(song);
    return song ? { songId: String(song.id), versionId: String(version?.id || "") } : null;
  }

  function sameRef(a, b) {
    return Boolean(a && b && String(a.songId) === String(b.songId) && String(a.versionId || "") === String(b.versionId || ""));
  }

  function preferredVersionId(song, requested = "") {
    return helper.resolveVersionId(song, requested, versionPreferences[String(song?.id || "")] || "");
  }

  function rememberVersion(songId, versionId) {
    const sid = String(songId || "");
    const vid = String(versionId || "");
    if (!sid || !vid) return;
    versionPreferences[sid] = vid;
  }

  function makeRefForSong(song, requestedVersionId = "") {
    if (!song?.id) return null;
    return { songId: String(song.id), versionId: preferredVersionId(song, requestedVersionId) };
  }

  function queueSnapshotFromCurrentView(selectedSongId = "") {
    let songs = [];
    try { songs = typeof window.queueSongs === "function" ? window.queueSongs() : [...(library().songs || [])]; }
    catch { songs = [...(library().songs || [])]; }
    const seen = new Set();
    const refs = [];
    for (const song of songs) {
      const id = String(song?.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      refs.push({ songId: id });
    }
    const selected = String(selectedSongId || currentSong()?.id || "");
    if (selected && !seen.has(selected) && songById(selected)) refs.unshift({ songId: selected });
    return refs;
  }

  function captureContext(selectedSongId = "", { save = true } = {}) {
    playbackContext = queueSnapshotFromCurrentView(selectedSongId);
    const selected = String(selectedSongId || currentSong()?.id || "");
    contextIndex = playbackContext.findIndex(item => String(item.songId) === selected);
    if (contextIndex < 0 && playbackContext.length) contextIndex = 0;
    if (save) scheduleSessionSave(true);
  }

  function cleanStateReferences() {
    const songs = library().songs || [];
    manualQueue = helper.sanitizeQueue(manualQueue, songs);
    const validIds = new Set(songs.map(song => String(song?.id || "")).filter(Boolean));
    playbackContext = playbackContext.filter(item => validIds.has(String(item?.songId || "")));
    navigationHistory = navigationHistory.filter(item => validIds.has(String(item?.songId || ""))).slice(-100);
    const current = currentRef();
    if (current) {
      const index = playbackContext.findIndex(item => String(item.songId) === current.songId);
      if (index >= 0 && activeConsumedQueueItem == null) contextIndex = index;
    }
  }

  function sessionPayload() {
    cleanStateReferences();
    const ref = currentRef() || {};
    const settings = library().settings || {};
    return {
      songId: ref.songId || "",
      versionId: ref.versionId || "",
      position: Math.max(0, asNumber(core?.currentTime?.())),
      manualQueue,
      contextSnapshot: playbackContext,
      contextIndex,
      shuffle: Boolean(settings.shuffle),
      repeat: ["off", "all", "one"].includes(settings.repeat) ? settings.repeat : "off",
      versionPreferences,
      navigationHistory,
      savedAt: nowIso(),
    };
  }

  function saveSessionNow() {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
    writeJson(sessionKey(), sessionPayload());
    lastSessionWriteAt = Date.now();
  }

  function scheduleSessionSave(immediate = false) {
    if (immediate || Date.now() - lastSessionWriteAt >= SESSION_SAVE_MS) {
      saveSessionNow();
      return;
    }
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = setTimeout(saveSessionNow, SESSION_SAVE_MS);
  }

  function readHistory() {
    history = helper.trimHistory(readJson(historyKey(), []));
  }

  function persistHistory() {
    history = helper.trimHistory(history);
    writeJson(historyKey(), history);
    updateHistoryCount();
  }

  function updateHistoryCount() {
    const count = $("a1HistoryCount");
    if (count) count.textContent = String(history.length);
  }

  function syncHistoryEvent(entry) {
    if (profiles?.currentRole?.() !== "cloud" || !entry) return;
    document.dispatchEvent(new CustomEvent("lyrictube:cloud-play-history-delta", { detail: { events: [{ ...entry }] } }));
  }

  function upsertHistoryEntry(entry, sync = true) {
    if (!entry?.eventId || !entry?.songId) return;
    const index = history.findIndex(item => String(item.eventId) === String(entry.eventId));
    if (index >= 0) history[index] = { ...history[index], ...entry };
    else history.unshift({ ...entry });
    persistHistory();
    if (sync) syncHistoryEvent(entry);
  }

  function effectiveDuration() {
    const version = currentVersion();
    const raw = Math.max(0, asNumber(core?.duration?.()));
    const start = Math.max(0, asNumber(version?.startTime));
    const end = version?.endTime == null ? null : asNumber(version.endTime);
    if (end != null && end > start) return Math.max(0.1, end - start);
    if (raw > start) return Math.max(0.1, raw - start);
    return raw;
  }

  function ensureTracker() {
    const ref = currentRef();
    if (!ref) { tracker = null; return null; }
    if (tracker && sameRef(tracker, ref)) return tracker;
    if (tracker) tracker = null;
    tracker = {
      ...ref,
      startedAt: nowIso(),
      playedSeconds: 0,
      duration: effectiveDuration(),
      counted: false,
      eventId: "",
      lastWall: performance.now(),
      wasPlaying: false,
    };
    if (!playbackContext.length && !restoring) captureContext(ref.songId);
    return tracker;
  }

  function accrueTracker(now = performance.now(), assumePreviousPlaying = false) {
    const t = ensureTracker();
    if (!t) return null;
    const playing = asNumber(core?.state?.()) === 1;
    const shouldAccrue = playing || (assumePreviousPlaying && t.wasPlaying);
    if (shouldAccrue) {
      const delta = Math.max(0, Math.min(1.5, (now - t.lastWall) / 1000));
      t.playedSeconds += delta;
    }
    t.lastWall = now;
    t.wasPlaying = playing;
    const duration = effectiveDuration();
    if (duration > 0) t.duration = duration;
    return t;
  }

  function refreshPlaybackStatsUi(song) {
    try { window.renderViewNav?.(); } catch {}
    try {
      if (activeSmartView || document.querySelector('.view-btn[data-view="recent"].active')) window.renderLibrary?.();
    } catch {}
    const nowCount = $("nowPlayCount");
    if (nowCount && song) nowCount.textContent = `${Number(song.playCount) || 0}回再生`;
    updateSmartViewUi();
  }

  function markEligible(t = tracker) {
    if (!t || t.counted) return;
    const song = songById(t.songId);
    if (!song) return;
    t.counted = true;
    t.eventId = helper.uid("h");
    const playedAt = nowIso();
    song.playCount = (Number(song.playCount) || 0) + 1;
    song.lastPlayedAt = playedAt;
    try { core.persist(); } catch {}
    const event = {
      eventId: t.eventId,
      songId: t.songId,
      versionId: t.versionId || "",
      playedAt,
      completed: false,
      skipped: false,
      playedSeconds: Math.round(t.playedSeconds * 10) / 10,
    };
    upsertHistoryEntry(event, true);
    refreshPlaybackStatsUi(song);
  }

  function finalizeTracker({ completed = false, skipped = false, deferEffects = false } = {}) {
    if (!tracker) return;
    const t = accrueTracker(performance.now(), true) || tracker;
    tracker = null;

    const commit = () => {
      if (!t.counted && helper.isEligiblePlay(t.playedSeconds, t.duration)) markEligible(t);
      if (t.counted && t.eventId) {
        const existing = history.find(item => String(item.eventId) === String(t.eventId)) || {};
        upsertHistoryEntry({
          ...existing,
          eventId: t.eventId,
          songId: t.songId,
          versionId: t.versionId || "",
          playedAt: existing.playedAt || t.startedAt,
          completed: Boolean(completed || existing.completed),
          skipped: Boolean(skipped && !completed),
          playedSeconds: Math.round(Math.max(asNumber(existing.playedSeconds), t.playedSeconds) * 10) / 10,
        }, true);
      }
      scheduleSessionSave(true);
    };

    if (deferEffects) queueMicrotask(commit);
    else commit();
  }

  function trackerTick() {
    const t = accrueTracker();
    if (!t) return;
    if (!t.counted && helper.isEligiblePlay(t.playedSeconds, t.duration)) markEligible(t);
    if (activeConsumedQueueItem && asNumber(core?.state?.()) === 1 && sameRef(activeConsumedQueueItem, currentRef())) {
      activeConsumedQueueItem = null;
    }
    scheduleSessionSave(false);
  }

  function pushNavigation(ref) {
    if (!ref?.songId) return;
    const last = navigationHistory.at(-1);
    if (!sameRef(last, ref)) navigationHistory.push({ songId: ref.songId, versionId: ref.versionId || "" });
    navigationHistory = navigationHistory.slice(-100);
  }

  function playReference(ref, options = {}) {
    const song = songById(ref?.songId);
    if (!song) return false;
    const requested = String(ref?.versionId || "");
    const versionId = preferredVersionId(song, requested);
    if (requested && !versionById(song, requested)) return false;
    const current = currentRef();
    if (options.pushHistory !== false && current && !sameRef(current, { songId: song.id, versionId })) pushNavigation(current);

    const autoplay = options.autoplay !== false;
    restoring = Boolean(options.restoring);
    try {
      const firstId = String(song.versions?.[0]?.id || "");
      if (versionId && versionId !== firstId) {
        original.selectSong(song.id, false);
        original.selectVersion(versionId, autoplay);
      } else {
        original.selectSong(song.id, autoplay);
      }
      rememberVersion(song.id, versionId || String(currentVersion(song)?.id || ""));
      tracker = null;
      if (options.queueItem) activeConsumedQueueItem = { ...options.queueItem, songId: String(song.id), versionId: versionId || "" };
      scheduleSessionSave(true);
      queueMicrotask(() => { restoring = false; injectSongMenus(); renderQueue(); });
      return true;
    } finally {
      if (!options.restoring) restoring = false;
    }
  }

  function queueItemStatus(item) {
    const song = songById(item?.songId);
    if (!song) return { available: false, reason: "曲が削除されています", song: null, version: null };
    const version = versionById(song, item?.versionId);
    if (!version) return { available: false, reason: "指定Versionが削除されています", song, version: null };
    if (item.runtimeUnavailable) return { available: false, reason: item.unavailableReason || "前回の再生に失敗しました", song, version };
    if (version.source === "localmedia") {
      const status = window.LyricTubeLocalMedia?.status?.(song, version);
      if (status?.local && status.linked === false) return { available: false, reason: "この端末にファイルがありません", song, version };
    }
    return { available: true, reason: "", song, version };
  }

  function firstAvailableQueueItem() {
    for (const item of manualQueue) {
      const status = queueItemStatus(item);
      if (status.available) return { item, ...status };
    }
    return null;
  }

  function consumeQueueItem(item) {
    manualQueue = helper.removeQueueItem(manualQueue, item.id);
    scheduleSessionSave(true);
    renderQueue();
  }

  function contextSongs() {
    cleanStateReferences();
    return playbackContext.map(ref => songById(ref.songId)).filter(Boolean);
  }

  function nextFromContext({ manual = false } = {}) {
    const songs = contextSongs();
    if (!songs.length) return null;
    const current = currentRef();
    const settings = library().settings || {};

    if (settings.shuffle && songs.length > 1) {
      const picked = window.LyricTubeFairShuffle?.pickNext?.(songs, current?.songId || "", Math.random);
      if (picked) return makeRefForSong(picked);
    }

    let index = Number.isInteger(contextIndex) ? contextIndex : songs.findIndex(song => String(song.id) === String(current?.songId || ""));
    if (index < 0) index = songs.findIndex(song => String(song.id) === String(current?.songId || ""));
    const nextIndex = index + 1;
    if (nextIndex >= 0 && nextIndex < songs.length) {
      contextIndex = nextIndex;
      return makeRefForSong(songs[nextIndex]);
    }

    if (settings.repeat === "all" && songs.length) {
      contextIndex = 0;
      return makeRefForSong(songs[0]);
    }

    if (manual && index < 0 && songs.length) {
      contextIndex = 0;
      return makeRefForSong(songs[0]);
    }
    return null;
  }

  function advancePlayback({ naturalEnd = false, manual = false } = {}) {
    const settings = library().settings || {};
    if (naturalEnd && settings.repeat === "one") {
      finalizeTracker({ completed: true });
      original.restartCurrent(true);
      tracker = null;
      scheduleSessionSave(true);
      return true;
    }

    finalizeTracker({ completed: naturalEnd, skipped: manual && !naturalEnd });

    const queued = firstAvailableQueueItem();
    if (queued) {
      consumeQueueItem(queued.item);
      return playReference({ songId: queued.song.id, versionId: queued.version.id }, { autoplay: true, queueItem: queued.item });
    }

    const next = nextFromContext({ manual });
    if (next) return playReference(next, { autoplay: true });

    try { core.pause(); } catch {}
    scheduleSessionSave(true);
    return false;
  }

  function previousPlayback() {
    const version = currentVersion();
    const relative = Math.max(0, asNumber(core.currentTime()) - Math.max(0, asNumber(version?.startTime)));
    if (relative >= 3) {
      original.restartCurrent(true);
      scheduleSessionSave(true);
      return true;
    }

    finalizeTracker({ skipped: true });
    const current = currentRef();
    let previous = null;
    while (navigationHistory.length) {
      const candidate = navigationHistory.pop();
      if (!candidate?.songId || !songById(candidate.songId)) continue;
      if (current && sameRef(candidate, current)) continue;
      previous = candidate;
      break;
    }
    if (previous) {
      const song = songById(previous.songId);
      const versionId = versionById(song, previous.versionId) ? previous.versionId : preferredVersionId(song);
      return playReference({ songId: song.id, versionId }, { autoplay: true, pushHistory: false });
    }
    original.restartCurrent(true);
    scheduleSessionSave(true);
    return true;
  }

  function enqueue(songId, mode, requestedVersionId = "") {
    const song = songById(songId);
    if (!song) return false;
    const versionId = preferredVersionId(song, requestedVersionId);
    if (!versionId) {
      core.toast("再生できるVersionがありません。");
      return false;
    }
    const op = mode === "next" ? helper.addPlayNext : helper.addQueueEnd;
    const result = op(manualQueue, { songId: song.id, versionId });
    if (!result.ok) {
      core.toast("キューは500件までです。不要な項目を削除してから追加してください。");
      return false;
    }
    manualQueue = result.queue;
    scheduleSessionSave(true);
    renderQueue();
    core.toast(mode === "next" ? `「${song.title}」を次に再生します。` : `「${song.title}」をキュー末尾に追加しました。`);
    return true;
  }

  function playQueueItemNow(itemId) {
    const item = manualQueue.find(entry => String(entry.id) === String(itemId));
    if (!item) return;
    const status = queueItemStatus(item);
    if (!status.available) {
      core.toast(status.reason || "このQueue項目は現在再生できません。");
      return;
    }
    finalizeTracker({ skipped: true });
    consumeQueueItem(item);
    playReference({ songId: status.song.id, versionId: status.version.id }, { autoplay: true, queueItem: item });
    $("queueDialog")?.close?.();
  }

  function relinkQueueItem(item) {
    const status = queueItemStatus(item);
    if (!status.song || !status.version || status.version.source !== "localmedia") return;
    const previous = currentRef();
    playReference({ songId: status.song.id, versionId: status.version.id }, { autoplay: false, pushHistory: false });
    setTimeout(async () => {
      try { await window.LyricTubeLocalMedia?.relinkCurrent?.(); }
      catch { core.toast("端末ファイルを再登録できませんでした。"); }
      item.runtimeUnavailable = false;
      item.unavailableReason = "";
      scheduleSessionSave(true);
      renderQueue();
      if (previous && !sameRef(previous, currentRef())) playReference(previous, { autoplay: false, pushHistory: false });
    }, 80);
  }

  function chooseQueueVersion(item) {
    const song = songById(item.songId);
    const versions = song?.versions || [];
    if (!versions.length) return core.toast("選べるVersionがありません。");
    const lines = versions.map((version, index) => `${index + 1}. ${core.versionName(version)}`).join("\n");
    const raw = prompt(`「${song.title}」のVersionを選んでください。\n${lines}`, "1");
    if (raw == null) return;
    const index = Number(raw) - 1;
    if (!Number.isInteger(index) || !versions[index]) return core.toast("番号を確認してください。");
    item.versionId = String(versions[index].id);
    item.runtimeUnavailable = false;
    item.unavailableReason = "";
    rememberVersion(song.id, item.versionId);
    scheduleSessionSave(true);
    renderQueue();
  }

  function retryQueueItem(item) {
    item.runtimeUnavailable = false;
    item.unavailableReason = "";
    scheduleSessionSave(true);
    renderQueue();
  }

  function thumbFor(song, version) {
    const videoId = String(version?.videoId || song?.versions?.find(v => v?.videoId)?.videoId || "");
    return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg` : "assets/lyrictube-icon.webp";
  }

  function renderCurrentQueueHeader() {
    let current = $("a1QueueCurrent");
    const list = $("queueList");
    if (!list) return;
    if (!current) {
      current = document.createElement("div");
      current.id = "a1QueueCurrent";
      current.className = "a1-queue-current";
      list.insertAdjacentElement("beforebegin", current);
    }
    const song = currentSong();
    const version = currentVersion(song);
    current.replaceChildren();
    const label = document.createElement("span");
    label.className = "a1-queue-kicker";
    label.textContent = "NOW PLAYING";
    const title = document.createElement("strong");
    title.textContent = song?.title || "再生中の曲はありません";
    const meta = document.createElement("span");
    meta.textContent = song ? [song.artist, version ? core.versionName(version) : ""].filter(Boolean).join(" · ") : "";
    current.append(label, title, meta);
  }

  function ensureQueueToolbar() {
    const dialog = $("queueDialog");
    if (!dialog) return;
    dialog.classList.add("a1-queue-dialog");
    const help = dialog.querySelector(".queue-help");
    if (help) help.textContent = "手動で追加した次の曲を管理します。現在の曲は並べ替え対象に含まれません。";
    if (!$("a1QueueToolbar")) {
      const toolbar = document.createElement("div");
      toolbar.id = "a1QueueToolbar";
      toolbar.className = "a1-queue-toolbar";
      const count = document.createElement("span");
      count.id = "a1QueueCount";
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "ghost-btn";
      clear.textContent = "キューを空にする";
      clear.addEventListener("click", () => {
        if (!manualQueue.length) return;
        manualQueue = [];
        scheduleSessionSave(true);
        renderQueue();
        core.toast("手動キューを空にしました。");
      });
      toolbar.append(count, clear);
      help?.insertAdjacentElement("afterend", toolbar);
    }
  }

  function queueActionButton(text, title, handler, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    if (className) button.className = className;
    button.addEventListener("click", event => { event.stopPropagation(); handler(); });
    return button;
  }

  function renderQueue() {
    const list = $("queueList");
    if (!list || !helper) return;
    ensureQueueToolbar();
    renderCurrentQueueHeader();
    const count = $("a1QueueCount");
    if (count) count.textContent = `手動キュー ${manualQueue.length} / ${helper.MAX_QUEUE_ITEMS}`;
    list.replaceChildren();

    if (!manualQueue.length) {
      const empty = document.createElement("div");
      empty.className = "a1-queue-empty";
      empty.innerHTML = "<strong>手動キューは空です</strong><span>曲の「⋯」から「次に再生」または「キュー末尾に追加」を使えます。</span>";
      list.appendChild(empty);
      return;
    }

    manualQueue.forEach((item, index) => {
      const status = queueItemStatus(item);
      const row = document.createElement("article");
      row.className = `a1-queue-row${status.available ? "" : " unavailable"}`;
      row.dataset.queueItemId = item.id;

      const thumb = document.createElement("img");
      thumb.className = "a1-queue-thumb";
      thumb.src = thumbFor(status.song, status.version);
      thumb.alt = "";

      const copy = document.createElement("div");
      copy.className = "a1-queue-copy";
      const title = document.createElement("strong");
      title.textContent = status.song?.title || "削除された曲";
      const meta = document.createElement("span");
      meta.textContent = status.song ? [status.song.artist, status.version ? core.versionName(status.version) : "Version不明"].filter(Boolean).join(" · ") : "参照切れ";
      copy.append(title, meta);
      if (!status.available) {
        const warning = document.createElement("span");
        warning.className = "a1-queue-warning";
        warning.textContent = status.reason;
        copy.appendChild(warning);
      }

      const actions = document.createElement("div");
      actions.className = "a1-queue-actions";
      const play = queueActionButton("▶", "今すぐ再生", () => playQueueItemNow(item.id), "a1-queue-play");
      play.disabled = !status.available;
      const up = queueActionButton("↑", "1つ上へ", () => {
        manualQueue = helper.moveQueueItem(manualQueue, item.id, -1);
        scheduleSessionSave(true); renderQueue();
      });
      up.disabled = index === 0;
      const down = queueActionButton("↓", "1つ下へ", () => {
        manualQueue = helper.moveQueueItem(manualQueue, item.id, 1);
        scheduleSessionSave(true); renderQueue();
      });
      down.disabled = index === manualQueue.length - 1;
      const remove = queueActionButton("×", "キューから削除", () => {
        manualQueue = helper.removeQueueItem(manualQueue, item.id);
        scheduleSessionSave(true); renderQueue();
      });
      actions.append(play, up, down, remove);

      if (!status.available && status.version?.source === "localmedia") {
        actions.prepend(queueActionButton("再登録", "端末ファイルを再登録", () => relinkQueueItem(item), "a1-queue-wide"));
      } else if (!status.available && status.song && !status.version) {
        actions.prepend(queueActionButton("Version選択", "別のVersionを明示的に選ぶ", () => chooseQueueVersion(item), "a1-queue-wide"));
      } else if (!status.available && item.runtimeUnavailable) {
        actions.prepend(queueActionButton("再試行", "再生失敗状態を解除して再試行できるようにする", () => retryQueueItem(item), "a1-queue-wide"));
      }

      row.append(thumb, copy, actions);
      list.appendChild(row);
    });
  }

  function ensureSongMenuDialog() {
    if ($("a1SongMenuDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "a1SongMenuDialog";
    dialog.className = "dialog a1-song-menu-dialog";
    dialog.innerHTML = `
      <div class="dialog-head"><div><p class="eyebrow">PLAY</p><h3 id="a1SongMenuTitle">曲の操作</h3></div><button id="a1SongMenuClose" class="icon-btn subtle" type="button">×</button></div>
      <p id="a1SongMenuMeta" class="muted small"></p>
      <div class="a1-song-menu-actions">
        <button type="button" data-a1-song-action="now" class="primary-soft">▶ 今すぐ再生</button>
        <button type="button" data-a1-song-action="next">⏭ 次に再生</button>
        <button type="button" data-a1-song-action="end">＋ キュー末尾に追加</button>
      </div>`;
    document.body.appendChild(dialog);
    $("a1SongMenuClose").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
      const button = event.target.closest("[data-a1-song-action]");
      if (!button) return;
      const songId = dialog.dataset.songId;
      const song = songById(songId);
      if (!song) return;
      if (button.dataset.a1SongAction === "now") {
        finalizeTracker({ skipped: true });
        captureContext(song.id);
        const ref = makeRefForSong(song);
        playReference(ref, { autoplay: true });
      } else if (button.dataset.a1SongAction === "next") enqueue(song.id, "next");
      else enqueue(song.id, "end");
      dialog.close();
    });
  }

  function openSongMenu(songId) {
    const song = songById(songId);
    const dialog = $("a1SongMenuDialog");
    if (!song || !dialog) return;
    dialog.dataset.songId = String(song.id);
    $("a1SongMenuTitle").textContent = song.title || "曲の操作";
    $("a1SongMenuMeta").textContent = song.artist || "";
    dialog.showModal();
  }

  function menuButtonFor(song) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "a1-song-menu-btn";
    button.textContent = "⋯";
    button.title = `「${song.title || "曲"}」の再生メニュー`;
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openSongMenu(song.id);
    });
    return button;
  }

  function injectSongMenus() {
    if (!initialized) return;
    let songs = [];
    try { songs = typeof window.viewSongs === "function" ? window.viewSongs() : library().songs || []; }
    catch { songs = library().songs || []; }

    document.querySelectorAll("#songList .song-row").forEach((row, index) => {
      const song = songs[index];
      if (!song || row.querySelector(".a1-song-menu-btn")) return;
      row.appendChild(menuButtonFor(song));
    });
  }

  function ensureSmartViews() {
    const nav = document.querySelector(".view-nav");
    const recent = nav?.querySelector('.view-btn[data-view="recent"]');
    if (!nav || !recent) return;

    if (!$("a1UnplayedView")) {
      const unplayed = document.createElement("button");
      unplayed.id = "a1UnplayedView";
      unplayed.className = "view-btn smart-view a1-smart-view";
      unplayed.type = "button";
      unplayed.dataset.a1View = "unplayed";
      unplayed.innerHTML = '<span><span class="nav-icon">○</span>未再生</span><span id="a1UnplayedCount" class="nav-count">0</span>';
      recent.insertAdjacentElement("afterend", unplayed);

      const stale = document.createElement("button");
      stale.id = "a1StaleView";
      stale.className = "view-btn smart-view a1-smart-view";
      stale.type = "button";
      stale.dataset.a1View = "stale";
      stale.innerHTML = '<span><span class="nav-icon">⌛</span>30日以上未再生</span><span id="a1StaleCount" class="nav-count">0</span>';
      unplayed.insertAdjacentElement("afterend", stale);

      const historyButton = document.createElement("button");
      historyButton.id = "a1HistoryBtn";
      historyButton.className = "view-btn smart-view a1-history-launch";
      historyButton.type = "button";
      historyButton.innerHTML = '<span><span class="nav-icon">≡</span>再生履歴</span><span id="a1HistoryCount" class="nav-count">0</span>';
      stale.insertAdjacentElement("afterend", historyButton);

      nav.querySelectorAll("[data-a1-view]").forEach(button => button.addEventListener("click", () => {
        document.querySelector('.view-btn[data-view="all"]')?.click();
        activeSmartView = button.dataset.a1View || "";
        core.render();
        updateSmartViewUi();
      }));
      historyButton.addEventListener("click", openHistoryDialog);
    }
    updateSmartViewUi();
  }

  function updateSmartViewUi() {
    const songs = library().songs || [];
    const unplayed = helper.unplayedSongs(songs);
    const stale = helper.staleSongs(songs);
    if ($("a1UnplayedCount")) $("a1UnplayedCount").textContent = String(unplayed.length);
    if ($("a1StaleCount")) $("a1StaleCount").textContent = String(stale.length);
    updateHistoryCount();
    document.querySelectorAll("[data-a1-view]").forEach(button => button.classList.toggle("active", button.dataset.a1View === activeSmartView));
    if (activeSmartView) {
      document.querySelectorAll('.view-btn[data-view]').forEach(button => button.classList.remove("active"));
      const label = $("libraryLabel");
      if (label) label.textContent = activeSmartView === "unplayed" ? "未再生" : "30日以上未再生";
    }
  }

  function ensureHistoryDialog() {
    if ($("a1HistoryDialog")) return;
    const dialog = document.createElement("dialog");
    dialog.id = "a1HistoryDialog";
    dialog.className = "dialog a1-history-dialog";
    dialog.innerHTML = `
      <div class="dialog-head"><div><p class="eyebrow">PLAY HISTORY</p><h3>再生履歴</h3></div><button id="a1HistoryClose" class="icon-btn subtle" type="button">×</button></div>
      <p class="muted small">10秒以上、または曲の10%以上を再生した記録です。最大500件を保持します。</p>
      <div class="a1-history-toolbar">
        <button id="a1HistoryClear" class="ghost-btn" type="button">履歴だけ削除</button>
        <button id="a1HistoryReset" class="danger-ghost" type="button">再生記録をリセット</button>
      </div>
      <div id="a1HistoryList" class="a1-history-list"></div>`;
    document.body.appendChild(dialog);
    $("a1HistoryClose").addEventListener("click", () => dialog.close());
    $("a1HistoryClear").addEventListener("click", clearDetailedHistory);
    $("a1HistoryReset").addEventListener("click", resetPlaybackRecords);
  }

  function formatPlayedSeconds(seconds) {
    const n = Math.max(0, asNumber(seconds));
    const min = Math.floor(n / 60);
    const sec = Math.floor(n % 60);
    return min ? `${min}分${sec}秒` : `${sec}秒`;
  }

  function renderHistory() {
    const list = $("a1HistoryList");
    if (!list) return;
    list.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("div");
      empty.className = "a1-history-empty";
      empty.textContent = "再生履歴はまだありません。";
      list.appendChild(empty);
      return;
    }
    for (const entry of history) {
      const song = songById(entry.songId);
      const version = versionById(song, entry.versionId);
      const row = document.createElement("div");
      row.className = "a1-history-row";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = song?.title || "削除された曲";
      const meta = document.createElement("span");
      const stamp = new Date(entry.playedAt);
      const when = Number.isFinite(stamp.getTime()) ? stamp.toLocaleString("ja-JP") : safeText(entry.playedAt);
      meta.textContent = [song?.artist, version ? core.versionName(version) : "", when].filter(Boolean).join(" · ");
      copy.append(title, meta);
      const badges = document.createElement("div");
      badges.className = "a1-history-badges";
      const duration = document.createElement("span");
      duration.textContent = formatPlayedSeconds(entry.playedSeconds);
      badges.appendChild(duration);
      if (entry.completed) {
        const badge = document.createElement("span"); badge.textContent = "完走"; badges.appendChild(badge);
      } else if (entry.skipped) {
        const badge = document.createElement("span"); badge.textContent = "スキップ"; badges.appendChild(badge);
      }
      row.append(copy, badges);
      list.appendChild(row);
    }
  }

  function openHistoryDialog() {
    renderHistory();
    $("a1HistoryDialog")?.showModal?.();
  }

  async function clearDetailedHistory() {
    if (!confirm("詳細な再生履歴だけを削除しますか？\n再生回数と最終再生日時は残ります。")) return;
    try {
      if (profiles?.currentRole?.() === "cloud") await window.LyricTubeCloudSync?.clearPlaybackHistory?.({ resetStats: false });
      history = [];
      persistHistory();
      renderHistory();
      core.toast("詳細な再生履歴を削除しました。再生回数は残しています。");
    } catch (error) {
      console.error("[LyricTube A1] clear history", error);
      core.toast("クラウドの再生履歴を削除できませんでした。");
    }
  }

  async function resetPlaybackRecords() {
    if (!confirm("再生履歴・再生回数・最終再生日時をすべてリセットしますか？\n曲・プレイリスト・タグは削除しません。")) return;
    try {
      if (profiles?.currentRole?.() === "cloud") await window.LyricTubeCloudSync?.clearPlaybackHistory?.({ resetStats: true });
      history = [];
      for (const song of library().songs || []) {
        song.playCount = 0;
        song.lastPlayedAt = null;
      }
      core.persist();
      persistHistory();
      core.render();
      renderHistory();
      core.toast("再生記録をリセットしました。曲データは残っています。");
    } catch (error) {
      console.error("[LyricTube A1] reset history", error);
      core.toast("再生記録をリセットできませんでした。");
    }
  }

  async function hydrateCloudHistory() {
    if (profiles?.currentRole?.() !== "cloud") return;
    try {
      const result = await window.LyricTubeCloudSync?.loadPlaybackHistory?.();
      const remote = Array.isArray(result?.history) ? result.history : [];
      history = helper.mergeHistory(history, remote);
      persistHistory();
      renderHistory();
    } catch (error) {
      console.warn("[LyricTube A1] cloud history load failed", error);
    }
  }

  function restoreSession() {
    const raw = readJson(sessionKey(), null);
    const session = helper.normalizeSession(raw);
    if (!session) {
      if (raw) try { localStorage.removeItem(sessionKey()); } catch {}
      manualQueue = [];
      playbackContext = [];
      navigationHistory = [];
      versionPreferences = {};
      return;
    }

    manualQueue = helper.sanitizeQueue(session.manualQueue, library().songs || []);
    playbackContext = session.contextSnapshot.filter(ref => songById(ref.songId));
    contextIndex = Math.min(Math.max(-1, session.contextIndex), playbackContext.length - 1);
    navigationHistory = session.navigationHistory.filter(ref => songById(ref.songId));
    versionPreferences = { ...session.versionPreferences };
    const settings = library().settings || {};
    settings.shuffle = session.shuffle;
    settings.repeat = session.repeat;
    try { window.updateModeButtons?.(); } catch {}

    const song = songById(session.songId);
    if (song) {
      const requested = versionById(song, session.versionId) ? session.versionId : preferredVersionId(song);
      playReference({ songId: song.id, versionId: requested }, { autoplay: false, pushHistory: false, restoring: true });
      const target = Math.max(0, session.position);
      const attempts = [220, 650, 1400, 2600];
      for (const delay of attempts) {
        setTimeout(() => {
          if (asNumber(core.state()) === 1) core.pause();
          core.seek(target, false);
        }, delay);
      }
    }
    scheduleSessionSave(true);
  }

  function patchPlaybackFunctions() {
    original = {
      selectSong: window.selectSong,
      selectVersion: window.selectVersion,
      playAdjacent: window.playAdjacent,
      handleTrackEnd: window.handleTrackEnd,
      markPlayed: window.markPlayed,
      renderQueueDialog: window.renderQueueDialog,
      openQueueDialog: window.openQueueDialog,
      showToast: window.showToast,
      restartCurrent: window.restartCurrent,
    };
    if (Object.values(original).some(value => typeof value !== "function")) {
      throw new Error("LyricTube playback functions are not available for A1 integration");
    }

    window.markPlayed = function() {
      // A1 counts a play only after the valid-play threshold is met.
    };

    window.selectSong = function(id, autoplay = false) {
      const before = currentRef();
      const changed = before?.songId && String(before.songId) !== String(id || "");
      if (changed) {
        // Only cheap bookkeeping stays before the media request. History/session/UI
        // writes are committed in a microtask after autoplay has been dispatched.
        finalizeTracker({ skipped: true, deferEffects: Boolean(autoplay) });
        pushNavigation(before);
      }

      const needsContext = changed || !playbackContext.length;
      const result = original.selectSong(id, autoplay);

      if (needsContext) captureContext(id, { save: !autoplay });
      const after = currentRef();
      if (after) rememberVersion(after.songId, after.versionId);
      tracker = null;
      if (autoplay) queueMicrotask(() => scheduleSessionSave(true));
      else scheduleSessionSave(true);
      queueMicrotask(() => { injectSongMenus(); updateSmartViewUi(); });
      return result;
    };

    window.selectVersion = function(id, autoplay = false) {
      const before = currentRef();
      const oldVersion = currentVersion();
      const oldStart = Math.max(0, asNumber(oldVersion?.startTime));
      const relative = Math.max(0, asNumber(core.currentTime()) - oldStart);
      const wasPlaying = asNumber(core.state()) === 1;
      const changed = before?.versionId && String(before.versionId) !== String(id || "");
      if (changed) finalizeTracker({ skipped: true });
      const result = original.selectVersion(id, false);
      const after = currentRef();
      if (after) rememberVersion(after.songId, after.versionId);
      tracker = null;
      if (changed && after) {
        const nextVersion = currentVersion();
        const target = Math.max(0, asNumber(nextVersion?.startTime) + relative);
        setTimeout(() => core.seek(target, Boolean(autoplay || wasPlaying)), 180);
        setTimeout(() => core.seek(target, Boolean(autoplay || wasPlaying)), 700);
      } else if (autoplay) {
        setTimeout(() => core.play(), 120);
      }
      scheduleSessionSave(true);
      return result;
    };

    window.playAdjacent = function(direction = 1) {
      if (direction < 0) return previousPlayback();
      return advancePlayback({ manual: true });
    };

    window.handleTrackEnd = function() {
      const now = Date.now();
      if (now < endingGuardUntil) return false;
      endingGuardUntil = now + 700;
      return advancePlayback({ naturalEnd: true, manual: false });
    };

    window.renderQueueDialog = renderQueue;
    window.openQueueDialog = function() {
      try { window.leaveLyricsFullscreenForDialog?.(); } catch {}
      renderQueue();
      $("queueDialog")?.showModal?.();
    };

    window.showToast = function(message) {
      const text = String(message || "");
      if (activeConsumedQueueItem && /再生できません|サイト内再生できません/.test(text)) {
        const failed = {
          ...activeConsumedQueueItem,
          runtimeUnavailable: true,
          unavailableReason: "YouTube側で再生できませんでした",
        };
        if (!manualQueue.some(item => String(item.id) === String(failed.id))) manualQueue.unshift(failed);
        activeConsumedQueueItem = null;
        scheduleSessionSave(true);
        setTimeout(() => advancePlayback({ manual: false }), 0);
      }
      return original.showToast(message);
    };
  }

  function wireHooks() {
    core.hooks?.addFilter?.("songs:view", songs => {
      if (activeSmartView === "unplayed") return helper.unplayedSongs(songs);
      if (activeSmartView === "stale") return helper.staleSongs(songs);
      return songs;
    });
    core.hooks?.on?.("render:all", () => queueMicrotask(() => {
      ensureSmartViews();
      injectSongMenus();
      updateSmartViewUi();
      renderQueue();
    }));

    document.addEventListener("click", event => {
      if (event.target.closest('.view-btn[data-view], .browse-chip[data-browse-view]')) activeSmartView = "";
    }, true);
  }

  function initialize() {
    if (initialized) return;
    helper = window.LyricTubePlaybackState;
    core = window.LyricTubeCore;
    profiles = window.LyricTubeProfiles;
    if (!helper || !core || !profiles) return;
    initialized = true;

    ensureStyle();
    readHistory();
    ensureSongMenuDialog();
    ensureHistoryDialog();
    ensureSmartViews();
    patchPlaybackFunctions();
    wireHooks();
    restoreSession();
    renderQueue();
    injectSongMenus();
    updateSmartViewUi();
    hydrateCloudHistory();

    setInterval(trackerTick, TRACK_TICK_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveSessionNow();
    });
    window.addEventListener("pagehide", saveSessionNow);
    window.addEventListener("beforeunload", saveSessionNow);

    window.LyricTubePlaybackA1 = Object.freeze({
      addNext: (songId, versionId = "") => enqueue(songId, "next", versionId),
      addEnd: (songId, versionId = "") => enqueue(songId, "end", versionId),
      queue: () => manualQueue.map(item => ({ ...item })),
      history: () => history.map(item => ({ ...item })),
      saveSession: saveSessionNow,
      renderQueue,
    });
  }

  if (window.LyricTubeCore) initialize();
  else document.addEventListener("lyrictube:app-ready", initialize, { once: true });
})();
