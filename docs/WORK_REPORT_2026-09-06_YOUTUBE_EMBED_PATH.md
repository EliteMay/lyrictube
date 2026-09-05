# Work Report — YouTube Embed Path A/B

Date: 2026-09-06
Build: 20260906-1

## Evidence

User runtime diagnostic on build `20260905-6`:

- click → PLAYING: 4552ms
- selectSong synchronous work: 1ms
- next frame: 33ms
- Long Task total: 0ms
- `REQUEST 1ms → loadVideoById 1ms → BUFFERING 74ms → UNSTARTED 389ms → BUFFERING 4526ms → PLAYING 4552ms`

This rules out LyricTube synchronous work, rendering, and the stale Playback Session restore timer as the dominant delay for this run.

## Change

- Replaced the implicit standard YouTube iframe creation path with an explicit official privacy-enhanced embed using `https://www.youtube-nocookie.com`.
- Kept YouTube IFrame API control with `enablejsapi=1` and explicit `origin`.
- Added `strict-origin-when-cross-origin` referrer policy, matching YouTube's current API client identity guidance.
- Added early preconnect for the privacy-enhanced host.
- Added actual embed host to playback diagnostics so the next user measurement is a clean standard-vs-privacy A/B.

## Not adopted

A hidden second YouTube player that automatically plays/mutes content to pre-buffer it was considered but not implemented. YouTube's current Developer Policies prohibit background-player content and require automatic playback to occur only when the player is sufficiently visible.

## Verification state

- Static / regression validation: required before merge.
- Real YouTube click-to-PLAYING improvement: User validation pending.
- Data Schema: unchanged (4).
- Display version: unchanged (`v0.13.2`).
