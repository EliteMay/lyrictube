from pathlib import Path

OLD_VERSION = "v0.10.2"
NEW_VERSION = "v0.11.0"
OLD_BUILD = "20260830-2"
NEW_BUILD = "20260830-3"


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


# --- app.js: quick-sync state and behavior ---
path = Path("app.js")
text = read(path)
text = replace_once(
    text,
    'let syncSelectedIndex = 0;\n',
    'let syncSelectedIndex = 0;\nlet syncAnchorIndices = new Set();\nlet syncBaseTimes = [];\n',
    "sync state",
)
text = replace_once(
    text,
    '"syncDialog","closeSyncDialog","syncEditorList","syncVideoTime","syncVideoDuration","syncRelativeTime","syncSeekBar","syncGoStartBtn","syncBack5Btn","syncBack1Btn","syncPlayPauseBtn","syncForward1Btn","syncForward5Btn","syncAddInterludeBtn","syncUndoBtn","resetSyncBtn","saveSyncBtn","useSharedSyncBtn",',
    '"syncDialog","closeSyncDialog","syncEditorList","syncAssistApplyBtn","syncAssistClearBtn","syncAssistStatus","syncVideoTime","syncVideoDuration","syncRelativeTime","syncSeekBar","syncGoStartBtn","syncBack5Btn","syncBack1Btn","syncPlayPauseBtn","syncForward1Btn","syncForward5Btn","syncAddInterludeBtn","syncUndoBtn","resetSyncBtn","saveSyncBtn","useSharedSyncBtn",',
    "sync els",
)
text = replace_once(
    text,
    '''function pushSyncUndo(entry){\n  syncUndoStack.push(entry);\n  if(syncUndoStack.length>200)syncUndoStack.shift();\n  updateSyncUndoButton();\n}\nfunction updateSyncUndoButton(){els.syncUndoBtn.disabled=!syncUndoStack.length}\nfunction undoSyncChange(){''',
    '''function pushSyncUndo(entry){\n  entry.prevAnchors=[...syncAnchorIndices];\n  entry.prevBaseTimes=[...syncBaseTimes];\n  syncUndoStack.push(entry);\n  if(syncUndoStack.length>200)syncUndoStack.shift();\n  updateSyncUndoButton();\n}\nfunction updateSyncUndoButton(){els.syncUndoBtn.disabled=!syncUndoStack.length}\nfunction syncAnchorList(){\n  return [...syncAnchorIndices]\n    .filter(index=>Number.isInteger(index)&&index>=0&&index<syncDraft.length)\n    .sort((a,b)=>a-b);\n}\nfunction updateSyncAssistStatus(){\n  const anchors=syncAnchorList();\n  if(els.syncAssistStatus){\n    els.syncAssistStatus.textContent=anchors.length>=2\n      ? `基準点 ${anchors.length}個 · ${anchors.length-1}区間を補間できます`\n      : `基準点 ${anchors.length}個 · あと${2-anchors.length}個必要`;\n    els.syncAssistStatus.classList.toggle("ready",anchors.length>=2);\n  }\n  if(els.syncAssistApplyBtn)els.syncAssistApplyBtn.disabled=anchors.length<2;\n  if(els.syncAssistClearBtn)els.syncAssistClearBtn.disabled=!anchors.length;\n}\nfunction markSyncAnchor(index){\n  if(!syncDraft[index])return;\n  syncAnchorIndices.add(index);\n  updateSyncAssistStatus();\n  els.syncEditorList\n    ?.querySelector(`.sync-editor-row[data-index="${index}"]`)\n    ?.classList.add("sync-anchor");\n}\nfunction reindexSyncAnchorsForInsert(index){\n  syncAnchorIndices=new Set([...syncAnchorIndices].map(value=>value>=index?value+1:value));\n}\nfunction reindexSyncAnchorsForRemove(index){\n  syncAnchorIndices=new Set([...syncAnchorIndices]\n    .filter(value=>value!==index)\n    .map(value=>value>index?value-1:value));\n}\nfunction clearSyncAnchors(){\n  if(!syncAnchorIndices.size)return;\n  syncAnchorIndices.clear();\n  renderSyncEditor();\n  showToast("基準点だけクリアしました。歌詞時間はそのままです。");\n}\nfunction applySyncAnchorInterpolation(){\n  const engine=window.LyricTubeSyncInterpolation;\n  const anchors=syncAnchorList();\n  if(!engine?.interpolateTimes){\n    showToast("自動補間エンジンを読み込めませんでした。");\n    return;\n  }\n  if(anchors.length<2){\n    showToast("「今の時間（基準点）」を2か所以上で設定してください。");\n    return;\n  }\n  try{\n    const currentTimes=syncDraft.map(line=>Number(line.time)||0);\n    const result=engine.interpolateTimes(syncBaseTimes,currentTimes,anchors);\n    pushSyncUndo({type:"all",prevTimes:currentTimes});\n    result.times.forEach((time,index)=>{if(syncDraft[index])syncDraft[index].time=time});\n    renderSyncEditor();\n    const fallback=result.equalSpacingSegments\n      ? `（${result.equalSpacingSegments}区間は元時間が無いため均等補間）`\n      : "";\n    showToast(`基準点の間を${result.segmentCount}区間、自動で合わせました。${fallback}`);\n  }catch(error){\n    showToast(error?.message||"自動補間できませんでした。");\n  }\n}\nfunction undoSyncChange(){''',
    "sync assist functions",
)
text = replace_once(
    text,
    '''  }else if(syncDraft[last.index]){\n    syncDraft[last.index].time=last.prevTime;\n  }\n\n  renderSyncEditor();''',
    '''  }else if(syncDraft[last.index]){\n    syncDraft[last.index].time=last.prevTime;\n  }\n\n  if(Array.isArray(last.prevAnchors))syncAnchorIndices=new Set(last.prevAnchors);\n  if(Array.isArray(last.prevBaseTimes))syncBaseTimes=[...last.prevBaseTimes];\n  renderSyncEditor();''',
    "undo anchor restore",
)
text = replace_once(
    text,
    '''  pushSyncUndo({type:"line",index,prevTime:line.time});\n  line.time=syncRelativeSeconds(currentPlayerTime());\n  renderSyncEditor();''',
    '''  pushSyncUndo({type:"line",index,prevTime:line.time});\n  line.time=syncRelativeSeconds(currentPlayerTime());\n  syncAnchorIndices.add(index);\n  renderSyncEditor();''',
    "stamp anchor",
)
text = replace_once(
    text,
    '''  pushSyncUndo({type:"line",index,prevTime:Number(line.time)||0});\n  line.time=Math.max(0,(Number(line.time)||0)+deltaSec);\n  syncSelectedIndex=index;''',
    '''  pushSyncUndo({type:"line",index,prevTime:Number(line.time)||0});\n  line.time=Math.max(0,(Number(line.time)||0)+deltaSec);\n  syncAnchorIndices.add(index);\n  syncSelectedIndex=index;''',
    "nudge anchor",
)
text = replace_once(
    text,
    '''  const index=findInterludeInsertIndex(at);\n  pushSyncUndo({type:"insert",index});\n  syncDraft.splice(index,0,{time:at,text:"♪"});\n  renderSyncEditor();''',
    '''  const index=findInterludeInsertIndex(at);\n  pushSyncUndo({type:"insert",index});\n  reindexSyncAnchorsForInsert(index);\n  syncBaseTimes.splice(index,0,at);\n  syncDraft.splice(index,0,{time:at,text:"♪"});\n  syncAnchorIndices.add(index);\n  renderSyncEditor();''',
    "interlude insert",
)
text = replace_once(
    text,
    '''  pushSyncUndo({type:"remove",index,line:{...line}});\n  syncDraft.splice(index,1);\n  renderSyncEditor();''',
    '''  pushSyncUndo({type:"remove",index,line:{...line}});\n  reindexSyncAnchorsForRemove(index);\n  syncDraft.splice(index,1);\n  syncBaseTimes.splice(index,1);\n  renderSyncEditor();''',
    "interlude remove",
)
text = replace_once(
    text,
    'row.className=`sync-editor-row${marker?" interlude":""}${index===syncSelectedIndex?" selected":""}`;',
    'row.className=`sync-editor-row${marker?" interlude":""}${syncAnchorIndices.has(index)?" sync-anchor":""}${index===syncSelectedIndex?" selected":""}`;',
    "anchor row class",
)
text = replace_once(
    text,
    '''      pushSyncUndo({type:"line",index,prevTime:line.time});\n      line.time=next;\n      timeInput.value=formatTime(next);\n      row.classList.add("changed");\n      setSelectedSyncLine(index);''',
    '''      pushSyncUndo({type:"line",index,prevTime:line.time});\n      line.time=next;\n      syncAnchorIndices.add(index);\n      timeInput.value=formatTime(next);\n      row.classList.add("changed","sync-anchor");\n      updateSyncAssistStatus();\n      setSelectedSyncLine(index);''',
    "manual time anchor",
)
text = replace_once(
    text,
    '''    const text=document.createElement("div");\n    text.className="sync-editor-text";\n    text.textContent=line.text;''',
    '''    const text=document.createElement("div");\n    text.className="sync-editor-text";\n    const lyricCopy=document.createElement("span");\n    lyricCopy.textContent=line.text;\n    text.appendChild(lyricCopy);\n    if(syncAnchorIndices.has(index)){\n      const anchorBadge=document.createElement("span");\n      anchorBadge.className="sync-anchor-badge";\n      anchorBadge.textContent="基準点";\n      text.appendChild(anchorBadge);\n    }''',
    "anchor badge",
)
text = replace_once(
    text,
    '''    stamp.className="stamp-btn";\n    stamp.textContent=index===syncSelectedIndex?"今の時間を入れる（選択中）":"今の時間";''',
    '''    stamp.className="stamp-btn";\n    stamp.textContent=syncAnchorIndices.has(index)?"基準点を更新":"今の時間（基準点）";''',
    "stamp label",
)
text = replace_once(
    text,
    '''    row.append(timeInput,text,actions);\n    els.syncEditorList.appendChild(row);\n  });\n}\nfunction nudgeAllSyncTimes''',
    '''    row.append(timeInput,text,actions);\n    els.syncEditorList.appendChild(row);\n  });\n  updateSyncAssistStatus();\n}\nfunction nudgeAllSyncTimes''',
    "assist status render",
)
text = replace_once(
    text,
    '''  syncDraft=source.map(line=>({time:Number(line.time)||0,text:line.text}));\n  syncUndoStack=[];\n  syncSelectedIndex=0;''',
    '''  syncDraft=source.map(line=>({time:Number(line.time)||0,text:line.text}));\n  syncBaseTimes=syncDraft.map(line=>Number(line.time)||0);\n  syncAnchorIndices=new Set();\n  syncUndoStack=[];\n  syncSelectedIndex=0;''',
    "sync open baseline",
)
text = replace_once(
    text,
    '''  pushSyncUndo({type:"all",prevTimes:syncDraft.map(l=>l.time)});\n  syncDraft.forEach(line=>line.time=0);\n  renderSyncEditor();''',
    '''  pushSyncUndo({type:"all",prevTimes:syncDraft.map(l=>l.time)});\n  syncDraft.forEach(line=>line.time=0);\n  syncAnchorIndices.clear();\n  renderSyncEditor();''',
    "reset anchors",
)
text = replace_once(
    text,
    '''els.offsetMinus.addEventListener("click",()=>updateOffset(-.5));els.offsetPlus.addEventListener("click",()=>updateOffset(.5));els.offsetInput.addEventListener("change",()=>updateOffset(null));els.openSyncEditorBtn.addEventListener("click",openSyncEditor);els.closeSyncDialog.addEventListener("click",()=>els.syncDialog.close());els.resetSyncBtn.addEventListener("click",resetSyncDraft);els.saveSyncBtn.addEventListener("click",saveSyncDraft);els.useSharedSyncBtn.addEventListener("click",useSharedSync);''',
    '''els.offsetMinus.addEventListener("click",()=>updateOffset(-.5));els.offsetPlus.addEventListener("click",()=>updateOffset(.5));els.offsetInput.addEventListener("change",()=>updateOffset(null));els.openSyncEditorBtn.addEventListener("click",openSyncEditor);els.closeSyncDialog.addEventListener("click",()=>els.syncDialog.close());els.resetSyncBtn.addEventListener("click",resetSyncDraft);els.saveSyncBtn.addEventListener("click",saveSyncDraft);els.useSharedSyncBtn.addEventListener("click",useSharedSync);els.syncAssistApplyBtn?.addEventListener("click",applySyncAnchorInterpolation);els.syncAssistClearBtn?.addEventListener("click",clearSyncAnchors);''',
    "assist events",
)
text = text.replace('|| "v0.10.2"', '|| "v0.11.0"', 1)
write(path, text)


