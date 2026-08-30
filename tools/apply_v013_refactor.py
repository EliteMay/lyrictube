from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_VERSION = "v0.12.0"
NEW_VERSION = "v0.13.0"
OLD_BUILD = "20260830-4"
NEW_BUILD = "20260830-5"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise RuntimeError(f"missing expected pattern: {label}")


# 1) app.js: move pure utilities behind core/app-utils.js and expose extension hooks.
app = read("app.js")
start = app.find('function normalizeText(v=""){')
end = app.find("function applyEditedLyricsToExistingSync")
if start < 0 or end < 0 or end <= start:
    raise RuntimeError("could not locate app utility block")

aliases = '''const appUtils=window.LyricTubeAppUtils;
if(!appUtils)throw new Error("core/app-utils.js is required before app.js");
const {
  normalizeText,clamp,escText,typeName,versionDisplayName,formatTime,parseTimecode,
  extractVideoId,thumbnailUrl,parseLrc,plainFromLrc,lyricTextLines,lyricLineKey,
  lcsLineMapping,interpolateTimeForInsertedLine,isSyncMarkerText,
  mergePreservedSyncMarkers,rebaseLrcTextKeepingTimes
}=appUtils;

'''
app = app[:start] + aliases + app[end:]

old_view_tail = '''  const q=normalizeText(els.librarySearch.value);
  if(q)arr=arr.filter(s=>normalizeText(`${s.title} ${s.artist} ${s.versions.map(v=>`${v.performer} ${v.label}`).join(" ")}`).includes(q));
  return arr
}'''
new_view_tail = '''  const q=normalizeText(els.librarySearch.value);
  if(q)arr=arr.filter(s=>normalizeText(`${s.title} ${s.artist} ${s.versions.map(v=>`${v.performer} ${v.label}`).join(" ")}`).includes(q));
  arr=window.LyricTubeHooks?.applyFilters?.("songs:view",arr,{currentView,query:q,library})||arr;
  return arr
}'''
require(app, old_view_tail, "viewSongs tail")
app = app.replace(old_view_tail, new_view_tail, 1)

old_main_page = '''function renderMainPage(){
  const browse=mainPage==="browse";
  els.browsePage.classList.toggle("page-hidden",!browse);
  els.playerWorkspace.classList.toggle("page-hidden",browse);
  els.playerPageBtn.classList.toggle("active",!browse);
  els.browsePageBtn.classList.toggle("active",browse);
}'''
new_main_page = '''function renderMainPage(){
  if(window.LyricTubeHooks?.dispatchHandled?.("render:main-page",{mainPage,library,currentView}))return;
  const browse=mainPage==="browse";
  els.browsePage.classList.toggle("page-hidden",!browse);
  els.playerWorkspace.classList.toggle("page-hidden",browse);
  els.playerPageBtn.classList.toggle("active",!browse);
  els.browsePageBtn.classList.toggle("active",browse);
  window.LyricTubeHooks?.emit?.("render:main-page:done",{mainPage,library,currentView});
}'''
require(app, old_main_page, "renderMainPage")
app = app.replace(old_main_page, new_main_page, 1)

empty_tail = '''    wrap.append(strong,span);
    empty.appendChild(wrap);
    els.browseGrid.appendChild(empty);
    return;
  }'''
empty_new = '''    wrap.append(strong,span);
    empty.appendChild(wrap);
    els.browseGrid.appendChild(empty);
    window.LyricTubeHooks?.emit?.("render:browse",{songs,empty:true});
    return;
  }'''
require(app, empty_tail, "renderBrowse empty")
app = app.replace(empty_tail, empty_new, 1)

browse_end = '''    body.append(title,artist,status);
    card.append(actions,cover,body);
    els.browseGrid.appendChild(card);
  }
}
function renderAll(){ensureSelection();applyUiSettings();renderViewNav();renderPlaylists();renderLibrary();renderBrowse();renderSelectedSong();renderBottomPlayer();updateVisualTheme();renderMainPage()}'''
browse_new = '''    body.append(title,artist,status);
    card.append(actions,cover,body);
    els.browseGrid.appendChild(card);
  }
  window.LyricTubeHooks?.emit?.("render:browse",{songs,empty:false});
}
function renderAll(){
  ensureSelection();
  applyUiSettings();
  renderViewNav();
  renderPlaylists();
  renderLibrary();
  renderBrowse();
  renderSelectedSong();
  renderBottomPlayer();
  updateVisualTheme();
  renderMainPage();
  window.LyricTubeHooks?.emit?.("render:all",{library,currentView,mainPage});
}'''
require(app, browse_end, "renderBrowse/renderAll boundary")
app = app.replace(browse_end, browse_new, 1)

# Current façade exposes the extension bus so future modules do not patch raw globals.
old_facade_tail = '''  seek: (target, autoplay = false) => seekMainPlayback(target,{autoplay}),
});'''
new_facade_tail = '''  seek: (target, autoplay = false) => seekMainPlayback(target,{autoplay}),
  hooks: window.LyricTubeHooks,
});'''
require(app, old_facade_tail, "LyricTubeCore facade tail")
app = app.replace(old_facade_tail, new_facade_tail, 1)
write("app.js", app)

