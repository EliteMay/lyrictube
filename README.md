# LyricTube

**Current version: v0.9.0**  
**Build: 20260829-8**

YouTube動画・端末の音声/動画ファイルと歌詞をまとめて管理し、同期歌詞付きで再生する個人用Webアプリです。

GitHub Pagesでそのまま利用できる静的構成を基本にしつつ、アカウント利用時はSupabase経由で曲情報をクラウド同期します。

## 目的

- YouTubeのMV / Cover / Liveを1つの曲としてまとめて管理する
- MP3 / MP4など手元のファイルも同じライブラリで扱う
- 通常歌詞とLRC同期歌詞を管理する
- 歌詞のタイミングを細かく編集する
- PC / スマホのどちらでも使いやすくする
- GitHub Pagesで追加費用なしに使える構成を維持する

## 現在の主な機能

### 再生ソース

- YouTube IFrame Player
- 端末音声
  - MP3
  - M4A
  - AAC
  - WAV
  - OGG / OGA
  - OPUS
  - FLAC
- 端末動画
  - MP4
  - WebM
  - M4V

新しい曲を追加するときに、最初から **YouTube / 端末ファイル（MP3 / MP4）** を選択できます。
Cover / Liveなどの追加バージョンでも同じように再生ソースを選べます。

### 曲 / バージョン管理

- 1曲に複数バージョンを登録
- 原曲 / MV
- Cover / 歌ってみた
- FIRST TAKE系
- Live
- Acoustic
- その他
- 動画ごとの開始位置 / 終了位置
- 途中スキップ区間
- 動画ごとの歌詞オフセット
- 動画専用LRC
- 同じYouTube動画IDの重複登録防止

### 歌詞

自動検索は複数ソースを使います。

1. LRCLIB
2. SyncLRC
3. lyrics.ovh

取得結果にはプロバイダー情報を保持し、同期歌詞がある場合はそのままLRCとして利用できます。
通常歌詞しか無い場合も、LyricTubeの同期エディタで時間を付けられます。

### 同期エディタ

- LRC時間同期
- `♪ 間奏を追加`
- 選択行への現在時間打刻
- 各行だけ `-0.5 / -0.1 / +0.1 / +0.5秒`
- Undo
- 歌詞本文を修正したとき、可能な範囲で既存タイミングを維持

### ライブラリ

- 全曲
- お気に入り
- 最近聴いた曲
- プレイリスト
- タグ
- 曲検索
- 曲を探す画面
- JSON書き出し / 読み込み

### アカウント / ゲスト

- Supabaseクラウドアカウント
- ゲストモード
- アカウントごとの曲情報保存
- ゲストでは編集系機能を制限

## データ保存

### 曲情報

曲・歌詞・プレイリスト・設定などは `lyrictube.library.v3` 互換のJSON構造を維持しています。

利用モードに応じて、ブラウザ内ではアカウント別のlocalStorageへ保存されます。
クラウドアカウントではSupabase側にも曲情報を同期します。

### MP3 / MP4などのファイル本体

端末ファイル本体は **GitHubにもSupabaseにも送信しません**。

ブラウザのIndexedDBへ、その端末だけのデータとして保存します。

そのため別PC / スマホへログインした場合、曲名・歌詞などは同期されても、MP3 / MP4本体はその端末で再登録する必要があります。

ブラウザのサイトデータを削除すると端末ファイルが消える場合があります。

## バージョン管理

VReviewと同じ考え方で、ユーザーに見せるバージョンと技術的な更新番号を分離します。

### ユーザー向け

Semantic Versioning形式を使います。

```text
v0.9.0
│ │ └─ PATCH: 不具合修正・小改善
│ └─── MINOR: 機能追加・まとまった改善
└───── MAJOR: 大きな仕様段階
```

現在は正式な `v1.0.0` 前なので `v0.x.x` とします。
主要機能が安定し、通常利用で重大な未確認部分がなくなった段階で `v1.0.0` に上げます。

### 内部ビルド

キャッシュ更新やデバッグには日付 + revisionを使います。

```text
20260829-8
```

この値は通常UIでは目立たせません。

旧 `v31 / v34 / v35 / v36` のような番号は、過去の作業履歴として作業報告書や旧ドキュメントに残すだけにします。

## 崩してはいけない仕様

- GitHub Pagesで利用可能な静的構成
- `lyrictube.library.v3` の既存データ互換
- 曲と複数再生バージョンの分離
- 動画ごとの開始 / 終了 / スキップ / 歌詞同期
- YouTube動画そのものを保存しない
- 端末MP3 / MP4をユーザー操作なしに外部送信しない
- APIキーやパスワードを公開リポジトリへ保存しない
- クラウド更新後も端末ファイルを勝手に削除しない
- 編集機能をゲストへ無断開放しない

## ファイル構成

主要ファイルだけ記載します。

```text
index.html
styles.css
mobile.css
guest.css
app.js
site-shell.js
profile-data.js
cloud-sync.js
lyrics-providers.js
version-meta.js
local-audio.js
local-audio.css
local-media.js
tags.js
tags.css

data/
  defaults.json
  library.json
  library-owner.json
  site-config.json

docs/
作業報告書.md
```

### 主な役割

- `app.js` — プレイヤー / 曲 / 歌詞 / 同期エディタ本体
- `site-shell.js` — ログイン / ゲスト / スマホ補助UI
- `profile-data.js` — アカウント別保存先と拡張スクリプト読み込み
- `cloud-sync.js` — Supabaseクラウド同期
- `lyrics-providers.js` — LRCLIB + SyncLRC + lyrics.ovh
- `local-media.js` — MP3 / MP4などの端末ファイル追加・再生
- `local-audio.js` — 旧端末音源互換レイヤー
- `tags.js` — タグ管理
- `version-meta.js` — ユーザー向けSemantic Version表示

## GitHub Pages

1. `Settings`
2. `Pages`
3. `Deploy from a branch`
4. Branch: `main`
5. Folder: `/ (root)`
6. `Save`

GitHub PagesではNode.jsや `start.bat` は不要です。

## セキュリティ / 公開時の注意

公開リポジトリへ以下を直接入れないでください。

- Supabase Service Role Key
- API秘密鍵
- パスワード
- 個人情報
- MP3 / MP4など配布権限のないメディア本体

ブラウザから利用する公開可能な設定と、秘密にする必要がある情報は分離してください。

## 現在の未確認・既知の注意点

- SyncLRC / lyrics.ovhは外部サービスのCORSや障害の影響を受けます。
- YouTube埋め込み禁止動画は再生できません。
- MP4の再生可否はブラウザが対応する動画 / 音声Codecにも依存します。
- 端末ファイルはIndexedDBのため、ブラウザやOSのストレージ整理で削除される可能性があります。
- 実機の全ブラウザ / 全スマホでの最終操作確認は未完了です。

確認できていない項目は作業報告書で「確認済み」と扱わない方針です。

## 完成条件

`v1.0.0` とする目安は以下です。

- YouTube / MP3 / MP4の主要再生が安定
- 曲追加 / 編集 / 削除が安定
- クラウド同期で重大なデータ消失がない
- 歌詞検索と同期編集が通常利用できる
- PC / スマホで致命的なUI崩れがない
- README / 作業報告書が現仕様と一致
- 既知の重大不具合が残っていない
