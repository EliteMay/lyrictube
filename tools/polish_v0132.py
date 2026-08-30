from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_VERSION = "v0.13.1"
NEW_VERSION = "v0.13.2"
OLD_BUILD = "20260830-6"
NEW_BUILD = "20260830-7"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


app = read("app.js")
old_seek_events = '''els.bottomSeek.addEventListener("change",()=>{
  bottomSeekDragging=false;
  try{ytPlayer?.seekTo?.(Number(els.bottomSeek.value)||0,true)}catch{}
  updateBottomPlayer();
});
els.bottomSeek.addEventListener("pointerup",()=>{
  bottomSeekDragging=false;
  try{ytPlayer?.seekTo?.(Number(els.bottomSeek.value)||0,true)}catch{}
});'''
new_seek_events = '''els.bottomSeek.addEventListener("change",()=>{
  bottomSeekDragging=false;
  seekMainPlayback(Number(els.bottomSeek.value)||0);
  updateBottomPlayer();
});
els.bottomSeek.addEventListener("pointerup",()=>{
  bottomSeekDragging=false;
  seekMainPlayback(Number(els.bottomSeek.value)||0);
});'''
if old_seek_events not in app:
    raise RuntimeError("bottom seek event block not found")
app = app.replace(old_seek_events, new_seek_events, 1)
write("app.js", app)

local = read("local-media.js")
restart_start = local.find("  function restartLocal(")
restart_end = local.find("  function seekLocal(", restart_start)
if restart_start < 0 or restart_end < 0:
    raise RuntimeError("obsolete restartLocal function not found")
local = local[:restart_start] + local[restart_end:]

old_local_seek_handlers = '''    $("bottomSeek")?.addEventListener("input", () => {
      if (localMode()) seekLocal(Number($("bottomSeek").value) || 0);
    });
    $("bottomSeek")?.addEventListener("pointerup", () => {
      if (localMode()) seekLocal(Number($("bottomSeek").value) || 0);
    });
'''
if old_local_seek_handlers not in local:
    raise RuntimeError("duplicate local bottom seek handlers not found")
local = local.replace(old_local_seek_handlers, "", 1)
write("local-media.js", local)

for path in [
    "app.js", "site-shell.js", "profile-data.js", "cloud-sync.js", "lyrics-providers.js",
    "local-media.js", "tags.js", "library-schema.js", "sync-interpolation.js"
]:
    text = read(path).replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD)
    write(path, text)

write("version.js", read("version.js").replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD))

index = read("index.html").replace(OLD_VERSION, NEW_VERSION).replace(OLD_BUILD, NEW_BUILD)
write("index.html", index)

defaults_path = ROOT / "data/defaults.json"
defaults = json.loads(defaults_path.read_text(encoding="utf-8"))
defaults["appVersion"] = NEW_VERSION
defaults["buildRevision"] = NEW_BUILD
defaults_path.write_text(json.dumps(defaults, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

guards = read("tests/runtime-guards.test.js")
guards = guards.replace('assert(version.includes(\'version: "v0.13.1"\'), "expected v0.13.1");', 'assert(version.includes(\'version: "v0.13.2"\'), "expected v0.13.2");')
marker = 'console.log("runtime regression guards passed");'
extra = '''assert(!app.includes('try{ytPlayer?.seekTo?.(Number(els.bottomSeek.value)||0,true)}catch{}'), "bottom seek must not bypass PlayerController");
assert(!local.includes("function restartLocal"), "obsolete Local Media restart shim must be removed");
assert(!local.includes('$("bottomSeek")?.addEventListener("pointerup"'), "Local Media must not install duplicate bottom seek listeners");
'''
if marker not in guards:
    raise RuntimeError("runtime guard marker missing")
guards = guards.replace(marker, extra + marker, 1)
write("tests/runtime-guards.test.js", guards)

readme = read("README.md").replace("**Current version: v0.13.1**", f"**Current version: {NEW_VERSION}**").replace("**Build: 20260830-6**", f"**Build: {NEW_BUILD}**")
readme = readme.replace("- 表示: `v0.13.1`", f"- 表示: `{NEW_VERSION}`").replace("- Build: `20260830-6`", f"- Build: `{NEW_BUILD}`")
write("README.md", readme)

arch = read("docs/ARCHITECTURE.md").replace("LyricTube v0.13.1 の現行構成です。", f"LyricTube {NEW_VERSION} の現行構成です。")
write("docs/ARCHITECTURE.md", arch)

entry = f'''## {NEW_VERSION} Player Controller仕上げ（2026-08-30）\n\n- 下部シークバーに残っていたYouTube直接シークを共通Player Controller経路へ変更。\n- Local Media側の重複シークListenerを削除。\n- Player Controller移行後に不要になった旧 `restartLocal` shimを削除。\n- 再発防止Guardを追加。\n- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。\n\n'''
for path in ["docs/CHANGELOG.md", "作業報告書.md"]:
    text = read(path)
    if not text.startswith(f"## {NEW_VERSION}"):
        write(path, entry + text)

print("v0.13.2 player-controller polish applied")
