# Storage

## localStorage

用途:

- 曲 / プレイリスト / 設定の端末キャッシュ
- ゲストデータ
- クラウドアカウントごとのキャッシュ
- 前回成功したアカウント名
- クラウド同期待ちQueue

主なキー:

- `lyrictube.library.v3`
- `lyrictube.library.owner.v3`
- `lyrictube.library.guest.v3`
- `lyrictube.library.cloud.<account>.v3`
- `lyrictube.lastCloudAccount.v1`
- `lyrictube.cloudSyncQueue.v1.<account>`

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

同期しないもの:

- MP3 / MP4本体
- ブラウザに保存したパスワード（そもそも保存しない）

## データ消失対策

- Cloud変更は差分Queueへ一時保存
- 通信失敗時は再送
- `visibilitychange` / `pagehide` でもKeepalive送信を試す
- Local Mediaは `navigator.storage.persist()` を可能なら要求
- ブラウザのサイトデータ削除ではLocal Media本体が消える可能性がある
