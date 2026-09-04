# LyricTube 制作開始

## 基本情報

サイト / アプリ名：
`LyricTube`

GitHub Repository：
`EliteMay/lyrictube`

ChatGPT Project：
`lyrictube`

## Project概要

YouTube動画と端末のMP3 / MP4を1つのライブラリで扱い、通常歌詞・同期歌詞・複数再生バージョン・タグ・プレイリスト・クラウド同期を組み合わせて利用するMedia Webアプリ。

既存Projectのため、新規Rewriteではなく現在のRepositoryを土台に継続改善する。

## 目的

自分の音楽・動画を、再生Sourceを意識せず1つのLibraryで管理・再生し、歌詞を見ながら快適に利用できる環境を作る。

## 想定利用者

主に個人利用。PC / Smartphoneの両方から利用する。

## 確定要件

- Productの中心構造は `Library → Player → Lyrics` とする
- YouTubeとLocal Mediaを同一Library / Player体験で扱う
- 通常歌詞・同期歌詞・手動編集・同期Editorを維持する
- 1曲にMV / Cover / Live等の複数再生Versionを持てる
- Cloud account利用時は曲情報等をSupabase同期する
- Local Media本体は端末内に保持し、GitHub / SupabaseへUploadしない
- Guest dataとCloud account dataを混在させない
- 既存Library dataとの互換性を維持する

## 主な機能

現在実装済みの主要機能はRepositoryの `README.md` を正本として確認する。

今後の機能強化はGitHub Issue #11をRoadmapとして扱い、次の順で進める。

1. A1: 再生体験の強化
2. A2: 歌詞体験の強化
3. A3: ライブラリ管理の強化

## 重要仕様 / 崩してはいけないこと

- GitHub Pagesで動くこと
- `lyrictube.library.v3` の既存Dataを読み込めること
- 1曲に複数の再生Versionを持てること
- YouTubeと端末Fileを混在できること
- 端末File本体をGitHub / SupabaseへUploadしないこと
- 曲開始 / 終了 / Skip / Lyrics Offset / 動画専用同期を維持すること
- 歌詞の手動編集と同期Editorを維持すること
- GuestとCloud accountのDataを混在させないこと
- 大きな仕様変更ではSchema / README / 関連Documentationを現行実装と一致させること

詳細・最新状態はRepositoryの `README.md`、`PROJECT_LEARNINGS.md`、関連 `docs/`、Issue / PR、Runtimeを確認する。

## 禁止事項

- 既存仕様・保存互換性を無視した一括Rewrite
- Local Media本体のCloud Upload
- 公開Repository / FrontendへのSecret埋め込み
- User確認済みのVisual Baselineを、明確な改善理由なく崩すこと

## MVP

現在は既存Projectの次期改善として **A1: 再生体験の強化** を最優先にする。

最低範囲：

- 次に再生Queue
- 「次に再生」
- 「Queueの最後に追加」
- Queueの並べ替え
- Queueから削除
- YouTube / Local Mediaで同じQueue操作
- 明示QueueとFair Shuffleの優先関係を定義
- Queueを使わない既存再生Flowを維持

## 将来候補

### A2: 歌詞体験

- 歌詞内検索
- 原文 / 翻訳 / 読み表示
- Section / Chorus等の区間表現
- 同期調整改善
- Provider比較

### A3: Library管理

- お気に入り / 評価
- 最近追加 / 最近再生 / 未再生
- 複合Filter
- Smart Playlist
- 重複整理
- 再生統計

詳細候補はGitHub Issue #11を参照する。

## 完成条件

A1について最低限、次を満たす。

- YouTube / Local Mediaの両方でQueue主要操作が同じ意味で動く
- 「次に再生」「最後に追加」「並べ替え」「削除」が利用できる
- Queue / Shuffle / Repeat / Playlistの優先関係が仕様として明確
- Queue未使用時の既存Playback Flowを壊さない
- 既存Library Data互換を維持する、または必要なMigrationを定義する
- Desktop / Mobileから主要Queue操作へ到達できる
- 必要なTest / Regression確認と実BrowserでのMedia確認を行う

## 未確定事項

A1実装前に次を確定する。

- QueueをPage reload後も保持するか
- QueueをCloud同期するか
- Playlist再生中に手動Queueへ追加した場合の順序
- Repeat / Shuffle / Queueの関係
- 明示QueueとFair Shuffleの優先順位

## 制作開始時

このChatGPT Projectでは、GitHub Repository `EliteMay/web-project-workflow` の最新 `DEVELOPMENT_PROJECT.md` を共通Project設定の正本として扱う。

Web制作ルールは `EliteMay/web-project-guide` の最新版をSource of Truthとする。

対象Repositoryは既に存在するため、作業開始時に現在のGitHub上の状態を確認してから進める。

古い会話、古いZIP、以前確認したルールだけを現在状態として扱わない。
