from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_VERSION = "v0.13.0"
NEW_VERSION = "v0.13.1"
OLD_BUILD = "20260830-5"
NEW_BUILD = "20260830-6"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_function(text: str, name: str, replacement: str) -> str:
    start = text.find(f"function {name}(")
    if start < 0:
        raise RuntimeError(f"function not found: {name}")
    brace = text.find("{", start)
    if brace < 0:
        raise RuntimeError(f"opening brace not found: {name}")
    depth = 0
    quote = None
    escape = False
    i = brace
    while i < len(text):
        ch = text[i]
        if quote:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == quote:
                quote = None
        else:
            if ch in ('"', "'", '`'):
                quote = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return text[:start] + replacement.rstrip() + text[i + 1:]
        i += 1
    raise RuntimeError(f"closing brace not found: {name}")


# ---- app.js: route all playback operations through core/player-controller.js ----
app = read("app.js")

current_player_block = '''const playerController=window.LyricTubePlayer;
if(!playerController)throw new Error("core/player-controller.js is required before app.js");
function ensureYoutubePlayerAdapter(){
  if(playerController.has("youtube"))return;
  playerController.register("youtube",{
    available:()=>Boolean(ytPlayer?.getCurrentTime),
    play:()=>{if(!ytPlayer?.playVideo)return false;try{ytPlayer.playVideo();return true}catch{return false}},
    pause:()=>{if(!ytPlayer?.pauseVideo)return false;try{ytPlayer.pauseVideo();return true}catch{return false}},
    seek:target=>{if(!ytPlayer?.seekTo)return false;try{ytPlayer.seekTo(Math.max(0,Number(target)||0),true);return true}catch{return false}},
    currentTime:()=>{try{return Number(ytPlayer?.getCurrentTime?.())||0}catch{return 0}},
    duration:()=>{try{return Number(ytPlayer?.getDuration?.())||0}catch{return 0}},
    state:()=>{try{return Number(ytPlayer?.getPlayerState?.())}catch{return -1}}
  });
}
function syncPlayerAdapter(v=getVersion()){
  ensureYoutubePlayerAdapter();
  const wanted=v?.source==="localmedia"?"localmedia":"youtube";
  if(playerController.has(wanted))playerController.activate(wanted);
  else playerController.activate("youtube");
  return playerController;
}
function mainPlayerAvailable(){return Boolean(syncPlayerAdapter().available())}
function currentPlayerTime(){return syncPlayerAdapter().currentTime()}
ensureYoutubePlayerAdapter();'''
app = replace_function(app, "currentPlayerTime", current_player_block)

load_selected = '''function loadSelectedVideo(autoplay=false){
  const v=getVersion();
  beginLyricVideoSwitch();
  if(v?.source==="localmedia"){
    syncPlayerAdapter(v);
    try{ytPlayer?.pauseVideo?.()}catch{}
    els.playerPlaceholder.classList.add("hidden");
    resetLyricsViewport();
    const result=window.LyricTubeLocalMedia?.activateCurrent?.(autoplay);
    if(result?.then){
      result.then(()=>{lyricVideoSwitchPending=false}).catch(error=>{
        console.warn("[LyricTube] local media activation failed",error);
        lyricVideoSwitchPending=false;
      });
    }else{
      lyricVideoSwitchPending=false;
    }
    return result;
  }
  window.LyricTubeLocalMedia?.deactivate?.();
  syncPlayerAdapter(v);
  if(!v?.videoId){
    els.playerPlaceholder.classList.remove("hidden");
    lyricVideoSwitchPending=false;
    resetLyricsViewport();
    return;
  }
  els.playerPlaceholder.classList.add("hidden");
  const start=Math.max(0,Number(v.startTime)||0);
  if(ytReady&&ytPlayer){
    const arg={videoId:v.videoId,startSeconds:start};
    try{autoplay?ytPlayer.loadVideoById(arg):ytPlayer.cueVideoById(arg)}catch{}
  }else if(window.YT?.Player&&!ytPlayer){
    createYoutubePlayer(v.videoId);
  }
}'''
app = replace_function(app, "loadSelectedVideo", load_selected)

