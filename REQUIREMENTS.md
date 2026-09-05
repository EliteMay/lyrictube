# LyricTube 要件定義

Status: A1 requirements complete  
Last updated: 2026-09-05  
Adopted web-project-guide: 1.15.0

## 0. Source of Truth / Project Profile

- Repository: `EliteMay/lyrictube`
- Product: `LyricTube`
- Profiles: `STATIC / MEDIA / TOOL / CLOUD / PUBLIC-CONTENT`
- Recommendation-by-default: Yes
- 実装・現行仕様の正本: 現在のGitHub Repository
- 今回のA1機能要件の正本: この `REQUIREMENTS.md`
- 実装開始時は最新の `EliteMay/web-project-guide` の `README.md` / `START_HERE.md` と、対象作業に必要な章だけ確認する
- 既存README・PROJECT_LEARNINGS・docs・Tests・Runtimeと矛盾する場合、破壊的変更を勝手に行わない

## 1. 目的

LyricTubeの既存方針 `Library → Player → Lyrics` を維持したまま、曲を追加した後に細かく管理しなくても快適に聴き続けられる再生体験へ強化する。

A1では、次に再生する曲を明示できるQueue、再生セッション復元、Fair Shuffleとの統合、再生履歴・最近再生・未再生・長期間未再生を実装対象とする。

## 2. 使用者 / 公開範囲

- 主用途: 個人利用
- 端末: Desktop / Smartphone
- 公開: GitHub Pagesで公開可能な静的Frontendを維持
- Cloud Account: Supabaseを利用
- Guest: 端末内のみ
- Local Media本体: 端末内のみ

## 3. 崩してはいけない既存仕様

1. GitHub Pagesで動くこと
2. 公開Repository / FrontendへSecretを保存しないこと
3. `lyrictube.library.v3` の既存データを読み込めること
4. Libraryの内部Schema `settings.dataSchemaVersion = 4` の互換性をA1だけを理由に壊さないこと
5. 1曲に複数の再生Versionを持てること
6. YouTubeとLocal Mediaを同じLibrary / Player体験で扱えること
7. Local Media本体をGitHub / SupabaseへUploadしないこと
8. 曲開始 / 終了 / Skip / Lyrics Offset / 動画専用同期を維持すること
9. 歌詞の手動編集と同期Editorを維持すること
10. GuestとCloud Accountのデータを混在させないこと
11. UIからProvider固有再生APIへ直接依存せず、既存 `core/player-controller.js` の共通契約を尊重すること
12. User確認済みのVisual Baselineを明確な改善理由なく崩さないこと
13. 大規模Rewriteを行わず、既存互換を維持しながら段階導入すること

## 4. A1 実装対象

### 必須

- 次に再生Queue
- 「次に再生」
- 「Queueの最後に追加」
- Queue並べ替え
- Queueから1件削除
- Queue全削除
- QueueとPlaylist / Filter / Library Contextの統合
- QueueとFair Shuffle / Repeatの優先関係
- 前回Playback Sessionの同一端末復元
- 最近再生
- 詳細再生履歴
- 未再生
- しばらく聴いていない曲
- Guest / Cloud Account分離
- Cloud Accountの再生履歴同期

### A1では後回し

次はA3等へ回し、A1の完成条件には含めない。

- 詳細な再生統計Dashboard
- Smart Playlist
- お気に入り / 評価との複合条件
- 年間まとめ等の分析機能
- 高度な履歴可視化

## 5. Queueの基本仕様

### 5.1 Queueの役割

Queueは「これから再生する明示的な曲一覧」とする。

- 現在再生中の曲はQueue一覧の並べ替え対象外
- Queueに同じ曲を複数回追加できる
- Queue最大件数は500件
- 500件を超える追加では古いQueueを勝手に削除せず、追加できないことをUIで示す

### 5.2 「次に再生」

最新の「次に再生」操作を最優先する。

例:

```text
現在: A
Xを「次に再生」
A → X

続けてYを「次に再生」
A → Y → X
```

「次に再生」は現在位置直後へ挿入する。

### 5.3 「Queueの最後に追加」

既存Queueの末尾へ追加する。