# --- index.html: quick-sync panel + engine + version/build ---
path = Path("index.html")
text = read(path)
text = replace_once(
    text,
    '''    </div>\n\n    <div id="syncEditorList" class="sync-editor-list"></div>''',
    '''    </div>\n\n    <section class="sync-assist-panel" aria-labelledby="syncAssistTitle">\n      <div class="sync-assist-head">\n        <div>\n          <p class="eyebrow">QUICK SYNC</p>\n          <strong id="syncAssistTitle">ざっくり自動合わせ</strong>\n          <p class="muted small">序盤・中盤・終盤など数か所だけ合わせて、その間を自動で伸縮します。</p>\n        </div>\n        <span id="syncAssistStatus" class="sync-anchor-status">基準点 0個 · あと2個必要</span>\n      </div>\n      <div class="sync-assist-actions">\n        <button id="syncAssistApplyBtn" class="primary-soft" type="button" disabled>基準点の間を自動補間</button>\n        <button id="syncAssistClearBtn" class="ghost-btn" type="button" disabled>基準点をクリア</button>\n      </div>\n      <p class="muted small sync-assist-note">使い方：2〜5か所の歌詞行で「今の時間（基準点）」を押す → 「基準点の間を自動補間」。元の同期歌詞がある場合は、その自然な歌詞間隔を保って速度だけ調整します。</p>\n    </section>\n\n    <div id="syncEditorList" class="sync-editor-list"></div>''',
    "quick sync panel",
)
text = text.replace('MY MUSIC · <span data-app-version>v0.10.2</span>', 'MY MUSIC · <span data-app-version>v0.11.0</span>', 1)
text = text.replace('<span id="settingsAppVersion">v0.10.1</span>', '<span id="settingsAppVersion">v0.11.0</span>', 1)
text = text.replace(OLD_BUILD, NEW_BUILD)
text = replace_once(
    text,
    f'<script src="library-schema.js?v={NEW_BUILD}"></script>\n  <script src="profile-data.js?v={NEW_BUILD}"></script>',
    f'<script src="library-schema.js?v={NEW_BUILD}"></script>\n  <script src="sync-interpolation.js?v={NEW_BUILD}"></script>\n  <script src="profile-data.js?v={NEW_BUILD}"></script>',
    "sync engine script",
)
write(path, text)