app = replace_function(app, "playMainPlayback", '''function playMainPlayback(){
  return Boolean(syncPlayerAdapter().play());
}''')
app = replace_function(app, "pauseMainPlayback", '''function pauseMainPlayback(){
  return Boolean(syncPlayerAdapter().pause());
}''')
app = replace_function(app, "seekMainPlayback", '''function seekMainPlayback(target,{autoplay=false}={}){
  const ok=Boolean(syncPlayerAdapter().seek(Math.max(0,Number(target)||0)));
  if(ok&&autoplay)playMainPlayback();
  return ok;
}''')
app = replace_function(app, "enforcePlaybackRules", '''function enforcePlaybackRules(){
  const v=getVersion();
  if(!v||playerStateSafe()!==1)return;
  const t=currentPlayerTime();
  if(v.autoSkip!==false){
    const seg=(v.skipSegments||[]).find(s=>s.enabled!==false&&t>=Number(s.start)&&t<Number(s.end)-.08);
    if(seg){seekMainPlayback(Number(seg.end)+.02);return}
  }
  if(v.endTime!==null&&Number(v.endTime)>Number(v.startTime||0)&&t>=Number(v.endTime)-.08){
    handleTrackEnd("range");
  }
}''')
app = replace_function(app, "playerDurationSafe", '''function playerDurationSafe(){return syncPlayerAdapter().duration()}''')
app = replace_function(app, "playerStateSafe", '''function playerStateSafe(){return syncPlayerAdapter().state()}''')
app = replace_function(app, "toggleMainPlayback", '''function toggleMainPlayback(){
  syncPlayerAdapter().toggle();
  setTimeout(updateBottomPlayer,50);
}''')
app = replace_function(app, "getPlayerDuration", '''function getPlayerDuration(){return playerDurationSafe()}''')
app = replace_function(app, "seekSyncPlayer", '''function seekSyncPlayer(sec){
  const dur=getPlayerDuration();
  const target=dur>0?clamp(Number(sec)||0,0,dur):Math.max(0,Number(sec)||0);
  seekMainPlayback(target);
}''')
app = replace_function(app, "toggleSyncPlayback", '''function toggleSyncPlayback(){
  playerStateSafe()===1?pauseMainPlayback():playMainPlayback();
  updateSyncTransport();
}''')

old_state = '''  let state=-1;
  try{state=ytPlayer?.getPlayerState?.()??-1}catch{}
  els.syncPlayPauseBtn.textContent=state===1?"一時停止":"再生";'''
new_state = '''  const state=playerStateSafe();
  els.syncPlayPauseBtn.textContent=state===1?"一時停止":"再生";'''
if old_state not in app:
    raise RuntimeError("sync transport state block not found")
app = app.replace(old_state, new_state, 1)

old_guard = 'if(!ytPlayer?.getCurrentTime)return showToast("動画を再生してから押してください。");'
if app.count(old_guard) < 2:
    raise RuntimeError("expected YouTube-only range guards not found")
app = app.replace(old_guard, 'if(!mainPlayerAvailable())return showToast("再生できる動画・端末ファイルを選んでください。");')

old_bottom_seek = '  els.bottomSeek.disabled=!v?.videoId;'
new_bottom_seek = '''  const localStatus=selectedLocalMediaStatus(song,v);
  els.bottomSeek.disabled=!(v?.videoId||(localStatus?.local&&localStatus.linked));
  if(localStatus?.local&&localStatus.linked){
    const label=localStatus.kind==="video"?"端末動画":"端末音源";
    els.bottomArtist.textContent=`${song.artist||"原曲アーティスト未設定"} · ${label}`;
  }'''
if old_bottom_seek not in app:
    raise RuntimeError("bottom seek source guard not found")
app = app.replace(old_bottom_seek, new_bottom_seek, 1)