```text
Queue: Y → X
Zを「Queueの最後に追加」
Queue: Y → X → Z
```

### 5.4 Queue内の直接再生

Queue内の曲を「今すぐ再生」した場合:

- 選択曲を直ちに再生する
- その選択曲自身はQueueから取り除く
- 他のQueue項目は維持する

例:

```text
Queue: X → Y → Z
Zを今すぐ再生
→ 再生: Z
→ 残Queue: X → Y
```

### 5.5 再生完了 / Skip

- Queue曲は通常再生完了時にQueueから自動削除する
- Queue曲を手動Skipした場合も消化済みとしてQueueから削除する
- 「前へ」で過去曲へ戻っても、消化済みQueueへ自動で戻さない

## 6. 再生優先順位

### 6.1 自動的な次曲決定

原則として次の優先関係を維持する。

1. Repeat Oneによる現在曲の繰り返し
2. 「次に再生」で明示されたQueue
3. その他の手動Queue
4. 元のPlaylist / Library / Filter等のPlayback Context
5. Fair Shuffle
6. Repeat AllによるContext先頭への復帰
7. どれも無ければ停止

明示QueueはFair Shuffleより必ず優先する。

### 6.2 Shuffle

- Shuffle ONでも明示Queueの並びはShuffleしない
- Queue消化後にShuffleが有効ならFair Shuffleを使う
- 既存 `core/fair-shuffle.js` の未再生優先 / 長期間未再生優先方針を維持する

### 6.3 Repeat

- Repeat Oneは自動再生完了時に現在曲を繰り返す
- Repeat Allは明示Queueを消化し、通常のPlayback Contextが終端へ達した後にContextを繰り返す
- 明示的なユーザー操作によるSkip / NextはRepeat Oneで操作不能にならないよう、通常の次曲選択へ進める

## 7. Playlist / Playback Context

### 7.1 手動QueueはPlaylistより優先

Playlist:

```text
A → B → C → D
```

B再生中に `X → Y` をQueueへ追加した場合:

```text
A → B → X → Y → C → D
```

Queue消化後は元のPlaylist位置へ戻る。

### 7.2 Playback Context

Queueとは別に「どこから再生を始めたか」をPlayback Contextとして保持する。

候補:

- Playlist
- Tag一覧
- 検索結果
- Filter結果
- Library全体
- 最近再生
- 未再生
- しばらく聴いていない
- 単曲再生

### 7.3 Context Snapshot

Playback Contextは再生開始時点の一覧をSnapshotとして固定する。

- 再生中に検索条件 / Filter条件を変えても現在Contextは変えない
- Playlistを編集中でも現在Contextは再生開始時点のSnapshotを維持する
- Playlistから曲を外しても、Libraryに曲自体が残っているなら現在Snapshotでは再生可能
- Libraryから曲自体が削除された場合は無効項目としてSkipする
- Playlist編集結果は次回そのPlaylistから再生開始したときに反映する

## 8. 手動で別曲を再生した場合

Library等から別の曲を直接再生しても手動Queueは消さない。

例:

```text
現在: A
Queue: X → Y → Z
LibraryからBを直接再生
→ Bを即再生
→ Queue: X → Y → Z を維持
→ B終了後はXへ進む
```

Queueを破棄したい場合は明示的な「Queueをすべてクリア」を使う。

## 9. 「前へ」ボタン

- 現在曲を3秒以上再生済みなら曲頭へ戻る
- 3秒未満なら直前の再生履歴の曲へ戻る
- 直前曲が無ければ現在曲の先頭へ戻る
- 過去曲へ戻っても、消化済みQueue項目をQueueへ自動復活させない

## 10. QueueとVersion

### 10.1 Queue Item

Queueは曲だけでなく、可能な場合は `songId + versionId` の組み合わせで再生対象を確定する。

### 10.2 Version未指定でQueue追加

次の優先順でVersionを決める。

1. その曲で前回使用したVersion
2. 曲の既定Version
3. 利用可能な最初のVersion
4. どれも再生不可ならQueue上で再生不可として扱う

Versionを明示してQueue追加した場合、そのVersionを固定する。

### 10.3 Version切替

現在再生中にVersionを切り替えた場合:

