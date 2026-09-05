from pathlib import Path

OLD_BUILD = "20260905-6"
NEW_BUILD = "20260906-1"

# app.js
p = Path("app.js")
text = p.read_text(encoding="utf-8")

old = '''function playerVideoIdSafe(){\n  try{return String(ytPlayer?.getVideoData?.()?.video_id||"")}catch{return""}\n}\n'''
new = '''function playerVideoIdSafe(){\n  try{return String(ytPlayer?.getVideoData?.()?.video_id||"")}catch{return""}\n}\nfunction playerEmbedHostSafe(){\n  try{return new URL(ytPlayer?.getIframe?.()?.src||"",window.location.href).hostname||""}catch{return""}\n}\n'''
if old not in text:
    raise SystemExit("playerVideoIdSafe anchor missing")
text = text.replace(old, new, 1)

old = '''  emitPlaybackDiagnosticStage("PLAYER_CREATE",{videoId:initialVideoId,autoplay:Boolean(initial?.autoplay)});\n  ytPlayer=new YT.Player("player",{\n    width:"100%",\n    height:"100%",\n    videoId:initialVideoId,\n    playerVars:{\n      playsinline:1,\n      rel:0,\n      start:Math.floor(Number(initial?.startSeconds??v?.startTime)||0),\n      autoplay:initial?.autoplay?1:0,\n      origin:window.location.origin\n    },\n    events:{\n'''
new = '''  const embedHost="https://www.youtube-nocookie.com";\n  const startSeconds=Math.floor(Number(initial?.startSeconds??v?.startTime)||0);\n  const target=document.getElementById("player");\n  if(target?.tagName!=="IFRAME"){\n    const params=new URLSearchParams({\n      enablejsapi:"1",\n      playsinline:"1",\n      rel:"0",\n      start:String(startSeconds),\n      autoplay:initial?.autoplay?"1":"0",\n      origin:window.location.origin\n    });\n    const iframe=document.createElement("iframe");\n    iframe.id="player";\n    iframe.width="100%";\n    iframe.height="100%";\n    iframe.src=`${embedHost}/embed/${encodeURIComponent(initialVideoId)}?${params.toString()}`;\n    iframe.title="YouTube video player";\n    iframe.frameBorder="0";\n    iframe.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";\n    iframe.allowFullscreen=true;\n    iframe.loading="eager";\n    iframe.referrerPolicy="strict-origin-when-cross-origin";\n    target?.replaceWith(iframe);\n  }\n  emitPlaybackDiagnosticStage("PLAYER_CREATE",{videoId:initialVideoId,autoplay:Boolean(initial?.autoplay),embedHost:"www.youtube-nocookie.com"});\n  ytPlayer=new YT.Player("player",{\n    events:{\n'''
if old not in text:
    raise SystemExit("YouTube constructor anchor missing")
text = text.replace(old, new, 1)

old = '''        emitPlaybackDiagnosticStage("PLAYER_READY",{videoId:playerVideoIdSafe(),pendingVideoId:String(pendingYoutubeRequest?.videoId||"")});\n'''
new = '''        emitPlaybackDiagnosticStage("PLAYER_READY",{videoId:playerVideoIdSafe(),pendingVideoId:String(pendingYoutubeRequest?.videoId||""),embedHost:playerEmbedHostSafe()});\n'''
if old not in text:
    raise SystemExit("PLAYER_READY anchor missing")
text = text.replace(old, new, 1)

old = '''        emitPlaybackDiagnosticStage("YT_STATE",{state:Number(e.data),videoId:playerVideoIdSafe(),loadedFraction});\n'''
new = '''        emitPlaybackDiagnosticStage("YT_STATE",{state:Number(e.data),videoId:playerVideoIdSafe(),loadedFraction,embedHost:playerEmbedHostSafe()});\n'''
if old not in text:
    raise SystemExit("YT_STATE anchor missing")
text = text.replace(old, new, 1)

old = '''        emitPlaybackDiagnosticStage("AUTOPLAY_BLOCKED",{videoId:playerVideoIdSafe()});\n'''
new = '''        emitPlaybackDiagnosticStage("AUTOPLAY_BLOCKED",{videoId:playerVideoIdSafe(),embedHost:playerEmbedHostSafe()});\n'''
if old not in text:
    raise SystemExit("AUTOPLAY_BLOCKED anchor missing")
text = text.replace(old, new, 1)

