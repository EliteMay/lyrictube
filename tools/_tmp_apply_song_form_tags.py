from pathlib import Path

BUILD_OLD = "20260901-1"
BUILD_NEW = "20260902-1"


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly 1 match, got {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all_required(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count < 1:
        raise SystemExit(f"{path}: expected at least 1 match for {old!r}")
    p.write_text(text.replace(old, new), encoding="utf-8")


# Core song-dialog lifecycle hooks. Tags remain an extension and do not duplicate save logic.
replace_once(
    "app.js",
    '  els.songDialog.showModal();\n}\nasync function searchLyrics(){',
    '  window.LyricTubeHooks?.emit("dialog:song-open",{song:song||null,editing:Boolean(song)});\n'
    '  els.songDialog.showModal();\n}\nasync function searchLyrics(){'
)
replace_once(
    "app.js",
    '  if(old){\n    library.songs=library.songs.map(s=>s.id===old.id?song:s);\n  }else{',
    '  song=window.LyricTubeHooks?.applyFilters("song:before-save",song,{old:old||null,editing:Boolean(old)})||song;\n\n'
    '  if(old){\n    library.songs=library.songs.map(s=>s.id===old.id?song:s);\n  }else{'
)

# Tag extension state + embedded song-form UI.
replace_once(
    "tags.js",
    '  let songTagTargetId = "";\n  let songTagDraft = new Set();',
    '  let songTagTargetId = "";\n  let songTagDraft = new Set();\n  let songFormTagDraft = new Set();'
)
replace_once(
    "tags.js",
    '    createTagEditorDialog();\n    createSongTagDialog();\n    ensurePageButton();',
    '    createTagEditorDialog();\n    createSongTagDialog();\n    createSongFormTagSection();\n    ensurePageButton();'
)

song_form_ui = r'''
  function createSongFormTagSection() {
    if ($("songFormTagSection")) return;
    const lyricsBox = document.querySelector("#songForm .lyrics-source-box");
    if (!lyricsBox?.parentElement) return;

    const section = document.createElement("section");
    section.id = "songFormTagSection";
    section.className = "song-form-tag-section";
    section.innerHTML = `
      <div class="song-form-tag-head">
        <div><strong>タグ</strong><span>曲を追加・編集するときに、そのまま分類できます。</span></div>
        <span id="songFormTagCount" class="song-form-tag-count"></span>
      </div>
      <div id="songFormTagList" class="song-form-tag-list"></div>
      <div class="song-form-tag-create">
        <input id="songFormQuickTagName" type="text" maxlength="24" placeholder="新しいタグ名">
        <select id="songFormQuickTagColor" aria-label="新しいタグの色"></select>
        <button id="songFormQuickCreateTagBtn" class="primary-soft" type="button">作成して選択</button>
      </div>`;
    lyricsBox.before(section);

    const select = $("songFormQuickTagColor");
    for (const preset of COLOR_PRESETS) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      select.appendChild(option);
    }
    $("songFormQuickCreateTagBtn")?.addEventListener("click", quickCreateSongFormTag);
  }

  function renderSongFormTagList() {
    const list = $("songFormTagList");
    if (!list) return;
    list.innerHTML = "";

    if (!tags().length) {
      const empty = document.createElement("span");
      empty.className = "song-form-tag-empty";
      empty.textContent = "タグはまだありません。下から作ると、この曲へそのまま付けられます。";
      list.appendChild(empty);
    } else {
      for (const tag of tags()) {
        const label = document.createElement("label");
        label.className = "song-form-tag-option";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = songFormTagDraft.has(tag.id);
        input.addEventListener("change", () => {
          if (input.checked) songFormTagDraft.add(tag.id);
          else songFormTagDraft.delete(tag.id);
          renderSongFormTagCount();
        });
        label.append(input, makeTagPill(tag));
        list.appendChild(label);
      }
    }
    renderSongFormTagCount();
  }

  function renderSongFormTagCount() {
    const count = $("songFormTagCount");
    if (!count) return;
    const selected = [...songFormTagDraft].filter(id => tagById(id)).length;
    count.textContent = selected ? `${selected}個選択` : "未選択";
  }

  function resetSongFormTags(song = null) {
    songFormTagDraft = new Set(songTagIds(song));
    if ($("songFormQuickTagName")) $("songFormQuickTagName").value = "";
    if ($("songFormQuickTagColor")) $("songFormQuickTagColor").value = "violet";
    renderSongFormTagList();
  }

  function quickCreateSongFormTag() {
    const name = String($("songFormQuickTagName")?.value || "").trim().slice(0, 24);
    const colorValue = $("songFormQuickTagColor")?.value;
    const color = COLOR_IDS.has(colorValue) ? colorValue : "violet";
    if (!name) return safeShowToast("新しいタグ名を入力してください。");

    const duplicate = tags().find(tag =>
      tag.name.normalize("NFKC").toLowerCase() === name.normalize("NFKC").toLowerCase()
    );
    if (duplicate) {
      songFormTagDraft.add(duplicate.id);
      renderSongFormTagList();
      safeShowToast("既存のタグを選択しました。");
      return;
    }

    const tag = { id: uid(), name, color };
    tags().push(tag);
    songFormTagDraft.add(tag.id);
    persistLibrary();
    $("songFormQuickTagName").value = "";
    renderSongFormTagList();
    renderTagSidebar();
    renderTagFilter();
    renderTagManagerPage();
    safeShowToast("タグを作成して選択しました。");
  }
'''
replace_once(
    "tags.js",
    '  function openStandardPage(mode) {',
    song_form_ui + '\n  function openStandardPage(mode) {'
)

replace_once(
    "tags.js",
    '    if(!hooks)throw new Error("core/runtime-hooks.js is required before tags.js");\n\n    hooks.addFilter("songs:view", result => {',
    '    if(!hooks)throw new Error("core/runtime-hooks.js is required before tags.js");\n\n'
    '    hooks.on("dialog:song-open", detail => {\n'
    '      resetSongFormTags(detail?.song || null);\n'
    '    });\n\n'
    '    hooks.addFilter("song:before-save", song => ({\n'
    '      ...song,\n'
    '      tagIds:[...songFormTagDraft].filter(id => tagById(id))\n'
    '    }));\n\n'
    '    hooks.addFilter("songs:view", result => {'
)

# Visual styles use existing theme tokens and remain inside the current dialog hierarchy.
p = Path("tags.css")
css = p.read_text(encoding="utf-8")
css_marker = '.song-tag-create{display:grid;grid-template-columns:minmax(0,1fr) 92px auto;gap:7px;padding-top:11px;border-top:1px solid var(--border)}.song-tag-create input,.song-tag-create select{min-width:0;height:38px;padding:0 9px;border:1px solid var(--border);border-radius:9px;background:var(--panel2);color:var(--text);outline:0}.song-tag-create select{cursor:pointer}\n'
if css.count(css_marker) != 1:
    raise SystemExit("tags.css: song tag create marker mismatch")
form_css = r'''

.song-form-tag-section{display:grid;gap:11px;margin:16px 0;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--panel2)}
.song-form-tag-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.song-form-tag-head>div{display:grid;gap:3px}.song-form-tag-head strong{font-size:12px}.song-form-tag-head span{color:var(--muted);font-size:9px;line-height:1.5}.song-form-tag-count{flex:0 0 auto;padding-top:2px;font-size:9px!important;font-weight:800;color:var(--muted)!important}
.song-form-tag-list{display:flex;flex-wrap:wrap;gap:7px;max-height:132px;overflow:auto;padding:2px 1px}.song-form-tag-empty{width:100%;padding:10px 2px;color:var(--muted);font-size:10px;line-height:1.5}
.song-form-tag-option{position:relative;display:inline-flex;cursor:pointer}.song-form-tag-option input{position:absolute;width:1px;height:1px;opacity:0}.song-form-tag-option .tag-pill{opacity:.5;transition:opacity .14s ease,box-shadow .14s ease,transform .14s ease}.song-form-tag-option:hover .tag-pill{opacity:.78}.song-form-tag-option input:checked+.tag-pill{opacity:1;box-shadow:inset 0 0 0 1px var(--tag-border)}.song-form-tag-option input:focus-visible+.tag-pill{outline:2px solid var(--accent);outline-offset:2px}.song-form-tag-option:active .tag-pill{transform:translateY(1px)}
.song-form-tag-create{display:grid;grid-template-columns:minmax(0,1fr) 92px auto;gap:7px;padding-top:10px;border-top:1px solid var(--border)}.song-form-tag-create input,.song-form-tag-create select{min-width:0;height:38px;padding:0 9px;border:1px solid var(--border);border-radius:9px;background:var(--panel);color:var(--text);outline:0}.song-form-tag-create input:focus,.song-form-tag-create select:focus{border-color:var(--accent)}.song-form-tag-create select{cursor:pointer}
'''
p.write_text(css.replace(css_marker, css_marker + form_css, 1), encoding="utf-8")

# Extend existing mobile rule without creating a separate visual system.
replace_once(
    "tags.css",
    '  .song-tag-create{grid-template-columns:1fr 90px}.song-tag-create button{grid-column:1/-1}\n',
    '  .song-tag-create,.song-form-tag-create{grid-template-columns:1fr 90px}.song-tag-create button,.song-form-tag-create button{grid-column:1/-1}\n'
)

# Cache/build revision. Data schema intentionally remains 4.
for path in ["index.html", "version.js", "data/defaults.json", "README.md"]:
    replace_all_required(path, BUILD_OLD, BUILD_NEW)

# Machine-readable feature flag.
replace_once(
    "data/defaults.json",
    '    "tags": true,\n    "lyricsSync": true,',
    '    "tags": true,\n    "songFormTagging": true,\n    "lyricsSync": true,'
)

# Human-facing documentation.
replace_once(
    "README.md",
    '## 歌詞\n',
    '## タグ\n\nタグ管理画面・サイドバー・曲一覧からの編集に加えて、Build `20260902-1` からは「曲を追加 / 曲情報を編集」ダイアログ内でも既存タグを選択できます。タグが無い場合は、その場で新しいタグを作成して選択できます。保存形式は既存の `song.tagIds` / `settings.tags` をそのまま利用し、Data Schema 4は変更しません。\n\n## 歌詞\n'
)

changelog = Path("docs/CHANGELOG.md")
old = changelog.read_text(encoding="utf-8")
entry = '''## v0.13.2 Song form tagging / build 20260902-1（2026-09-02）\n\n- 「曲を追加 / 曲情報を編集」ダイアログへタグ選択欄を追加。\n- 既存タグはチェック式で複数選択でき、保存時に既存の `song.tagIds` へ反映。\n- ダイアログ内から新規タグを作成し、そのまま選択可能。\n- タグ定義は既存の `library.settings.tags` を再利用し、新しい保存Schemaは追加しない。\n- `app.js` はタグ実装へ依存せず、`dialog:song-open` / `song:before-save` Hookで拡張する。\n- User-validated Visual Baselineの構造・Theme Tokenは変更しない。追加欄の実ブラウザVisualは未確認。\n- Data Schema 4 / `lyrictube.library.v3` を維持。\n\n'''
changelog.write_text(entry + old, encoding="utf-8")

# Regression guard.
test = Path("tests/song-form-tags.test.js")
test.write_text(r'''"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");

const app=fs.readFileSync("app.js","utf8");
const tags=fs.readFileSync("tags.js","utf8");
const css=fs.readFileSync("tags.css","utf8");
const index=fs.readFileSync("index.html","utf8");
const defaults=JSON.parse(fs.readFileSync("data/defaults.json","utf8"));

assert.match(app,/emit\("dialog:song-open"/,"song dialog must expose an open lifecycle hook");
assert.match(app,/applyFilters\("song:before-save"/,"song save must expose a pre-save filter");
assert.match(tags,/function createSongFormTagSection\(/,"tags extension must create the embedded song-form tag UI");
assert.match(tags,/hooks\.on\("dialog:song-open"/,"tag draft must reset when the song dialog opens");
assert.match(tags,/hooks\.addFilter\("song:before-save"/,"selected tags must flow through the formal save hook");
assert.match(tags,/tagIds:\[\.\.\.songFormTagDraft\]/,"song form must preserve selected tag ids");
assert.match(css,/\.song-form-tag-section\{/,"song-form tag UI must have visual rules");
assert.match(index,/tags\.css\?v=20260902-1/,"tag CSS cache revision must be current");
assert.match(index,/tags\.js\?v=20260902-1/,"tag JS cache revision must be current");
assert.equal(defaults.dataSchemaVersion,4,"song-form tagging must not bump Data Schema");
assert.equal(defaults.features.songFormTagging,true,"machine-readable feature flag must be enabled");
console.log("song-form tag regression checks passed");
''', encoding="utf-8")

print("song form tagging patch applied")
