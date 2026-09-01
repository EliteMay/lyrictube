# Cloud

## 役割分担

### site-shell.js

- ログイン / 作成キー付き新規アカウント登録
- Session確認
- 初回Library取得
- アカウント管理

### profile-data.js

Library保存前後を比較し、変更内容を差分へ変換します。

### cloud-sync.js

Supabaseへの唯一の書き込みWriterです。

## 差分内容

- `upsertSongs`
- `deleteSongIds`
- `upsertPlaylists`
- `deletePlaylistIds`
- `state`
- 大規模置換時のみ `replaceLibrary`

## 再送

通信エラー時はメモリだけでなく、次のlocalStorageキーにも待機中の差分を保存します。

```text
lyrictube.cloudSyncQueue.v1.<accountId>
```

次回オンライン時・Session準備後に再送します。

## ページ終了時

通常の非同期保存だけに依存せず、`visibilitychange` と `pagehide` でFetch `keepalive` を利用して送信を試みます。

## 認証

Edge Functionは独自Session tokenを検証します。

パスワードはGitHub Pagesへ保存しません。

v0.10.0では同一アカウント名へのログイン失敗を10分窓で数え、5回失敗すると15分間ブロックします。成功時は失敗カウンターを削除します。

Build `20260901-1` から、未ログイン状態でも作成キーを使って新規クラウドアカウントを作成できます。作成キーの平文はGitHub Pages / localStorage / sessionStorageへ保存せず、Edge Function側でSHA-256照合します。作成キーの誤入力は接続元を直接保存せずHash化したRate Keyで数え、短時間の連続試行を制限します。登録は `lyrictube_register_account` でアカウントと初期Stateを同一Transaction内に作成し、成功後は30日Sessionを発行してそのままログインします。

## Local Media

MP3 / MP4本体はCloudへ送信しません。

Cloudには次だけ保存されます。

- `source: localmedia`
- `localMediaKind`
- `localFileName`
- 曲情報 / 歌詞 /同期設定

そのため別端末ではファイル再登録が必要です。
