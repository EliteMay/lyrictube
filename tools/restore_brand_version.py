from pathlib import Path

VERSION_OLD = "v0.10.1"
VERSION_NEW = "v0.10.2"
BUILD_OLD = "20260830-1"
BUILD_NEW = "20260830-2"


def replace_required(path: str, old: str, new: str, count: int | None = None):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    found = text.count(old)
    if found == 0:
        raise SystemExit(f"required text not found in {path}: {old[:80]!r}")
    if count is not None and found != count:
        raise SystemExit(f"unexpected match count in {path}: {found} != {count}")
    p.write_text(text.replace(old, new), encoding="utf-8")


index = Path("index.html")
text = index.read_text(encoding="utf-8")
text = text.replace("assets/lyrictube-icon.svg", "assets/lyrictube-icon.webp")
text = text.replace('type="image/svg+xml" href="assets/lyrictube-icon.webp"', 'type="image/webp" href="assets/lyrictube-icon.webp"')
old_brand = '<p class="eyebrow">MY MUSIC</p>\n            <div class="brand-title-line"><h1>LyricTube</h1><span class="version-badge">v0.10.1</span></div>'
new_brand = '<p class="eyebrow">MY MUSIC · <span data-app-version>v0.10.2</span></p>\n            <div class="brand-title-line"><h1>LyricTube</h1></div>'
if old_brand not in text:
    raise SystemExit("brand/version markup not found")
text = text.replace(old_brand, new_brand, 1)
text = text.replace(BUILD_OLD, BUILD_NEW)
index.write_text(text, encoding="utf-8")

version = Path("version.js")
text = version.read_text(encoding="utf-8")
text = text.replace(f'version: "{VERSION_OLD}"', f'version: "{VERSION_NEW}"')
text = text.replace(f'build: "{BUILD_OLD}"', f'build: "{BUILD_NEW}"')
old_selector = '''    document.querySelectorAll(".version-badge").forEach(el => {\n      el.textContent = meta.version;\n      el.title = `${meta.product} ${meta.version} · build ${meta.build}`;\n    });'''
new_selector = '''    document.querySelectorAll("[data-app-version], .version-badge").forEach(el => {\n      el.textContent = meta.version;\n      el.title = `${meta.product} ${meta.version} · build ${meta.build}`;\n      el.setAttribute("aria-label", `${meta.product} ${meta.version}`);\n    });'''
if old_selector not in text:
    raise SystemExit("version UI selector block not found")
text = text.replace(old_selector, new_selector, 1)
version.write_text(text, encoding="utf-8")

replace_required("app.js", f'|| "{VERSION_OLD}"', f'|| "{VERSION_NEW}"', 1)
replace_required("data/defaults.json", f'"appVersion": "{VERSION_OLD}"', f'"appVersion": "{VERSION_NEW}"', 1)
replace_required("data/defaults.json", f'"buildRevision": "{BUILD_OLD}"', f'"buildRevision": "{BUILD_NEW}"', 1)

readme = Path("README.md")
text = readme.read_text(encoding="utf-8").replace(VERSION_OLD, VERSION_NEW).replace(BUILD_OLD, BUILD_NEW)
readme.write_text(text, encoding="utf-8")

changelog = Path("docs/CHANGELOG.md")
text = changelog.read_text(encoding="utf-8")
entry = '''## v0.10.2 - 2026-08-30\n\n- 土台整理時に意図せず変更されていたLyricTubeの元WebPアイコンを復元。\n- VReviewの実際の表示方式に合わせ、タイトル横のバージョンバッジを廃止。\n- サイドバー上部を `MY MUSIC · v0.10.2` の控えめな表示に変更。\n- Build番号は引き続きキャッシュ・デバッグ専用として通常UIには表示しない。\n\n'''
if not text.startswith("## v0.10.2"):
    changelog.write_text(entry + text, encoding="utf-8")

report = Path("作業報告書.md")
if report.exists():
    text = report.read_text(encoding="utf-8")
    note = '''## v0.10.2 追加修正（2026-08-30）\n\n- 元のWebPアイコンをGit履歴から復元。\n- 意図せず追加されていた代替SVGアイコンの利用を停止。\n- VReviewを再確認し、バージョン表示を `MY MUSIC · v0.10.2` 形式へ変更。\n- 表示Versionと内部Buildの分離方針は維持。\n- GitHub Pages上の実ブラウザ表示はデプロイ後にユーザー確認が必要。\n\n'''
    if not text.startswith("## v0.10.2 追加修正"):
        report.write_text(note + text, encoding="utf-8")

svg = Path("assets/lyrictube-icon.svg")
if svg.exists():
    svg.unlink()

print("restored original brand icon and VReview-style version presentation")