# 2) tags.js: stop replacing core functions; use filter/render/page hooks instead.
tags = read("tags.js")
patch_start = tags.find("  function installFunctionPatches() {")
patch_end = tags.find("  function installEvents() {", patch_start)
if patch_start < 0 or patch_end < 0:
    raise RuntimeError("could not locate tag function patch block")

hook_block = '''  function installHooks() {
    const hooks=window.LyricTubeHooks;
    if(!hooks)throw new Error("core/runtime-hooks.js is required before tags.js");

    hooks.addFilter("songs:view", result => {
      if(!activeTagIds.size)return result;
      const required=[...activeTagIds];
      return result.filter(song => {
        const set=new Set(songTagIds(song));
        return required.every(id => set.has(id));
      });
    });

    hooks.on("render:browse", () => {
      ensureBrowseTagFilter();
      renderTagFilter();
      augmentBrowseCards();
    });

    hooks.on("render:all", () => {
      ensureUi();
      renderTagSidebar();
      renderTagFilter();
      updateTopTagButton();
      if(tagPageOpen)renderTagManagerPage();
    });

    hooks.handle("render:main-page", () => {
      const tagsPage=$("tagsPage");
      if(tagPageOpen&&tagsPage){
        $("browsePage")?.classList.add("page-hidden");
        $("playerWorkspace")?.classList.add("page-hidden");
        tagsPage.classList.remove("page-hidden");
        $("playerPageBtn")?.classList.remove("active");
        $("browsePageBtn")?.classList.remove("active");
        $("tagsPageBtn")?.classList.add("active");
        return true;
      }
      tagsPage?.classList.add("page-hidden");
      $("tagsPageBtn")?.classList.remove("active");
      return false;
    });
  }

'''
tags = tags[:patch_start] + hook_block + tags[patch_end:]

# The old wrapper helper is now dead code; remove it as well.
wrapper_start = tags.find("  function renderMainPagePatch(original) {")
wrapper_end = tags.find("  function renderTagSidebar() {", wrapper_start)
if wrapper_start >= 0 and wrapper_end > wrapper_start:
    tags = tags[:wrapper_start] + tags[wrapper_end:]

require(tags, "    installFunctionPatches();", "tags init patch call")
tags = tags.replace("    installFunctionPatches();", "    installHooks();", 1)
write("tags.js", tags)

# 3) Update runtime version/build fallbacks.
for path in [
    "app.js", "site-shell.js", "profile-data.js", "cloud-sync.js", "lyrics-providers.js",
    "local-media.js", "tags.js", "library-schema.js", "sync-interpolation.js"
]:
    text = read(path)
    text = text.replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD)
    write(path, text)

version = read("version.js").replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD)
write("version.js", version)

defaults_path = ROOT / "data/defaults.json"
defaults = json.loads(defaults_path.read_text(encoding="utf-8"))
defaults["appVersion"] = NEW_VERSION
defaults["buildRevision"] = NEW_BUILD
defaults_path.write_text(json.dumps(defaults, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 4) index: load extracted core modules before app bootstrap and use the new cache revision.
index = read("index.html").replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD)
needle = f'  <script src="version.js?v={NEW_BUILD}"></script>\n  <script src="library-schema.js?v={NEW_BUILD}"></script>'
replacement = f'  <script src="version.js?v={NEW_BUILD}"></script>\n  <script src="core/app-utils.js?v={NEW_BUILD}"></script>\n  <script src="core/runtime-hooks.js?v={NEW_BUILD}"></script>\n  <script src="library-schema.js?v={NEW_BUILD}"></script>'
require(index, needle, "index core insertion")
index = index.replace(needle, replacement, 1)
write("index.html", index)

# 5) Static validator requires the new runtime dependencies.
validator = read("tools/validate_static.py")
needle = 'required = [\n    "version.js",\n    "library-schema.js",'
replacement = 'required = [\n    "version.js",\n    "core/app-utils.js",\n    "core/runtime-hooks.js",\n    "library-schema.js",'
require(validator, needle, "static required list")
validator = validator.replace(needle, replacement, 1)
write("tools/validate_static.py", validator)

