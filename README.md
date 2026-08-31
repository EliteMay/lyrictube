# LyricTube

**Current version: v0.13.2**  
**Build: 20260830-8**

YouTube動画、端末のMP3/MP4、通常歌詞、同期歌詞を1つのライブラリで管理する個人用Webアプリです。

## 目的

- MV / Cover / Live / FIRST TAKEなどを「1曲の複数バージョン」として管理する
- MP3 / MP4など手元のファイルも同じプレイヤーで扱う
- LRCLIB / SyncLRC / lyrics.ovhを使って歌詞を探す
- LRC同期歌詞を表示・編集する
- PC / スマホのどちらでも利用する
- GitHub Pagesで公開できる静的構成を維持する
- アカウント利用時はSupabaseへ曲情報をクラウド同期する

## 崩してはいけない仕様

1. GitHub Pagesで動くこと
2. APIキーやパスワードを公開リポジトリへ保存しないこと
3. `lyrictube.library.v3` の既存データを読み込めること
4. 1曲に複数の再生バージョンを持てること
5. YouTubeと端末ファイルを混在できること
6. 端末ファイル本体をGitHub / Supabaseへアップロードしないこと
7. 曲開始 / 終了 / スキップ / 歌詞オフセット / 動画専用同期を維持すること
8. 歌詞の手動編集と同期エディタを維持すること
9. ゲストとクラウドアカウントのデータを混在させないこと
10. 大きな仕様変更時はSchema / README / 作業報告を同時更新すること

## 現在の構成

```text
index.html
├─ version.js                 表示バージョン / Build / Schema番号
├─ core/app-utils.js         LRC / 時刻 / 文字列などPure utility
├─ core/runtime-hooks.js     拡張機能用Hook / Filter基盤
├─ core/player-controller.js YouTube / Local Media共通再生API
├─ library-schema.js          ライブラリ正規化・移行
├─ sync-interpolation.js      基準点間の歌詞時間自動補間
├─ profile-data.js            アカウント別localStorageルーティング
├─ cloud-sync.js              Supabase差分同期（唯一の同期Writer）
├─ site-shell.js              ログイン / ゲスト / スマホ外枠
├─ lyrics-providers.js        LRCLIB + SyncLRC + lyrics.ovh統合
├─ local-media.js             MP3 / MP4 / WebM + IndexedDB
├─ tags.js                    タグ
└─ app.js                     既存コアUI / 再生 / 同期編集
```

`app.js` はまだ大きいですが、v0.13.0でPure utilityを `core/app-utils.js` へ分離し、タグ機能の本体関数上書きをHook方式へ移行しました。v0.13.1ではPlayer Controllerも分離し、YouTube / Local Mediaの再生操作を共通化しました。次はUI / Dialogを段階分割します。機能を一気に移動して既存ライブラリや再生を壊す変更は行いません。

## バージョン管理

ユーザー向けのバージョンとキャッシュ用Buildを分離しています。

- 表示: `v0.13.2`
- Build: `20260830-8`
- データSchema: `4`

正本は `version.js` です。旧 `v35 / v36` の番号は現行UIのバージョンとして使用しません。

## 再生ソース

### YouTube

YouTube IFrame Player APIを使用します。YouTube Data APIキーは不要です。

### 端末ファイル

`local-media.js` が以下を扱います。

- MP3
- M4A
- AAC
- WAV
- OGG / OGA
- OPUS
- FLAC
- MP4
- WebM
- M4V

ファイル本体はIndexedDB `lyrictube.localMedia.v1` に保存します。クラウドへは曲情報とファイル名などのメタデータだけを同期します。

旧 `lyrictube.localAudio.v1` が残っている場合、Local Media初期化時に新ストレージへ移行を試みます。

別端末ではファイル本体は存在しないため、「この端末にファイルがありません」と表示し、再登録できます。

## 歌詞検索

自動検索は以下の順で候補を統合します。

1. LRCLIB
2. SyncLRC
3. lyrics.ovh（通常歌詞の補完）

結果は重複除去し、取得元を表示します。保存時は `lyricsProvider` / `lyricsProviderId` を記録します。旧 `lrclibId` も互換性のため維持します。

### ざっくり自動合わせ

同期エディタでは、全行を手作業で打刻せずに数か所だけ基準点を設定できます。2個以上の基準点を置いて「基準点の間を自動補間」を押すと、基準点の間を区間ごとに自動調整します。

- 元の同期歌詞がある場合: 元の歌詞間隔を保ったまま時間軸を一定倍率で伸縮
- 元の同期時間が無い区間: 行数ベースで均等補間
- 補間後: 気になる行だけ従来の `±0.1 / ±0.5秒` で修正可能
- 基準点情報は編集セッション専用で、保存データ形式は変更しません

## クラウド同期

Supabaseを使用します。

- `profile-data.js`: localStorageへの変更から差分を生成
- `cloud-sync.js`: 差分をまとめてSupabaseへ送信
- `site-shell.js`: ログイン・初回読込のみ担当

v0.10.2から **クラウド保存Writerは `cloud-sync.js` の1本だけ**です。以前の `site-shell.js` 全体保存処理は無効化しています。

