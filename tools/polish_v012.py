from pathlib import Path

root = Path(__file__).resolve().parents[1]


def p(name): return root / name

def read(name): return p(name).read_text(encoding="utf-8")
def write(name, text): p(name).write_text(text, encoding="utf-8")
def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {n}")
    return text.replace(old, new, 1)

shell = read("site-shell.js")
shell = shell.replace('const VERSION = window.LyricTubeVersion?.build || "20260830-1";', 'const VERSION = window.LyricTubeVersion?.build || "20260830-4";')
shell = once(
    shell,
    '    initCloudSettings(access.role, access.session);\n    window.LyricTubeVersion?.applyUi?.();\n    document.dispatchEvent(new CustomEvent("lyrictube:app-ready"));',
    '    initCloudSettings(access.role, access.session);\n    window.LyricTubeVersion?.applyUi?.();',
    "remove duplicate app-ready dispatch",
)
write("site-shell.js", shell)

local = read("local-media.js")
local = once(
    local,
    '      await cleanupOrphans();\n      await updateStorageSummary();',
    '      await cleanupOrphans();\n      await updateStorageSummary();\n      if (isLocalMediaVersion(currentVersion())) await activateLocalMedia(false);',
    "activate selected local media after db load",
)
local = local.replace('return typeof getSong === "function" &&', 'return document.documentElement.dataset.lyricTubeReady !== "error" &&\n      typeof getSong === "function" &&', 1)
write("local-media.js", local)

tags = read("tags.js")
tags = tags.replace('return typeof library !== "undefined" &&', 'return document.documentElement.dataset.lyricTubeReady !== "error" &&\n      typeof library !== "undefined" &&', 1)
write("tags.js", tags)

app = read("app.js")
app = app.replace('document.documentElement.dataset.lyricTubeReady="v29";', 'document.documentElement.dataset.lyricTubeReady=APP_VERSION;')
app = once(
    app,
    '''function updatePlayingState(){
  try{
    const playing=ytPlayer?.getPlayerState?.()===1;
    document.body.classList.toggle('is-playing',!!playing);
  }catch{}
}''',
    '''function updatePlayingState(){
  try{
    const playing=playerStateSafe()===1;
    document.body.classList.toggle('is-playing',!!playing);
  }catch{}
}''',
    "generic playing state",
)
app = once(
    app,
    '''  currentTime: () => currentPlayerTime(),
  duration: () => getPlayerDuration(),
});
document.dispatchEvent(new CustomEvent("lyrictube:app-ready"));
document.dispatchEvent(new CustomEvent("lyrictube:ui-ready"));''',
    '''  currentTime: () => currentPlayerTime(),
  duration: () => getPlayerDuration(),
  state: () => playerStateSafe(),
  play: () => playMainPlayback(),
  pause: () => pauseMainPlayback(),
  seek: (target, autoplay = false) => seekMainPlayback(target, { autoplay }),
});
if(document.documentElement.dataset.lyricTubeReady!=="error"){
  document.dispatchEvent(new CustomEvent("lyrictube:app-ready"));
  document.dispatchEvent(new CustomEvent("lyrictube:ui-ready"));
}''',
    "expand core player facade and guarded ready event",
)
write("app.js", app)

test = read("tests/runtime-guards.test.js")
insert = '''assert(!app.includes('dataset.lyricTubeReady="v29"'), "legacy internal ready version must not return");
assert(app.includes("play: () => playMainPlayback()"), "core facade must expose generic playback");
assert(local.includes("await activateLocalMedia(false)"), "selected Local Media must activate after IndexedDB loads");
'''
anchor = 'assert(version.includes(\'version: "v0.12.0"\'), "expected v0.12.0");\n'
if anchor not in test:
    raise RuntimeError("runtime test anchor missing")
test = test.replace(anchor, insert + anchor, 1)
write("tests/runtime-guards.test.js", test)

print("v0.12 startup polish applied")
