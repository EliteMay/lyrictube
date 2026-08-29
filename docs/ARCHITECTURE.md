# Architecture

LyricTube v0.10.0 の現行構成です。

## 起動順

1. `version.js`
2. `library-schema.js`
3. `profile-data.js`
4. `cloud-sync.js`
5. `site-shell.js`
6. `lyrics-providers.js`
7. `local-media.js`
8. `tags.js`
9. ログイン / ゲスト確定後に `site-shell.js` が `app.js` を読み込む

## 責務

### version.js

- ユーザー向けSemVer
- Build revision
- Data Schema番号
- バージョン表示

### library-schema.js

- 保存データの正規化
- 旧形式から現行形式への安全な補完
- Validation API

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

タグ作成、付与、絞り込み、管理画面。

### app.js

旧バージョンからの互換コアです。現状は再生・ライブラリ・同期エディタ・UIの多くを含むため大きいですが、v0.10.0から `window.LyricTubeCore` Facadeを公開し、追加機能が直接内部状態へ依存しすぎない構成へ移行しています。

## 今後の分割順

機能を壊さないため、一括Rewriteではなく以下の順に分離します。

1. Pure utility
2. Library model
3. Lyrics parser / sync editor
4. Player controller
5. Dialog / UI renderer
6. app bootstrap

各段階でGitHub Actionsを通してから次へ進みます。
