# LyricTube

**Current version: v0.13.2**  
**Build: 20260905-5**  
**公開サイト:** [https://elitemay.github.io/lyrictube/](https://elitemay.github.io/lyrictube/)

YouTube動画、端末のMP3/MP4、通常歌詞、同期歌詞を1つのライブラリで管理するWebアプリです。

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

## Visual Direction

LyricTubeは `MEDIA + TOOL` として、**Library → Player → Lyrics** の作業空間を主役にします。

- Layout: Desktopは左Library rail + Player + Lyricsのmaster-detail構成
- Density: medium-high。日常操作を優先し、Marketing的な大Heroは置かない
- Typography: compact product UI。大きさだけでなくWeight / Spacing / Contrastで階層を作る
- Theme: Dark / Light / Synthwave / Midnight / Sepiaの5種類。ThemeごとのPage / Navigation / Surface / Text / Border / Accentは同じToken体系で切り替える
- Components: 曲一覧はList、曲を探す画面はMedia Grid、編集設定はSection / Divider中心
- Decorative effects: ShadowはPlayer / OverlayなどElevationが必要な場所だけ。Gradient / Glowの常用は避ける
- Signature: 再生領域と同期歌詞を並べて使うMedia Workspaceそのもの

Visual compositionは `workspace.css`、Sidebarの構造は `sidebar.css`、Theme Colorの正本は `theme.css` です。Legacy CSSにTheme指定が残っていても、現行UIの配色判断は `theme.css` のTokenを基準にします。

現在の見た目はユーザー確認済みのVisual Referenceとして [`docs/VISUAL_BASELINE.md`](docs/VISUAL_BASELINE.md) に固定しています。今後のUI変更では、明確な改善理由がない限りこのHierarchy / Density / Theme consistencyを悪化させません。

## 現在の構成

```text
index.html
├─ version.js                 表示Version / Build / Schema番号
├─ core/app-utils.js          LRC / 時刻 / 文字列などPure utility
├─ core/runtime-hooks.js      拡張機能用Hook / Filter基盤
├─ core/player-controller.js  YouTube / Local Media共通再生API
├─ core/fair-shuffle.js       再生履歴を考慮したShuffle候補選択
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

`app.js` はまだ大きいため、Pure utility、Hook、Player Controller、Fair Shuffleから段階分割しています。一括Rewriteは行わず、既存ライブラリ・再生・同期互換を維持しながら移行します。

## バージョン管理

- 表示Version: `v0.13.2`
- Build: `20260905-5`
- Data Schema: `4`

正本は `version.js` です。旧 `v35 / v36` 等の開発番号は現行UIのVersionとして使用しません。

## 再生ソース

### YouTube

YouTube IFrame Player APIを使用します。YouTube Data APIキーは通常再生には不要です。

### 端末ファイル

`local-media.js` が以下を扱います。

- MP3 / M4A / AAC / WAV / OGG / OGA / OPUS / FLAC
- MP4 / WebM / M4V

ファイル本体はIndexedDB `lyrictube.localMedia.v1` に保存します。クラウドへは曲情報とファイル名などのメタデータだけを同期します。

旧 `lyrictube.localAudio.v1` が残っている場合、Local Media初期化時に新ストレージへ移行を試みます。別端末ではファイル本体が無いため、再登録導線を表示します。

### シャッフル

シャッフルは現在の表示・プレイリスト・タグ等から作られる再生キューを対象にします。

- 現在再生中の曲は次候補から除外
- `lastPlayedAt` が無い未再生曲が残っている場合は、未再生曲を最優先
- 全候補に再生履歴がある場合は、最も長く聴いていない曲群からランダム選択
- `lastPlayedAt` は既存ライブラリへ保存済みの値を利用するため、ブラウザを閉じても昨日までの履歴を引き継ぐ
- 新しいShuffle専用StorageやData Schemaは追加しない

これにより、完全ランダムで一部の曲だけ何度も選ばれ、別の曲が長時間一度も流れない偏りを抑えます。

## タグ

タグ管理画面・サイドバー・曲一覧からの編集に加えて、Build `20260905-5` からは「曲を追加 / 曲情報を編集」ダイアログ内でも既存タグを選択できます。タグが無い場合は、その場で新しいタグを作成して選択できます。保存形式は既存の `song.tagIds` / `settings.tags` をそのまま利用し、Data Schema 4は変更しません。

## 歌詞

自動検索は以下のProvider候補を統合します。

1. LRCLIB
2. SyncLRC
3. lyrics.ovh（通常歌詞の補完）

保存時は `lyricsProvider` / `lyricsProviderId` を記録し、旧 `lrclibId` も互換性のため維持します。

### ざっくり自動合わせ

同期エディタでは2個以上の基準点を置き、その間の歌詞時間を自動補間できます。

- 元の同期歌詞がある場合: 元の歌詞間隔を保ったまま時間軸を伸縮
- 元時間が無い区間: 行数ベースで均等補間
- 補間後: 行単位 `±0.1 / ±0.5秒` で微調整可能
- 基準点情報は編集セッション専用で、保存Schemaは変更しない

## クラウド同期

Supabaseを使用します。

- `profile-data.js`: localStorage変更から差分生成
- `cloud-sync.js`: 差分をSupabaseへ送信する唯一のCloud Writer
- `site-shell.js`: ログイン・初回読込

同期待ちデータはlocalStorageへ一時保存し、通信復帰後に再送します。

## ログイン

既存アカウントはアカウント名 + パスワードでログインします。ログイン画面の「＋ 新しいアカウントを作る」から、アカウント作成キーを使った新規登録もできます。登録成功後はそのままクラウドアカウントへログインします。成功したアカウント名だけを端末に記憶し、ログインパスワードとアカウント作成キーは保存しません。Supabase側ではログイン失敗と作成キーの連続失敗を制限します。

## データ / 保存場所

互換Storage Keyは `lyrictube.library.v3`、内部Schemaは `settings.dataSchemaVersion = 4` です。

| データ | 保存先 |
|---|---|
| 曲 / プレイリスト / 設定 | localStorage + Supabase（クラウド時） |
| MP3 / MP4本体 | IndexedDB（その端末のみ） |
| ログインセッション | sessionStorage |
| 前回成功したアカウント名 | localStorage |
| 同期待ちキュー | localStorage |

機械可読Schemaは `data/library.schema.json`、詳細は `docs/DATA_SCHEMA.md` を参照してください。

## GitHub Pages

静的HTML / CSS / JS構成です。公開RepoへAPI Secret、パスワード、Service Role Key等を追加しないでください。

## 自動検証

GitHub Actions `Validate LyricTube` で以下を確認します。

- 全 `.js` の `node --check`
- `tests/*.test.js` のロジック / Regression Guard
- 全 `.json` のJSON構文
- `index.html` のローカル参照切れ
- 廃止したLocal Audio runtimeの再混入
- Base64画像のHTML再埋め込み
- Python保守ツールの構文

Visual regression guardではMedia Workspace構造に加え、5テーマが共通Token体系を持ち、SidebarがDark固定へ戻らないことも確認します。Fair ShuffleはPure logic testとRuntime integration guardで、未再生優先と旧完全ランダム方式の再混入を確認します。

### web-project-guide 定期監査

`Web Project Guide Audit` を毎週実行します。

- `EliteMay/web-project-guide` の最新Version / main Commitを確認
- `project-guide.json` の確認済みRevisionと比較
- 定期実行時に `Validate LyricTube` も再実行
- 未確認のGuide変更があればGitHub Issueを1件だけ作成・更新
- Guide更新だけを理由にLyricTubeのコードを自動書換えしない

Project Profileは `STATIC / MEDIA / CLOUD / PUBLIC-CONTENT` です。詳細は `docs/GUIDE_AUDIT.md` と `PROJECT_LEARNINGS.md` を参照してください。

## 主なファイル

```text
.github/workflows/
  validate-js.yml
  guide-audit.yml

core/
  app-utils.js
  runtime-hooks.js
  player-controller.js
  fair-shuffle.js

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
  VISUAL_BASELINE.md
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
workspace.css
theme.css
sidebar.css
mobile.css
guest.css
auth-ui.css
tags.css
index.html
```

## 注意点 / 既知の課題

- ブラウザのサイトデータを削除するとLocal Media本体も消える可能性があります。
- MP4の再生可否はブラウザが対応する映像/音声Codecに依存します。
- YouTube埋め込み不可動画は再生できません。
- 外部歌詞サービス障害時は、そのProviderだけ一時的に利用できません。
- Supabaseへ同期するのは曲情報であり、MP3 / MP4本体ではありません。
- `app.js` はまだ大きく、UI / Dialog / Library単位の段階分割が残っています。
- Legacy `styles.css` には旧世代のVisual ruleが残っていますが、現行のLayout / Themeの正本は `workspace.css` / `sidebar.css` / `theme.css` です。段階的に整理します。
- Fair Shuffleの長時間利用での体感は実運用で継続確認します。自動Testでは候補選択ルールを確認済みです。
- Visual変更はStatic / Regressionで確認できますが、最終的な見た目は実ブラウザ・Zoom・小Viewportでも確認が必要です。

変更履歴は `docs/CHANGELOG.md`、詳細な未完了事項は `docs/KNOWN_ISSUES.md` を参照してください。
