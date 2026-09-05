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

Supabaseへのブラウザ側書き込みQueueを管理します。

- Library差分は既存 `lyrictube-api` へ送信
- A1の再生履歴eventは `lyrictube-play-history-api` へ送信
- どちらも同じ端末側再送Queueへ保持し、送信失敗時に復元します

## 差分内容

Library:

- `upsertSongs`
- `deleteSongIds`
- `upsertPlaylists`
- `deletePlaylistIds`
- `state`
- 大規模置換時のみ `replaceLibrary`

A1 Playback:

- `playHistory`: event ID、song ID、Version ID、playedAt、completed、skipped、playedSeconds

Playback eventはevent IDで冪等化します。同一eventの再送は詳細履歴を更新できますが、集約再生回数は最初の登録時だけ加算します。これにより通信再送や複数端末での競合による二重加算を防ぎます。

Cloudから詳細履歴を読む際は、`lyrictube_song_play_stats` の集約値も取得し、ローカルに未送信の再生がある場合を考慮して大きい再生回数 / 新しい最終再生日時を画面へ反映します。

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

## A1 Playback履歴

Supabase側では次を分離します。

- `lyrictube_play_history`: 最新500件の詳細履歴
- `lyrictube_song_play_stats`: 履歴を消しても残せる曲単位の集約値

「履歴だけ削除」は詳細履歴だけを消し、再生回数 / 最終再生日時は維持します。

「再生記録をリセット」は詳細履歴と集約値を削除し、Cloud Library上の各Song JSONの `playCount` / `lastPlayedAt` も0 / nullへ戻します。曲・プレイリスト・タグ自体は削除しません。

手動QueueとPlayback SessionはCloud同期せず、端末ローカルのままです。

## Local Media

MP3 / MP4本体はCloudへ送信しません。

Cloudには次だけ保存されます。

- `source: localmedia`
- `localMediaKind`
- `localFileName`
- 曲情報 / 歌詞 /同期設定

そのため別端末ではファイル再登録が必要です。