- 現在曲だけに適用する
- Queue内の同一曲の別Entryは変更しない
- 可能な場合は再生位置を引き継ぐ
- Version固有のLyrics Offset / 動画専用同期を適用する
- 再生履歴には実際に使用したVersion情報を残す

## 11. 再生不可項目

### Local Media

- Local Fileが無いQueue項目を勝手に削除しない
- Queue上で再生不可状態を表示する
- 「ファイルを再登録」導線を用意する
- 再生順が来た場合はその項目を一旦Skipして次へ進む
- 再登録後は同じQueue項目から再生可能にする
- 同じ曲に別Versionがあっても勝手に代替しない

### YouTube

削除済み動画、埋め込み不可、地域制限等で再生不可の場合も同じ考え方を採用する。

- Queueに残す
- 再生不可状態を表示
- その回はSkip
- 別Versionへ勝手に切り替えない
- ユーザーが選択した場合のみ代替Versionを使う

## 12. 曲 / Version削除時

### 曲そのものをLibraryから削除

その曲を参照しているQueue / Playback Session等の無効参照は安全に除外する。

履歴データの扱いは、曲参照が失われてもApplication全体の復元を失敗させないことを優先する。

### Versionだけ削除

- Queue Itemが削除Versionを指している場合、勝手に別Versionへ切り替えない
- 同じ曲の別Versionがある場合はユーザーが選べる
- 無ければ再生不可表示

## 13. Playback Session保存

### 13.1 保存対象

Library本体とは分離したPlayback Session専用Storageを使う。

保存対象:

- 現在の `songId`
- 現在の `versionId`
- 現在の再生位置
- 手動Queueと順序
- Playback Context Snapshot
- Context内の現在位置
- Shuffle状態
- Repeat状態
- 保存日時

Libraryの `settings.dataSchemaVersion = 4` はA1 Queue導入だけを理由に変更しない。

### 13.2 保存しないもの

- MP3 / MP4本体
- Password / Account creation key等の認証秘密情報
- QueueのCloud同期
- 現在の再生位置のCloud同期
- Playback ContextのCloud同期
- Drag中など未確定の一時UI状態

### 13.3 復元

同一端末では以下を復元する。

- 現在曲
- Version
- 再生位置
- Queue
- Playback Context Snapshot
- Context位置
- Shuffle / Repeat状態

ただし復元後に自動再生しない。ユーザーが再生操作を行った後に前回位置から続ける。

### 13.4 Session期限

30日間使用されていないPlayback Sessionは期限切れとして破棄可能。

対象はQueue / 再生位置 / Playback Context等のSessionデータのみで、Libraryや再生履歴は削除しない。

## 14. Guest / Account分離

Playback SessionはProfile単位で完全分離する。

- Guest → AccountへログインしてもGuest Queueを持ち込まない
- Account A → Account Bでも混在させない
- Logout時にAccount SessionをGuestへ混ぜない
- 同一Accountへ再ログインした場合、その端末に残るAccount専用Playback Sessionは復元できる
- Queue / Playback Sessionは同じAccountでも別端末へCloud同期しない

## 15. 再生履歴

### 15.1 履歴記録条件

次のどちらかを満たした再生を「再生した」と判定する。

- 10秒以上再生
- または曲全体の10%以上を再生

以下は履歴へ残さない。

- 条件未満で別曲へ移動
- 再生直後の誤操作
- 読み込み失敗
- 実際に再生できなかったMedia

### 15.2 playCount / lastPlayedAt

履歴条件を満たしたタイミングで:

- `playCount += 1`
- `lastPlayedAt = 現在時刻`

同じ1回の再生中にSeekしても `playCount` は1回だけ増やす。

### 15.3 詳細履歴

詳細履歴では最低限、実装可能な範囲で次を保持できる設計にする。

- songId
- 実際に再生したversionId
- 再生日時
- completed
- skipped
- playedSeconds

A1のUIでは詳細統計Dashboardへ拡張せず、履歴表示・最近再生・Fair Shuffle等の基礎に使う。

### 15.4 保存件数

- Guest: 直近500件
- Cloud Account: 直近500件
- 501件目追加時は最古の詳細履歴から削除
- 詳細履歴が消えても累計 `playCount` / 最新 `lastPlayedAt` は保持する

