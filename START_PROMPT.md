# LyricTube 実装開始プロンプト

GitHub Repository：

`https://github.com/EliteMay/lyrictube`

このRepositoryの実装を続けます。

最初に最新の `EliteMay/web-project-guide` の `README.md` と `START_HERE.md` を確認し、今回の実装に必要なルールだけ参照してください。

その後、`EliteMay/lyrictube` の現在のGitHub上の状態を確認してください。

今回までに整理・保存した **`REQUIREMENTS.md` をA1再生体験強化のSource of Truth** として扱い、機能別の詳細仕様は関連Owner Docも確認してください。少なくとも次を必要範囲で確認してから実装を開始してください。

- `REQUIREMENTS.md`
- `README.md`
- `PROJECT_LEARNINGS.md`
- `docs/ARCHITECTURE.md`
- `docs/STORAGE.md`
- `docs/CLOUD.md`
- `docs/DATA_SCHEMA.md`
- `docs/LYRICS.md`
- `docs/VISUAL_BASELINE.md`
- `core/player-controller.js`
- `core/fair-shuffle.js`
- `profile-data.js`
- `cloud-sync.js`
- Playback / Queue / History / Lyrics searchに関係する既存Tests

古い会話・古いZIP・記憶だけを基準にせず、現在のGitHub上の内容を優先してください。

## 今回の実装対象

A1: 再生体験の強化と、今回確定した関連UI / Runtime改善。

中心機能は次です。

- 次に再生Queue
- 「次に再生」
- 「Queueの最後に追加」
- Queue並べ替え / 削除 / 全削除
- Playlist / Library / Search / Filter等のPlayback Contextとの統合
- Fair Shuffle / Repeatとの優先関係
- 同一端末でのPlayback Session復元
- 最近再生
- 詳細再生履歴
- 未再生
- しばらく聴いていない曲
- Cloud Accountの再生履歴同期
- 曲一覧の曲行クリック / タップで即時再生
- Sidebar曲行 / More action / Footer toolsのVisual整理
- 歌詞検索を閉じた後に遅延した非同期検索結果でDialogが勝手に再表示される問題の修正

Queue / 再生 / UIの詳細挙動・保存方針・完成条件は `REQUIREMENTS.md`、歌詞検索のProvider・非同期結果・Dialog lifecycleは `docs/LYRICS.md` を正本として確認してください。

## 特に崩してはいけないこと

- GitHub Pagesで動く
- `lyrictube.library.v3` の既存データ互換
- Library内部Schema 4をA1だけを理由に壊さない
- YouTube / Local Mediaで同じ再生操作を同じ意味にする
- `core/player-controller.js` の共通再生契約を尊重する
- Local Media本体をGitHub / SupabaseへUploadしない
- GuestとCloud Accountのデータを混在させない
- Queue / 再生位置 / Playback ContextをCloud同期しない
- 明示QueueをFair Shuffleより優先する
- User確認済みのVisual Baselineを明確な改善理由なく崩さない
- 閉じた歌詞検索結果Dialogをstaleな非同期結果で再表示しない
- 古い歌詞検索結果で新しい検索・別曲のUIを上書きしない
- 大規模Rewriteをしない

## 仕様衝突時

`REQUIREMENTS.md`、`docs/LYRICS.md`、現行README / docs、実装、Testsの間に重要な矛盾がある場合は、破壊的な変更を勝手に行わず、影響を示してください。

保存互換性、Cloud同期、Player共通契約、Local Media、主要UI構造、非同期Request lifecycleに影響する変更は特に慎重に扱ってください。

## 実装方針

- 既存機能を壊さないSmallest Safe Changeを優先する
- Provider別にQueueロジックを重複させない
- Playback SessionはLibrary本体から分離する
- Cloud履歴同期は既存Cloud Writer方針に統合する
- Queue UIは既存 `Library → Player → Lyrics` Workspaceを壊さない
- 歌詞検索はRequest ID / generation token / cancellation等で「現在も有効な検索」だけがUIを更新できるようにする
- Desktop / Mobileの両方で主要操作へ到達可能にする
- 実装に伴いREADME / 関連docs / Tests / PROJECT_LEARNINGS等を必要範囲で現行状態へ合わせる

## 完成判定

`REQUIREMENTS.md` のA1完成条件・必須テストと、`docs/LYRICS.md` の非同期検索Regression確認を満たすこと。

「コードを書いた」「Commitした」だけで完成扱いにしないでください。

Static / Regression Testに加え、可能な範囲で実BrowserのYouTube / Local Media、Desktop / Mobile UI、Playback Session復元、歌詞検索Dialogを閉じた後の遅延結果挙動まで確認し、確認できない項目は未確認として明記してください。

## 会話名

`lyrictube（実装）`
