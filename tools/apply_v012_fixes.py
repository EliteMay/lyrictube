from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 match, got {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label, flags=re.S):
    new, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly 1 regex match, got {count}")
    return new


# ---------------------------------------------------------------------------
# version / cache
# ---------------------------------------------------------------------------
version = read("version.js")
version = version.replace('version: "v0.11.0"', 'version: "v0.12.0"')
version = version.replace('build: "20260830-3"', 'build: "20260830-4"')
write("version.js", version)

index = read("index.html")
index = index.replace("20260830-3", "20260830-4")
index = index.replace("<span data-app-version>v0.11.0</span>", "<span data-app-version>v0.12.0</span>")
write("index.html", index)

# ---------------------------------------------------------------------------
# site shell: remove old version writer, duplicate guest CSS injection,
# and announce app readiness after app.js has actually loaded.
# ---------------------------------------------------------------------------
shell = read("site-shell.js")
shell = regex_once(
    shell,
    r"\n    if \(!qs\('link\[data-guest-style\]'\)\) \{.*?\n    \}\n    if \(!qs\(\"#cloudAccountStyle\"\)\) \{",
    '\n    if (!qs("#cloudAccountStyle")) {',
    "remove duplicate guest css injection",
)
shell = regex_once(
    shell,
    r"\n  function keepVersionLabels\(\) \{.*?\n  \}\n\n  async function start\(\) \{",
    "\n  async function start() {",
    "remove legacy GH v35 writer",
)
shell = replace_once(
    shell,
    "    initCloudSettings(access.role, access.session);\n    keepVersionLabels();",
    "    initCloudSettings(access.role, access.session);\n    window.LyricTubeVersion?.applyUi?.();\n    document.dispatchEvent(new CustomEvent(\"lyrictube:app-ready\"));",
    "announce app ready",
)
write("site-shell.js", shell)

# ---------------------------------------------------------------------------
# local media: no polling timeout. Expose a small playback contract so app.js
# can operate YouTube and local files through the same path.
# ---------------------------------------------------------------------------
local = read("local-media.js")
local = replace_once(
    local,
    "  let lastUiTick = 0;\n",
    "  let lastUiTick = 0;\n  let initialized = false;\n",
    "local initialized flag",
)
old_api = '''  window.LyricTubeLocalMedia = Object.freeze({
    status(song = currentSong(), version = currentVersion(song)) {
      if (!isLocalMediaVersion(version)) return { local: false, linked: false };
      const row = records.get(keyFor(song, version)) || null;
      return { local: true, linked: !!row, kind: row?.kind || version?.localMediaKind || "", fileName: row?.fileName || version?.localFileName || "" };
    },
    refreshStorage: updateStorageSummary,
    relinkCurrent: relinkCurrentFile,
  });'''
new_api = '''  window.LyricTubeLocalMedia = Object.freeze({
    status(song = currentSong(), version = currentVersion(song)) {
      if (!isLocalMediaVersion(version)) return { local: false, linked: false };
      const row = records.get(keyFor(song, version)) || null;
      return { local: true, linked: !!row, kind: row?.kind || version?.localMediaKind || "", fileName: row?.fileName || version?.localFileName || "" };
    },
    playCurrent() {
      const el = currentMedia();
      if (!el) return false;
      el.play().catch(() => toast("再生できませんでした。ファイル形式を確認してください。"));
      return true;
    },
    pauseCurrent() {
      const el = currentMedia();
      if (!el) return false;
      el.pause();
      return true;
    },
    seekCurrent(target) { return seekLocal(target); },
    currentTime() { const el = currentMedia(); return el ? Number(el.currentTime) || 0 : 0; },
    duration() { const el = currentMedia(); return el ? Number(el.duration) || 0 : 0; },
    state() { const el = currentMedia(); return el ? (el.paused ? 2 : 1) : -1; },
    refreshStorage: updateStorageSummary,
    relinkCurrent: relinkCurrentFile,
  });'''
