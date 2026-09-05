from pathlib import Path

OLD_BUILD = "20260906-1"
NEW_BUILD = "20260906-2"

# Keep the A1 click guard and YouTube warm-up, remove user-facing playback diagnostics.
Path("a1-ui-guards.js").write_text(r'''(() => {
  "use strict";

  let initialized = false;

  function warmYoutubeConnections() {
    for (const href of ["https://www.youtube.com", "https://www.youtube-nocookie.com", "https://i.ytimg.com"]) {
      if (document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = href;
      link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    }
    if (!window.YT?.Player && !document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.lyrictubeEarlyYoutubeApi = "";
      document.head.appendChild(script);
    }
  }

  function visibleSongs() {
    try {
      return typeof window.viewSongs === "function" ? window.viewSongs() : [];
    } catch {
      return [];
    }
  }

  function annotateSongRows() {
    const songs = visibleSongs();
    document.querySelectorAll("#songList .song-row").forEach((row, index) => {
      const song = songs[index];
      if (!song?.id) return;
      row.dataset.a1SongId = String(song.id);
      const primary = row.querySelector(".song-item");
      if (!primary) return;
      primary.title = `「${song.title || "曲"}」を再生`;
      primary.setAttribute("aria-label", `${song.title || "曲"}を再生`);
    });
  }

  function clearLegacyPlaybackDiagnostics() {
    try {
      localStorage.removeItem("lyrictube.playbackDiagnostics.v1");
      localStorage.removeItem("lyrictube.playbackDiagnostics.v2");
      localStorage.removeItem("lyrictube.playbackDiagnostic.latest");
    } catch {}
    try { delete window.LyricTubePlaybackDiagnostics; } catch {}
  }

  function handlePrimarySongClick(event) {
    const primary = event.target?.closest?.("#songList .song-item");
    if (!primary) return;

    let row = primary.closest(".song-row");
    let songId = row?.dataset?.a1SongId || "";
    if (!songId) {
      annotateSongRows();
      row = primary.closest(".song-row");
      songId = row?.dataset?.a1SongId || "";
    }
    if (!songId || typeof window.selectSong !== "function") return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.selectSong(songId, true);
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    clearLegacyPlaybackDiagnostics();
    annotateSongRows();
    document.addEventListener("click", handlePrimarySongClick, true);
    window.LyricTubeHooks?.on?.("render:all", () => queueMicrotask(annotateSongRows));
  }

  warmYoutubeConnections();
  if (window.LyricTubeCore) initialize();
  else document.addEventListener("lyrictube:app-ready", initialize, { once: true });
})();
''', encoding="utf-8")

# Remove the now-unneeded standalone diagnostics route.
for name in ("playback-diagnostics.html", "playback-diagnostics.js"):
    p = Path(name)
    if p.exists():
        p.unlink()

# Update regression guards to require the production UI to stay free of playback diagnostics.
p = Path("tests/a1-requirements.test.js")
text = p.read_text(encoding="utf-8")
for line in [
    'assert(ui.includes(\'lyrictube.playbackDiagnostics.v2\'), "local playback-start diagnostics missing");\n',
    'assert(ui.includes(\'playbackDiagnosticPanel\'), "visible playback diagnostic panel missing");\n',
    'assert(ui.includes(\'PerformanceObserver\'), "long-task playback diagnostics missing");\n',
    'assert(ui.includes(\'const stageStartIndex = playbackStages.length\'), "diagnostics must capture synchronous playback stages before selectSong");\n',
    'assert(ui.includes(\'observePlaybackStart(songId, startedAt, syncMs, stageStartIndex)\'), "diagnostic stage start must be passed through to the observer");\n',
]:
    if line not in text:
        raise SystemExit(f"test anchor missing: {line.strip()}")
    text = text.replace(line, "", 1)
