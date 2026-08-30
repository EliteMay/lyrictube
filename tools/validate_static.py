from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []

json_documents: dict[Path, object] = {}
for path in ROOT.rglob("*.json"):
    if ".git" in path.parts:
        continue
    try:
        json_documents[path] = json.loads(path.read_text(encoding="utf-8"))
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
    "core/app-utils.js",
    "core/runtime-hooks.js",
    "library-schema.js",
    "sync-interpolation.js",
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

version_text = (ROOT / "version.js").read_text(encoding="utf-8")
version_match = re.search(r'version:\s*"([^"]+)"', version_text)
build_match = re.search(r'build:\s*"([^"]+)"', version_text)
if not version_match:
    errors.append("version.js does not expose a semantic display version")
if not build_match:
    errors.append("version.js does not expose a build revision")

version_value = version_match.group(1) if version_match else None
build_value = build_match.group(1) if build_match else None
defaults = json_documents.get(ROOT / "data" / "defaults.json")
if isinstance(defaults, dict):
    if version_value and defaults.get("appVersion") != version_value:
        errors.append("data/defaults.json appVersion does not match version.js")
    if build_value and defaults.get("buildRevision") != build_value:
        errors.append("data/defaults.json buildRevision does not match version.js")

if version_value and f'data-app-version>{version_value}<' not in index:
    # The exact markup includes an attribute before the closing > in current HTML,
    # so fall back to a direct visible-version check as well.
    if version_value not in index:
        errors.append("index.html visible version does not match version.js")

if build_value:
    local_refs = [ref for ref in refs if ref and not ref.startswith(("http://", "https://", "data:", "#", "mailto:", "javascript:"))]
    runtime_refs = [ref for ref in local_refs if ref.endswith((".js", ".css")) or ".js?v=" in ref or ".css?v=" in ref]
    stale = [ref for ref in runtime_refs if "?v=" in ref and f"?v={build_value}" not in ref]
    if stale:
        errors.append(f"runtime cache revisions do not match version.js build: {', '.join(stale[:5])}")

if errors:
    print("Static validation failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Static validation passed")
