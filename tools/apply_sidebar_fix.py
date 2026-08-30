from pathlib import Path

BUILD = "20260830-8"

# index.html
p = Path("index.html")
text = p.read_text(encoding="utf-8")
if 'class="sidebar-scroll"' not in text:
    start = '      </div>\n\n      <label class="search-box">'
    end = '      <div id="songList" class="song-list"></div>\n\n      <div class="sidebar-tools">'
    if start not in text or end not in text:
        raise SystemExit("sidebar markers not found")
    text = text.replace(start, '      </div>\n\n      <div class="sidebar-scroll" aria-label="ライブラリと分類">\n        <label class="search-box">', 1)
    text = text.replace(end, '      <div id="songList" class="song-list"></div>\n      </div>\n\n      <div class="sidebar-tools">', 1)
if 'href="sidebar.css?' not in text:
    marker = '  <link rel="stylesheet" href="tags.css?v=20260830-7">'
    if marker not in text:
        raise SystemExit("tags stylesheet marker not found")
    text = text.replace(marker, marker + f'\n  <link rel="stylesheet" href="sidebar.css?v={BUILD}">', 1)
text = text.replace('src="version.js?v=20260830-7"', f'src="version.js?v={BUILD}"')
p.write_text(text, encoding="utf-8")

# Canonical sidebar component CSS loaded last.
Path("sidebar.css").write_text('''/* Canonical sidebar layout: persistent header/tools + one scroll region. */
.sidebar{
  display:grid!important;
  grid-template-rows:auto minmax(0,1fr) auto!important;
  min-height:0!important;
  overflow:hidden!important;
}
.sidebar-scroll{
  min-height:0;
  overflow-y:auto;
  overscroll-behavior:contain;
  scrollbar-gutter:stable;
  padding-right:3px;
}
.sidebar-scroll .search-box{margin-top:16px}
.sidebar-scroll .song-list{
  overflow:visible!important;
  flex:none!important;
  max-height:none!important;
  min-height:0!important;
  padding-right:0;
}
.sidebar-scroll .playlist-nav,
.sidebar-scroll .tag-sidebar-nav{
  max-height:none!important;
  overflow:visible!important;
}
.sidebar-tools{
  min-width:0;
  margin-top:8px!important;
  padding-top:10px;
  border-top:1px solid var(--border);
  position:relative;
  z-index:2;
}
.sidebar-tools .ghost-btn,
.sidebar-tools .file-label{
  min-width:0;
  min-height:42px;
  padding-left:7px;
  padding-right:7px;
  white-space:nowrap;
}
.playlist-head,
.library-head,
.tag-sidebar-head{
  color:var(--text)!important;
  font-weight:700;
}
.tag-sidebar-head{letter-spacing:.06em}

@media(max-width:900px){
  .sidebar-scroll{overflow-y:auto!important}
  .sidebar-tools{padding-top:8px}
}

@media(max-width:900px) and (max-height:640px){
  .sidebar{padding-top:10px!important;padding-bottom:10px!important}
  .brand-subtitle{display:none!important}
  .sidebar-scroll .search-box{margin-top:10px}
  .sidebar-scroll .view-nav{margin:8px 0}
  .sidebar-scroll .view-btn{padding-top:7px;padding-bottom:7px}
  .sidebar-scroll .tag-sidebar-head{margin-top:10px}
  .sidebar-tools{margin-top:6px!important;padding-top:6px}
}
''', encoding="utf-8")

# Build SSOT
p = Path("version.js")
text = p.read_text(encoding="utf-8").replace('build: "20260830-7"', f'build: "{BUILD}"')
p.write_text(text, encoding="utf-8")

p = Path("data/defaults.json")
text = p.read_text(encoding="utf-8").replace('"buildRevision": "20260830-7"', f'"buildRevision": "{BUILD}"')
p.write_text(text, encoding="utf-8")

# Regression guard
Path("tests/sidebar-layout.test.js").write_text('''const fs=require("fs");
const assert=require("assert");
const index=fs.readFileSync("index.html","utf8");
const css=fs.readFileSync("sidebar.css","utf8");
assert(index.includes('class="sidebar-scroll"'),"sidebar scroll region missing");
assert(index.includes('class="sidebar-tools"'),"sidebar tools missing");
assert(/class="sidebar-scroll"[\\s\\S]*id="songList"[\\s\\S]*<\\/div>[\\s\\S]*class="sidebar-tools"/.test(index),"tools must be outside scroll region");
assert(css.includes('grid-template-rows:auto minmax(0,1fr) auto'),"sidebar grid rows missing");
assert(css.includes('overflow-y:auto'),"sidebar middle area must scroll");
assert(css.includes('@media(max-width:900px) and (max-height:640px)'),"low-height guard missing");
console.log("sidebar layout regression guards passed");
''', encoding="utf-8")

# Documentation
p = Path("README.md")
text = p.read_text(encoding="utf-8")
text = text.replace("**Build: 20260830-7**", f"**Build: {BUILD}**", 1)
text = text.replace("- Build: `20260830-7`", f"- Build: `{BUILD}`", 1)
entry = '''\n## v0.13.2 Sidebar安定化（build 20260830-8）\n\n- Sidebarを「ブランド / 中央スクロール / 操作ツール」の3領域に分離。\n- タグ・プレイリスト・曲一覧だけを中央でスクロールし、`設定 / ? / 書き出し / 読み込み` は常に表示領域へ残す。\n- 低い縦解像度やモバイルでも主要操作が押し出されにくい構造へ変更。\n- Sidebar見出しのコントラストを改善。\n- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。\n'''
anchor = "\n## v0.12.0 安定性修正\n"
if "## v0.13.2 Sidebar安定化（build 20260830-8）" not in text:
    text = text.replace(anchor, entry + anchor, 1)
p.write_text(text, encoding="utf-8")

report = '''## v0.13.2 Sidebar安定化 / build 20260830-8（2026-08-30）\n\n- `web-project-guide` の既存サイト修正ルート、F-006 / F-012、UI / UX / Quality Checklistを基準に修正。\n- Sidebarをブランド・中央Scroll・下部操作の3領域へ分離。\n- 低い画面やモバイルで `設定 / ? / 書き出し / 読み込み` が画面外へ押し出される問題を修正。\n- タグ / プレイリスト / 曲一覧のNested Scrollを減らし、中央の単一Scroll領域へ集約。\n- Sidebar見出しの視認性を改善。\n- `tests/sidebar-layout.test.js` を追加。\n- 保存形式 / Storage Key / Schema変更なし。\n- Static Validation対象。実ブラウザの低い縦解像度・125〜150% Zoomは未確認。\n\n'''
p = Path("作業報告書.md")
text = p.read_text(encoding="utf-8")
if not text.startswith("## v0.13.2 Sidebar安定化 / build 20260830-8"):
    p.write_text(report + text, encoding="utf-8")

p = Path("docs/CHANGELOG.md")
text = p.read_text(encoding="utf-8")
entry = '''## v0.13.2 Sidebar安定化 / build 20260830-8（2026-08-30）\n\n- Sidebarをブランド / 独立Scroll / 操作ツールの3領域へ整理。\n- 低い画面やモバイルで設定・ヘルプ・書き出し・読み込みが消える問題を修正。\n- Sidebar見出しの視認性を改善。\n- Sidebar LayoutのRegression Guardを追加。\n- 保存Schema変更なし。\n\n'''
if not text.startswith("## v0.13.2 Sidebar安定化 / build 20260830-8"):
    p.write_text(entry + text, encoding="utf-8")
