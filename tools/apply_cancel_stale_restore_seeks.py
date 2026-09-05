from pathlib import Path

BUILD_OLD = "20260905-5"
BUILD_NEW = "20260905-6"

# --- playback-a1.js ---------------------------------------------------------
p = Path("playback-a1.js")
text = p.read_text(encoding="utf-8")

old = '''  let sessionSaveTimer = null;\n  let lastSessionWriteAt = 0;\n  let activeSmartView = "";\n'''
new = '''  let sessionSaveTimer = null;\n  let lastSessionWriteAt = 0;\n  let delayedTransportGeneration = 0;\n  const delayedTransportTimers = new Set();\n  let activeSmartView = "";\n'''
if old not in text:
    raise SystemExit("playback state anchor missing")
text = text.replace(old, new, 1)

old = '''  const nowIso = () => new Date().toISOString();\n  const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;\n  const safeText = value => String(value ?? "");\n'''
new = '''  const nowIso = () => new Date().toISOString();\n  const asNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;\n  const safeText = value => String(value ?? "");\n\n  function emitPlaybackStage(stage, detail = {}) {\n    try {\n      document.dispatchEvent(new CustomEvent("lyrictube:playback-stage", {\n        detail: { stage: String(stage || ""), at: performance.now(), ...detail }\n      }));\n    } catch {}\n  }\n\n  function cancelDelayedTransport(reason = "") {\n    delayedTransportGeneration += 1;\n    for (const timer of delayedTransportTimers) clearTimeout(timer);\n    delayedTransportTimers.clear();\n    if (reason) emitPlaybackStage("A1_DELAYED_CANCEL", { reason });\n    return delayedTransportGeneration;\n  }\n\n  function scheduleDelayedTransport(delay, generation, callback) {\n    const timer = setTimeout(() => {\n      delayedTransportTimers.delete(timer);\n      if (generation !== delayedTransportGeneration) return;\n      callback();\n    }, delay);\n    delayedTransportTimers.add(timer);\n    return timer;\n  }\n'''
if old not in text:
    raise SystemExit("helper anchor missing")
text = text.replace(old, new, 1)

old = '''  function playReference(ref, options = {}) {\n    const song = songById(ref?.songId);\n'''
new = '''  function playReference(ref, options = {}) {\n    if (!options.restoring) cancelDelayedTransport("play-reference");\n    const song = songById(ref?.songId);\n'''
if old not in text:
    raise SystemExit("playReference anchor missing")
text = text.replace(old, new, 1)

old = '''    const song = songById(session.songId);\n    if (song) {\n      const requested = versionById(song, session.versionId) ? session.versionId : preferredVersionId(song);\n      playReference({ songId: song.id, versionId: requested }, { autoplay: false, pushHistory: false, restoring: true });\n      const target = Math.max(0, session.position);\n      const attempts = [220, 650, 1400, 2600];\n      for (const delay of attempts) {\n        setTimeout(() => {\n          if (asNumber(core.state()) === 1) core.pause();\n          core.seek(target, false);\n        }, delay);\n      }\n    }\n'''
new = '''    const song = songById(session.songId);\n    if (song) {\n      const requested = versionById(song, session.versionId) ? session.versionId : preferredVersionId(song);\n      const restoreGeneration = cancelDelayedTransport("restore-start");\n      const expectedRef = { songId: String(song.id), versionId: String(requested || "") };\n      playReference(expectedRef, { autoplay: false, pushHistory: false, restoring: true });\n      const target = Math.max(0, session.position);\n      const attempts = [220, 650, 1400, 2600];\n      for (const delay of attempts) {\n        scheduleDelayedTransport(delay, restoreGeneration, () => {\n          if (!sameRef(currentRef(), expectedRef)) return;\n          emitPlaybackStage("A1_RESTORE_SEEK", { delay, target, songId: expectedRef.songId, versionId: expectedRef.versionId });\n          if (asNumber(core.state()) === 1) core.pause();\n          core.seek(target, false);\n        });\n      }\n    }\n'''
if old not in text:
    raise SystemExit("restore seek anchor missing")
text = text.replace(old, new, 1)

old = '''    window.selectSong = function(id, autoplay = false) {\n      const before = currentRef();\n'''
new = '''    window.selectSong = function(id, autoplay = false) {\n      cancelDelayedTransport("select-song");\n      const before = currentRef();\n'''
if old not in text:
    raise SystemExit("selectSong wrapper anchor missing")
text = text.replace(old, new, 1)

old = '''    window.selectVersion = function(id, autoplay = false) {\n      const before = currentRef();\n'''
new = '''    window.selectVersion = function(id, autoplay = false) {\n      const transportGeneration = cancelDelayedTransport("select-version");\n      const before = currentRef();\n'''
if old not in text:
    raise SystemExit("selectVersion wrapper anchor missing")
text = text.replace(old, new, 1)