old = '''        emitPlaybackDiagnosticStage("YT_ERROR",{code:Number(e.data),videoId:playerVideoIdSafe()});\n'''
new = '''        emitPlaybackDiagnosticStage("YT_ERROR",{code:Number(e.data),videoId:playerVideoIdSafe(),embedHost:playerEmbedHostSafe()});\n'''
if old not in text:
    raise SystemExit("YT_ERROR anchor missing")
text = text.replace(old, new, 1)

p.write_text(text, encoding="utf-8")

# a1-ui-guards.js
p = Path("a1-ui-guards.js")
text = p.read_text(encoding="utf-8")
old = '''    for (const href of ["https://www.youtube.com", "https://i.ytimg.com"]) {\n'''
new = '''    for (const href of ["https://www.youtube.com", "https://www.youtube-nocookie.com", "https://i.ytimg.com"]) {\n'''
if old not in text:
    raise SystemExit("preconnect anchor missing")
text = text.replace(old, new, 1)
old = '''      if(item.hasPlayer!==undefined)extra.push(`player=${item.hasPlayer}`);\n      if(item.reason)extra.push(`reason=${item.reason}`);\n'''
new = '''      if(item.hasPlayer!==undefined)extra.push(`player=${item.hasPlayer}`);\n      if(item.embedHost)extra.push(`host=${item.embedHost}`);\n      if(item.reason)extra.push(`reason=${item.reason}`);\n'''
if old not in text:
    raise SystemExit("diagnostic host anchor missing")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")

# index.html: explicit referrer policy and earliest useful preconnects.
p = Path("index.html")
text = p.read_text(encoding="utf-8")
old = '''  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>LyricTube</title>\n'''
new = '''  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="referrer" content="strict-origin-when-cross-origin">\n  <link rel="preconnect" href="https://www.youtube.com" crossorigin>\n  <link rel="preconnect" href="https://www.youtube-nocookie.com" crossorigin>\n  <link rel="preconnect" href="https://i.ytimg.com" crossorigin>\n  <title>LyricTube</title>\n'''
if old not in text:
    raise SystemExit("index head anchor missing")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")

# Regression guards.
p = Path("tests/a1-requirements.test.js")
text = p.read_text(encoding="utf-8")
anchor = '''assert(ui.includes('https://i.ytimg.com'), "thumbnail origin preconnect is missing");\n'''
addition = '''assert(ui.includes('https://i.ytimg.com'), "thumbnail origin preconnect is missing");\nassert(ui.includes('https://www.youtube-nocookie.com'), "privacy-enhanced YouTube embed preconnect is missing");\nassert(app.includes('const embedHost="https://www.youtube-nocookie.com"'), "YouTube player must use the official privacy-enhanced embed host");\nassert(app.includes('iframe.referrerPolicy="strict-origin-when-cross-origin"'), "YouTube iframe must preserve recommended referrer identity");\nassert(app.includes('enablejsapi:"1"'), "privacy-enhanced iframe must keep IFrame API control enabled");\nassert(app.includes('origin:window.location.origin'), "privacy-enhanced iframe must identify the embedding origin");\nassert(app.includes('embedHost:playerEmbedHostSafe()'), "YouTube diagnostics must record the actual embed host");\n'''
if anchor not in text:
    raise SystemExit("test anchor missing")
text = text.replace(anchor, addition, 1)
p.write_text(text, encoding="utf-8")

# Build/cache revision.
for name in ["version.js", "index.html", "README.md", "data/defaults.json"]:
    p = Path(name)
    text = p.read_text(encoding="utf-8")
    if OLD_BUILD not in text:
        raise SystemExit(f"build anchor missing in {name}")
    p.write_text(text.replace(OLD_BUILD, NEW_BUILD), encoding="utf-8")

