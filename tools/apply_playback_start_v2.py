from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_BUILD = "20260903-1"
NEW_BUILD = "20260905-2"


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


# app.js: move autoplay media work ahead of full render and keep the latest
# YouTube load request until the iframe player is actually ready.
app = read("app.js")
if "let pendingYoutubeRequest = null;" not in app:
    app = replace_once(
        app,
        "let ytPlayer = null;\nlet ytReady = false;\n",
        "let ytPlayer = null;\nlet ytReady = false;\nlet pendingYoutubeRequest = null;\nlet youtubeRequestGeneration = 0;\n",
        "YouTube request state",
    )

selection_pattern = re.compile(
    r"function selectSong\(id,autoplay=false\)\{.*?\n\}\n\n\nfunction selectedLocalMediaStatus",
    re.S,
)
selection_replacement = r'''function makeYoutubeRequest(v,autoplay=false){
  return{
    generation:++youtubeRequestGeneration,
    videoId:String(v?.videoId||""),
    startSeconds:Math.max(0,Number(v?.startTime)||0),
    autoplay:Boolean(autoplay)
  };
}
function clearPendingYoutubeRequest(){
  youtubeRequestGeneration+=1;
  pendingYoutubeRequest=null;
}
function applyPendingYoutubeRequest(request=pendingYoutubeRequest){
  if(!request?.videoId||!ytPlayer||!ytReady)return false;
  if(pendingYoutubeRequest&&request.generation!==pendingYoutubeRequest.generation)return false;
  const selected=getVersion();
  if(!selected?.videoId||String(selected.videoId)!==String(request.videoId))return false;
  const arg={videoId:request.videoId,startSeconds:request.startSeconds};
  try{
    request.autoplay?ytPlayer.loadVideoById(arg):ytPlayer.cueVideoById(arg);
    if(pendingYoutubeRequest?.generation===request.generation)pendingYoutubeRequest=null;
    return true;
  }catch(error){
    console.warn("[LyricTube] YouTube request failed",error);
    return false;
  }
}
function selectSong(id,autoplay=false){
  selectedSongId=id;
  const song=getSong();
  selectedVersionId=song?.versions[0]?.id||null;
  beginLyricVideoSwitch();
  if(autoplay){
    // Issue the media request in the click task before rebuilding Library/Browse/Lyrics.
    loadSelectedVideo(true);
    const targetSongId=String(id||"");
    requestAnimationFrame(()=>{
      if(String(selectedSongId||"")===targetSongId)renderAll();
    });
    return;
  }
  renderAll();
  loadSelectedVideo(false);
}
function selectVersion(id,autoplay=false){selectedVersionId=id;beginLyricVideoSwitch();renderSelectedSong();renderLibrary();loadSelectedVideo(autoplay)}
function loadSelectedVideo(autoplay=false){
  const v=getVersion();
  beginLyricVideoSwitch();
  if(v?.source==="localmedia"){
    clearPendingYoutubeRequest();
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
    clearPendingYoutubeRequest();
    els.playerPlaceholder.classList.remove("hidden");
    lyricVideoSwitchPending=false;
    resetLyricsViewport();
    return;
  }
  els.playerPlaceholder.classList.add("hidden");
  const request=makeYoutubeRequest(v,autoplay);
  pendingYoutubeRequest=request;
  if(ytReady&&ytPlayer){
    applyPendingYoutubeRequest(request);
  }else if(window.YT?.Player&&!ytPlayer){
    createYoutubePlayer(request.videoId);
  }else{
    loadYoutubeApi();
  }
}

function selectedLocalMediaStatus'''
app, count = selection_pattern.subn(selection_replacement, app, count=1)
require(count == 1, f"selection/load block: expected one replacement, found {count}")

