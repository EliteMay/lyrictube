from pathlib import Path

root = Path(__file__).resolve().parents[1]
local_path = root / "local-media.js"
test_path = root / "tests/runtime-guards.test.js"

local = local_path.read_text(encoding="utf-8")
old = '''    document.addEventListener("click", event => {
      if (!localMode()) return;
      const line = event.target?.closest?.(".lyric-line");
      if (!line) return;
      const time = Number(line.dataset.time);
      if (Number.isFinite(time)) seekLocal(time + Number(currentVersion()?.lyricsOffset || 0));
    });

'''
if local.count(old) != 1:
    raise SystemExit(f"expected one legacy lyric click handler, got {local.count(old)}")
local = local.replace(old, "", 1)
local_path.write_text(local, encoding="utf-8")

test = test_path.read_text(encoding="utf-8")
needle = 'assert(local.includes("playCurrent()"), "Local Media must expose playback contract");\n'
addition = needle + 'assert(!local.includes("closest?.(\\\".lyric-line\\\")"), "Local Media must not install a second lyric click seeker");\n'
if needle not in test:
    raise SystemExit("runtime guard insertion point missing")
test = test.replace(needle, addition, 1)
test_path.write_text(test, encoding="utf-8")

print("removed legacy Local Media lyric click handler")