old_playing_state = '''function updatePlayingState(){
  try{
    const playing=ytPlayer?.getPlayerState?.()===1;
    document.body.classList.toggle('is-playing',!!playing);
  }catch{}
}'''
new_playing_state = '''function updatePlayingState(){
  document.body.classList.toggle('is-playing',playerStateSafe()===1);
}'''
if old_playing_state not in app:
    raise RuntimeError("playing state block not found")
app = app.replace(old_playing_state, new_playing_state, 1)

# Last-song deletion should also stop whichever source is active.
app = app.replace('    else try{ytPlayer?.stopVideo?.()}catch{}', '    else pauseMainPlayback();')
write("app.js", app)

# ---- local-media.js: register an adapter and remove playback monkey-patching ----
local = read("local-media.js")

# Remove obsolete playback-original variables while keeping two dialog hooks.
var_start = local.find("  let patched = false;")
var_end = local.find("\n\n  const audio = document.createElement", var_start)
if var_start < 0 or var_end < 0:
    raise RuntimeError("local media patch variable block not found")
local_vars = '''  let dialogsPatched = false;
  let lastUiTick = 0;
  let initialized = false;
  let originalOpenSongDialog = null;
  let originalOpenVersionDialog = null;'''
local = local[:var_start] + local_vars + local[var_end:]

# Local play button can delegate to the controller when the current source is not local.
local = replace_function(local, "togglePlayback", '''function togglePlayback(){
    const el=currentMedia();
    if(!isLocalMediaVersion(currentVersion()))return window.LyricTubePlayer?.toggle?.();
    if(!el){toast("この端末にMP3 / MP4を登録してください。");return false}
    if(el.paused)el.play().catch(()=>toast("再生できませんでした。ファイル形式を確認してください。"));
    else el.pause();
    return true;
  }''')

# Remove the duplicate local playback-rules function; app.js now owns range/skip rules.
rule_start = local.find("  function applyPlaybackRules() {")
if rule_start >= 0:
    rule_end_marker = "  function togglePlayback() {"
    rule_end = local.find(rule_end_marker, rule_start)
    if rule_end < 0:
        raise RuntimeError("local applyPlaybackRules end not found")
    local = local[:rule_start] + local[rule_end:]
local = local.replace("        applyPlaybackRules();\n", "")

# Replace the old 12-function playback patch with only the two dialog compatibility hooks.
local = replace_function(local, "patchPlayback", '''function patchDialogs(){
    if(dialogsPatched)return;
    dialogsPatched=true;
    originalOpenSongDialog=openSongDialog;
    originalOpenVersionDialog=openVersionDialog;

    openSongDialog=function(song=null){
      const result=originalOpenSongDialog(song);
      if(!song)switchSongSource("youtube",true);
      return result;
    };
    openVersionDialog=function(version=null){
      const result=originalOpenVersionDialog(version);
      switchVersionSource(version?.source==="localmedia"?"local":"youtube",true);
      if(version?.source==="localmedia"){
        const row=records.get(keyFor(currentSong(),version));
        const status=$("versionLocalMediaStatus");
        if(status)status.textContent=row?`登録済み: ${row.fileName}`:"この端末にはファイルがありません。必要なら再登録してください。";
      }
      return result;
    };
  }''')
local = local.replace("    patchPlayback();", "    patchDialogs();", 1)

# activateLocalMedia chooses the local adapter; switching away is handled by app.js.
needle = '''  async function activateLocalMedia(autoplay = false) {
    const song = currentSong();
    const version = currentVersion(song);
    if (!song || !isLocalMediaVersion(version)) return false;'''
replacement = '''  async function activateLocalMedia(autoplay = false) {
    const song = currentSong();
    const version = currentVersion(song);
    if (!song || !isLocalMediaVersion(version)) return false;
    window.LyricTubePlayer?.activate?.("localmedia");'''
if needle not in local:
    raise RuntimeError("activateLocalMedia header not found")
local = local.replace(needle, replacement, 1)

# Register adapter before publishing the Local Media public API.
api_marker = "  window.LyricTubeLocalMedia = Object.freeze({"
if api_marker not in local:
    raise RuntimeError("Local Media public API marker not found")
