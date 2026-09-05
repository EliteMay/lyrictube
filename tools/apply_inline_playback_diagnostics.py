from pathlib import Path

app_path=Path('app.js')
app=app_path.read_text(encoding='utf-8')

anchor='''function makeYoutubeRequest(v,autoplay=false){\n'''
insert='''function emitPlaybackDiagnosticStage(stage,detail={}){\n  try{\n    document.dispatchEvent(new CustomEvent("lyrictube:playback-stage",{\n      detail:{stage:String(stage||""),at:performance.now(),...detail}\n    }));\n  }catch{}\n}\n\nfunction makeYoutubeRequest(v,autoplay=false){\n'''
if anchor not in app: raise SystemExit('makeYoutubeRequest anchor missing')
app=app.replace(anchor,insert,1)

old='''  try{\n    request.autoplay?ytPlayer.loadVideoById(arg):ytPlayer.cueVideoById(arg);\n'''
new='''  try{\n    emitPlaybackDiagnosticStage(request.autoplay?"loadVideoById":"cueVideoById",{videoId:request.videoId,startSeconds:request.startSeconds,ytReady:Boolean(ytReady)});\n    request.autoplay?ytPlayer.loadVideoById(arg):ytPlayer.cueVideoById(arg);\n'''
if old not in app: raise SystemExit('apply request anchor missing')
app=app.replace(old,new,1)

old='''  const request=makeYoutubeRequest(v,autoplay);\n  pendingYoutubeRequest=request;\n'''
new='''  const request=makeYoutubeRequest(v,autoplay);\n  pendingYoutubeRequest=request;\n  emitPlaybackDiagnosticStage("REQUEST",{\n    videoId:request.videoId,autoplay:request.autoplay,ytReady:Boolean(ytReady),hasPlayer:Boolean(ytPlayer),\n    playerVideoId:playerVideoIdSafe(),playerState:playerStateSafe()\n  });\n'''
if old not in app: raise SystemExit('loadSelectedVideo request anchor missing')
app=app.replace(old,new,1)

old='''  ytReady=false;\n  ytPlayer=new YT.Player("player",{\n'''
new='''  ytReady=false;\n  emitPlaybackDiagnosticStage("PLAYER_CREATE",{videoId:initialVideoId,autoplay:Boolean(initial?.autoplay)});\n  ytPlayer=new YT.Player("player",{\n'''
if old not in app: raise SystemExit('player create anchor missing')
app=app.replace(old,new,1)

old='''      onReady:()=>{\n        ytReady=true;\n'''
new='''      onReady:()=>{\n        ytReady=true;\n        emitPlaybackDiagnosticStage("PLAYER_READY",{videoId:playerVideoIdSafe(),pendingVideoId:String(pendingYoutubeRequest?.videoId||"")});\n'''
if old not in app: raise SystemExit('onReady anchor missing')
app=app.replace(old,new,1)

old='''      onStateChange:e=>{\n        if(initial?.autoplay&&(e.data===3||e.data===1))initialAutoplayProgressed=true;\n'''
new='''      onStateChange:e=>{\n        let loadedFraction=null;\n        try{loadedFraction=Number(ytPlayer?.getVideoLoadedFraction?.())}catch{}\n        emitPlaybackDiagnosticStage("YT_STATE",{state:Number(e.data),videoId:playerVideoIdSafe(),loadedFraction});\n        if(initial?.autoplay&&(e.data===3||e.data===1))initialAutoplayProgressed=true;\n'''
if old not in app: raise SystemExit('onStateChange anchor missing')
app=app.replace(old,new,1)

old='''      onError:e=>showToast(e.data===101||e.data===150?"この動画は投稿者の設定でサイト内再生できません。":"YouTube動画を再生できませんでした。")\n'''
new='''      onAutoplayBlocked:()=>{\n        emitPlaybackDiagnosticStage("AUTOPLAY_BLOCKED",{videoId:playerVideoIdSafe()});\n      },\n      onError:e=>{\n        emitPlaybackDiagnosticStage("YT_ERROR",{code:Number(e.data),videoId:playerVideoIdSafe()});\n        showToast(e.data===101||e.data===150?"この動画は投稿者の設定でサイト内再生できません。":"YouTube動画を再生できませんでした。");\n      }\n'''
if old not in app: raise SystemExit('onError anchor missing')
app=app.replace(old,new,1)
app_path.write_text(app,encoding='utf-8')

guard_path=Path('a1-ui-guards.js')
guard=guard_path.read_text(encoding='utf-8')
old='''  const longTasks = [];\n'''
new='''  const longTasks = [];\n  const playbackStages = [];\n  document.addEventListener("lyrictube:playback-stage",event=>{\n    const detail=event.detail||{};\n    playbackStages.push({at:Number(detail.at)||performance.now(),...detail});\n    if(playbackStages.length>200)playbackStages.splice(0,playbackStages.length-200);\n  });\n'''
if old not in guard: raise SystemExit('guard buffer anchor missing')
guard=guard.replace(old,new,1)