同期待ちデータは端末のlocalStorageへ一時保存するため、通信失敗直後にページを閉じても次回再送できます。

## ログイン

初回はアカウント名 + パスワードでログインします。

成功したアカウント名だけを端末に保存し、次回はパスワード欄だけ表示できます。パスワードそのものは保存しません。「変更」から別アカウントへ切り替えられます。

Supabase側では同一アカウントへの連続ログイン失敗を制限します。

## データ

現在の互換キーは `lyrictube.library.v3` のままです。

内部Schemaは `settings.dataSchemaVersion = 4` を使用します。読み込み時は `library-schema.js` が不足フィールド・旧Local Audio・Provider情報などを正規化します。

機械可読Schema:

- `data/library.schema.json`

詳細は `docs/DATA_SCHEMA.md`。

## 保存場所

| データ | 保存先 |
|---|---|
| 曲 / プレイリスト / 設定 | localStorage + Supabase（クラウド時） |
| MP3 / MP4本体 | IndexedDB（その端末のみ） |
| ログインセッション | sessionStorage |
| 前回成功したアカウント名 | localStorage |
| 同期待ちキュー | localStorage |

## GitHub Pages

静的HTML / CSS / JS構成なのでGitHub Pagesで利用できます。

1. `Settings`
2. `Pages`
3. `Deploy from a branch`
4. `main`
5. `/ (root)`

APIキー・パスワード・秘密情報をリポジトリへ追加しないでください。

## 自動検証

GitHub Actions `Validate LyricTube` で以下を確認します。

- 全 `.js` の `node --check`
- `tests/*.test.js` の同期補間ロジックテスト
- 全 `.json` のJSON構文
- `index.html` のローカル参照切れ
- 廃止したLocal Audio runtimeの再混入
- Base64画像のHTML再埋め込み
- Python保守ツールの構文

### web-project-guide 定期監査

GitHub Actions `Web Project Guide Audit` を毎週実行します。

- `EliteMay/web-project-guide` の最新Versionとmain Commitを確認
- `project-guide.json` に記録した確認済みRevisionと比較
- 定期実行時に `Validate LyricTube` も再実行
- 未確認のGuide変更があればGitHub Issueを1件だけ作成・更新
- Guide更新を理由にLyricTubeのコードを自動書換えしない
- Review後にbaselineを更新すると次回監査でIssueを自動Close

現在のProject Profileは `STATIC / MEDIA / CLOUD / PUBLIC-CONTENT` です。詳細は `docs/GUIDE_AUDIT.md` と `PROJECT_LEARNINGS.md` を参照してください。

## ファイル構成

```text
.github/workflows/
  validate-js.yml
  guide-audit.yml

assets/
  lyrictube-icon.webp

data/
  defaults.json
  library.json
  library-owner.json
  library.schema.json
  site-config.json

docs/
  ARCHITECTURE.md
  CLOUD.md
  DATA_SCHEMA.md
  GUIDE_AUDIT.md
  LYRICS.md
  STORAGE.md
  CHANGELOG.md
  KNOWN_ISSUES.md

tools/
  check_web_project_guide.py

PROJECT_LEARNINGS.md
project-guide.json
app.js
version.js
library-schema.js
sync-interpolation.js
profile-data.js
cloud-sync.js
site-shell.js
lyrics-providers.js
local-media.js
tags.js
styles.css
mobile.css
guest.css
auth-ui.css
tags.css
index.html
```

## 注意点

- ブラウザのサイトデータを削除するとLocal Media本体も消える可能性があります。
- MP4の再生可否はブラウザが対応する映像/音声Codecに依存します。
- YouTube埋め込み不可動画は再生できません。
- 外部歌詞サービス障害時は、そのProviderだけ一時的に利用できません。
- Supabaseへ同期するのは曲情報であり、MP3 / MP4本体ではありません。

## 既知の課題

`app.js` は旧バージョンから機能を積み重ねてきたため、まだ大きな単一ファイルです。v0.10.2では重複ランタイムとデータ・同期の土台を先に整理しました。今後は動作を維持したままPlayer / Lyrics / Library / UI単位に段階分割します。

詳細は `docs/KNOWN_ISSUES.md` を参照してください。


## v0.13.2 Sidebar安定化（build 20260830-8）

- Sidebarを「ブランド / 中央スクロール / 操作ツール」の3領域に分離。
- タグ・プレイリスト・曲一覧だけを中央でスクロールし、`設定 / ? / 書き出し / 読み込み` は常に表示領域へ残す。
- 低い縦解像度やモバイルでも主要操作が押し出されにくい構造へ変更。
- Sidebar見出しのコントラストを改善。
- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。

## v0.12.0 安定性修正

- ログインを30秒以上放置してもLocal Media / Tagsが確実に初期化されるよう、Pollingから`lyrictube:app-ready`イベントへ変更。
- MP3 / MP4でも同期歌詞追従、歌詞クリックシーク、Space / ← / →操作が同じ再生経路を使うよう修正。
- `GH v35`を再表示する旧処理と`lyrictube_v14_`書き出し名を撤去。
- 破損したlocalStorage JSONは上書き前に復旧用コピーへ退避。
- Sidebar下部4操作をPC / モバイルとも4列で固定。
- Schema検査と回帰テストを強化。