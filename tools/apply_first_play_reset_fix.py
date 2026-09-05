from pathlib import Path

app_path = Path("app.js")
app = app_path.read_text(encoding="utf-8")

old = '''function createYoutubePlayer(videoId){
  if(!window.YT?.Player||ytPlayer)return;
  const v=getVersion();
  const initial=pendingYoutubeRequest;
  const initialVideoId=String(initial?.videoId||videoId||v?.videoId||"");
  if(!initialVideoId)return;
  ytReady=false;
  ytPlayer=new YT.Player("player",{'''
new = '''function createYoutubePlayer(videoId){
  if(!window.YT?.Player||ytPlayer)return;
  const v=getVersion();
  const initial=pendingYoutubeRequest;
  const initialVideoId=String(initial?.videoId||videoId||v?.videoId||"");
  if(!initialVideoId)return;
  // If autoplay already reached BUFFERING before onReady, do not issue a
  // second playVideo() call. The duplicate command can reset the first load.
  let initialAutoplayProgressed=false;
  ytReady=false;
  ytPlayer=new YT.Player("player",{'''
if old not in app:
    raise SystemExit("createYoutubePlayer anchor not found")
app = app.replace(old, new, 1)

old = '''        if(pending?.videoId){
          if(playerId===String(pending.videoId)){
            if(pending.autoplay){try{ytPlayer.playVideo?.()}catch{}}
            if(pendingYoutubeRequest?.generation===pending.generation)pendingYoutubeRequest=null;
          }else{
            applyPendingYoutubeRequest(pending);
          }
        }else{'''
new = '''        if(pending?.videoId){
          if(playerId===String(pending.videoId)){
            // The constructor already received autoplay=1. Only use playVideo
            // as a fallback when autoplay never made playback progress.
            if(pending.autoplay&&!initialAutoplayProgressed){try{ytPlayer.playVideo?.()}catch{}}
            if(pendingYoutubeRequest?.generation===pending.generation)pendingYoutubeRequest=null;
          }else{
            applyPendingYoutubeRequest(pending);
          }
        }else{'''
if old not in app:
    raise SystemExit("onReady autoplay anchor not found")
app = app.replace(old, new, 1)

old = '''      onStateChange:e=>{
        if(e.data===1){'''
new = '''      onStateChange:e=>{
        if(initial?.autoplay&&(e.data===3||e.data===1))initialAutoplayProgressed=true;
        if(e.data===1){'''
if old not in app:
    raise SystemExit("onStateChange anchor not found")
app = app.replace(old, new, 1)
app_path.write_text(app, encoding="utf-8")

# Cache bust the public assets so the changed app.js is guaranteed to load.
for name in ["version.js", "index.html", "README.md"]:
    path = Path(name)
    text = path.read_text(encoding="utf-8")
    if "20260905-3" not in text:
        raise SystemExit(f"build anchor missing in {name}")
    path.write_text(text.replace("20260905-3", "20260905-4"), encoding="utf-8")

# Regression guard: first autoplay must not be restarted in onReady after the
# player already emitted BUFFERING/PLAYING.
test_path = Path("tests/a1-requirements.test.js")
test = test_path.read_text(encoding="utf-8")
anchor = 'assert(app.includes(\'if(playerId===String(pending.videoId))\'), "initial YouTube onReady must avoid reloading the same video");\n'
addition = anchor + 'assert(app.includes(\'let initialAutoplayProgressed=false\'), "initial YouTube autoplay progress guard missing");\nassert(app.includes(\'if(initial?.autoplay&&(e.data===3||e.data===1))initialAutoplayProgressed=true\'), "initial autoplay progress must be observed before onReady fallback");\nassert(app.includes(\'pending.autoplay&&!initialAutoplayProgressed\'), "onReady must not restart autoplay after buffering already began");\n'
if anchor not in test:
    raise SystemExit("test anchor not found")
test_path.write_text(test.replace(anchor, addition, 1), encoding="utf-8")
