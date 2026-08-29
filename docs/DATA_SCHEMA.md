# Data Schema

## 互換キー

ブラウザ互換のため保存キーは引き続き `lyrictube.library.v3` を使用します。

データ内容の世代は `settings.dataSchemaVersion` で管理します。

Current: **4**

## Library

```json
{
  "version": 3,
  "songs": [],
  "playlists": [],
  "settings": {
    "dataSchemaVersion": 4,
    "tags": []
  }
}
```

## Song追加フィールド

- `lyricsProvider`
- `lyricsProviderId`
- `tagIds`

旧 `lrclibId` は互換性維持のため残します。

## Version

YouTubeバージョンは従来の `youtubeUrl` / `videoId` を利用します。

端末ファイルは次を追加します。

```json
{
  "source": "localmedia",
  "localMediaKind": "audio",
  "localFileName": "example.mp3"
}
```

端末ファイル本体はJSONへ入れません。

## Migration

`library-schema.js` が読み込み時に次を補完します。

- songs / playlists / settingsの欠落
- `tagIds`
- Provider情報
- `skipSegments`
- `startTime / endTime / lyricsOffset`
- 旧 `source: local` → `source: localmedia`

古いライブラリを破壊的に書き換えるのではなく、読み込み時に現行形へ正規化してから保存します。

機械可読定義は `data/library.schema.json` を参照してください。