# --- styles.css ---
path = Path("styles.css")
text = read(path)
text = text.replace(OLD_BUILD, NEW_BUILD)
marker = "/* v0.11 quick-sync assist */"
if marker not in text:
    text += '''\n\n/* v0.11 quick-sync assist */\n.sync-assist-panel{margin:0 22px 14px;padding:14px 15px;border:1px solid rgba(139,92,246,.24);border-radius:14px;background:linear-gradient(135deg,rgba(139,92,246,.10),rgba(139,92,246,.035))}\n.sync-assist-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.sync-assist-head>div{min-width:0}.sync-assist-head strong{display:block;font-size:15px;margin-bottom:4px}.sync-anchor-status{flex:0 0 auto;border:1px solid var(--border);border-radius:999px;padding:6px 9px;color:var(--muted);background:#0d1014;font-size:11px;font-weight:800;white-space:nowrap}.sync-anchor-status.ready{color:#d8cdff;border-color:rgba(139,92,246,.34);background:var(--accentSoft)}\n.sync-assist-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}.sync-assist-note{margin-top:9px}.sync-editor-row.sync-anchor{border-color:rgba(139,92,246,.42);box-shadow:inset 3px 0 0 var(--accent)}.sync-editor-text{min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.sync-editor-text>span:first-child{min-width:0;overflow-wrap:anywhere}.sync-anchor-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 6px;background:var(--accentSoft);color:#d8cdff;font-size:9px;font-weight:900;letter-spacing:.04em;white-space:nowrap}\n@media(max-width:640px){.sync-assist-head{flex-direction:column;gap:9px}.sync-anchor-status{white-space:normal}.sync-assist-actions>*{flex:1 1 180px}.sync-editor-row.sync-anchor{box-shadow:inset 2px 0 0 var(--accent)}}\n'''
