from pathlib import Path

OLD_BUILD = "20260902-1"
NEW_BUILD = "20260903-1"


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


auth = Path("auth-ui.css")
text = auth.read_text(encoding="utf-8")
marker = "/* account gate low-height overflow guard */"
if marker not in text:
    text += "\n\n" + "\n".join([
        marker,
        ".access-card{",
        "  max-height:calc(100dvh - 24px);",
        "  overflow-y:auto;",
        "  overscroll-behavior-y:contain;",
        "  scrollbar-gutter:stable;",
        "  -webkit-overflow-scrolling:touch;",
        "}",
        "@supports not (height:100dvh){",
        "  .access-card{max-height:calc(100vh - 24px)}",
        "}",
        "@media(max-height:680px){",
        "  .access-card{max-height:calc(100dvh - 12px)}",
        "}",
        "",
    ])
auth.write_text(text, encoding="utf-8")

replace_once("version.js", f'build: "{OLD_BUILD}"', f'build: "{NEW_BUILD}"')
replace_once("data/defaults.json", f'"buildRevision": "{OLD_BUILD}"', f'"buildRevision": "{NEW_BUILD}"')

index = Path("index.html")
text = index.read_text(encoding="utf-8")
count = text.count(OLD_BUILD)
if count < 8:
    raise SystemExit(f"index build refs unexpectedly low: {count}")
index.write_text(text.replace(OLD_BUILD, NEW_BUILD), encoding="utf-8")

shell = Path("site-shell.js")
text = shell.read_text(encoding="utf-8")
fallback_old = 'const VERSION = window.LyricTubeVersion?.build || "20260901-1";'
fallback_new = f'const VERSION = window.LyricTubeVersion?.build || "{NEW_BUILD}";'
if fallback_old in text:
    text = text.replace(fallback_old, fallback_new, 1)
shell.write_text(text, encoding="utf-8")

readme = Path("README.md")
text = readme.read_text(encoding="utf-8")
if OLD_BUILD not in text:
    raise SystemExit("README old build not found")
readme.write_text(text.replace(OLD_BUILD, NEW_BUILD), encoding="utf-8")

changelog = Path("docs/CHANGELOG.md")
text = changelog.read_text(encoding="utf-8")
entry = "\n".join([
    f"## v0.13.2 Account registration overflow fix / build {NEW_BUILD}（2026-09-03）",
    "",
    "- 新規アカウント作成フォームが低い画面・高いZoomでViewportを超えた場合、下部の「作成してログイン」まで到達できない問題を修正。",
    "- `.access-card` にdynamic viewport height基準の最大高さと縦スクロールを追加。",
    "- `100dvh` 非対応環境向けに `100vh` fallbackを維持。",
    "- Login / Guest / Account registrationの機能・Supabase・保存Schemaは変更しない。",
    "- User-validated Visual Baselineの配色・構造は変更せず、overflow behaviorだけを修正。",
    "- 実ブラウザでの学校PC相当Viewport確認は未実施。",
    "",
    "",
])
if not text.startswith(entry):
    changelog.write_text(entry + text, encoding="utf-8")

learnings = Path("PROJECT_LEARNINGS.md")
text = learnings.read_text(encoding="utf-8")
if "PL-F-006 Account registration form" not in text:
    learning = "\n".join([
        "",
        "",
        "## PL-F-006 Account registration formが低いViewportで最後まで操作できなかった",
        "",
        "- **Status:** Resolved",
        "- **Symptom:** 新規アカウント作成フォームを開くと、画面高さやZoomによって下部の「作成してログイン」までスクロールできない。",
        "- **Trigger:** Login用の短いCardへ後から長いRegistration Formを追加したが、Card自身にViewport基準のmax-height / overflow contractがなかった。",
        "- **Root cause:** Desktopの十分な縦解像度だけを前提にし、低いViewport・学校PCの表示Scale・Browser ZoomをRegression対象にしていなかった。",
        "- **Fix:** `.access-card` に `max-height: calc(100dvh - ...)` と `overflow-y:auto` を持たせ、`100vh` fallbackを追加。",
        "- **Regression guard:** `tests/account-register-scroll.test.js` でdynamic viewport / overflow / cache revisionを確認する。",
        "- **Prevention:** Modal / Gateへ内容を追加したときは、横幅だけでなく低ViewportとZoom時にPrimary Actionへ到達できるか確認する。",
        "",
    ])
    learnings.write_text(text.rstrip() + learning, encoding="utf-8")

report = Path("作業報告書.md")
if report.exists():
    text = report.read_text(encoding="utf-8")
    entry = "\n".join([
        "## 2026-09-03 Account registration scroll fix",
        "",
        "- User report: 新規アカウント作成画面で下まで移動できない。",
        "- Cause: Registration Form追加後もAccess Cardに低Viewport時の縦Scroll contractがなかった。",
        "- Fix: `auth-ui.css` の `.access-card` にdynamic viewport max-height + overflow-yを追加。",
        f"- Build: `{NEW_BUILD}`",
        "- Storage / Schema / Supabase: 変更なし。",
        "- Visual verification: 実ブラウザ未確認。CI / Pages後にユーザー環境で確認予定。",
        "",
        "",
    ])
    if not text.startswith(entry):
        report.write_text(entry + text, encoding="utf-8")

test = Path("tests/account-register-scroll.test.js")
test.write_text('''"use strict";\nconst assert=require("node:assert/strict");\nconst fs=require("node:fs");\n\nconst css=fs.readFileSync("auth-ui.css","utf8");\nconst version=fs.readFileSync("version.js","utf8");\nconst index=fs.readFileSync("index.html","utf8");\nconst build=version.match(/build:\\s*"([^"]+)"/)?.[1];\n\nassert(build,"current build metadata missing");\nassert.match(css,/\\.access-card\\s*\\{[\\s\\S]*max-height:calc\\(100dvh - 24px\\)/,"access card must be capped to the dynamic viewport");\nassert.match(css,/\\.access-card\\s*\\{[\\s\\S]*overflow-y:auto/,"access card must scroll vertically when registration content is taller than the viewport");\nassert.match(css,/overscroll-behavior-y:contain/,"registration scroll should stay inside the access card");\nassert.match(css,/@supports not \\(height:100dvh\\)[\\s\\S]*100vh/,"100vh fallback is required for older browsers");\nassert(index.includes(`auth-ui.css?v=${build}`),"auth UI cache revision must follow current build metadata");\nconsole.log("account registration overflow regression guards passed");\n''', encoding="utf-8")
