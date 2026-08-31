from pathlib import Path


def replace_once(path: str, old: str, new: str, marker: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if new in text:
        print(f"{path}: already patched")
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one {marker} pattern, found {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"{path}: patched {marker}")


replace_once(
    "app.js",
    "if(library.settings.shuffle&&queue.length>1){let choices=queue.filter(s=>s.id!==selectedSongId);const next=choices[Math.floor(Math.random()*choices.length)];selectSong(next.id,autoplay);return}",
    "if(library.settings.shuffle&&queue.length>1){const next=window.LyricTubeFairShuffle?.pickNext?.(queue,selectedSongId,Math.random);if(next){selectSong(next.id,autoplay);return}}",
    "memoryless shuffle branch",
)

replace_once(
    "site-shell.js",
    '''  function loadMainApp() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `app.js?v=${VERSION}`;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error("app.js load failed"));
      document.body.appendChild(script);
    });
  }
''',
    '''  function loadScript(src, label) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`${label} load failed`));
      document.body.appendChild(script);
    });
  }

  async function loadMainApp() {
    await loadScript(`core/fair-shuffle.js?v=${VERSION}`, "fair shuffle");
    await loadScript(`app.js?v=${VERSION}`, "app.js");
  }
''',
    "main runtime loader",
)