write(path, text)


# --- version.js / defaults ---
path = Path("version.js")
text = read(path).replace('version: "v0.10.2"', 'version: "v0.11.0"', 1).replace('build: "20260830-2"', 'build: "20260830-3"', 1)
write(path, text)

path = Path("data/defaults.json")
text = read(path).replace('"appVersion": "v0.10.2"', '"appVersion": "v0.11.0"', 1).replace('"buildRevision": "20260830-2"', '"buildRevision": "20260830-3"', 1)
write(path, text)


# --- README ---
path = Path("README.md")
text = read(path)
text = text.replace('**Current version: v0.10.2**', '**Current version: v0.11.0**', 1)
text = text.replace('**Build: 20260830-2**', '**Build: 20260830-3**', 1)
text = text.replace('- 表示: `v0.10.2`', '- 表示: `v0.11.0`', 1)
text = text.replace('- Build: `20260830-2`', '- Build: `20260830-3`', 1)
text = text.replace('├─ library-schema.js          ライブラリ正規化・移行\n', '├─ library-schema.js          ライブラリ正規化・移行\n├─ sync-interpolation.js      基準点間の歌詞時間自動補間\n', 1)
text = text.replace('  lyrictube-icon.svg', '  lyrictube-icon.webp', 1)
text = text.replace('library-schema.js\nprofile-data.js', 'library-schema.js\nsync-interpolation.js\nprofile-data.js', 1)
insert_after = '同期歌詞が無い通常歌詞はLyricTubeの同期エディタでLRC化できます。\n'
if insert_after in text and '## ざっくり自動合わせ' not in text:
    # This sentence lives in docs rather than README in some revisions; keep README insertion elsewhere below.
    pass
