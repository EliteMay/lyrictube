# Work Report — Playback Start Latency Fix

Date: 2026-09-05

## Symptom

曲をクリックしてからYouTube / Local Mediaの再生が始まるまで、体感上の待ち時間が長い。

## Root Cause

Autoplay付きの曲切替でも、既存 `app.js` はPlayerへ新しい動画を渡す前に `renderAll()` を実行していた。

`renderAll()` はLibrary、Browse、Selected Song、Lyrics、Bottom Player等をまとめて再構築するため、曲数・歌詞量・表示状態によっては動画読込命令の発行そのものが遅れる。

また、初回YouTube Player準備中にユーザーが再生を要求した場合、Playerが後からReadyになったタイミングで再生要求を補助する経路がなかった。

## Fix

`a1-ui-guards.js` のAutoplay選択経路で次を行う。

1. Autoplay付き `selectSong` の間だけFull Render要求を保留する。
2. 先に既存Player経路へ動画切替 / 再生要求を渡す。
3. Full Renderは次のAnimation Frameへ回す。
4. PlayerがまだReadyでない場合はPlayer Controller経由の `play()` を最大5秒だけ再試行する。
5. YouTube / Thumbnail originへpreconnectし、初回接続コストを減らす。

通常の「選択のみ」操作ではこの最適化を使わず、既存Render順を維持する。

## Compatibility

- Data Schema変更なし
- Queue / Session / Cloud履歴変更なし
- YouTube / Local Mediaの共通Player Controller契約を維持
- App coreの大規模Rewriteなし

## Regression Guard

`tests/a1-requirements.test.js` に以下を追加。

- Autoplay選択でFull Renderをdeferできること
- 次FrameでRenderを戻すこと
- Player Controller経由でReady待ち再生を補助すること
- 5秒でRetryを打ち切ること
- YouTube origin preconnectを持つこと

## Manual Verification

公開サイトでは次を確認する。

1. Sidebarから別曲をクリックしたとき、以前より動画開始が早い。
2. 連続して別曲をクリックしても最後に選んだ曲が再生される。
3. 初回起動直後の最初の曲でも再生要求が失われない。
4. YouTubeとLocal Mediaの両方で既存Queue / Previous / Nextが壊れていない。
5. 曲切替後のLibrary / Browse / Lyrics表示が次Frameで正しく更新される。


## Follow-up — 約5秒待ちが残った件

ユーザー実機で約5秒の待ちが残ったため、初回修正を再調査した。

追加で確認した原因:

1. 前回の高速化後もBuild revisionが `20260903-1` のままで、公開サイトが同じasset URLを使い続けていた。
2. YouTube IFrame API / Playerの初期化前に押されたAutoplay要求は、`loadSelectedVideo()`内でPlayerがReadyでないとその場では適用されず、後段のRetryに依存していた。

追加修正:

- Build revisionを `20260905-2` へ更新。
- Access Gate表示中からYouTube IFrame APIを先行ロード。
- 最新のYouTube動画Requestを保持し、Player `onReady`で適用。
- Autoplay曲選択はFull Render前に動画要求を発行。
- YouTube API scriptの二重読み込みを防止。

これによりLyricTube側で発生していた「初期化待ち + stale cache + render先行」の待ちを削減する。YouTube CDN側の実際のbuffering時間そのものはFrontendから保証できない。