local = replace_once(local, old_api, new_api, "local playback public api")
local = replace_once(
    local,
    "  async function init() {\n    styleUi();",
    "  async function init() {\n    if (initialized) return;\n    initialized = true;\n    styleUi();",
    "local init guard",
)
local = local.replace('document.documentElement.dataset.localMedia = "v0.10.1";', 'document.documentElement.dataset.localMedia = window.LyricTubeVersion?.version || "v0.12.0";')
local = regex_once(
    local,
    r'''\n  const timer = setInterval\(\(\) => \{.*?\n  setTimeout\(\(\) => clearInterval\(timer\), 30000\);\n\}\)\(\);\s*$''',
    '''
  function appCoreReady() {
    return typeof getSong === "function" &&
      typeof loadSelectedVideo === "function" &&
      typeof makeVersion === "function" &&
      $("songForm") && $("versionForm") &&
      document.querySelector(".player-card");
  }

  function startWhenReady() {
    if (appCoreReady()) init();
  }

  document.addEventListener("lyrictube:app-ready", startWhenReady);
  queueMicrotask(startWhenReady);
})();
''',
    "replace local polling",
)
write("local-media.js", local)

# ---------------------------------------------------------------------------
# tags: use the same explicit ready event instead of 30-second polling.
# ---------------------------------------------------------------------------
tags = read("tags.js")
tags = tags.replace('const TAG_VERSION = window.LyricTubeVersion?.version || "v0.10.1";', 'const TAG_VERSION = window.LyricTubeVersion?.version || "v0.12.0";')
tags = regex_once(
    tags,
    r'''\n  const timer = setInterval\(\(\) => \{.*?\n  setTimeout\(\(\) => clearInterval\(timer\), 30000\);\n\}\)\(\);\s*$''',
    '''
  function appCoreReady() {
    return typeof library !== "undefined" &&
      typeof viewSongs === "function" &&
      typeof renderBrowse === "function" &&
      typeof renderAll === "function" &&
      typeof renderSelectedSong === "function" &&
      typeof renderMainPage === "function" &&
      typeof persistLibrary === "function" &&
      $("browsePage") && $("browsePageBtn");
  }

  function startWhenReady() {
    if (appCoreReady()) init();
  }

  document.addEventListener("lyrictube:app-ready", startWhenReady);
  queueMicrotask(startWhenReady);
})();
''',
    "replace tags polling",
)
write("tags.js", tags)

# ---------------------------------------------------------------------------
# app core: generic player helpers, local-media lyric sync/seek fixes,
# keyboard fixes, recovery backup, stale help/version cleanup.
# ---------------------------------------------------------------------------
app = read("app.js")
app = app.replace('const APP_VERSION = window.LyricTubeVersion?.version || "v0.11.0";', 'const APP_VERSION = window.LyricTubeVersion?.version || "v0.12.0";')
app = replace_once(
    app,
    'const LEGACY_KEY = "lyrictube.songs.v1";\n',
    'const LEGACY_KEY = "lyrictube.songs.v1";\nconst RECOVERY_KEY_PREFIX = "lyrictube.library.recovery.";\nlet recoveryBackupKey = "";\n',
    "recovery constants",
)

app = regex_once(
    app,
    r'''function loadLibrary\(\)\{.*?\}\nfunction persistLibrary\(\)\{localStorage\.setItem\(STORAGE_KEY,JSON\.stringify\(library\)\)\}''',
    '''function backupCorruptLibrary(raw,error){
  if(!raw)return "";
  const key=`${RECOVERY_KEY_PREFIX}${Date.now()}`;
  try{localStorage.setItem(key,raw);recoveryBackupKey=key}catch{}
  console.error("[LyricTube] library parse failed; recovery copy saved",error);
  return key;
}
function loadLibrary(){
  const v3=localStorage.getItem(STORAGE_KEY);
  if(v3){
    try{
      const parsed=JSON.parse(v3);
      const migrated=window.LyricTubeLibrarySchema?.migrate?.(parsed)||parsed;
      library=normalizeLibrary(migrated);
      const validation=window.LyricTubeLibrarySchema?.validate?.(library);
      if(validation&&!validation.ok)console.warn("[LyricTube] library validation warnings",validation.errors);
      return;
    }catch(error){
      backupCorruptLibrary(v3,error);
      library=defaultLibrary();
      return;
    }
  }
  try{
    const legacy=localStorage.getItem(LEGACY_KEY);
    if(legacy){library=migrateLegacy(JSON.parse(legacy));persistLibrary();showToast("以前の曲データを新しい形式へ移行しました。");return}
  }catch(error){
    console.warn(error);
  }
  library=defaultLibrary();
}
function persistLibrary(){localStorage.setItem(STORAGE_KEY,JSON.stringify(library))}''',
    "safe library loading",
)