# Durable learning.
p = Path("PROJECT_LEARNINGS.md")
text = p.read_text(encoding="utf-8")
entry = '''\n\n### PL-F-009 YouTube埋め込みの動画切替待ちはApp処理ではなくProvider側に残った\n\n- Date: 2026-09-06\n- Status: experiment implemented / User validation pending\n- Severity: major\n- Cost: high\n- Symptom: build `20260905-6` で曲クリックから `loadVideoById` までは1msだが、PLAYINGまで約4.5秒かかる。\n- Expected: 曲行クリック後、YouTube再生が体感上すぐ開始する。\n- Actual: `REQUEST 1ms → loadVideoById 1ms → BUFFERING 74ms → UNSTARTED 389ms → BUFFERING 4526ms → PLAYING 4552ms`。Main Thread Long Taskは0ms。\n- Trigger / Reproduction: 通常ページでYouTube曲を別曲へ切り替える。\n- Root Cause: LyricTube内の同期処理・描画・stale restoreは主要因ではなく、標準YouTube iframeが新しい動画データを取得し始めるまでのProvider待ちがCritical Pathに残った。\n- Experiment: YouTube公式のprivacy-enhanced embed (`youtube-nocookie.com`) を明示iframe + `enablejsapi=1` + `origin` + `strict-origin-when-cross-origin` で構築し、同じ診断で標準hostと比較する。\n- Affected files / systems: `app.js`, `a1-ui-guards.js`, `index.html`, playback diagnostics\n- Detection method: User supplied normal-page runtime diagnostics across builds `20260905-5` and `20260905-6`.\n- Regression Guard: `tests/a1-requirements.test.js` でprivacy-enhanced host / origin / referrer / diagnostic hostを確認する。\n- Prevention: Provider待ちが支配的になった時はApp側の同期処理を繰り返し最適化せず、公式に許可されたProvider構成のA/Bと実測を行う。\n- Guide candidate: yes — MEDIA Profileの外部Provider latency切り分け例。\n'''
if "### PL-F-009 YouTube埋め込みの動画切替待ち" not in text:
    text += entry
p.write_text(text, encoding="utf-8")

# Changelog.
p = Path("docs/CHANGELOG.md")
text = p.read_text(encoding="utf-8")
entry = '''\n## v0.13.2 YouTube privacy-enhanced embed experiment / build 20260906-1（2026-09-06）\n\n- User実測で `loadVideoById` 発行は1ms、PLAYINGは約4.5秒後となり、Provider側待ちが支配的と確認。\n- YouTube公式のprivacy-enhanced embed (`youtube-nocookie.com`) を明示iframeで使用。\n- `enablejsapi=1` / `origin` / `strict-origin-when-cross-origin` を明示し、IFrame API契約とClient identificationを維持。\n- `youtube-nocookie.com` へのpreconnectを追加。\n- 再生診断へ実際のembed hostを追加し、標準hostとのA/B比較を可能にした。\n- 非表示Playerの自動先読みはYouTube Developer Policiesのbackground playback / visibility要件に反するため採用しない。\n'''
if "build 20260906-1" not in text:
    if text.startswith("# CHANGELOG"):
        first_newline = text.find("\n")
        text = text[:first_newline+1] + entry + text[first_newline+1:]
    else:
        text = entry.lstrip("\n") + "\n" + text
p.write_text(text, encoding="utf-8")

# Work report.
p = Path("docs/WORK_REPORT_2026-09-06_YOUTUBE_EMBED_PATH.md")
p.write_text('''# Work Report — YouTube Embed Path A/B\n\nDate: 2026-09-06\nBuild: 20260906-1\n\n## Evidence\n\nUser runtime diagnostic on build `20260905-6`:\n\n- click → PLAYING: 4552ms\n- selectSong synchronous work: 1ms\n- next frame: 33ms\n- Long Task total: 0ms\n- `REQUEST 1ms → loadVideoById 1ms → BUFFERING 74ms → UNSTARTED 389ms → BUFFERING 4526ms → PLAYING 4552ms`\n\nThis rules out LyricTube synchronous work, rendering, and the stale Playback Session restore timer as the dominant delay for this run.\n\n## Change\n\n- Replaced the implicit standard YouTube iframe creation path with an explicit official privacy-enhanced embed using `https://www.youtube-nocookie.com`.\n- Kept YouTube IFrame API control with `enablejsapi=1` and explicit `origin`.\n- Added `strict-origin-when-cross-origin` referrer policy, matching YouTube's current API client identity guidance.\n- Added early preconnect for the privacy-enhanced host.\n- Added actual embed host to playback diagnostics so the next user measurement is a clean standard-vs-privacy A/B.\n\n## Not adopted\n\nA hidden second YouTube player that automatically plays/mutes content to pre-buffer it was considered but not implemented. YouTube's current Developer Policies prohibit background-player content and require automatic playback to occur only when the player is sufficiently visible.\n\n## Verification state\n\n- Static / regression validation: required before merge.\n- Real YouTube click-to-PLAYING improvement: User validation pending.\n- Data Schema: unchanged (4).\n- Display version: unchanged (`v0.13.2`).\n''', encoding="utf-8")

print("youtube privacy embed patch applied")