player_pattern = re.compile(
    r"function createYoutubePlayer\(videoId\)\{.*?\nfunction markPlayed\(\)",
    re.S,
)
player_replacement = r'''function createYoutubePlayer(videoId){
  if(!window.YT?.Player||ytPlayer)return;
  const v=getVersion();
  const initial=pendingYoutubeRequest;
  const initialVideoId=String(initial?.videoId||videoId||v?.videoId||"");
  if(!initialVideoId)return;
  ytReady=false;
  ytPlayer=new YT.Player("player",{
    width:"100%",
    height:"100%",
    videoId:initialVideoId,
    playerVars:{
      playsinline:1,
      rel:0,
      start:Math.floor(Number(initial?.startSeconds??v?.startTime)||0),
      autoplay:initial?.autoplay?1:0,
      origin:window.location.origin
    },
    events:{
      onReady:()=>{
        ytReady=true;
        try{ytPlayer.setVolume?.(clamp(Number(library.settings.volume??80),0,100))}catch{}
        const pending=pendingYoutubeRequest;
        if(pending?.videoId){
          applyPendingYoutubeRequest(pending);
        }else{
          const current=getVersion();
          const playerId=playerVideoIdSafe();
          if(current?.videoId&&playerId!==String(current.videoId)){
            try{ytPlayer.cueVideoById({videoId:current.videoId,startSeconds:Number(current.startTime)||0})}catch{}
          }
        }
        resetLyricsViewport();
        updateBottomPlayer();
      },
      onStateChange:e=>{
        if(e.data===1){
          const currentId=playerVideoIdSafe();
          if(pendingYoutubeRequest?.videoId===currentId)pendingYoutubeRequest=null;
          markPlayed();
        }
        if(e.data===0)handleTrackEnd("youtube");
        updateBottomPlayer();
      },
      onError:e=>showToast(e.data===101||e.data===150?"この動画は投稿者の設定でサイト内再生できません。":"YouTube動画を再生できませんでした。")
    }
  });
}
window.onYouTubeIframeAPIReady=()=>{
  const v=getVersion();
  const requested=pendingYoutubeRequest?.videoId||v?.videoId||"";
  if(requested)createYoutubePlayer(requested);
};
function loadYoutubeApi(){
  if(window.YT?.Player){window.onYouTubeIframeAPIReady();return}
  if(document.querySelector('script[src*="youtube.com/iframe_api"]'))return;
  const s=document.createElement("script");
  s.src="https://www.youtube.com/iframe_api";
  s.async=true;
  s.dataset.lyrictubeYoutubeApi="";
  document.head.appendChild(s);
}
function markPlayed()'''
app, count = player_pattern.subn(player_replacement, app, count=1)
require(count == 1, f"YouTube player block: expected one replacement, found {count}")
write("app.js", app)

# A1 UI guard: preload the YouTube IFrame API while the login gate is still open.
ui = read("a1-ui-guards.js")
ui = re.sub(
    r"  function warmYoutubeConnections\(\) \{.*?\n  \}\n\n  function visibleSongs",
    '''  function warmYoutubeConnections() {
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

  function visibleSongs''',
    ui,
    count=1,
    flags=re.S,
)
require('data-lyrictube-early-youtube-api' not in ui, "unexpected HTML-style data marker")
require('script.dataset.lyrictubeEarlyYoutubeApi' in ui, "early YouTube API preload was not installed")
write("a1-ui-guards.js", ui)

# Cache revision: this change must be immediately distinguishable from the
# previous published JavaScript URLs, otherwise GitHub Pages/browser caching can
# keep serving the old playback code.
for path in ["version.js", "index.html", "site-shell.js", "README.md"]:
    text = read(path)
    require(OLD_BUILD in text, f"{path}: old build marker not found")
    write(path, text.replace(OLD_BUILD, NEW_BUILD))