player_helpers = '''
function selectedLocalMediaStatus(song=getSong(),v=getVersion(song)){
  try{return window.LyricTubeLocalMedia?.status?.(song,v)||null}catch{return null}
}
function playMainPlayback(){
  const status=selectedLocalMediaStatus();
  if(status?.local)return Boolean(window.LyricTubeLocalMedia?.playCurrent?.());
  try{ytPlayer?.playVideo?.();return true}catch{return false}
}
function pauseMainPlayback(){
  const status=selectedLocalMediaStatus();
  if(status?.local)return Boolean(window.LyricTubeLocalMedia?.pauseCurrent?.());
  try{ytPlayer?.pauseVideo?.();return true}catch{return false}
}
function seekMainPlayback(target,{autoplay=false}={}){
  const value=Math.max(0,Number(target)||0);
  const status=selectedLocalMediaStatus();
  let ok=false;
  if(status?.local)ok=Boolean(window.LyricTubeLocalMedia?.seekCurrent?.(value));
  else try{ytPlayer?.seekTo?.(value,true);ok=true}catch{}
  if(ok&&autoplay)playMainPlayback();
  return ok;
}

'''
app = replace_once(app, "function renderLyrics(song=getSong(),v=getVersion()){", player_helpers + "function renderLyrics(song=getSong(),v=getVersion()){", "insert player helpers")

old_lyric_click = '''      d.dataset.index=index;
      d.textContent=line.text;
      d.title=`曲開始から ${formatTime(line.time)}`;
      d.addEventListener("click",()=>{
        const vv=getVersion();
        if(!vv||!ytPlayer?.seekTo)return;
        lyricVideoSwitchPending=false;
        ytPlayer.seekTo(
          Math.max(0,Number(vv.startTime||0)+line.time+Number(vv.lyricsOffset||0)),
          true
        );
        ytPlayer.playVideo?.();
      });'''
new_lyric_click = '''      d.dataset.index=index;
      d.dataset.time=String(line.time);
      d.textContent=line.text;
      d.title=`曲開始から ${formatTime(line.time)}`;
      d.addEventListener("click",()=>{
        const vv=getVersion();
        if(!vv)return;
        lyricVideoSwitchPending=false;
        seekMainPlayback(
          Math.max(0,Number(vv.startTime||0)+line.time+Number(vv.lyricsOffset||0)),
          {autoplay:true}
        );
      });'''
app = replace_once(app, old_lyric_click, new_lyric_click, "generic lyric click")

app = replace_once(
    app,
    '  if(!song||!v||!ytPlayer?.getCurrentTime)return;\n',
    '  if(!song||!v)return;\n  const localStatus=selectedLocalMediaStatus(song,v);\n  if(localStatus?.local){if(!localStatus.linked)return}else if(!ytPlayer?.getCurrentTime)return;\n',
    "local lyric highlight guard",
)

app = regex_once(
    app,
    r'''function lyricPlayerReadyForSelectedVideo\(v\)\{\n  if\(!v\?\.videoId\|\|!ytPlayer\)return false;''',
    '''function lyricPlayerReadyForSelectedVideo(v){
  if(v?.source==="localmedia")return Boolean(selectedLocalMediaStatus(getSong(),v)?.linked);
  if(!v?.videoId||!ytPlayer)return false;''',
    "local lyric readiness",
)

app = app.replace('function handleTrackEnd(reason="ended"){if(handlingEnd)return;handlingEnd=true;setTimeout(()=>handlingEnd=false,700);if(library.settings.repeat==="one"){restartCurrent(true);return}const queue=queueSongs();if(queue.length<=1&&library.settings.repeat!=="all"){try{ytPlayer.pauseVideo?.()}catch{}return}playAdjacent(1,true,true)}',
'''function handleTrackEnd(reason="ended"){if(handlingEnd)return;handlingEnd=true;setTimeout(()=>handlingEnd=false,700);if(library.settings.repeat==="one"){restartCurrent(true);return}const queue=queueSongs();if(queue.length<=1&&library.settings.repeat!=="all"){pauseMainPlayback();return}playAdjacent(1,true,true)}''')
app = app.replace('else{try{ytPlayer.pauseVideo?.()}catch{}return}}selectSong(queue[next].id,autoplay)}', 'else{pauseMainPlayback();return}}selectSong(queue[next].id,autoplay)}')
app = app.replace('function restartCurrent(autoplay=true){const v=getVersion();if(!v||!ytPlayer)return;ytPlayer.seekTo(Number(v.startTime)||0,true);if(autoplay)ytPlayer.playVideo?.()}', 'function restartCurrent(autoplay=true){const v=getVersion();if(!v)return;seekMainPlayback(Number(v.startTime)||0,{autoplay})}')

