from pathlib import Path

OLD_BUILD = "20260906-2"
NEW_BUILD = "20260906-3"

# 1) Sidebar tag click toggles the sole active tag off instead of reselecting it.
p = Path("tags.js")
text = p.read_text(encoding="utf-8")
old = '''      button.addEventListener("click", () => {
        activeTagIds.clear();
        activeTagIds.add(tag.id);
        openStandardPage("browse");
        renderAll();
      });'''
new = '''      button.addEventListener("click", () => {
        const sameTagOnly = activeTagIds.size === 1 && activeTagIds.has(tag.id);
        activeTagIds.clear();
        if (!sameTagOnly) activeTagIds.add(tag.id);
        openStandardPage("browse");
        renderAll();
      });'''
if old not in text:
    raise SystemExit("sidebar tag click anchor missing")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")

# 2) Regression guard in the existing tag test.
p = Path("tests/song-form-tags.test.js")
text = p.read_text(encoding="utf-8")
anchor = 'console.log("song-form tag regression checks passed");\n'
addition = '''assert.match(tags,/const sameTagOnly = activeTagIds\\.size === 1 && activeTagIds\\.has\\(tag\\.id\\)/,"sidebar tag must detect a repeated single-tag selection");
assert.match(tags,/activeTagIds\\.clear\\(\\);\\s*if \\(!sameTagOnly\\) activeTagIds\\.add\\(tag\\.id\\)/,"clicking the active sidebar tag must clear the tag filter instead of immediately re-adding it");
''' + anchor
if anchor not in text:
    raise SystemExit("song-form tag test footer missing")
text = text.replace(anchor, addition, 1)
p.write_text(text, encoding="utf-8")

# 3) Persist the explicit UX requirement.
p = Path("REQUIREMENTS.md")
text = p.read_text(encoding="utf-8")
anchor = '''詳細履歴は「最近再生」等から到達可能にする。
'''
addition = anchor + '''\nSidebarのタグ一覧は単一タグ絞り込みのショートカットとして扱う。現在選択中のタグをもう一度クリック / タップした場合は、そのタグ絞り込みを解除して一覧へ戻れること。タグ解除時に検索文字や他の独立したFilter条件を勝手に消さない。\n'''
if anchor not in text:
    raise SystemExit("requirements sidebar anchor missing")
text = text.replace(anchor, addition, 1)

test_anchor = '''### Visual / 実ブラウザ
'''
tag_tests = '''### Tag filter\n\n- Sidebarのタグを押すと、そのタグで絞り込まれる\n- 同じSidebarタグをもう一度押すとタグ絞り込みが解除される\n- タグ解除後は、検索文字など他の独立Filterがある場合はそれだけを維持する\n\n'''
if test_anchor not in text:
    raise SystemExit("requirements test anchor missing")
text = text.replace(test_anchor, tag_tests + test_anchor, 1)
p.write_text(text, encoding="utf-8")

# 4) Build/cache revision bump.
p = Path("version.js")
text = p.read_text(encoding="utf-8")
if f'build: "{OLD_BUILD}"' not in text:
    raise SystemExit("version build anchor missing")
p.write_text(text.replace(f'build: "{OLD_BUILD}"', f'build: "{NEW_BUILD}"', 1), encoding="utf-8")

p = Path("data/defaults.json")
text = p.read_text(encoding="utf-8")
if OLD_BUILD not in text:
    raise SystemExit("defaults build anchor missing")
p.write_text(text.replace(OLD_BUILD, NEW_BUILD), encoding="utf-8")

p = Path("index.html")
text = p.read_text(encoding="utf-8")
if OLD_BUILD not in text:
    raise SystemExit("index cache revision anchor missing")
p.write_text(text.replace(OLD_BUILD, NEW_BUILD), encoding="utf-8")

p = Path("README.md")
text = p.read_text(encoding="utf-8")
if OLD_BUILD not in text:
    raise SystemExit("README build anchor missing")
p.write_text(text.replace(OLD_BUILD, NEW_BUILD), encoding="utf-8")

# 5) Changelog.
p = Path("docs/CHANGELOG.md")
text = p.read_text(encoding="utf-8")
entry = '''## v0.13.2 Sidebar tag toggle / build 20260906-3（2026-09-06）\n\n- Sidebarのタグ絞り込みをToggle操作へ変更。\n- 現在選択中の同じタグをもう一度押すと、タグ条件だけ解除して一覧へ戻れるよう修正。\n- 検索文字など、タグ以外の独立した絞り込み条件は解除時も維持。\n- 既存の `song.tagIds` / `library.settings.tags` とData Schema 4は変更なし。\n- 回帰Guardを追加し、同じタグを再追加して解除不能になる実装の再混入を防止。\n\n'''
if "build 20260906-3" not in text:
    if not text.startswith("# CHANGELOG\n"):
        raise SystemExit("CHANGELOG heading missing")
    text = text.replace("# CHANGELOG\n\n", "# CHANGELOG\n\n" + entry, 1)
p.write_text(text, encoding="utf-8")

print("tag sidebar toggle fix applied")