anchor = 'assert(!ui.includes(\'core.play?.()\'), "A1 UI must not repeatedly call PlayerController.play");\n'
addition = anchor + '''assert(!ui.includes('playbackDiagnosticPanel'), "production UI must not recreate the playback diagnostic panel");
assert(!ui.includes('PerformanceObserver'), "production A1 guard must not run playback timing observers");
assert(!ui.includes('LyricTubePlaybackDiagnostics ='), "production UI must not expose playback diagnostic controls");
assert(ui.includes('localStorage.removeItem("lyrictube.playbackDiagnostics.v2")'), "legacy playback diagnostic data should be cleaned up");
'''
if anchor not in text:
    raise SystemExit("A1 test insertion anchor missing")
text = text.replace(anchor, addition, 1)
p.write_text(text, encoding="utf-8")

# Cache/build bump so the removed panel disappears without relying on stale JS expiry.
p = Path("version.js")
text = p.read_text(encoding="utf-8")
if f'build: "{OLD_BUILD}"' not in text:
    raise SystemExit("version build anchor missing")
p.write_text(text.replace(f'build: "{OLD_BUILD}"', f'build: "{NEW_BUILD}"', 1), encoding="utf-8")

p = Path("data/defaults.json")
text = p.read_text(encoding="utf-8")
if OLD_BUILD not in text:
    raise SystemExit("defaults build anchor missing")
p.write_text(text.replace(OLD_BUILD, NEW_BUILD, 1), encoding="utf-8")

p = Path("index.html")
text = p.read_text(encoding="utf-8")
if OLD_BUILD not in text:
    raise SystemExit("index cache revision anchor missing")
p.write_text(text.replace(OLD_BUILD, NEW_BUILD), encoding="utf-8")

p = Path("README.md")
text = p.read_text(encoding="utf-8")
replacements = [
    (f"**Build: {OLD_BUILD}**", f"**Build: {NEW_BUILD}**"),
    (f"- Build: `{OLD_BUILD}`", f"- Build: `{NEW_BUILD}`"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f"README build anchor missing: {old}")
    text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")

# Record the cleanup and the completed latency investigation without claiming YouTube itself was fixed.
p = Path("docs/CHANGELOG.md")
text = p.read_text(encoding="utf-8")
entry = '''\n## v0.13.2 Playback diagnostics cleanup / build 20260906-2（2026-09-06）\n\n- 再生遅延調査で使用した通常画面の「再生診断」パネルと自動計測を削除。\n- `playback-diagnostics.html` / `playback-diagnostics.js` の専用検査ページを削除。\n- 過去の再生診断localStorageを起動時に削除。\n- Sidebarの1クリック即時再生、YouTube接続warm-up、A1再生安定化処理は維持。\n- 再生遅延そのものはYouTube Provider側の待ちが支配的という調査結果であり、この変更では再生経路を変更しない。\n'''
if "build 20260906-2" not in text:
    if text.startswith("# CHANGELOG"):
        first = text.find("\n")
        text = text[:first+1] + entry + text[first+1:]
    else:
        text = entry.lstrip("\n") + "\n" + text
p.write_text(text, encoding="utf-8")

p = Path("PROJECT_LEARNINGS.md")
text = p.read_text(encoding="utf-8")
old = "- Status: experiment implemented / User validation pending\n"
new = "- Status: investigation complete / provider-side latency accepted; user-facing diagnostics removed in build `20260906-2`\n"
if old in text:
    text = text.replace(old, new, 1)
note_anchor = "- Prevention: Provider待ちが支配的になった時はApp側の同期処理を繰り返し最適化せず、公式に許可されたProvider構成のA/Bと実測を行う。\n"
note = note_anchor + "- Final observation: standard host 4552ms、privacy-enhanced host 4596ms、拡張機能無効時6235msで、App同期処理はいずれも1ms。通常UIの再生診断は調査完了後に削除した。\n"
if note_anchor in text and "Final observation: standard host 4552ms" not in text:
    text = text.replace(note_anchor, note, 1)
p.write_text(text, encoding="utf-8")

print("playback diagnostics cleanup applied")