lyrics_heading = '結果は重複除去し、取得元を表示します。保存時は `lyricsProvider` / `lyricsProviderId` を記録します。旧 `lrclibId` も互換性のため維持します。\n'
quick_section = '''結果は重複除去し、取得元を表示します。保存時は `lyricsProvider` / `lyricsProviderId` を記録します。旧 `lrclibId` も互換性のため維持します。\n\n### ざっくり自動合わせ\n\n同期エディタでは、全行を手作業で打刻せずに数か所だけ基準点を設定できます。2個以上の基準点を置いて「基準点の間を自動補間」を押すと、基準点の間を区間ごとに自動調整します。\n\n- 元の同期歌詞がある場合: 元の歌詞間隔を保ったまま時間軸を一定倍率で伸縮\n- 元の同期時間が無い区間: 行数ベースで均等補間\n- 補間後: 気になる行だけ従来の `±0.1 / ±0.5秒` で修正可能\n- 基準点情報は編集セッション専用で、保存データ形式は変更しません\n'''
if lyrics_heading in text and '### ざっくり自動合わせ' not in text:
    text = text.replace(lyrics_heading, quick_section, 1)
text = text.replace('- 全 `.js` の `node --check`', '- 全 `.js` の `node --check`\n- `tests/*.test.js` の同期補間ロジックテスト', 1)
write(path, text)


# --- docs ---
path = Path("docs/LYRICS.md")
text = read(path)
if '## ざっくり自動合わせ' not in text:
    text += '''\n\n## ざっくり自動合わせ\n\n動画専用同期を1行ずつ全部打刻するのが面倒な場合の補助機能です。\n\n1. 同期エディタを開く\n2. 序盤・中盤・終盤など2〜5か所で `今の時間（基準点）` を押す\n3. `基準点の間を自動補間` を押す\n4. 気になる行だけ `±0.1 / ±0.5秒` で仕上げる\n\n元の同期歌詞がある区間は、単純な行数均等配置ではなく元タイムスタンプの間隔比率を使用します。つまりCoverやLiveが少し速い・遅い場合でも、基準点間を一定倍率で伸縮して自然な間隔を維持します。元時間が無い区間だけ行数ベースの均等補間へフォールバックします。\n\n補間対象は最初の基準点から最後の基準点までです。曲全体を自動補間したい場合は、序盤と終盤にも基準点を置きます。基準点は編集時だけの情報で、保存されるLRC形式やデータSchemaは変わりません。\n'''
write(path, text)

