# Known Issues

## 1. app.jsがまだ大きい

`app.js` は旧バージョンから積み上げた互換コアで、まだ単一ファイルとして大きいです。

v0.10.0では一括Rewriteを避け、まず次を完了しました。

- Version一本化
- Schema追加
- Cloud writer一本化
- Local Media一本化
- Login統合
- CI強化
- 公開Core Facade追加

今後は純粋関数→Library→Lyrics→Player→UIの順で分割します。

## 2. Local MediaのCodec依存

MP4 / WebMというコンテナが同じでも、内部Codecがブラウザ非対応だと再生できません。

目安:

- MP4: H.264 + AAC
- WebM: VP8 / VP9 + Opus/Vorbis

## 3. Local Mediaは端末間同期されない

ファイル本体はプライバシーと容量のためSupabaseへ送信しません。別端末では再リンクが必要です。

## 4. 外部歌詞Provider

LRCLIB / SyncLRC / lyrics.ovhは外部サービスなので、CORS・Rate limit・障害・仕様変更の影響を受けます。

## 5. YouTube埋め込み

投稿者側で埋め込みが禁止されている動画はIFrame Playerで再生できません。

## 6. 実機確認

GitHub Actionsでは静的構文・参照整合を検証していますが、以下は実ブラウザでの最終確認が必要です。

- YouTube実再生
- MP3 / MP4の実デコード
- モバイルSafariのMedia挙動
- Providerごとの実通信
- 長時間再生時のメモリ使用量
