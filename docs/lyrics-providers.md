# LyricTube 複数歌詞ソース

## 目的

LRCLIBだけで歌詞が見つからない曲を補完するため、既存のLRCLIB検索を残したまま追加プロバイダーを検索します。

## 検索順

1. LRCLIB — 既存の検索ロジックをそのまま利用
2. SyncLRC — LRCLIB / NetEase / QQ Music / Kugou / Musixmatch系を横断する補完候補
3. lyrics.ovh — 同期歌詞が見つからない場合の通常歌詞候補

## 実装方針

- `app.js` の既存LRCLIB処理は置き換えない。
- `lyrics-providers.js` を追加レイヤーとして読み込む。
- LRCLIB検索完了後、SyncLRCとlyrics.ovhの候補を追加する。
- 曲名・アーティスト・歌詞本文を使って重複候補を除去する。
- 検索結果へ `SOURCE: LRCLIB / SyncLRC / lyrics.ovh` を表示する。
- 選択した候補の取得元を `lyricsProvider` / `lyricsProviderId` として曲データへ追加保存する。
- 従来の `lrclibId` はLRCLIB候補では引き続き保存し、既存データとの互換性を維持する。

## SyncLRC

API: `https://api.synclrc.dev/search?q=...&limit=...&offset=...`

LyricTubeでは検索結果の `lyrics.synced` を優先し、無い場合は `lyrics.plain` を使います。

## lyrics.ovh

API: `https://api.lyrics.ovh/v1/{artist}/{title}`

同期情報はないため、通常歌詞のみのフォールバックとして扱います。アーティスト未入力時は誤取得を避けるため検索しません。

## 障害時

追加プロバイダーがタイムアウト・CORS・サービス障害などで失敗しても、LRCLIB本体の検索は維持します。

## 未確認

- 実機ブラウザからSyncLRCへのCORS通信
- 実機ブラウザからlyrics.ovhへのCORS通信
- 日本曲での取得率比較
- GitHub Pages反映後の実クリック操作
