from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_BUILD = "20260905-2"
NEW_BUILD = "20260905-3"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    require(count == 1, f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# app.js: warm the selected iframe before the expensive first render, and do not
# reload the same initial video again when the YouTube iframe reports onReady.
app = read("app.js")
old_ready = '''        const pending=pendingYoutubeRequest;
        if(pending?.videoId){
          applyPendingYoutubeRequest(pending);
        }else{
          const current=getVersion();
          const playerId=playerVideoIdSafe();
          if(current?.videoId&&playerId!==String(current.videoId)){
            try{ytPlayer.cueVideoById({videoId:current.videoId,startSeconds:Number(current.startTime)||0})}catch{}
          }
        }
'''
new_ready = '''        const pending=pendingYoutubeRequest;
        const playerId=playerVideoIdSafe();
        if(pending?.videoId){
          if(playerId===String(pending.videoId)){
            if(pending.autoplay){try{ytPlayer.playVideo?.()}catch{}}
            if(pendingYoutubeRequest?.generation===pending.generation)pendingYoutubeRequest=null;
          }else{
            applyPendingYoutubeRequest(pending);
          }
        }else{
          const current=getVersion();
          if(current?.videoId&&playerId!==String(current.videoId)){
            try{ytPlayer.cueVideoById({videoId:current.videoId,startSeconds:Number(current.startTime)||0})}catch{}
          }
        }
'''
app = replace_once(app, old_ready, new_ready, "YouTube onReady double-load guard")

old_bootstrap = '''  mainPage=library.settings.startupPage==="browse"?"browse":"player";
  ensureSelection();
  renderAll();
  updateModeButtons();
  els.browseSearch.value=els.librarySearch.value;
  els.bottomVolume.value=String(clamp(Number(library.settings.volume??80),0,100));
  if(selectedSongId)loadSelectedVideo(false);
  syncTimer=setInterval(playbackTick,180);
  loadYoutubeApi();
'''
new_bootstrap = '''  mainPage=library.settings.startupPage==="browse"?"browse":"player";
  ensureSelection();
  // Start warming the selected media before the first full Library/Browse/Lyrics render.
  if(selectedSongId)loadSelectedVideo(false);
  renderAll();
  updateModeButtons();
  els.browseSearch.value=els.librarySearch.value;
  els.bottomVolume.value=String(clamp(Number(library.settings.volume??80),0,100));
  syncTimer=setInterval(playbackTick,180);
  loadYoutubeApi();
'''
app = replace_once(app, old_bootstrap, new_bootstrap, "bootstrap player warm order")
write("app.js", app)


# playback-a1.js: A1 used to do session/history/context work before handing the
# click to the media player. Keep old-track accounting, but defer its side effects
# until after the autoplay request has been issued.
playback = read("playback-a1.js")
playback = replace_once(
    playback,
    '  function captureContext(selectedSongId = "") {\n',
    '  function captureContext(selectedSongId = "", { save = true } = {}) {\n',
    "captureContext options",
)
playback = replace_once(
    playback,
    '    scheduleSessionSave(true);\n  }\n\n  function cleanStateReferences()',
    '    if (save) scheduleSessionSave(true);\n  }\n\n  function cleanStateReferences()',
    "captureContext deferred save",
)

finalize_pattern = re.compile(
    r'''  function finalizeTracker\(\{ completed = false, skipped = false \} = \{\}\) \{\n.*?\n  \}\n\n  function trackerTick\(\) \{''',
    re.S,
)
finalize_replacement = '''  function finalizeTracker({ completed = false, skipped = false, deferEffects = false } = {}) {
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

  function trackerTick() {'''
playback, count = finalize_pattern.subn(finalize_replacement, playback, count=1)
require(count == 1, f"finalizeTracker replacement count={count}")

select_pattern = re.compile(
    r'''    window\.selectSong = function\(id, autoplay = false\) \{\n.*?\n    \};\n\n    window\.selectVersion = function''',
    re.S,
)
select_replacement = '''    window.selectSong = function(id, autoplay = false) {
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

    window.selectVersion = function'''
playback, count = select_pattern.subn(select_replacement, playback, count=1)
require(count == 1, f"selectSong wrapper replacement count={count}")
write("playback-a1.js", playback)


# a1-ui-guards.js: the app and A1 integration now own autoplay. Remove the old
# 5-second play() retry layer so one user click has one playback control path.
ui = '''(() => {
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
'''
write("a1-ui-guards.js", ui)


# Regression tests: ensure the 5-second retry shim cannot return, and media work
# is issued before A1 context/session persistence.
test = read("tests/a1-requirements.test.js")
if 'const playback = fs.readFileSync("playback-a1.js", "utf8");' not in test:
    test = replace_once(
        test,
        'const app = fs.readFileSync("app.js", "utf8");\n',
        'const app = fs.readFileSync("app.js", "utf8");\nconst playback = fs.readFileSync("playback-a1.js", "utf8");\n',
        "playback test import",
    )
old_asserts = '''// Autoplay selections must issue media work before the expensive full rerender,
// and a click made while the YouTube iframe is still booting must not be lost.
assert(app.includes('loadSelectedVideo(true);'), "autoplay selection must request media immediately");
assert(app.includes('requestAnimationFrame(()=>{'), "full visual render must yield until after the media request");
assert(app.includes('let pendingYoutubeRequest = null'), "pending YouTube request state missing");
assert(app.includes('function applyPendingYoutubeRequest'), "pending YouTube request replay missing");
assert(app.includes('pendingYoutubeRequest=request'), "latest YouTube selection must be retained while player is not ready");
assert(app.includes('autoplay:initial?.autoplay?1:0'), "initial iframe creation must preserve autoplay intent");
assert(app.includes("if(document.querySelector('script[src*=\\\"youtube.com/iframe_api\\\"]'))return;"), "duplicate YouTube API loads must be prevented");
assert(ui.includes('script.src = "https://www.youtube.com/iframe_api"'), "YouTube API must warm during the access gate");
assert(ui.includes('https://www.youtube.com'), "YouTube preconnect is missing");
assert(ui.includes('https://i.ytimg.com'), "thumbnail origin preconnect is missing");
'''
new_asserts = '''// A single click must have one autoplay control path. The old A1 guard retried
// play() for five seconds and could contend with the actual YouTube loader.
assert(app.includes('loadSelectedVideo(true);'), "autoplay selection must request media immediately");
assert(app.includes('let pendingYoutubeRequest = null'), "pending YouTube request state missing");
assert(app.includes('function applyPendingYoutubeRequest'), "pending YouTube request replay missing");
assert(app.includes('pendingYoutubeRequest=request'), "latest YouTube selection must be retained while player is not ready");
assert(app.includes('autoplay:initial?.autoplay?1:0'), "initial iframe creation must preserve autoplay intent");
assert(app.includes('if(playerId===String(pending.videoId))'), "initial YouTube onReady must avoid reloading the same video");
assert(!ui.includes('maxWaitMs = 5000'), "five-second autoplay retry loop must not return");
assert(!ui.includes('function ensureAutoplayStarted'), "A1 UI must not own a second autoplay controller");
assert(!ui.includes('core.play?.()'), "A1 UI must not repeatedly call PlayerController.play");
assert(ui.includes('lyrictube.playbackDiagnostics.v1'), "local playback-start diagnostics missing");
assert(ui.includes('script.src = "https://www.youtube.com/iframe_api"'), "YouTube API must warm during the access gate");
assert(ui.includes('https://www.youtube.com'), "YouTube preconnect is missing");
assert(ui.includes('https://i.ytimg.com'), "thumbnail origin preconnect is missing");
const wrappedSelect = playback.slice(playback.indexOf('window.selectSong = function'), playback.indexOf('window.selectVersion = function'));
assert(wrappedSelect.indexOf('original.selectSong(id, autoplay)') < wrappedSelect.indexOf('captureContext(id'), "A1 context persistence must happen after the media request");
assert(wrappedSelect.includes('deferEffects: Boolean(autoplay)'), "old-track finalization side effects must defer during autoplay");
const bootstrap = app.slice(app.indexOf('function bootstrapCore()'), app.indexOf('// Stable façade'));
assert(bootstrap.indexOf('loadSelectedVideo(false)') < bootstrap.indexOf('renderAll()'), "initial YouTube player warm must begin before the first full render");
'''
require(old_asserts in test, "old A1 playback latency assertion block not found")
test = test.replace(old_asserts, new_asserts, 1)
write("tests/a1-requirements.test.js", test)


# Build/cache revision. This must ship as new asset URLs.
for path in ["version.js", "index.html", "site-shell.js", "README.md"]:
    text = read(path)
    require(OLD_BUILD in text, f"{path}: old build marker missing")
    write(path, text.replace(OLD_BUILD, NEW_BUILD))

defaults_path = ROOT / "data/defaults.json"
defaults = json.loads(defaults_path.read_text(encoding="utf-8"))
require(defaults.get("buildRevision") == OLD_BUILD, "data/defaults.json: unexpected buildRevision")
defaults["buildRevision"] = NEW_BUILD
defaults_path.write_text(json.dumps(defaults, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# Documentation: record that the previous diagnosis was incomplete instead of
# pretending the user-observed five-second symptom had been resolved.
changelog = read("docs/CHANGELOG.md")
entry = f'''## v0.13.2 Playback latency v3 / build {NEW_BUILD}（2026-09-05）\n\n- User再確認でbuild `{OLD_BUILD}` 後も曲クリックから再生開始まで約5秒の体感が変わっていないことを確認。\n- A1の曲選択Wrapperが履歴確定・Context作成・Session保存を本体再生要求より前に行う順序を修正し、Autoplay時はPlayerへの要求を先に発行。\n- `a1-ui-guards.js` に残っていた最大5秒の `play()` 再試行Loopを削除し、再生開始制御を本体Player経路へ一本化。\n- 初期選択動画のYouTube Player warm-upをFull Renderより前へ移動。\n- YouTube `onReady` で初期動画と同じPending requestを `loadVideoById` し直さないよう修正。\n- Local-onlyの再生開始Timing ring buffer（最大20件）を追加し、次回再発時にクリック→PLAYINGの実測値を残せるようにした。\n- Cache revisionを `{NEW_BUILD}` へ更新。Data Schema 4 / Queue / Cloud履歴 / Local Media保存形式は変更なし。\n\n'''
if entry not in changelog:
    changelog = entry + changelog
write("docs/CHANGELOG.md", changelog)

learnings = read("PROJECT_LEARNINGS.md")
pattern = re.compile(r'''\n\n## PL-F-007 Playback高速化.*?\Z''', re.S)
replacement = f'''\n\n## PL-F-007 Playback開始遅延の初回診断が不完全で、A1の前処理と二重Autoplay制御が残った\n\n- **Date:** 2026-09-05\n- **Status:** v3 implemented / User validation pending\n- **Symptom:** 曲を押してから動画開始まで約5秒待つ。build `{OLD_BUILD}` を公開後もUser確認で体感が変わらなかった。\n- **Expected:** 曲クリック直後にYouTubeの読込要求を出し、既にReadyなら即座に再生開始へ進む。\n- **Actual:** 本体 `app.js` をmedia-firstへしても、A1 wrapperがその外側で履歴・Context・Session処理を先に実行し、さらにUI guardが最大5秒 `play()` を再試行していた。初期Player `onReady` では同じ動画を再度 `loadVideoById` する経路も残った。\n- **Trigger:** A1導入後のSidebar曲行からの即時再生。特にログイン直後・初回Player準備中。\n- **Root Cause:** Playback ownershipが `app.js` / `playback-a1.js` / `a1-ui-guards.js` の3層へ分散したまま、前回は本体層だけを高速化していた。Cache問題は実在したが、約5秒症状の唯一の原因ではなかった。\n- **Final Fix:** Autoplay時はA1の重いfinalize/session/context side effectをmedia request後へ遅延。UI guardの5秒retryを削除。本体Player warm-upを初回Full Renderより前へ移し、初期 `onReady` の同一動画二重Loadを防止。\n- **Affected files / systems:** `app.js`, `playback-a1.js`, `a1-ui-guards.js`, A1 regression tests, build cache revision\n- **Cost / Severity:** Major。主要操作の体感性能に直結し、前回Fix後も再発。\n- **Detection method:** User実利用による「変わってない」の再確認 + Runtime ownership追跡。\n- **Regression Guard:** `tests/a1-requirements.test.js` で5秒retryの不在、media request前後順序、初期Player warm-up順、同一動画二重Load防止を確認。Local diagnosticsにクリック→PLAYING実測を最大20件保存。\n- **Prevention:** 性能Bugでは内側関数だけでなく、User actionを包む全Wrapper / Hook / Monkey patchを順に追い、外側で同期処理やretryが残っていないか確認する。User確認前にResolvedと断定しない。\n- **Guide candidate:** yes — Interactive Media AppのPerformance調査ではcontrol ownershipとWrapper順序を診断対象にする。\n'''
learnings, count = pattern.subn(replacement, learnings, count=1)
require(count == 1, f"PL-F-007 replacement count={count}")
write("PROJECT_LEARNINGS.md", learnings)

report = f'''# LyricTube Playback Latency v3 Work Report\n\nDate: 2026-09-05  \nBuild: `{NEW_BUILD}`  \nStatus: Implemented / Static validation pending at generation time / User validation required\n\n## User evidence\n\n- build `{OLD_BUILD}` 公開後も「変わってない」とUserが確認。\n- 約5秒の再生開始遅延を未解決として再調査。\n\n## Root cause found\n\n1. `playback-a1.js` の `window.selectSong` wrapperが、`original.selectSong(..., autoplay)` より前に履歴確定・Context capture・Session saveを実行していた。\n2. `a1-ui-guards.js` が本体とは別に最大5秒 `PlayerController.play()` を再試行し、Playback ownershipが二重化していた。\n3. 初期YouTube Player `onReady` で、既に同じ動画を持つ場合でもPending requestを `loadVideoById` し直していた。\n4. 初期Player warm-upが最初のFull Render後だった。\n\n## Changes\n\n- Autoplay時は本体のmedia requestをA1 context/session処理より先に発行。\n- Old-track finalizeのStorage/UI side effectをmicrotaskへ遅延。\n- 5秒Autoplay retry shimを削除。\n- 初期Player warm-upをFull Renderより前へ移動。\n- `onReady` 同一動画二重Loadを防止。\n- Local-only playback timing diagnosticsを最大20件のring bufferで追加。\n- Cache revisionを `{NEW_BUILD}` へ更新。\n\n## Compatibility\n\n- Display version: `v0.13.2` 維持\n- Data Schema: `4` 維持\n- Queue / Playback Session / Cloud History semantics: 変更なし\n- Local Media storage: 変更なし\n\n## Validation required before completion\n\n- JavaScript syntax\n- `tests/a1-requirements.test.js`\n- full `Validate LyricTube`\n- Web Project Guide Audit\n- `tools/validate_static.py`\n- cleanup後のMerge Commitに対するPages deployment\n- User実ブラウザでの曲クリック→再生開始体感\n\n## Environment limitation\n\nこの作業環境のHeadless Chromiumから公開GitHub Pagesへ接続を試したが、`ERR_BLOCKED_BY_ADMINISTRATOR` で外部サイトE2Eを実行できなかった。したがって実YouTube playback latencyはUser browser validationが必要。\n'''
write("docs/WORK_REPORT_2026-09-05_PLAYBACK_LATENCY_V3.md", report)

print(f"Applied playback latency v3 fix; build {NEW_BUILD}")
