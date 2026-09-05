# Storage

## localStorage

用途:

- 曲 / プレイリスト / 設定の端末キャッシュ
- ゲストデータ
- クラウドアカウントごとのキャッシュ
- 前回成功したアカウント名
- クラウド同期待ちQueue
- A1の再生Session / 手動Queue（端末・Role / Cloud account単位）
- A1の詳細再生履歴キャッシュ

主なキー:

- `lyrictube.library.v3`
- `lyrictube.library.owner.v3`
- `lyrictube.library.guest.v3`
- `lyrictube.library.cloud.<account>.v3`
- `lyrictube.lastCloudAccount.v1`
- `lyrictube.cloudSyncQueue.v1.<account>`
- `lyrictube.playbackSession.v1.<scope>`
- `lyrictube.playHistory.v1.<scope>`

A1のPlayback Sessionには現在曲 / Version、再生位置、手動Queue、再生開始時のContext snapshot、Shuffle / Repeat、曲ごとのVersion preference、Previous用navigation historyを保存します。30日を超えたSessionは復元しません。

手動QueueとPlayback Sessionは端末ローカルです。Cloud accountでも別端末へQueueそのものは同期しません。

詳細再生履歴は最大500件をローカル保持し、Cloud accountでは同じevent IDをSupabaseにも同期します。

## sessionStorage

- 現在のCloud session token
- 現在のアクセスRole

ブラウザを閉じるとセッションは終了します。

## IndexedDB

Current DB:

- `lyrictube.localMedia.v1`

保存するもの:

- MP3 / MP4 / WebM等のBlob
- fileName
- mime
- size
- media kind
- songId / versionId / account scope

旧DB:

- `lyrictube.localAudio.v1`

v0.10.0で新Local Media DBへ自動移行を試み、移行後は旧DBを削除します。

## Supabase

同期するもの:

- Song metadata
- Playlist
- Settings
- Lyrics
- Local Mediaのファイル名 / kindなどのmetadata
- Cloud accountの詳細再生履歴
- Cloud accountの曲ごとの集約再生回数 / 最終再生日時

A1で追加したPlayback用テーブル:

- `lyrictube_play_history`: event ID単位の詳細履歴。アカウントごとに最新500件。
- `lyrictube_song_play_stats`: 曲ごとの`play_count` / `last_played_at`集約値。

再生イベントはevent IDを主キーにして冪等化し、通信再送や複数端末による同一eventの重複送信で再生回数が二重加算されないようにします。

同期しないもの:

- MP3 / MP4本体
- 手動Queue / Playback Session
- ブラウザに保存したパスワード（そもそも保存しない）

## データ消失対策

- Cloud変更は差分Queueへ一時保存
- 再生履歴eventも同じ再送Queueへ保存
- 通信失敗時は再送
- `visibilitychange` / `pagehide` でもKeepalive送信を試す
- Local Mediaは `navigator.storage.persist()` を可能なら要求
- ブラウザのサイトデータ削除ではLocal Media本体と端末ローカルQueue / Sessionが消える可能性がある