app = regex_once(
    app,
    r'''window\.addEventListener\("keydown",e=>\{.*?\}\);\n\nlet miniPlayerActive=false;''',
    '''window.addEventListener("keydown",e=>{
  if(els.syncDialog?.open&&e.shiftKey&&e.key.toLowerCase()==="t"){
    e.preventDefault();stampSyncLine(syncSelectedIndex);return;
  }
  if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName))return;
  if(e.code==="Space"){
    e.preventDefault();
    playerStateSafe()===1?pauseMainPlayback():playMainPlayback();
  }else if(e.key==="ArrowRight"&&!e.ctrlKey){
    e.preventDefault();seekMainPlayback(currentPlayerTime()+5);
  }else if(e.key==="ArrowLeft"&&!e.ctrlKey){
    e.preventDefault();seekMainPlayback(Math.max(0,currentPlayerTime()-5));
  }else if(e.ctrlKey&&e.key==="ArrowRight"){
    e.preventDefault();playAdjacent(1,true,false);
  }else if(e.ctrlKey&&e.key==="ArrowLeft"){
    e.preventDefault();playAdjacent(-1,true,false);
  }else if(e.key.toLowerCase()==="f"){
    toggleFavorite();
  }else if(e.key==="?"||e.key==="/"){
    e.preventDefault();els.shortcutDialog.showModal();
  }
});

let miniPlayerActive=false;''',
    "generic keyboard player controls",
)

app = app.replace('a.download=`lyrictube_v14_${new Date().toISOString().slice(0,10)}.json`;', 'a.download=`lyrictube_${new Date().toISOString().slice(0,10)}.json`;')
app = app.replace('「＋ 曲を追加」からYouTube URLを登録', '「＋ 曲を追加」からYouTubeまたは端末のMP3 / MP4を登録')
app = app.replace('曲・歌詞・プレイリスト・設定は、このブラウザの localStorage に保存されます。別のPCや別ブラウザでは自動共有されないので、必要なら書き出しを使ってください。', 'ゲストはこのブラウザ内に保存されます。クラウドアカウントは曲・歌詞・プレイリスト・設定をSupabaseへ同期します。MP3 / MP4本体だけは端末内保存なので、別端末では再登録が必要です。')
app = app.replace('"<section class=\\"help-block\\"><h4>便利操作</h4><ul><li>行をクリックして選択</li>', '"<section class=\\"help-block\\"><h4>ざっくり自動合わせ</h4><p>2〜5か所程度だけ「今の時間（基準点）」を設定して「基準点の間を自動補間」を押すと、その間をまとめて合わせられます。</p></section>",\n    "<section class=\\"help-block\\"><h4>便利操作</h4><ul><li>行をクリックして選択</li>')

# Notify about recovery after the UI exists.
app = replace_once(
    app,
    '  bootstrapCore();\n}catch(err){',
    '  bootstrapCore();\n  if(recoveryBackupKey)showToast("保存データを読み込めなかったため、復旧用コピーを端末に退避しました。新しい空データで上書きする前に書き出し・復旧を確認してください。");\n}catch(err){',
    "recovery notification",
)
write("app.js", app)

# ---------------------------------------------------------------------------
# layout: four stable sidebar tools at all desktop/mobile widths.
# ---------------------------------------------------------------------------
styles = read("styles.css")
styles = styles.replace('.sidebar-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}', '.sidebar-tools{display:grid;grid-template-columns:minmax(0,1fr) 38px minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:10px}')
write("styles.css", styles)

mobile = read("mobile.css")
mobile = mobile.replace('.sidebar-tools{grid-template-columns:repeat(3,minmax(0,1fr))!important}', '.sidebar-tools{grid-template-columns:minmax(0,1fr) 38px minmax(0,1fr) minmax(0,1fr)!important}')
write("mobile.css", mobile)