# 6) Regression guards: ensure the refactor cannot silently regress to monkey-patching.
guards = read("tests/runtime-guards.test.js")
guards = guards.replace('assert(version.includes(\'version: "v0.12.0"\'), "expected v0.12.0");', 'assert(version.includes(\'version: "v0.13.0"\'), "expected v0.13.0");')
extra = '''\nassert(app.includes("window.LyricTubeAppUtils"), "app must consume extracted pure utilities");
assert(app.includes('applyFilters?.("songs:view"'), "viewSongs must expose the song filter hook");
assert(!tags.includes("originalViewSongs"), "Tags must not monkey-patch viewSongs");
assert(!tags.includes("originalRenderAll"), "Tags must not monkey-patch renderAll");
assert(tags.includes('hooks.addFilter("songs:view"'), "Tags must use the song filter hook");
assert(tags.includes('hooks.handle("render:main-page"'), "Tags page must use the page render hook");
const index = read("index.html");
assert(index.includes("core/app-utils.js"), "index must load app utilities");
assert(index.includes("core/runtime-hooks.js"), "index must load runtime hooks");
'''
require(guards, 'console.log("runtime regression guards passed");', "runtime guard ending")
guards = guards.replace('console.log("runtime regression guards passed");', extra + '\nconsole.log("runtime regression guards passed");')
write("tests/runtime-guards.test.js", guards)

# 7) Documentation.
readme = read("README.md").replace("**Current version: v0.12.0**", f"**Current version: {NEW_VERSION}**").replace("**Build: 20260830-4**", f"**Build: {NEW_BUILD}**")
readme = readme.replace("├─ library-schema.js          ライブラリ正規化・移行", "├─ core/app-utils.js         LRC / 時刻 / 文字列などPure utility\n├─ core/runtime-hooks.js     拡張機能用Hook / Filter基盤\n├─ library-schema.js          ライブラリ正規化・移行")
readme = readme.replace("`app.js` はまだ大きいため、v0.10系では互換性を壊さない範囲で公開Facadeを追加し、今後段階的に分割します。", "`app.js` はまだ大きいですが、v0.13.0でPure utilityを `core/app-utils.js` へ分離し、タグ機能の本体関数上書きをHook方式へ移行しました。今後も同じ手順でPlayer / UIを段階分割します。")
readme = readme.replace("- 表示: `v0.12.0`", f"- 表示: `{NEW_VERSION}`").replace("- Build: `20260830-4`", f"- Build: `{NEW_BUILD}`")
write("README.md", readme)

arch = read("docs/ARCHITECTURE.md")
arch = arch.replace("LyricTube v0.11.0 の現行構成です。", f"LyricTube {NEW_VERSION} の現行構成です。")
arch = arch.replace("1. `version.js`\n2. `library-schema.js`\n3. `sync-interpolation.js`", "1. `version.js`\n2. `core/app-utils.js`\n3. `core/runtime-hooks.js`\n4. `library-schema.js`\n5. `sync-interpolation.js`")
arch = arch.replace("4. `profile-data.js`\n5. `cloud-sync.js`\n6. `site-shell.js`\n7. `lyrics-providers.js`\n8. `local-media.js`\n9. `tags.js`\n10. ログイン / ゲスト確定後に `site-shell.js` が `app.js` を読み込む", "6. `profile-data.js`\n7. `cloud-sync.js`\n8. `site-shell.js`\n9. `lyrics-providers.js`\n10. `local-media.js`\n11. `tags.js`\n12. ログイン / ゲスト確定後に `site-shell.js` が `app.js` を読み込む")
arch = arch.replace("### library-schema.js", "### core/app-utils.js\n\n- LRC parse / format\n- 時刻変換\n- YouTube ID抽出\n- 歌詞編集時の同期時刻保持\n- DOMに依存しないPure utility\n\n### core/runtime-hooks.js\n\n- 拡張機能向けEvent / Filter / handled hook\n- 本体関数の代入上書きを減らすための正式な拡張口\n- `tags.js` はv0.13.0からこのHookを利用\n\n### library-schema.js")
arch = arch.replace("タグ作成、付与、絞り込み、管理画面。", "タグ作成、付与、絞り込み、管理画面。v0.13.0から `viewSongs / renderAll / renderBrowse / renderMainPage` の直接上書きを廃止し、`core/runtime-hooks.js` 経由で接続します。")
arch = arch.replace("1. Pure utility\n2. Library model\n3. Lyrics parser / sync editor\n4. Player controller\n5. Dialog / UI renderer\n6. app bootstrap", "1. ~~Pure utility~~ — v0.13.0で第一段階完了\n2. Library model\n3. Lyrics parser / sync editor\n4. Player controller\n5. Dialog / UI renderer\n6. app bootstrap")
write("docs/ARCHITECTURE.md", arch)

entry = f'''## {NEW_VERSION} 段階リファクタ Phase 1（2026-08-30）\n\n- `core/app-utils.js` を追加し、LRC・時刻・文字列・同期保持のPure utilityを `app.js` から分離。\n- `core/runtime-hooks.js` を追加。\n- `tags.js` に残っていた `viewSongs / renderBrowse / renderAll / renderMainPage` の関数上書きを廃止。\n- タグ絞り込みはFilter、描画拡張はRender Hook、タグ画面はhandled Hookへ移行。\n- Utility / HookのNodeテストを追加。\n- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。\n\n'''
for path in ["docs/CHANGELOG.md", "作業報告書.md"]:
    text = read(path)
    if not text.startswith(f"## {NEW_VERSION}"):
        write(path, entry + text)

print("v0.13.0 phase-1 refactor applied")
