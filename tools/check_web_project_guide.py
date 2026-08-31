#!/usr/bin/env python3
"""Check whether LyricTube has reviewed the latest web-project-guide revision."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "project-guide.json"


def fetch_json(url: str) -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "LyricTube-web-project-guide-audit",
    }
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Failed to fetch {url}: {exc}") from exc


def write_output(name: str, value: str) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as handle:
            handle.write(f"{name}={value}\n")
    print(f"{name}={value}")


def append_summary(lines: list[str]) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return
    with open(summary_path, "a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def fail(message: str) -> None:
    print(f"Guide audit error: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if not CONFIG_PATH.exists():
        fail("project-guide.json is missing")

    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"project-guide.json is invalid JSON: {exc}")

    source_repo = str(config.get("sourceRepository", "")).strip()
    adopted_version = str(config.get("reviewedGuideVersion", "")).strip()
    reviewed_commit = str(config.get("reviewedGuideCommit", "")).strip().lower()
    profiles = config.get("profiles")

    if not re.fullmatch(r"[^/\s]+/[^/\s]+", source_repo):
        fail("sourceRepository must be owner/repo")
    if not re.fullmatch(r"\d+\.\d+\.\d+", adopted_version):
        fail("reviewedGuideVersion must be SemVer-like X.Y.Z")
    if not re.fullmatch(r"[0-9a-f]{40}", reviewed_commit):
        fail("reviewedGuideCommit must be a 40-character commit SHA")
    if not isinstance(profiles, list) or not profiles or not all(isinstance(item, str) and item for item in profiles):
        fail("profiles must be a non-empty string array")

    required_files = [
        "README.md",
        "PROJECT_LEARNINGS.md",
        "作業報告書.md",
        "version.js",
        "data/library.schema.json",
        "docs/KNOWN_ISSUES.md",
        ".github/workflows/validate-js.yml",
    ]
    missing = [path for path in required_files if not (ROOT / path).exists()]
    if missing:
        fail("Missing guide-aligned project files: " + ", ".join(missing))

    version_url = f"https://raw.githubusercontent.com/{source_repo}/main/guide-version.json"
    branch_url = f"https://api.github.com/repos/{source_repo}/branches/main"

    remote_version_data = fetch_json(version_url)
    remote_branch_data = fetch_json(branch_url)

    latest_version = str(remote_version_data.get("guideVersion", "")).strip()
    latest_commit = str(remote_branch_data.get("commit", {}).get("sha", "")).strip().lower()

    if not re.fullmatch(r"\d+\.\d+\.\d+", latest_version):
        fail("Remote guide-version.json does not contain a valid guideVersion")
    if not re.fullmatch(r"[0-9a-f]{40}", latest_commit):
        fail("Could not resolve the latest web-project-guide main commit")

    version_changed = latest_version != adopted_version
    commit_changed = latest_commit != reviewed_commit
    needs_review = version_changed or commit_changed

    write_output("needs_review", "true" if needs_review else "false")
    write_output("latest_version", latest_version)
    write_output("latest_commit", latest_commit)
    write_output("adopted_version", adopted_version)
    write_output("reviewed_commit", reviewed_commit)

    status = "Review required" if needs_review else "Up to date"
    compare_url = f"https://github.com/{source_repo}/compare/{reviewed_commit}...{latest_commit}"
    append_summary(
        [
            "## web-project-guide periodic audit",
            "",
            f"- Status: **{status}**",
            f"- Adopted guide: `{adopted_version}` / `{reviewed_commit[:12]}`",
            f"- Latest guide: `{latest_version}` / `{latest_commit[:12]}`",
            f"- Profiles: `{', '.join(profiles)}`",
            f"- Diff: {compare_url}" if commit_changed else "- Diff: no unreviewed commit",
            "- Policy: Guide changes are reviewed first; LyricTube is not auto-rewritten.",
        ]
    )

    if needs_review:
        print(f"web-project-guide changed: {adopted_version}/{reviewed_commit[:12]} -> {latest_version}/{latest_commit[:12]}")
    else:
        print(f"web-project-guide is up to date at {latest_version}/{latest_commit[:12]}")


if __name__ == "__main__":
    main()