### 15.5 最近再生

最近再生一覧は曲単位で重複をまとめ、最新の `lastPlayedAt` 順に表示する。

詳細履歴画面では同一曲の複数回再生を時系列の別Entryとして表示する。

### 15.6 未再生

`playCount === 0` を未再生として扱う。

### 15.7 しばらく聴いていない

- 初期条件: `lastPlayedAt` が30日以上前
- 一度も再生していない曲は混ぜず「未再生」へ分離
- 将来条件を変更しやすい構造とし、7 / 30 / 90 / 180日等を選べる余地を残す

## 16. 履歴のCloud同期

### Guest

再生履歴は端末内だけに保存する。

### Cloud Account

次をSupabaseへ同期する。

- 詳細再生履歴
- `lastPlayedAt`
- `playCount`
- completed / skipped
- 実際に再生したVersion
- 再生日時

Queue / 再生位置 / Playback Context / Playback SessionはCloud同期しない。

### 複数端末

PCとSmartphone等で同時再生した場合:

- 両方の有効な再生Eventを履歴へ残す
- `lastPlayedAt` は最も新しい時刻
- `playCount` は片方の更新で他方が失われない方式にする

Cloud Writerは既存方針どおり単一の同期入口を維持し、Frontend各所からSupabaseへ直接Writerを増殖させない。

## 17. 履歴削除

2種類に分ける。

### 履歴だけ削除

- 詳細履歴を削除
- `playCount` / `lastPlayedAt` は残す

### 再生記録をリセット

- 詳細履歴
- `playCount`
- `lastPlayedAt`
- 未再生判定に関係する再生記録

をまとめて初期化する。

曲本体・Playlist・Tag等は削除しない。

## 18. UI / 導線

### Desktop

Player周辺からQueueを開く右側Drawer形式を基本とする。

Queue UI:

- 現在再生中
- 次に再生
- Queue一覧
- Queueをすべてクリア
- サムネイル
- 曲名
- アーティスト
- 再生Source / Version情報
- 並べ替え
- 1件削除
- 今すぐ再生
- 再生不可状態 / 修復導線

### Mobile

右側固定PanelではなくBottom Sheet形式とし、Desktopと同じ機能へ到達できること。

### 曲メニュー

最低限:

- 今すぐ再生
- 次に再生
- Queueの最後に追加

### Sidebar / Library

最低限:

- 最近再生
- 未再生
- しばらく聴いていない

詳細履歴は「最近再生」等から到達可能にする。

Drag操作だけに依存せず、Mobile / Keyboard等でもQueue操作へ到達できること。

## 19. Visual Direction

既存のUser確認済み `Library → Player → Lyrics` Media Workspaceを維持する。

- Desktop: 左Library rail + Player + Lyrics
- Density: medium-high
- Marketing Heroを追加しない
- Queue追加に伴い既存Player / Lyricsの主従関係を崩さない
- Theme Tokenの正本は既存 `theme.css`
- 現在Visualの正本は `docs/VISUAL_BASELINE.md`
- Queue Drawer / Bottom Sheetを追加しても5 Themeの一貫性を維持する

## 20. 主な利用フロー

```text
Library / Playlist / Search等から曲を再生
↓
Playback Context Snapshotを作る
↓
必要なら「次に再生」/「Queue最後に追加」
↓
明示Queueを優先して再生
↓
Queue消化後は元のContextへ戻る
↓
Context終端後はShuffle / Repeat設定に従う
↓
有効な再生を履歴へ記録
↓
同一端末ではSessionを復元可能
```

## 21. 性能 / 規模

- Queue: 最大500件
- 詳細再生履歴: 最大500件 / Profile
- Queue / Session保存処理で再生UIを不必要にBlockしない
- Queue並べ替えで全Libraryを書き直す設計を避ける
- 再生履歴Cloud同期は差分送信を基本とし、複数端末で更新消失を起こさない
- Local Media本体をSession / Historyへ複製保存しない

## 22. 必須テスト

### Queue

- 1曲追加
- 複数曲追加
- 同じ曲を複数追加
- 「次に再生」を連続追加
- Queue最後に追加
- 並べ替え
- 1件削除
- 全削除
- 500件上限