old = '''      if (changed && after) {\n        const nextVersion = currentVersion();\n        const target = Math.max(0, asNumber(nextVersion?.startTime) + relative);\n        setTimeout(() => core.seek(target, Boolean(autoplay || wasPlaying)), 180);\n        setTimeout(() => core.seek(target, Boolean(autoplay || wasPlaying)), 700);\n      } else if (autoplay) {\n        setTimeout(() => core.play(), 120);\n      }\n'''
new = '''      if (changed && after) {\n        const nextVersion = currentVersion();\n        const expectedRef = { ...after };\n        const target = Math.max(0, asNumber(nextVersion?.startTime) + relative);\n        for (const delay of [180, 700]) {\n          scheduleDelayedTransport(delay, transportGeneration, () => {\n            if (!sameRef(currentRef(), expectedRef)) return;\n            emitPlaybackStage("A1_VERSION_SEEK", { delay, target, songId: expectedRef.songId, versionId: expectedRef.versionId });\n            core.seek(target, Boolean(autoplay || wasPlaying));\n          });\n        }\n      } else if (autoplay) {\n        const expectedRef = after ? { ...after } : null;\n        scheduleDelayedTransport(120, transportGeneration, () => {\n          if (expectedRef && !sameRef(currentRef(), expectedRef)) return;\n          emitPlaybackStage("A1_VERSION_PLAY", { delay: 120 });\n          core.play();\n        });\n      }\n'''
if old not in text:
    raise SystemExit("version delayed transport anchor missing")
text = text.replace(old, new, 1)

p.write_text(text, encoding="utf-8")

# --- a1-ui-guards.js -------------------------------------------------------
p = Path("a1-ui-guards.js")
text = p.read_text(encoding="utf-8")

old = '''  function observePlaybackStart(songId, startedAt, syncMs) {\n    const generation = ++timingGeneration;\n    const stageStartIndex=playbackStages.length;\n'''
new = '''  function observePlaybackStart(songId, startedAt, syncMs, stageStartIndex = playbackStages.length) {\n    const generation = ++timingGeneration;\n'''
if old not in text:
    raise SystemExit("diagnostic observe anchor missing")
text = text.replace(old, new, 1)

old = '''    const startedAt = performance.now();\n    window.selectSong(songId, true);\n    const syncMs = performance.now() - startedAt;\n    observePlaybackStart(songId, startedAt, syncMs);\n'''
new = '''    const stageStartIndex = playbackStages.length;\n    const startedAt = performance.now();\n    window.selectSong(songId, true);\n    const syncMs = performance.now() - startedAt;\n    observePlaybackStart(songId, startedAt, syncMs, stageStartIndex);\n'''
if old not in text:
    raise SystemExit("diagnostic click anchor missing")
text = text.replace(old, new, 1)

old = '''      if(item.autoplay!==undefined)extra.push(`autoplay=${item.autoplay}`);\n      if(item.ytReady!==undefined)extra.push(`ready=${item.ytReady}`);\n      if(item.hasPlayer!==undefined)extra.push(`player=${item.hasPlayer}`);\n'''
new = '''      if(item.autoplay!==undefined)extra.push(`autoplay=${item.autoplay}`);\n      if(Number.isFinite(item.startSeconds))extra.push(`start=${item.startSeconds}`);\n      if(item.ytReady!==undefined)extra.push(`ready=${item.ytReady}`);\n      if(item.hasPlayer!==undefined)extra.push(`player=${item.hasPlayer}`);\n      if(item.reason)extra.push(`reason=${item.reason}`);\n      if(Number.isFinite(item.delay))extra.push(`delay=${item.delay}`);\n      if(Number.isFinite(item.target))extra.push(`target=${item.target}`);\n'''
if old not in text:
    raise SystemExit("diagnostic details anchor missing")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")

# --- regression tests ------------------------------------------------------
p = Path("tests/a1-requirements.test.js")
text = p.read_text(encoding="utf-8")
anchor = '''assert(wrappedSelect.includes('deferEffects: Boolean(autoplay)'), "old-track finalization side effects must defer during autoplay");\n'''
addition = '''assert(wrappedSelect.includes('deferEffects: Boolean(autoplay)'), "old-track finalization side effects must defer during autoplay");\nassert(playback.includes('const delayedTransportTimers = new Set()'), "A1 delayed transport timers must be centrally tracked");\nassert(playback.includes('function cancelDelayedTransport'), "A1 delayed transport cancellation helper missing");\nassert(playback.includes('cancelDelayedTransport("select-song")'), "manual song selection must cancel stale restore/version timers");\nassert(playback.includes('if (!sameRef(currentRef(), expectedRef)) return;'), "delayed restore/version transport must verify the current song/version");\nassert(playback.includes('A1_RESTORE_SEEK'), "restore seek diagnostic breadcrumb missing");\nassert(!playback.includes('setTimeout(() => {\\n          if (asNumber(core.state()) === 1) core.pause();\\n          core.seek(target, false);\\n        }, delay);'), "unguarded restore seek retries must not return");\nassert(ui.includes('const stageStartIndex = playbackStages.length'), "diagnostics must capture synchronous playback stages before selectSong");\nassert(ui.includes('observePlaybackStart(songId, startedAt, syncMs, stageStartIndex)'), "diagnostic stage start must be passed through to the observer");\n'''
if anchor not in text:
    raise SystemExit("test insertion anchor missing")
