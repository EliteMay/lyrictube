from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

for path in ROOT.rglob("*.json"):
    if ".git" in path.parts:
        continue
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"invalid JSON: {path.relative_to(ROOT)}: {exc}")

index_path = ROOT / "index.html"
index = index_path.read_text(encoding="utf-8")

if "data:image/" in index:
    errors.append("index.html still contains embedded data:image assets")
if "local-audio.js" in index or "local-audio.css" in index:
    errors.append("index.html still loads deprecated local-audio assets")

refs = re.findall(r'''(?:src|href)=["']([^"']+)["']''', index)
for ref in refs:
    if not ref or ref.startswith(("http://", "https://", "data:", "#", "mailto:", "javascript:")):
        continue
    clean = urlsplit(ref).path.lstrip("/")
    if not clean:
        continue
    target = ROOT / clean
    if not target.exists():
        errors.append(f"missing referenced asset: {ref}")

required = [
    "version.js",
    "library-schema.js",
    "profile-data.js",
    "cloud-sync.js",
    "site-shell.js",
    "lyrics-providers.js",
    "local-media.js",
    "tags.js",
]
for filename in required:
    if filename not in index:
        errors.append(f"index.html does not load {filename}")

version = (ROOT / "version.js").read_text(encoding="utf-8")
if 'version: "v0.10.0"' not in version:
    errors.append("version.js is not v0.10.0")

if errors:
    print("Static validation failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Static validation passed")