### 再生優先関係

- Queue → Playlist / Context復帰
- Queue → Fair Shuffle
- Repeat One
- Repeat All
- Shuffle ON / OFF
- 前へ / 次へ
- Libraryから別曲を即再生

### 復元 / Profile

- Page reload
- Browser restart
- 30日以上経過したSession
- Guest → Login
- Account A → Account B
- Logout → Guest
- 同一Accountへの再Login

### Media

- YouTube
- Local MP3
- Local MP4
- Local File紛失
- YouTube再生不可
- Version削除
- 曲削除

### 履歴

- 10秒未満
- 10秒以上
- 10%以上再生
- Skip
- 完走
- Seekを含む1再生でplayCountが重複加算されない
- 同一曲の連続再生
- 500件超過
- 履歴だけ削除
- 再生記録リセット
- Cloud複数端末統合

### Visual / 実ブラウザ

- Desktop
- Mobile幅
- Queue Drawer
- Bottom Sheet
- 5 Theme
- YouTube実再生
- Local Media実再生
- Session復元

## 23. A1 完成条件

- [ ] YouTube / Local MediaでQueue操作の意味が一致する
- [ ] 「次に再生」「Queue最後に追加」「並べ替え」「削除」「全削除」が利用できる
- [ ] 明示QueueがFair Shuffleより優先される
- [ ] Queue / Context / Shuffle / Repeatの優先関係がこの要件どおり
- [ ] Queue未使用時の既存Playback Flowを壊さない
- [ ] Page reload / Browser restart後に同一端末でSessionを復元できる
- [ ] Session復元後に自動再生しない
- [ ] Guest / Cloud AccountのPlayback Sessionが混在しない
- [ ] Queue / 再生位置 / Playback ContextをCloud同期しない
- [ ] 再生履歴・最近再生・未再生・長期間未再生が仕様どおり
- [ ] Cloud Accountの再生履歴がSupabase同期される
- [ ] 複数端末でplayCount更新が失われない
- [ ] 再生不可Version / 削除済み参照があってもPlayer全体が壊れない
- [ ] Desktop / Mobileから主要Queue操作へ到達できる
- [ ] Library Schema 4互換を維持する、または実装上変更が不可避ならMigration / Backup / Rollbackを先に定義してユーザー確認する
- [ ] 必要なStatic Test / Regression Guardが成功する
- [ ] 実ブラウザでYouTube / Local Mediaを確認する
- [ ] Visual変更後に既存Visual Baselineを悪化させていないことを確認する
- [ ] README / 関連docs / PROJECT_LEARNINGS等を実装最終状態と一致させる
- [ ] 未確認項目を明記する

## 24. 実装時に勝手に変えてはいけない項目

次は要件変更になるため、実装都合だけで変更しない。

- QueueをCloud同期する
- QueueをPage reloadで消す
- Queue最大500件の方針
- 明示QueueよりShuffleを優先する
- Queue内をShuffleする
- Local Media欠落時に別Versionへ自動置換する
- Guest / Account間でPlayback Sessionを共有する
- Library Schema互換を破壊する
- Local Media本体をCloudへUploadする
- 現在のVisual Baselineを大きく変更する
- A2 / A3機能をA1へ無断で追加する

## 25. 実装前確認

実装会話では最初に以下を確認する。

1. 最新 `EliteMay/web-project-guide` の `README.md` / `START_HERE.md`
2. この `REQUIREMENTS.md`
3. `README.md`
4. `PROJECT_LEARNINGS.md`
5. `docs/ARCHITECTURE.md`
6. `docs/STORAGE.md`
7. `docs/CLOUD.md`
8. `docs/DATA_SCHEMA.md`
9. `docs/VISUAL_BASELINE.md`
10. `core/player-controller.js`
11. `core/fair-shuffle.js`
12. `profile-data.js` / `cloud-sync.js`
13. Queue / History / Playbackに関係する既存Tests

実際のコードがこの要件作成時点から更新されている場合、現在のGitHub状態を優先して差分を確認する。ただし、このファイルの確定要件と衝突する破壊的変更はユーザー確認なしに確定しない。
