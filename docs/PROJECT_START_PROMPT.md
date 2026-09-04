# LyricTube 新プロジェクト開始プロンプト

GitHub Repository:

https://github.com/EliteMay/lyrictube

このChatGPT Projectでは、既存Webアプリ `LyricTube` の継続開発・改善を行う。

作業を始める前に、必ず最新の `EliteMay/web-project-guide` を確認し、`README.md` と `START_HERE.md` を読んで今回の作業種類に必要なルートだけ参照すること。過去の会話や記憶だけを基準に進めないこと。

その後、`EliteMay/lyrictube` の現行Repositoryを確認し、少なくとも今回の作業に関係する次の情報を読むこと。

- `README.md`
- `PROJECT_LEARNINGS.md`
- 関連する `docs/`
- 関連Issue / PR
- 必要に応じてRuntime / Schema / Test

既存仕様を無視して作り直さないこと。

---

## LyricTubeの目的

LyricTubeは、YouTube動画と端末のMP3 / MP4を1つのライブラリで管理し、通常歌詞・同期歌詞・複数再生バージョン・タグ・プレイリスト・クラウド同期を組み合わせて利用するMedia Webアプリ。

中心となるProduct構造は、

`Library → Player → Lyrics`

とする。

---

## 現在の機能強化ロードマップ

GitHub Issue #11を現在の機能強化ロードマップとして扱う。

優先順位:

1. **A1: 再生体験の強化**
2. **A2: 歌詞体験の強化**
3. **A3: ライブラリ管理の強化**

### A1: 再生体験

候補:

- 次に再生キュー
- 「次に再生」
- 「キューの最後に追加」
- Queue並べ替え
- Queue削除
- 一時Queue
- 最近再生した曲
- 再生履歴
- しばらく聴いていない曲
- 未再生優先
- Fair Shuffleとの統合
- 前回再生セッション復元

A1では、実装前に以下を確定する。

- Queueを再読み込み後も残すか
- QueueをCloud同期するか
- Playlist再生中の明示Queueの優先順位
- Repeat / Shuffle / Queueの関係
- 明示QueueとFair Shuffleの優先順位

### A2: 歌詞体験

候補:

- 歌詞内検索
- 原文 / 日本語訳 / 読みの切替
- 原文 + 翻訳の2段表示
- `[Intro] [Verse] [Chorus]` 等の区間
- 区間ジャンプ
- 同期ズレの簡易修正
- 動画バージョンごとの同期調整
- カラオケ風の現在行強調
- 歌詞クリックSeek改善
- Provider比較
- 採用歌詞の記憶

### A3: ライブラリ管理

候補:

- お気に入り
- 評価
- 最近追加
- 最近再生
- 未再生
- 再生回数順
- 長期間未再生
- YouTube / MP3 / MP4フィルター
- タグ複数条件検索
- スマートプレイリスト
- 重複曲検出
- MV / Live / Cover等の整理支援
- 再生統計

---

## 崩してはいけない仕様

1. GitHub Pagesで動くこと
2. 公開RepositoryへSecretを保存しないこと
3. `lyrictube.library.v3` の既存データを読み込めること
4. 1曲に複数の再生バージョンを持てること
5. YouTubeと端末ファイルを混在できること
6. 端末ファイル本体をGitHub / Supabaseへアップロードしないこと
7. 曲開始 / 終了 / スキップ / 歌詞オフセット / 動画専用同期を維持すること
8. 歌詞の手動編集と同期エディタを維持すること
9. ゲストとクラウドアカウントのデータを混在させないこと
10. 大きな仕様変更時はSchema / README / 関連docs / 作業報告を同時更新すること

---

## Architecture上の重要方針

- YouTube / Local Media共通操作は `core/player-controller.js` の契約を優先する
- UIからProvider固有APIへ直接依存を増やさない
- Cloud Writerを無秩序に増やさない
- Local Media本体はIndexedDBに保持し、Cloudへ送らない
- `app.js` は一括Rewriteせず段階分割する
- Theme / Layoutは現行の正本を尊重する
- Legacy CSSへの場当たり的な上書きを増やさない

---

## UI / Visual方針

LyricTubeは `MEDIA + TOOL` として扱う。

- DesktopはLibrary rail + Player + LyricsのMedia Workspaceを中心にする
- Marketing風の巨大Heroは置かない
- 同じ強さのCardを大量に並べない
- Gradient / Glow / Glassを理由なく常用しない
- 装飾より、Hierarchy / Density / Typography / State設計を優先する
- 既存5ThemeのToken体系を崩さない
- 大きな見た目変更では、最新 `web-project-guide` のDomain-first Visual Researchを先に行う
- 見た目変更後はBrowser / Screenshotで最終状態を確認する

---

## 保存 / Cloud

現在の基本方針:

- 曲 / プレイリスト / 設定: localStorage + Cloud account時はSupabase
- MP3 / MP4本体: IndexedDB、その端末のみ
- Login session: sessionStorage
- Guest / Cloud dataは分離

Schema変更時は、Migration / Import Export互換 / Guest Cloud双方への影響 / Rollback / 別端末整合を先に確認する。

---

## Security

- API Secret / Password / Service Role Keyを公開Frontendへ置かない
- Supabase変更ではRLS / Grant / Edge Function境界を確認する
- 既存のServer-side registration gateを弱めない

---

## MVP / 当面の完成条件

まずA1を優先する。

A1の最低完成条件:

- YouTube / Local Mediaの両方でQueue操作が同じように動く
- 「次に再生」「最後に追加」「並べ替え」「削除」ができる
- 明示Queueがある場合はFair Shuffleより優先される
- Queueを使わない既存再生フローが壊れない
- 既存Library Schema互換を維持する、またはMigrationが定義される
- Desktop / Mobileで主要Queue操作へ到達できる
- Static test / Regression guardに加え、実ブラウザでYouTube / Local Mediaを確認する

---

## 作業ルール

- 小規模変更はSmallest Safe Changeを優先する
- 未確認の挙動を確認済みと書かない
- GitHub Actions成功だけでMedia実動作やVisual品質まで確認済みとは扱わない
- 一時Script / WorkflowはCleanup後の最終状態でValidationする
- 再発防止価値の高い失敗・成功は `PROJECT_LEARNINGS.md` へ残す
- README / Spec / Runtimeが矛盾する場合は勝手に片方を正しいと決めない
- 大きな仕様変更、保存互換性破壊、Security影響がある変更はユーザー確認を優先する

このプロジェクトでは、長期的な実装・不具合修正・UI改善を継続してよい。