adapter_block = '''  function registerPlayerAdapter(){
    const player=window.LyricTubePlayer;
    if(!player||player.has("localmedia"))return;
    player.register("localmedia",{
      available:()=>Boolean(currentMedia()),
      play:()=>{
        const el=currentMedia();
        if(!el){toast("この端末にMP3 / MP4を登録してください。");return false}
        el.play().catch(()=>toast("再生できませんでした。ファイル形式を確認してください。"));
        return true;
      },
      pause:()=>{const el=currentMedia();if(!el)return false;el.pause();return true},
      seek:target=>seekLocal(target),
      currentTime:()=>{const el=currentMedia();return el?Number(el.currentTime)||0:0},
      duration:()=>{const el=currentMedia();return el?Number(el.duration)||0:0},
      state:()=>{const el=currentMedia();return el?(el.paused?2:1):-1}
    });
  }
  registerPlayerAdapter();

'''
local = local.replace(api_marker, adapter_block + api_marker, 1)

# Expose activation/deactivation so app.js owns source switching directly.
api_tail = '''    state() { const el = currentMedia(); return el ? (el.paused ? 2 : 1) : -1; },
    refreshStorage: updateStorageSummary,
    relinkCurrent: relinkCurrentFile,
  });'''
api_tail_new = '''    state() { const el = currentMedia(); return el ? (el.paused ? 2 : 1) : -1; },
    activateCurrent: activateLocalMedia,
    deactivate: stopLocalMedia,
    refreshStorage: updateStorageSummary,
    relinkCurrent: relinkCurrentFile,
  });'''
if api_tail not in local:
    raise RuntimeError("Local Media API tail not found")
local = local.replace(api_tail, api_tail_new, 1)
write("local-media.js", local)

# ---- version/build/runtime load order ----
for path in [
    "app.js", "site-shell.js", "profile-data.js", "cloud-sync.js", "lyrics-providers.js",
    "local-media.js", "tags.js", "library-schema.js", "sync-interpolation.js"
]:
    text = read(path).replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD)
    write(path, text)

write("version.js", read("version.js").replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD))