# ---------------------------------------------------------------------------
# stronger library validation without rejecting migrated legacy data.
# ---------------------------------------------------------------------------
schema = read("library-schema.js")
old_validate = '''  function validate(input) {
    const errors = [];
    if (!input || typeof input !== "object") errors.push("library must be an object");
    if (!Array.isArray(input?.songs)) errors.push("songs must be an array");
    if (!Array.isArray(input?.playlists)) errors.push("playlists must be an array");
    for (const [index, song] of (input?.songs || []).entries()) {
      if (!song?.id) errors.push(`songs[${index}].id is required`);
      if (!Array.isArray(song?.versions)) errors.push(`songs[${index}].versions must be an array`);
    }
    return { ok: errors.length === 0, errors };
  }'''
new_validate = '''  function validate(input) {
    const errors = [];
    if (!input || typeof input !== "object") errors.push("library must be an object");
    if (!Array.isArray(input?.songs)) errors.push("songs must be an array");
    if (!Array.isArray(input?.playlists)) errors.push("playlists must be an array");

    const songIds = new Set();
    const versionIds = new Set();
    const tagIds = new Set((input?.settings?.tags || []).map(tag => String(tag?.id || "")).filter(Boolean));

    for (const [index, song] of (input?.songs || []).entries()) {
      const songId = String(song?.id || "");
      if (!songId) errors.push(`songs[${index}].id is required`);
      else if (songIds.has(songId)) errors.push(`duplicate song id: ${songId}`);
      else songIds.add(songId);

      if (!Array.isArray(song?.versions)) {
        errors.push(`songs[${index}].versions must be an array`);
        continue;
      }
      for (const [vIndex, version] of song.versions.entries()) {
        const versionId = String(version?.id || "");
        if (!versionId) errors.push(`songs[${index}].versions[${vIndex}].id is required`);
        else if (versionIds.has(versionId)) errors.push(`duplicate version id: ${versionId}`);
        else versionIds.add(versionId);

        const start = Number(version?.startTime || 0);
        const end = version?.endTime;
        if (end !== null && end !== undefined && Number(end) < start) errors.push(`version ${versionId || vIndex}: endTime is before startTime`);
        for (const [sIndex, segment] of (version?.skipSegments || []).entries()) {
          if (Number(segment?.end) <= Number(segment?.start)) errors.push(`version ${versionId || vIndex} skipSegments[${sIndex}] has invalid range`);
        }
      }
      for (const tagId of song?.tagIds || []) {
        if (tagIds.size && !tagIds.has(String(tagId))) errors.push(`song ${songId || index} references missing tag: ${tagId}`);
      }
    }

    for (const [index, playlist] of (input?.playlists || []).entries()) {
      for (const songId of playlist?.songIds || []) {
        if (!songIds.has(String(songId))) errors.push(`playlists[${index}] references missing song: ${songId}`);
      }
    }
    return { ok: errors.length === 0, errors };
  }'''
schema = replace_once(schema, old_validate, new_validate, "strong schema validation")
write("library-schema.js", schema)

# ---------------------------------------------------------------------------
# tests/guards that prevent these regressions from returning.
# ---------------------------------------------------------------------------
(runtime_test := ROOT / "tests" / "runtime-guards.test.js").write_text(r'''const fs = require("fs");
const assert = require("assert");

const read = file => fs.readFileSync(file, "utf8");
const app = read("app.js");
const shell = read("site-shell.js");
const local = read("local-media.js");
const tags = read("tags.js");
const mobile = read("mobile.css");
const version = read("version.js");

assert(!shell.includes("GH v35"), "legacy GH v35 writer must not return");
assert(!app.includes("lyrictube_v14_"), "legacy export filename must not return");
assert(!local.includes("clearInterval(timer), 30000"), "Local Media must not time out while waiting for login");
assert(!tags.includes("clearInterval(timer), 30000"), "Tags must not time out while waiting for login");
assert(app.includes("d.dataset.time=String(line.time)"), "synced lyric DOM must carry its timestamp");
assert(app.includes("seekMainPlayback(currentPlayerTime()+5)"), "keyboard seeking must use generic player path");
assert(app.includes("selectedLocalMediaStatus"), "app must understand local playback state");
assert(local.includes("playCurrent()"), "Local Media must expose playback contract");
assert(mobile.includes("38px minmax(0,1fr) minmax(0,1fr)!important"), "mobile sidebar tools must fit four controls");
assert(version.includes('version: "v0.12.0"'), "expected v0.12.0");
console.log("runtime regression guards passed");
''', encoding="utf-8")

