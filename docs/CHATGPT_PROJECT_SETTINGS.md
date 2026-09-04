# ChatGPT Project Settings — lyrictube

## Project name

`lyrictube`

## GitHub repository

`EliteMay/lyrictube`

https://github.com/EliteMay/lyrictube

## Purpose

LyricTubeは、YouTube動画と端末のMP3 / MP4を1つのライブラリで扱い、通常歌詞・同期歌詞・複数再生バージョン・タグ・プレイリスト・クラウド同期を組み合わせて使う個人向けMedia Webアプリ。

このChatGPT Projectでは、LyricTubeの継続的な実装・改善・不具合修正・UI調整・調査を扱う。

要件定義のSource of TruthはGitHub上の現行README / docs / Issuesを優先し、この設定へ要件全文を複製しない。

## 作業開始時の必須確認

HTML / CSS / JavaScript / GitHub Pages / Supabase等に関わる作業を始める前に、必ず以下を確認する。

1. `EliteMay/web-project-guide` の最新版
2. `web-project-guide/README.md`
3. `web-project-guide/START_HERE.md`
4. START_HEREが今回の作業に指定する必要な章だけ読む
5. `EliteMay/lyrictube` の現行README・関連docs・PROJECT_LEARNINGS・Issue / PRを必要範囲で確認する

過去の会話や記憶だけで実装方針を決めない。

## 現在の主要方針

LyricTubeのVisual / Product構造は `Library → Player → Lyrics` を中心とする。

機能強化の優先順位は次の通り。

1. A1: 再生体験の強化
2. A2: 歌詞体験の強化
3. A3: ライブラリ管理の強化

詳細はGitHub Issue #11を参照する。

A1では、Queue / 次に再生 / 最後に追加 / 並べ替え / 削除 / 再生履歴 / Fair Shuffleとの統合 / 再生セッション復元などを候補とする。

A2では、歌詞検索 / 原文・翻訳・読み / 区間表示 / 同期修正 / Provider比較 / 歌詞表示改善などを候補とする。

A3では、お気に入り / 評価 / 最近追加 / 最近再生 / 未再生 / フィルター / スマートプレイリスト / 重複整理 / 再生統計などを候補とする。

## 崩してはいけない主要仕様

- GitHub Pagesで動くこと
- 公開RepositoryへSecretを保存しないこと
- `lyrictube.library.v3` の既存データを読み込めること
- 1曲に複数の再生バージョンを持てること
- YouTubeと端末ファイルを混在できること
- 端末ファイル本体をGitHub / Supabaseへアップロードしないこと
- 曲開始 / 終了 / スキップ / 歌詞オフセット / 動画専用同期を維持すること
- 歌詞の手動編集と同期エディタを維持すること
- ゲストとクラウドアカウントのデータを混在させないこと
- 保存Schema変更時はMigration / Backup / Rollbackを検討すること
- 大きな仕様変更時はREADME / Schema / 関連docs / 作業報告を現行実装と一致させること

## 既存Architectureを尊重する

- UIからYouTube / Local Media固有APIへ直接依存を増やさず、`core/player-controller.js` の共通契約を優先する
- Cloudへの書き込みは既存の同期責務を尊重し、Writerを無秩序に増やさない
- Local Media本体はIndexedDB側に保持し、Cloudへ送らない
- `app.js` は大きいが、一括Rewriteせず段階的に分割する
- Theme / Layoutの正本を無視してLegacy CSSへ場当たり的な上書きを追加しない
- User-validated Visual Baselineを明確な改善理由なしに悪化させない

## UI / Visual

LyricTubeは `MEDIA + TOOL` として扱う。

- Desktop: Library rail + Player + LyricsのMedia Workspaceを維持
- Marketing風の巨大Heroを追加しない
- 同じ強さのCardを大量に並べない
- Gradient / Glow / Glassを理由なく増やさない
- Layout / Density / Typography / Stateの情報設計を装飾より優先
- Themeは既存Token体系を尊重する
- 大きな見た目変更では最新web-project-guideのDomain-first Visual Researchを先に行う
- 見た目変更後はScreenshot / Browserで最終状態を確認する

## データ / 保存

現在の主要保存方針を壊さない。

- Library / Settings: localStorage + Cloud account時はSupabase
- Local MP3 / MP4本体: IndexedDB、その端末のみ
- Login session: sessionStorage
- Guest / Cloud dataは分離

Schema変更を伴う提案では、先に次を確認する。

- 既存データMigration
- Import / Export互換
- Guest / Cloud双方への影響
- Rollback可否
- 別端末との整合

## Security

- GitHub PagesへAPI Secret / Password / Service Role Key等を置かない
- 公開Frontendへ秘密情報を埋め込まない
- Supabase変更ではRLS / Grant / Edge Function境界を確認する
- Account registration等の既存Server-side Gateを弱めない

## 作業方針

- 小規模修正ではSmallest Safe Changeを優先する
- 大規模仕様変更を勝手に確定しない
- README / SPEC / Runtimeが衝突する場合は、実装を勝手に正本と決めず差分を示す
- 未確認のBrowser挙動を確認済みと書かない
- 一時Script / Workflowを使った場合はCleanup後の最終状態でValidationする
- 既知の失敗・成功で再発防止価値が高いものは `PROJECT_LEARNINGS.md` へ残す
- GitHub Actions成功だけでMedia実動作・Visual品質まで確認済みとは扱わない

## ChatGPT / Codexの役割分担

### ChatGPT

- 相談
- 要件整理
- 調査
- 比較
- UI / UX案
- 仕様案
- 説明
- 文章作成
- Codex向け引き継ぎ作成

### Codex

- 既存Repositoryの実ファイル確認
- コード / 設定変更
- 複数ファイルへの反映
- Test / Build / CI / Browser確認
- README / Spec / Learnings等との整合確認

既存プロジェクトへ変更を反映する作業は、原則としてCodex側でGitHubの最新状態を確認して実施する。

## GitHubとの連携

- 現在のGitHub `main` を通常のSource of Truthとする
- 作業前に関連Issue / PR / docsを確認する
- 大きな変更はIssue / PRへ目的・互換性・検証条件を残す
- 完了時は最終Commit / CI / Pages状態を確認する
- 公開URLは実際に確認できた場合のみ提示する

## 会話名

基本的に次を使う。

- `lyrictube（実装）`
- `lyrictube（UI・見た目）`
- `lyrictube（不具合・改善）`
- `lyrictube（相談・調査）`

必要な場合のみ、

- `lyrictube（データ・コンテンツ）`
- `lyrictube（GitHub・公開）`

を追加する。

## 最終判断

ユーザーの現在の明示指示を最優先する。ただし既存データ互換・崩してはいけない仕様・Securityと衝突する場合は、影響と代替案を示してから大きな変更を行う。
