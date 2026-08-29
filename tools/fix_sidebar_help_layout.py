from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DISPLAY = "v0.10.1"
BUILD = "20260830-1"


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


# Fix the real cause: the legacy v19 rule still forces the sidebar footer to 3 columns.
styles = read("styles.css")
styles, count = re.subn(
    r"\.sidebar-tools\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}",
    ".sidebar-tools{grid-template-columns:minmax(46px,.72fr) 32px minmax(0,1fr) minmax(0,1fr);gap:6px;align-items:center}",
    styles,
    count=1,
)
if count != 1:
    raise RuntimeError("desktop sidebar-tools legacy 3-column rule not found")

styles = styles.replace(
    ".sidebar-tools .ghost-btn,.sidebar-tools .file-label{min-width:0;padding-left:8px;padding-right:8px}",
    ".sidebar-tools .ghost-btn:not(.help-icon-btn),.sidebar-tools .file-label{min-width:0;padding-left:7px;padding-right:7px;font-size:13px;white-space:nowrap;overflow:hidden}.sidebar-tools .help-icon-btn{justify-self:center}",
    1,
)

styles, mobile_count = re.subn(
    r"\.sidebar-tools\{grid-template-columns:1fr 1fr\}\s*\.sidebar-tools #settingsBtn\{grid-column:1/-1\}",
    ".sidebar-tools{grid-template-columns:minmax(46px,.72fr) 32px minmax(0,1fr) minmax(0,1fr)}\n  .sidebar-tools #settingsBtn{grid-column:auto}",
    styles,
    count=1,
)
if mobile_count != 1:
    raise RuntimeError("mobile sidebar-tools override not found")

write("styles.css", styles)

# Bump the user-facing patch version and cache build.
version = read("version.js")
version = version.replace('version: "v0.10.0"', f'version: "{DISPLAY}"')
version = version.replace('build: "20260829-10"', f'build: "{BUILD}"')
write("version.js", version)

# Update cache-busting references and visible fallback badge in the static shell.
index = read("index.html")
index = index.replace("20260829-10", BUILD).replace(">v0.10.0<", f">{DISPLAY}<")
write("index.html", index)

# Keep fallbacks and current metadata consistent.
for path in ["app.js", "profile-data.js", "site-shell.js", "local-media.js", "tags.js"]:
    p = ROOT / path
    if not p.exists():
        continue
    text = p.read_text(encoding="utf-8")
    text = text.replace('"v0.10.0"', f'"{DISPLAY}"').replace('"20260829-10"', f'"{BUILD}"')
    p.write_text(text, encoding="utf-8")

# Current defaults metadata only; preserve actual user data format.
defaults_path = ROOT / "data/defaults.json"
if defaults_path.exists():
    data = json.loads(defaults_path.read_text(encoding="utf-8"))
    data["appVersion"] = DISPLAY
    data["buildRevision"] = BUILD
    defaults_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# README current version/build.
readme = read("README.md")
readme = readme.replace("v0.10.0", DISPLAY).replace("20260829-10", BUILD)
write("README.md", readme)

# Add concise history entries without rewriting old historical notes.
changelog_path = ROOT / "docs/CHANGELOG.md"
if changelog_path.exists():
    changelog = changelog_path.read_text(encoding="utf-8")
    entry = "## v0.10.1 - 2026-08-30\n\n- サイドバー下部の `設定 / ? / 書き出し / 読み込み` を4項目専用グリッドへ修正。\n- `?` ボタン追加時に `読み込み` が次の行へ落ちるレイアウト崩れを修正。\n- 狭い画面でも同じ4項目レイアウトを維持。\n\n"
    if "## v0.10.1 - 2026-08-30" not in changelog:
        marker = "# CHANGELOG\n\n"
        changelog = changelog.replace(marker, marker + entry, 1) if marker in changelog else entry + changelog
    changelog_path.write_text(changelog, encoding="utf-8")

report_path = ROOT / "作業報告書.md"
if report_path.exists():
    report = report_path.read_text(encoding="utf-8")
    entry = "## v0.10.1 / 2026-08-30\n\n- `?` ヘルプボタン追加後にサイドバー下部が3列の旧CSSを継承し、`読み込み` が2段目へ落ちる問題を修正。\n- 4項目を1行で収めるグリッドへ変更し、モバイル側の旧2列上書きも整合。\n- GitHub Actionsの静的検証対象として通常どおり確認する。\n\n"
    if "## v0.10.1 / 2026-08-30" not in report:
        marker = "# 作業報告書\n\n"
        report = report.replace(marker, marker + entry, 1) if marker in report else entry + report
    report_path.write_text(report, encoding="utf-8")

print("sidebar help layout fixed for", DISPLAY, BUILD)
