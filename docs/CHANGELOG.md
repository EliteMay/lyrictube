## v0.13.1 Player Controller移行（2026-08-30）

- `core/player-controller.js` を追加。
- YouTube / Local Mediaを同じ再生契約へ統合。
- Local Mediaが `currentPlayerTime / duration / state / toggle / seek / restart / playback rules / bottom player` を後から上書きする構造を撤去。
- Local Media側に残す互換Patchは曲追加・バージョン編集Dialogの2か所だけに縮小。
- 開始/終了、スキップ、同期エディタ、キーボード操作を共通Player経路へ統一。
- `player-controller.test.js` と回帰Guardを追加。
- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。

## v0.13.0 段階リファクタ Phase 1（2026-08-30）

- `core/app-utils.js` を追加し、LRC・時刻・文字列・同期保持のPure utilityを `app.js` から分離。
- `core/runtime-hooks.js` を追加。
- `tags.js` に残っていた `viewSongs / renderBrowse / renderAll / renderMainPage` の関数上書きを廃止。
- タグ絞り込みはFilter、描画拡張はRender Hook、タグ画面はhandled Hookへ移行。
- Utility / HookのNodeテストを追加。
- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。

## v0.11.0 - 2026-08-30

- 同期エディタに「ざっくり自動合わせ」を追加。
- 2〜数個の基準点だけ手動で合わせ、基準点間の歌詞時間を自動補間できるようにした。
- 元の同期歌詞がある場合は、そのタイムスタンプ間隔を保ちながら区間ごとに時間軸を伸縮する。
- 元時間が無い区間は行数ベースの均等補間へフォールバックする。
- 補間後も従来の行単位 `±0.1 / ±0.5秒` 微調整を利用可能。
- 自動補間ロジックを `sync-interpolation.js` へ分離し、Nodeテストを追加。
- 保存Schemaは変更なし。

## v0.10.2 - 2026-08-30

- 土台整理時に意図せず変更されていたLyricTubeの元WebPアイコンを復元。
- VReviewの実際の表示方式に合わせ、タイトル横のバージョンバッジを廃止。
- サイドバー上部を `MY MUSIC · v0.10.2` の控えめな表示に変更。
- Build番号は引き続きキャッシュ・デバッグ専用として通常UIには表示しない。

## v0.10.1 - 2026-08-30

- サイドバー下部の `設定 / ? / 書き出し / 読み込み` を4項目専用グリッドへ修正。
- `?` ボタン追加時に `読み込み` が次の行へ落ちるレイアウト崩れを修正。
- 狭い画面でも同じ4項目レイアウトを維持。

# Changelog

## v0.10.0 — Foundation cleanup

### Architecture

- ユーザー向けSemVerとBuild番号を `version.js` へ一本化
- `library-schema.js` と `data/library.schema.json` を追加
- `window.LyricTubeCore` Facadeを追加し、追加機能がコア内部へ直接依存しすぎない移行を開始

### Local Media

- MP3系とMP4/WebMを `local-media.js` へ統合
- 旧 `local-audio.js / local-audio.css` runtimeを廃止
- 旧IndexedDB `lyrictube.localAudio.v1` から新DBへの移行処理を追加
- 別端末でファイルが無い状態を明示
- 設定画面へ端末ファイル容量表示を追加
- timeupdate時のUI更新を約8fps上限へ抑制

### Cloud

- Cloud writerを `cloud-sync.js` のみに統一
- `site-shell.js` の旧全体保存Writerを削除
- 同期待ち差分をlocalStorageへ保持
- online / session-ready / pagehide / visibilitychangeで再送

### Login

- 前回成功したアカウント名を端末にだけ記憶
- 次回はパスワードのみでログイン可能
- パスワード自体は保存しない
- Supabase側へログイン失敗回数制限を追加

### Lyrics

- LRCLIB + SyncLRC + lyrics.ovh構成を正式文書化
- Provider metadataをSchemaへ追加

### UI / Static

- 巨大Base64ロゴを `assets/lyrictube-icon.svg` へ分離
- HTMLタイトルと表示バージョンを整理
- index.htmlから旧Local Audio資産を除去

### CI

- 一部JSだけでなく全JavaScriptを `node --check`
- 全JSONを検証
- HTMLローカル参照切れを検出
- 旧Local Audio runtime再混入を検出
- Base64画像の再埋め込みを検出

## v0.9.x

- `v35 / v36` の開発番号からSemVer表示へ移行
- MP3 / MP4直接追加
- SyncLRC / lyrics.ovh追加
- 前回アカウント記憶の試験実装

## Legacy v03〜v35

初期の複数YouTubeバージョン、LRC同期、同期エディタ、プレイリスト、ゲスト、Supabaseアカウント、タグ、端末音源などを段階的に追加した世代です。

詳細な旧作業記録はGit履歴を参照してください。現行仕様はREADMEと本docsを正とします。