defaults_path = ROOT / "data/defaults.json"
defaults = json.loads(defaults_path.read_text(encoding="utf-8"))
defaults["appVersion"] = NEW_VERSION
defaults["buildRevision"] = NEW_BUILD
defaults_path.write_text(json.dumps(defaults, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

index = read("index.html").replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD)
needle = f'  <script src="core/runtime-hooks.js?v={NEW_BUILD}"></script>\n  <script src="library-schema.js?v={NEW_BUILD}"></script>'
replacement = f'  <script src="core/runtime-hooks.js?v={NEW_BUILD}"></script>\n  <script src="core/player-controller.js?v={NEW_BUILD}"></script>\n  <script src="library-schema.js?v={NEW_BUILD}"></script>'
if needle not in index:
    raise RuntimeError("player controller insertion point not found")
index = index.replace(needle, replacement, 1)
write("index.html", index)

validator = read("tools/validate_static.py")
needle = '    "core/runtime-hooks.js",\n    "library-schema.js",'
replacement = '    "core/runtime-hooks.js",\n    "core/player-controller.js",\n    "library-schema.js",'
if needle not in validator:
    raise RuntimeError("validator player insertion point not found")
validator = validator.replace(needle, replacement, 1)
write("tools/validate_static.py", validator)

# ---- regression guards ----
guards = read("tests/runtime-guards.test.js")
guards = guards.replace('assert(version.includes(\'version: "v0.13.0"\'), "expected v0.13.0");', 'assert(version.includes(\'version: "v0.13.1"\'), "expected v0.13.1");')
extra = '''\nassert(app.includes("window.LyricTubePlayer"), "app must use the player controller");
assert(app.includes('playerController.register("youtube"'), "YouTube must register as a player adapter");
assert(local.includes('player.register("localmedia"'), "Local Media must register as a player adapter");
assert(!local.includes("originalCurrentPlayerTime"), "Local Media must not patch currentPlayerTime");
assert(!local.includes("originalPlayerDurationSafe"), "Local Media must not patch player duration");
assert(!local.includes("originalToggleMainPlayback"), "Local Media must not patch main playback");
assert(!local.includes("originalEnforcePlaybackRules"), "Local Media must not patch playback rules");
assert(!local.includes("function patchPlayback"), "legacy Local Media playback patch must be removed");
const index2 = read("index.html");
assert(index2.includes("core/player-controller.js"), "index must load player controller");
'''
marker = 'console.log("runtime regression guards passed");'
if marker not in guards:
    raise RuntimeError("runtime guard ending not found")
guards = guards.replace(marker, extra + "\n" + marker, 1)
write("tests/runtime-guards.test.js", guards)

# ---- docs ----
readme = read("README.md").replace("**Current version: v0.13.0**", f"**Current version: {NEW_VERSION}**").replace("**Build: 20260830-5**", f"**Build: {NEW_BUILD}**")
readme = readme.replace("├─ core/runtime-hooks.js     拡張機能用Hook / Filter基盤", "├─ core/runtime-hooks.js     拡張機能用Hook / Filter基盤\n├─ core/player-controller.js YouTube / Local Media共通再生API")
readme = readme.replace("今後も同じ手順でPlayer / UIを段階分割します。", "v0.13.1ではPlayer Controllerも分離し、YouTube / Local Mediaの再生操作を共通化しました。次はUI / Dialogを段階分割します。")
readme = readme.replace("- 表示: `v0.13.0`", f"- 表示: `{NEW_VERSION}`").replace("- Build: `20260830-5`", f"- Build: `{NEW_BUILD}`")
write("README.md", readme)

arch = read("docs/ARCHITECTURE.md").replace("LyricTube v0.13.0 の現行構成です。", f"LyricTube {NEW_VERSION} の現行構成です。")
arch = arch.replace("3. `core/runtime-hooks.js`\n4. `library-schema.js`", "3. `core/runtime-hooks.js`\n4. `core/player-controller.js`\n5. `library-schema.js`")
arch = arch.replace("4. `library-schema.js`\n5. `sync-interpolation.js`\n6. `profile-data.js`", "5. `library-schema.js`\n6. `sync-interpolation.js`\n7. `profile-data.js`")
arch = arch.replace("7. `cloud-sync.js`\n8. `site-shell.js`\n9. `lyrics-providers.js`\n10. `local-media.js`\n11. `tags.js`\n12. ログイン / ゲスト確定後に `site-shell.js` が `app.js` を読み込む", "8. `cloud-sync.js`\n9. `site-shell.js`\n10. `lyrics-providers.js`\n11. `local-media.js`\n12. `tags.js`\n13. ログイン / ゲスト確定後に `site-shell.js` が `app.js` を読み込む")
arch = arch.replace("### library-schema.js", "### core/player-controller.js\n\n- YouTube / Local Media共通の `play / pause / seek / currentTime / duration / state`\n- Source切替をAdapterとして管理\n- Local Mediaによる再生関数の大量上書きを廃止\n\n### library-schema.js")
arch = arch.replace("4. Player controller", "4. ~~Player controller~~ — v0.13.1で完了")
write("docs/ARCHITECTURE.md", arch)

entry = f'''## {NEW_VERSION} Player Controller移行（2026-08-30）\n\n- `core/player-controller.js` を追加。\n- YouTube / Local Mediaを同じ再生契約へ統合。\n- Local Mediaが `currentPlayerTime / duration / state / toggle / seek / restart / playback rules / bottom player` を後から上書きする構造を撤去。\n- Local Media側に残す互換Patchは曲追加・バージョン編集Dialogの2か所だけに縮小。\n- 開始/終了、スキップ、同期エディタ、キーボード操作を共通Player経路へ統一。\n- `player-controller.test.js` と回帰Guardを追加。\n- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。\n\n'''
for path in ["docs/CHANGELOG.md", "作業報告書.md"]:
    text = read(path)
    if not text.startswith(f"## {NEW_VERSION}"):
        write(path, entry + text)

print("v0.13.1 player-controller refactor applied")
