# v36 複数歌詞ソース追加 作業報告

## 今回変更した内容

- 既存LRCLIB検索を維持したまま、SyncLRCとlyrics.ovhを追加検索する拡張を追加。
- 検索結果を統合し、歌詞本文を含めた重複除去を追加。
- 取得元バッジ `SOURCE: ...` を検索候補へ追加。
- 選択した歌詞の取得元を `lyricsProvider` / `lyricsProviderId` として保存。
- 追加ソース障害時もLRCLIBのみで使えるフォールバック構成にした。

## 変更したファイル

- `lyrics-providers.js` — 新規
- `profile-data.js` — 追加プロバイダー読み込みを追加
- `docs/lyrics-providers.md` — 新規
- `docs/work-report-v36-lyrics-providers.md` — 新規

## 崩していない仕様

- `lyrictube.library.v3`
- 既存 `lrclibId`
- LRCLIBの検索順・表記ゆれ・YouTubeタイトルフォールバック
- LRC同期歌詞処理
- 手動同期エディタ
- GitHub Pages静的構成
- APIキー不要

## 確認したこと

- SyncLRCの現行READMEで `/search?q={query}&limit={limit}&offset={offset}` と `lyrics.plain / synced / karaoke` のレスポンス仕様を確認。
- SyncLRCがLRCLIBに加えてNetEase / QQ Music / Kugou / Musixmatch系を利用する構成を確認。
- lyrics.ovhの現行READMEで `/v1/{artist}/{title}` と `{ lyrics: ... }` の仕様を確認。
- GitHub上へ新規ファイルと読み込み処理が反映されたことを確認。

## 未確認

- GitHub Pages上の実ブラウザでのCORS通信。
- 検索ボタンからLRCLIB → SyncLRC → lyrics.ovhまでの実クリック試験。
- 日本曲での検索精度・取得率。
- モバイル実機。

## 今後必要な作業

- 実ブラウザで数曲検索し、SyncLRC候補が表示されるか確認。
- CORSが拒否された場合はSupabase Edge Function経由に切り替える。
- 必要ならSyncLRCの単語同期 `karaoke` を将来のカラオケ表示機能へ利用する。
