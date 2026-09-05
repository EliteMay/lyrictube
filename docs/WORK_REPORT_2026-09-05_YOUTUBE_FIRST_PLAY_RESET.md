# Work Report — YouTube first-play reset

Date: 2026-09-05

## Symptom

User-visible YouTube playback startup remained around 5–10 seconds even after app-side selection/render optimizations.

## Runtime evidence

The dedicated playback diagnostic captured this sequence for a real song selection:

- click → `selectSong` return: 6 ms
- next frame: 8 ms
- first `BUFFERING`: 136 ms
- `UNSTARTED`: 593 ms
- second `BUFFERING`: 9578 ms
- `PLAYING`: 9620 ms

This ruled out the Library/Lyrics render path and main-thread work as the primary source of the delay. The important signal was that the initial player reached BUFFERING quickly and then returned to UNSTARTED before the long wait.

## Root-cause hypothesis addressed

On the first autoplay path, LyricTube constructed `YT.Player` with `playerVars.autoplay = 1`. The same pending autoplay request was then handled again in `onReady` with `playVideo()`.

That creates two autoplay commands for the same initial video. The observed `BUFFERING → UNSTARTED` transition is consistent with the first load being reset around player readiness.

## Change

`app.js` now records whether the initial autoplay has already reached `BUFFERING` or `PLAYING` before `onReady`.

- If playback has already progressed, `onReady` does not call `playVideo()` again.
- If autoplay never progressed, the existing `playVideo()` call remains as a fallback.
- The pending request is still cleared normally.
- Subsequent already-ready-player switches continue to use the existing `loadVideoById()` path.

## Cache

Build bumped from `20260905-3` to `20260905-4` and public asset query revisions were updated so the changed `app.js` is not hidden by stale GitHub Pages/browser cache.

## Regression guard

`tests/a1-requirements.test.js` now requires:

- initial autoplay progress tracking
- BUFFERING/PLAYING progress observation
- `onReady` fallback to be gated by that progress flag

## Verification state

Static syntax and targeted regression checks passed in the patch workflow. Final PR CI and GitHub Pages deployment must pass before release.

The real latency improvement must still be confirmed in the user's browser with the existing playback diagnostic page. Do not mark issue #18 resolved until that measurement is available.
