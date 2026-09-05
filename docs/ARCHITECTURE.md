# Architecture

LyricTube v0.13.2 の現行構成です。

## 起動順

1. `version.js`
2. `core/app-utils.js`
3. `core/runtime-hooks.js`
4. `core/player-controller.js`
5. `library-schema.js`
6. `sync-interpolation.js`
7. `profile-data.js`
8. `cloud-sync.js`
9. `site-shell.js`
10. `lyrics-providers.js`
11. `local-media.js`
12. `tags.js`
13. `cloud-sync.js` が `core/playback-state.js` → `playback-a1.js` → `a1-ui-guards.js` を動的読込する。App未起動時は各A1 moduleが `lyrictube:app-ready` まで初期化を待つ
14. ログイン / ゲスト確定後に `site-shell.js` が `core/fair-shuffle.js` を読み込む
15. 続けて `site-shell.js` が `app.js` を読み込む

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

### core/fair-shuffle.js

- Shuffle時の次曲候補選択をDOMから分離したPure logic
- 現在曲を候補から除外
- `lastPlayedAt` の無い未再生曲を最優先
- 全候補に履歴がある場合は、最も長く聴いていない曲群の中からランダム選択
- 既存 `lastPlayedAt` だけを使うためShuffle専用Storage / Schemaは持たない
- Queueの範囲そのものは `app.js` の既存 `queueSongs()` が決定する

### core/playback-state.js

A1再生機能のDOM非依存ロジックです。

- 手動Queueの追加 / 並び替え / 削除 / 500件上限
- 有効再生判定（10秒または曲長の10%）
- 詳細履歴の500件上限とMerge
- 未再生 / 30日以上未再生判定
- Playback Sessionの30日TTLと正規化

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
- A1 Playback history event差分
- 失敗時Retry
- 同期待ちQueueの永続化
- 現行A1 Runtime (`core/playback-state.js` / `playback-a1.js` / `a1-ui-guards.js`) のbootstrap

A1 bootstrapは既存IndexのAsset revisionを崩さず段階導入するための現行構成です。将来 `app.js` bootstrapを分割する段階で、正式な起動入口へ統合する候補とします。

### site-shell.js

- ログイン
- ゲスト入口
- アカウント管理
- スマホSidebar
- 初回Cloud library取得
- `core/fair-shuffle.js` / `app.js` bootstrap

Cloudの保存処理は持ちません。

### lyrics-providers.js

既存LRCLIB検索を拡張し、SyncLRC / lyrics.ovh候補を統合します。

非同期検索はgeneration単位で所有し、検索開始時の曲名 / アーティスト / 編集対象 / 現在Songをsnapshotします。新しい検索、対象変更、元DialogのClose、結果DialogのCloseで古い検索をstale化し、staleなProvider応答は結果・進捗・Toast・Dialogへ反映しません。

### playback-a1.js

A1の再生Session / 手動Queue / Previous・Next / 詳細再生履歴 / Smart Viewを既存Playerへ統合します。QueueとSessionは端末ローカル、Cloud accountの詳細履歴だけは `cloud-sync.js` 経由でSupabaseへ同期します。

### a1-ui-guards.js

A1で追加されたSidebarの主操作契約を担当します。

- Sidebarの `.song-item` クリック / タップを「選択のみ」ではなく「選択 + 即再生」にする
- Playlist追加やMore等の補助操作はSibling Actionとして主操作と分離する
- 再Render後の曲行へSong ID / accessible labelを再付与する

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

Shuffle時は既存 `queueSongs()` で現在の表示 / Playlist / Tag Filter等に対応するQueueを作り、次曲の公平な候補選択だけを `core/fair-shuffle.js` へ委譲します。

## 今後の分割順

機能を壊さないため、一括Rewriteではなく以下の順に分離します。

1. ~~Pure utility~~ — v0.13.0で第一段階完了
2. Library model
3. Lyrics parser / sync editor
4. ~~Player controller~~ — v0.13.1で完了
5. Dialog / UI renderer
6. app bootstrap

各段階でGitHub Actionsを通してから次へ進みます。
