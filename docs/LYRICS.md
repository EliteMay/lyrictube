# Lyrics

## 自動検索

LyricTubeは1つの検索ボタンから複数Providerを利用します。

### Provider

1. LRCLIB
   - 既存の高精度検索
   - 通常歌詞 / LRC
2. SyncLRC
   - LRCLIB外の候補を補完
   - 同期歌詞を優先
3. lyrics.ovh
   - 通常歌詞だけの最終補完

## 検索方針

- 曲名 + 原曲アーティストを優先
- 既存LRCLIBの表記ゆれ検索は維持
- Provider結果を統合
- 同一Provider IDと歌詞Fingerprintで重複除去
- 一致度を既存Rankingへ渡す

## 保存

Songへ以下を保存します。

```json
{
  "lyricsSource": "SyncLRC: Track / Artist",
  "lyricsProvider": "synclrc",
  "lyricsProviderId": "..."
}
```

LRCLIB由来の場合は旧互換の `lrclibId` も維持します。

## 手動フォールバック

自動取得できない場合はGoogle検索から歌詞を手動貼り付けできます。

同期歌詞が無い通常歌詞はLyricTubeの同期エディタでLRC化できます。

## 外部サービス障害

各Providerは独立扱いです。SyncLRCやlyrics.ovhが失敗しても、LRCLIB検索自体は利用できます。