text = text.replace(anchor, addition, 1)
p.write_text(text, encoding="utf-8")

# --- build/cache bump ------------------------------------------------------
for name in ["version.js", "index.html", "README.md", "data/defaults.json"]:
    p = Path(name)
    text = p.read_text(encoding="utf-8")
    if BUILD_OLD not in text:
        raise SystemExit(f"build anchor missing in {name}")
    p.write_text(text.replace(BUILD_OLD, BUILD_NEW), encoding="utf-8")

# --- durable learning ------------------------------------------------------
p = Path("PROJECT_LEARNINGS.md")
text = p.read_text(encoding="utf-8")
entry = '''\n\n## PL-F-008 Playback Session復元の遅延Seekが手動選曲後の新しい動画へ残留した\n\n- **Date:** 2026-09-05\n- **Status:** fix implemented / User validation pending\n- **Severity:** Major\n- **Symptom:** 曲クリック後、App同期処理は1ms程度なのにYouTubeが一度BUFFERINGへ入り、約1秒後にUNSTARTEDへ戻ってから約10秒後にPLAYINGになった。\n- **Evidence:** build `20260905-5` の通常ページ診断で `BUFFERING 138ms → UNSTARTED 1138ms → BUFFERING 10383ms → PLAYING 10408ms`。Main Threadは最大59msで、App描画が主因ではなかった。\n- **Expected:** Playback Session復元のSeek retryは復元対象の曲/Versionにだけ作用し、ユーザーが別曲を手動再生した時点で失効する。\n- **Actual:** `restoreSession()` が220/650/1400/2600ms後のSeekを無条件に予約し、User selection後もTimerをcancelせず、実行時の現在PlayerへSeekしていた。\n- **Root Cause:** Restore retryにgeneration / expected song-version guard / timer ownershipが無かった。Async restorationとmanual playbackのownershipが分離されていなかった。\n- **Final Fix:** A1の遅延transportを中央管理し、manual song/version selectionや通常のplayReferenceで既存Timerをcancel。Restore / version-switch retryはgenerationとexpected `songId + versionId` が一致する場合だけ実行する。\n- **Affected files / systems:** `playback-a1.js`, `a1-ui-guards.js`, A1 regression tests, playback diagnostics\n- **Detection method:** User supplied runtime timing + delayed transport code review。\n- **Regression Guard:** `tests/a1-requirements.test.js` でtimer centralization、manual cancellation、expected ref guard、旧unguarded restore retryの不在を確認。\n- **Prevention:** User操作より後に実行するSeek/Play/Restore retryには必ずgenerationまたはAbort相当のownershipを持たせ、対象Entityを再確認してからTransportへ触る。\n- **Guide candidate:** yes — Interactive Mediaのstale async action / delayed timer ownershipの実例。\n'''
if "## PL-F-008 Playback Session復元の遅延Seek" not in text:
    text += entry
p.write_text(text, encoding="utf-8")

# --- changelog/work report -------------------------------------------------
p = Path("docs/CHANGELOG.md")
text = p.read_text(encoding="utf-8")
marker = "# CHANGELOG\n"
entry = '''# CHANGELOG\n\n## v0.13.2 Playback stale-restore cancellation / build 20260905-6（2026-09-05）\n\n- Playback Session復元の220/650/1400/2600ms遅延Seekを中央管理し、手動選曲後は即キャンセルする。\n- Restore / Version切替の遅延transportはgenerationと` songId + versionId `一致時だけ実行する。\n- 通常ページ診断でselectSong同期中のREQUEST/loadVideoByIdも取りこぼさないよう計測開始位置を修正。\n- User実測 `BUFFERING 138ms → UNSTARTED 1138ms → PLAYING 10408ms` を根拠にした修正。\n'''
if marker not in text:
    raise SystemExit("changelog heading missing")
if "build 20260905-6" not in text:
    text = text.replace(marker, entry, 1)
p.write_text(text, encoding="utf-8")

p = Path("docs/WORK_REPORT_2026-09-05_PLAYBACK_START.md")
if p.exists():
    text = p.read_text(encoding="utf-8")
    note = '''\n\n## Follow-up: stale Playback Session restore seek (build 20260905-6)\n\nUser実測ではApp同期処理1ms、次Frame50msに対し、YouTube状態が `BUFFERING 138ms → UNSTARTED 1138ms → BUFFERING 10383ms → PLAYING 10408ms` だった。`playback-a1.js` を再確認した結果、Session restoreが220/650/1400/2600ms後に現在Playerへ無条件SeekするTimerを残していた。\n\n対策として遅延transportをgeneration付きで中央管理し、manual selection / non-restoring playback開始で旧Timerをcancelする。Restore / version switchのretryはexpected song/version一致時のみ実行する。診断もselectSong同期中のREQUEST/loadVideoByIdを含めるよう修正した。\n\n実ブラウザでのclick→PLAYING改善値はUser再計測待ち。\n'''
    if "stale Playback Session restore seek (build 20260905-6)" not in text:
        text += note
    p.write_text(text, encoding="utf-8")