old='''    return [\n      `LyricTube playback diagnostic build=${entry.build || "unknown"}`,\n      `曲クリック→PLAYING: ${formatMs(entry.elapsedMs)}`,\n      `selectSong同期処理: ${formatMs(entry.syncMs)}`,\n      `次の描画Frame: ${formatMs(entry.frameMs)}`,\n      `Player状態: ${states}`,\n      `Long Task合計: ${formatMs(entry.longTaskTotalMs)} / 最大: ${formatMs(entry.longTaskMaxMs)}`,\n      `結果: ${entry.result || "unknown"}`,\n    ].join("\\n");\n'''
new='''    const internal=(entry.internalStages||[]).map(item=>{\n      const extra=[];\n      if(item.videoId)extra.push(`video=${item.videoId}`);\n      if(item.autoplay!==undefined)extra.push(`autoplay=${item.autoplay}`);\n      if(item.ytReady!==undefined)extra.push(`ready=${item.ytReady}`);\n      if(item.hasPlayer!==undefined)extra.push(`player=${item.hasPlayer}`);\n      if(Number.isFinite(item.state))extra.push(`state=${item.state}`);\n      if(Number.isFinite(item.loadedFraction))extra.push(`loaded=${item.loadedFraction.toFixed(3)}`);\n      return `${item.stage} ${item.atMs}ms${extra.length?` (${extra.join(", ")})`:""}`;\n    }).join(" → ")||"なし";\n    return [\n      `LyricTube playback diagnostic build=${entry.build || "unknown"}`,\n      `曲クリック→PLAYING: ${formatMs(entry.elapsedMs)}`,\n      `selectSong同期処理: ${formatMs(entry.syncMs)}`,\n      `次の描画Frame: ${formatMs(entry.frameMs)}`,\n      `Player状態: ${states}`,\n      `内部Stages: ${internal}`,\n      `Long Task合計: ${formatMs(entry.longTaskTotalMs)} / 最大: ${formatMs(entry.longTaskMaxMs)}`,\n      `結果: ${entry.result || "unknown"}`,\n    ].join("\\n");\n'''
if old not in guard: raise SystemExit('diagnosticText anchor missing')
guard=guard.replace(old,new,1)

old='''  function observePlaybackStart(songId, startedAt, syncMs) {\n    const generation = ++timingGeneration;\n'''
new='''  function observePlaybackStart(songId, startedAt, syncMs) {\n    const generation = ++timingGeneration;\n    const stageStartIndex=playbackStages.length;\n'''
if old not in guard: raise SystemExit('observe anchor missing')
guard=guard.replace(old,new,1)

old='''      if (sawNonPlaying && state === 1) {\n        recordPlaybackTiming({\n'''
new='''      if (sawNonPlaying && state === 1) {\n        const internalStages=playbackStages.slice(stageStartIndex).filter(item=>item.at>=startedAt&&item.at<=now).map(item=>({...item,atMs:Math.round(item.at-startedAt)}));\n        recordPlaybackTiming({\n'''
if old not in guard: raise SystemExit('success record anchor missing')
guard=guard.replace(old,new,1)

old='''          states,\n          longTaskTotalMs: long.total,\n'''
new='''          states,\n          internalStages,\n          longTaskTotalMs: long.total,\n'''
if old not in guard: raise SystemExit('success fields anchor missing')
guard=guard.replace(old,new,1)

old='''      if (elapsed >= 12000) {\n        recordPlaybackTiming({\n'''
new='''      if (elapsed >= 12000) {\n        const internalStages=playbackStages.slice(stageStartIndex).filter(item=>item.at>=startedAt&&item.at<=now).map(item=>({...item,atMs:Math.round(item.at-startedAt)}));\n        recordPlaybackTiming({\n'''
if old not in guard: raise SystemExit('timeout record anchor missing')
guard=guard.replace(old,new,1)

timeout_marker='''          timeout: true,\n'''
idx=guard.find(timeout_marker)
if idx<0: raise SystemExit('timeout marker missing')
block_start=guard.rfind('recordPlaybackTiming({',0,idx)
segment=guard[block_start:idx]
if 'internalStages' not in segment:
    segment=segment.replace('          states,\n          longTaskTotalMs: long.total,\n','          states,\n          internalStages,\n          longTaskTotalMs: long.total,\n',1)
    guard=guard[:block_start]+segment+guard[idx:]
guard_path.write_text(guard,encoding='utf-8')

for name in ['version.js','index.html','README.md','data/defaults.json']:
    p=Path(name); text=p.read_text(encoding='utf-8')
    if '20260905-4' not in text: raise SystemExit(f'build anchor missing in {name}')
    p.write_text(text.replace('20260905-4','20260905-5'),encoding='utf-8')

p=Path('playback-diagnostics.html'); text=p.read_text(encoding='utf-8')
text=text.replace('<iframe id="appFrame" src="./?playback-diagnostics=1" title="LyricTube"></iframe>','<iframe id="appFrame" src="./?playback-diagnostics=1" title="LyricTube" allow="autoplay; fullscreen"></iframe>')
p.write_text(text,encoding='utf-8')