defaults_path = ROOT / "data/defaults.json"
defaults = json.loads(defaults_path.read_text(encoding="utf-8"))
require(defaults.get("buildRevision") == OLD_BUILD, "data/defaults.json: unexpected buildRevision")
defaults["buildRevision"] = NEW_BUILD
defaults_path.write_text(json.dumps(defaults, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# Regression guard: keep the performance contract in the existing A1 test that CI already runs.
test = read("tests/a1-requirements.test.js")
if 'const app = fs.readFileSync("app.js", "utf8");' not in test:
    test = replace_once(
        test,
        'const ui = fs.readFileSync("a1-ui-guards.js", "utf8");\n',
        'const ui = fs.readFileSync("a1-ui-guards.js", "utf8");\nconst app = fs.readFileSync("app.js", "utf8");\n',
        "A1 test app import",
    )
old_asserts = '''// Autoplay selections must issue media work before the expensive full rerender.
assert(ui.includes('function runAutoplaySelectionFirst'), "fast autoplay selection path missing");
assert(ui.includes('window.renderAll = () => { renderRequested = true; }'), "full render must be deferrable during autoplay selection");
assert(ui.includes('scheduleDeferredFullRender()'), "deferred visual refresh missing");
assert(ui.includes('requestAnimationFrame'), "autoplay render should yield before full visual rebuild");
assert(ui.includes('function ensureAutoplayStarted'), "YouTube readiness follow-up missing");
assert(ui.includes('core.play?.()'), "pending autoplay must retry through the player controller");
assert(ui.includes('maxWaitMs = 5000'), "pending autoplay retries need a bounded timeout");
assert(ui.includes('https://www.youtube.com'), "YouTube preconnect is missing");
assert(ui.includes('https://i.ytimg.com'), "thumbnail origin preconnect is missing");
'''
new_asserts = '''// Autoplay selections must issue media work before the expensive full rerender,
// and a click made while the YouTube iframe is still booting must not be lost.
assert(app.includes('loadSelectedVideo(true);'), "autoplay selection must request media immediately");
assert(app.includes('requestAnimationFrame(()=>{'), "full visual render must yield until after the media request");
assert(app.includes('let pendingYoutubeRequest = null'), "pending YouTube request state missing");
assert(app.includes('function applyPendingYoutubeRequest'), "pending YouTube request replay missing");
assert(app.includes('pendingYoutubeRequest=request'), "latest YouTube selection must be retained while player is not ready");
assert(app.includes('autoplay:initial?.autoplay?1:0'), "initial iframe creation must preserve autoplay intent");
assert(app.includes('if(document.querySelector(\'script[src*="youtube.com/iframe_api"]\'))return;'), "duplicate YouTube API loads must be prevented");
assert(ui.includes('script.src = "https://www.youtube.com/iframe_api"'), "YouTube API must warm during the access gate");
assert(ui.includes('https://www.youtube.com'), "YouTube preconnect is missing");
assert(ui.includes('https://i.ytimg.com'), "thumbnail origin preconnect is missing");
'''
require(old_asserts in test, "old playback-start A1 assertions not found")
test = test.replace(old_asserts, new_asserts, 1)
write("tests/a1-requirements.test.js", test)

# Changelog / learnings / work report.
changelog = read("docs/CHANGELOG.md")
entry = f'''## v0.13.2 Playback start latency follow-up / build {NEW_BUILD}（2026-09-05）\n\n- YouTube IFrame APIをAccess Gate表示中から先行読み込みし、ログイン後の初回Player準備待ちを短縮。\n- 曲行の即時再生では、Library / Browse / LyricsのFull Renderより先に動画読込要求を発行。\n- Player準備中のクリックは最新のYouTube requestとして保持し、`onReady`で選択中の動画へ適用する。\n- YouTube API scriptの二重挿入を防止。\n- Cache revisionを `{NEW_BUILD}` へ更新し、前BuildのJSが残る問題を解消。\n- Data Schema 4 / Queue / Session / Cloud履歴 / Local Media保存形式は変更なし。\n\n'''
if entry not in changelog:
    changelog = entry + changelog
write("docs/CHANGELOG.md", changelog)

learnings = read("PROJECT_LEARNINGS.md")
learning = f'''\n\n## PL-F-007 Playback高速化を同一Cache revisionで配信し、初回YouTube requestも保持していなかった\n\n- **Date:** 2026-09-05\n- **Status:** Resolved\n- **Symptom:** 曲を押してから動画開始まで約5秒待つ体感が残った。\n- **Root cause:** 高速化Patchを入れてもBuild revisionを更新しておらず、GitHub Pages / Browser cacheで旧JSが残り得た。さらにYouTube IFrame PlayerがReadyになる前のAutoplay要求をPlayer本体が保持していなかった。\n- **Fix:** Cache revisionを `{NEW_BUILD}` へ更新。YouTube APIをAccess Gate中から先行ロードし、最新の動画Requestを保持してPlayer `onReady`で適用する。曲選択時はFull Renderより先に動画読込を開始する。\n- **Regression guard:** `tests/a1-requirements.test.js` と `tools/validate_static.py` でpending request / early API warm / build revision整合を確認。\n- **Prevention:** 公開済みRuntimeの性能・挙動を変える場合は、コード変更だけでなくCache revisionまで同じ変更単位で更新する。初期化待ちの外部PlayerではUser Intentを明示的に保持する。\n'''
if "## PL-F-007 Playback高速化" not in learnings:
    learnings += learning
write("PROJECT_LEARNINGS.md", learnings)

report = read("docs/WORK_REPORT_2026-09-05_PLAYBACK_START.md")
followup = f'''\n\n## Follow-up — 約5秒待ちが残った件\n\nユーザー実機で約5秒の待ちが残ったため、初回修正を再調査した。\n\n追加で確認した原因:\n\n1. 前回の高速化後もBuild revisionが `{OLD_BUILD}` のままで、公開サイトが同じasset URLを使い続けていた。\n2. YouTube IFrame API / Playerの初期化前に押されたAutoplay要求は、`loadSelectedVideo()`内でPlayerがReadyでないとその場では適用されず、後段のRetryに依存していた。\n\n追加修正:\n\n- Build revisionを `{NEW_BUILD}` へ更新。\n- Access Gate表示中からYouTube IFrame APIを先行ロード。\n- 最新のYouTube動画Requestを保持し、Player `onReady`で適用。\n- Autoplay曲選択はFull Render前に動画要求を発行。\n- YouTube API scriptの二重読み込みを防止。\n\nこれによりLyricTube側で発生していた「初期化待ち + stale cache + render先行」の待ちを削減する。YouTube CDN側の実際のbuffering時間そのものはFrontendから保証できない。\n'''
if "## Follow-up — 約5秒待ちが残った件" not in report:
    report += followup
write("docs/WORK_REPORT_2026-09-05_PLAYBACK_START.md", report)

print(f"Applied playback start v2 fix and cache revision {NEW_BUILD}")