path = Path("docs/ARCHITECTURE.md")
text = read(path)
text = text.replace('LyricTube v0.10.0 の現行構成です。', 'LyricTube v0.11.0 の現行構成です。', 1)
text = text.replace('2. `library-schema.js`\n3. `profile-data.js`', '2. `library-schema.js`\n3. `sync-interpolation.js`\n4. `profile-data.js`', 1)
text = text.replace('4. `cloud-sync.js`\n5. `site-shell.js`\n6. `lyrics-providers.js`\n7. `local-media.js`\n8. `tags.js`\n9. ログイン / ゲスト確定後', '5. `cloud-sync.js`\n6. `site-shell.js`\n7. `lyrics-providers.js`\n8. `local-media.js`\n9. `tags.js`\n10. ログイン / ゲスト確定後', 1)
if '### sync-interpolation.js' not in text:
    anchor = '### profile-data.js\n'
    section = '''### sync-interpolation.js\n\n- 同期エディタの基準点間を区間ごとに線形補間\n- 元LRCの時間間隔を使ったテンポ伸縮\n- 元時間が無い区間の均等補間フォールバック\n- DOMに依存しないPure utilityとしてNodeテスト可能\n\n'''
    text = text.replace(anchor, section + anchor, 1)
write(path, text)

path = Path("docs/CHANGELOG.md")
text = read(path)
entry = '''## v0.11.0 - 2026-08-30\n\n- 同期エディタに「ざっくり自動合わせ」を追加。\n- 2〜数個の基準点だけ手動で合わせ、基準点間の歌詞時間を自動補間できるようにした。\n- 元の同期歌詞がある場合は、そのタイムスタンプ間隔を保ちながら区間ごとに時間軸を伸縮する。\n- 元時間が無い区間は行数ベースの均等補間へフォールバックする。\n- 補間後も従来の行単位 `±0.1 / ±0.5秒` 微調整を利用可能。\n- 自動補間ロジックを `sync-interpolation.js` へ分離し、Nodeテストを追加。\n- 保存Schemaは変更なし。\n\n'''
if not text.startswith('## v0.11.0'):
    text = entry + text
write(path, text)

path = Path("作業報告書.md")
text = read(path)
report = '''## v0.11.0 ざっくり自動同期（2026-08-30）\n\n### 変更した内容\n\n- 同期エディタに基準点方式の自動補間を追加。\n- `今の時間（基準点）` を2〜5か所程度だけ設定し、その間を自動で時間合わせできるようにした。\n- 元LRCの時間差を利用する区間伸縮方式を採用し、単純な等間隔配置による不自然さを減らした。\n- 元同期が無い区間のみ行数ベースの均等補間を使用。\n- 基準点行を視覚的に表示し、基準点クリア機能を追加。\n- 補間処理をPure utilityへ分離し自動テストを追加。\n\n### 変更ファイル\n\n- `app.js`\n- `index.html`\n- `styles.css`\n- `sync-interpolation.js`\n- `tests/sync-interpolation.test.js`\n- `version.js`\n- `data/defaults.json`\n- `README.md`\n- `docs/LYRICS.md`\n- `docs/ARCHITECTURE.md`\n- `docs/CHANGELOG.md`\n- `.github/workflows/validate-js.yml`\n\n### 崩していない仕様\n\n- 既存の1行ずつの手動同期は維持。\n- 動画専用LRCの保存形式は変更なし。\n- `lyrictube.library.v3` / Data Schema 4を維持。\n- YouTube / Local Mediaの両方から同じ同期エディタを利用する構成を維持。\n\n### 確認\n\n- JavaScript構文チェックを実施。\n- JSON構文と静的参照検証を実施。\n- 補間エンジンのNodeテストを実施。\n- GitHub Pages上での実動画を使った操作感はデプロイ後に実ブラウザ確認が必要。\n\n'''
if not text.startswith('## v0.11.0 ざっくり自動同期'):
    text = report + text
write(path, text)


# --- CI: run actual pure-logic tests ---
path = Path('.github/workflows/validate-js.yml')
text = read(path)
if 'Run LyricTube logic tests' not in text:
    needle = '''      - name: Check Python maintenance tools\n        shell: bash\n        run: |\n          set -euo pipefail\n          python -m py_compile tools/*.py\n\n'''
    addition = needle + '''      - name: Run LyricTube logic tests\n        shell: bash\n        run: |\n          set -euo pipefail\n          for file in tests/*.test.js; do\n            [ -e "$file" ] || continue\n            node "$file"\n          done\n\n'''
    text = replace_once(text, needle, addition, 'CI tests')
write(path, text)

print('quick sync v0.11.0 applied')
