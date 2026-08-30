# Architecture

LyricTube v0.13.1 の現行構成です。

## 起動順

1. `version.js`
2. `core/app-utils.js`
3. `core/runtime-hooks.js`
4. `core/player-controller.js`
5. `library-schema.js`
5. `sync-interpolation.js`
6. `profile-data.js`
8. `cloud-sync.js`
9. `site-shell.js`
10. `lyrics-providers.js`
11. `local-media.js`
12. `tags.js`
13. ログイン / ゲスト確定後に `site-shell.js` が `app.js` を読み込む

## 責務

### version.js

- ユーザー向けSemVer
- Build revision
- Data Schema番号
- バージョン表示

### core/app-utils.js

- LRC parse / format
- 時刻変換
- YouTube ID抽出
- 歌詞編集時の同期時刻保持
- DOMに依存しないPure utility

### core/runtime-hooks.js

- 拡張機能向けEvent / Filter / handled hook
- 本体関数の代入上書きを減らすための正式な拡張口
- `tags.js` はv0.13.0からこのHookを利用

### core/player-controller.js

- YouTube / Local Media共通の `play / pause / seek / currentTime / duration / state`
- Source切替をAdapterとして管理
- Local Mediaによる再生関数の大量上書きを廃止

### library-schema.js

- 保存データの正規化
- 旧形式から現行形式への安全な補完
- Validation API

### sync-interpolation.js

- 同期エディタの基準点間を区間ごとに線形補間
- 元LRCの時間間隔を使ったテンポ伸縮
- 元時間が無い区間の均等補間フォールバック
- DOMに依存しないPure utilityとしてNodeテスト可能

### profile-data.js

- ゲスト / クラウド / 旧オーナーのlocalStorageを分離
- `lyrictube.library.v3` へのアクセスを現在のProfileへルーティング
- 保存差分を `lyrictube:cloud-library-delta` として通知

### cloud-sync.js

クラウドへの唯一の書き込み担当です。

- Song単位差分
- Playlist単位差分
- Settings / state差分
- 失敗時Retry
- 同期待ちQueueの永続化

### site-shell.js

- ログイン
- ゲスト入口
- アカウント管理
- スマホSidebar
- 初回Cloud library取得
- `app.js` bootstrap

Cloudの保存処理は持ちません。

### lyrics-providers.js

既存LRCLIB検索を拡張し、SyncLRC / lyrics.ovh候補を統合します。

### local-media.js

- MP3 / MP4 / WebM等
- IndexedDB
- Local Media player
- 旧Local Audio DB移行
- 別端末での再リンク
- 端末使用容量表示

旧 `local-audio.js` は廃止済みです。

### tags.js

タグ作成、付与、絞り込み、管理画面。v0.13.0から `viewSongs / renderAll / renderBrowse / renderMainPage` の直接上書きを廃止し、`core/runtime-hooks.js` 経由で接続します。

### app.js

旧バージョンからの互換コアです。現状は再生・ライブラリ・同期エディタ・UIの多くを含むため大きいですが、v0.10.0から `window.LyricTubeCore` Facadeを公開し、追加機能が直接内部状態へ依存しすぎない構成へ移行しています。

## 今後の分割順

機能を壊さないため、一括Rewriteではなく以下の順に分離します。

1. ~~Pure utility~~ — v0.13.0で第一段階完了
2. Library model
3. Lyrics parser / sync editor
4. ~~Player controller~~ — v0.13.1で完了
5. Dialog / UI renderer
6. app bootstrap

各段階でGitHub Actionsを通してから次へ進みます。
