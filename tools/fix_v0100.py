from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

path = ROOT / "local-media.js"
text = path.read_text(encoding="utf-8")
text = text.replace('      document.querySelector(".player-card") &&\n    ) {', '      document.querySelector(".player-card")\n    ) {')
path.write_text(text, encoding="utf-8")

print("v0.10.0 edge-case fixes applied")