(schema_test := ROOT / "tests" / "library-schema.test.js").write_text(r'''const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("library-schema.js", "utf8"), sandbox);
const api = sandbox.window.LyricTubeLibrarySchema;

const valid = { version: 3, settings: { tags: [{ id: "t1", name: "x" }] }, songs: [{ id: "s1", tagIds: ["t1"], versions: [{ id: "v1", startTime: 0, endTime: 10, skipSegments: [] }] }], playlists: [{ id: "p1", songIds: ["s1"] }] };
assert(api.validate(api.migrate(valid)).ok);

const duplicate = JSON.parse(JSON.stringify(valid));
duplicate.songs.push({ id: "s1", versions: [{ id: "v2" }] });
assert(!api.validate(api.migrate(duplicate)).ok);

const badRange = JSON.parse(JSON.stringify(valid));
badRange.songs[0].versions[0].endTime = -1;
assert(!api.validate(api.migrate(badRange)).ok);
console.log("library schema tests passed");
''', encoding="utf-8")

# ---------------------------------------------------------------------------
# docs
# ---------------------------------------------------------------------------
readme = read("README.md")
readme = readme.replace("**Current version: v0.11.0**", "**Current version: v0.12.0**")
readme = readme.replace("**Build: 20260830-3**", "**Build: 20260830-4**")
readme = readme.replace("- 表示: `v0.11.0`", "- 表示: `v0.12.0`")
readme = readme.replace("- Build: `20260830-3`", "- Build: `20260830-4`")
readme += '''\n\n## v0.12.0 安定性修正\n\n- ログインを30秒以上放置してもLocal Media / Tagsが確実に初期化されるよう、Pollingから`lyrictube:app-ready`イベントへ変更。\n- MP3 / MP4でも同期歌詞追従、歌詞クリックシーク、Space / ← / →操作が同じ再生経路を使うよう修正。\n- `GH v35`を再表示する旧処理と`lyrictube_v14_`書き出し名を撤去。\n- 破損したlocalStorage JSONは上書き前に復旧用コピーへ退避。\n- Sidebar下部4操作をPC / モバイルとも4列で固定。\n- Schema検査と回帰テストを強化。\n'''
write("README.md", readme)

known = read("docs/KNOWN_ISSUES.md")
known = known.replace("# Known Issues", "# Known Issues\n\n> v0.12.0でLocal Mediaの同期歌詞・キーボード操作、30秒初期化タイムアウト、旧バージョン表示の再発を修正しました。")
write("docs/KNOWN_ISSUES.md", known)

report = read("作業報告書.md")
report = '''## v0.12.0 安定性修正（2026-08-30）\n\n### 修正した内容\n\n- Local Media / Tagsの30秒Polling初期化を廃止し、`lyrictube:app-ready`イベントへ変更。\n- MP3 / MP4の同期歌詞追従、歌詞クリックシーク、Space / ← / →操作を共通Player経路へ修正。\n- Local Mediaへ小さな再生API（play / pause / seek / time / duration / state）を追加。\n- `site-shell.js`に残っていた`GH v35`再表示コードを削除。\n- JSON書き出し名の旧`v14`表記を撤去。\n- `guest.css`の二重読込処理を削除。\n- 壊れたlocalStorage JSONを復旧キーへ退避してから空ライブラリへ移るよう変更。\n- Schema検査をID重複、Playlist参照、時間範囲、Skip範囲、Tag参照まで拡張。\n- PC / MobileのSidebar下部4操作を4列固定。\n- 現行仕様に合わせてHelpを更新。\n- 回帰テストを追加。\n\n### 完了条件の確認\n\n- 既存のYouTube / Local Media / 歌詞 / Quick Sync / Cloud / Tagsの保存形式は維持。\n- `lyrictube.library.v3` / Data Schema 4は変更なし。\n- JavaScript構文、JSON/Static検証、NodeロジックテストをCIで確認する。\n- 実YouTube / MP3 / MP4再生とモバイル実機操作はGitHub Pagesデプロイ後の実ブラウザ確認が必要。\n\n''' + report
write("作業報告書.md", report)

print("v0.12.0 reliability patch applied")
