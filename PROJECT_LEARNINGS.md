# PROJECT LEARNINGS

このファイルは、LyricTubeで発生した**再発防止価値の高い失敗**と、今後も再利用したい**成功パターン**を長期的に残すための正本です。

作業報告書は「今回何を変更したか」、このファイルは「このProjectから何を学んだか」を記録します。

## Failure

### PL-F-001 Providerごとに再生処理が分岐した

- Date: 2026-08-30
- Status: resolved
- Severity: high
- Cost: high
- Symptom: YouTubeでは動く同期歌詞・Seek・Keyboard操作がLocal Mediaでは一部動かなかった。
- Expected: YouTube / MP3 / MP4で同じUI操作が同じ意味を持つ。
- Actual: UIからYouTube APIへ直接接続する処理とLocal Mediaの後付け処理が混在した。
- Trigger / Reproduction: Local Mediaを選び、歌詞クリック・Space / Arrow・同期追従を利用する。
- Root Cause: Providerごとにplay / pause / seek / time取得を別経路で実装した。
- Final Fix: `core/player-controller.js`へ共通契約を作り、UIからProvider固有APIへの直接依存を削減した。
- Affected files / systems: `app.js`, `local-media.js`, `core/player-controller.js`
- Detection method: Code review + regression test
- Regression Guard: `tests/player-controller.test.js`、Runtime guard
- Prevention: 複数Providerで同じ操作を扱う場合はController / Adapterを入口にする。
- Related Issue / PR / Commit: v0.13.1〜v0.13.2
- Guide candidate: yes
- Guide note: web-project-guide F-008 / S-003へ還元済み。

### PL-F-002 古いVersion表示とhardcodeが新方式を上書きした

- Date: 2026-08-30
- Status: resolved
- Severity: medium
- Cost: medium
- Symptom: `version.js`を正本にした後も古い `GH v35` 表示や `v14` 書き出し名が復活した。
- Expected: 表示Version / Build / SchemaはSingle Source of Truthから取得する。
- Actual: Legacy runtimeに旧Version文字列が残っていた。
- Trigger / Reproduction: 設定画面を開く、データを書き出す。
- Root Cause: Runtime統合後の旧hardcode探索とRegression Guardが不足していた。
- Final Fix: 旧hardcode削除、Version正本統一、再混入Guard追加。
- Affected files / systems: `version.js`, `site-shell.js`, `app.js`, tests
- Detection method: Code search + user report
- Regression Guard: Runtime regression guard
- Prevention: Version / Build / Schema変更時はRepository全体の旧hardcodeを検索する。
- Related Issue / PR / Commit: v0.10.x〜v0.12.0
- Guide candidate: yes
- Guide note: web-project-guide F-004 / F-013へ還元済み。

### PL-F-003 Sidebarの操作領域がContentに押し出された

- Date: 2026-08-30
- Status: monitoring
- Severity: medium
- Cost: medium
- Symptom: タグ・プレイリスト等が増えた状態や低いViewportで `設定 / ? / 書き出し / 読み込み` が見えにくくなった。
- Expected: 主要操作はContent量やZoomに左右されず到達できる。
- Actual: Sidebar内部へContentと操作を同じ縦Flowで積み、`overflow`と高さ制約で操作が押し出された。
- Trigger / Reproduction: 低い縦解像度、Mobile、Zoom、Sidebar項目増加。
- Root Cause: SidebarをBrand / Scroll Content / Toolsへ分離していなかった。
- Final Fix: Sidebarを3領域化し、中央だけをScrollさせる構成へ変更した。
- Affected files / systems: `index.html`, `styles.css`, `mobile.css`, `sidebar.css`
- Detection method: User screenshot + layout review
- Regression Guard: `tests/sidebar-layout.test.js`
- Prevention: fixed / sticky / overflowを含むLayout変更では低いViewportとZoomを確認する。
- Related Issue / PR / Commit: v0.13.2 build 20260830-8
- Guide candidate: yes
- Guide note: web-project-guide F-006 / F-012へ還元済み。

---

## Success

### PL-S-001 Player Controllerで複数再生Sourceを統合

- Date: 2026-08-30
- Goal / Problem: YouTube / Local Mediaの操作差とMonkey Patchを減らす。
- Adopted Pattern: UI → Player Controller → Provider Adapter。
- Why it worked: play / pause / seek / currentTime / duration / stateの共通契約でUI側の分岐を減らせた。
- Trade-off: Controller / Adapterの初期構造と統合テストが必要。
- Reuse when: 同じUI操作を複数Backend / Providerへ接続するとき。
- Avoid when: Providerが1種類だけの小規模Prototype。
- Related files / tests: `core/player-controller.js`, `tests/player-controller.test.js`
- Guide candidate: yes
- Guide note: web-project-guide S-003へ還元済み。

### PL-S-002 Final-state Validationを基準にする

- Date: 2026-08-30
- Goal / Problem: 一時Script / Workflowを使った修正で途中Commitだけ検証済みになる問題を防ぐ。
- Adopted Pattern: Cleanup後の最終main CommitでCI / Pages / Regressionを確認する。
- Why it worked: 作業途中の成功と公開状態の成功を分離できる。
- Trade-off: 最後にもう一度Validationを待つ必要がある。
- Reuse when: GitHub Pages、複数Commit修正、Temporary toolingを使う作業。
- Avoid when: 単一ファイルの極小変更でもFinal Commit確認自体は省略しない。
- Related files / tests: `.github/workflows/validate-js.yml`
- Guide candidate: yes
- Guide note: web-project-guide S-020へ還元済み。

### PL-S-003 Media Workspaceを構造で差別化する

- Date: 2026-08-31
- Goal / Problem: Gradient / Card / Glowを増やすのではなく、LyricTube固有の用途が一目で分かるVisual hierarchyへ改善する。
- Adopted Pattern: `Library rail → Player → Lyrics` をSignatureとして固定し、Browse Heroを通常のLibrary headerへ縮小。編集設定は同じ強さのCard群からSection / Divider中心へ変更した。
- Why it worked: Mediaを主役にしながら、選択・再生・歌詞・編集の優先度をPosition / Density / Spacingで表せる。
- Trade-off: 派手な装飾は減るため、Artwork / Player / Lyricsの実Content品質がより目立つ。
- Reuse when: 高頻度で使うMedia Tool、PlayerとLibraryを同時に扱うWorkspace。
- Avoid when: Marketing Messageそのものを主役にするLanding Page。
- Related files / tests: `workspace.css`, `sidebar.css`, `tests/visual-workspace.test.js`
- Guide candidate: no
- Guide note: web-project-guide Visual Design Quality / AP-026〜AP-028をProjectへ適用した実例。

---

## Guide Feedback Queue

| ID | Type | Summary | Evidence | Next action |
|---|---|---|---|---|
| PL-Q-001 | success | 定期的にGuide revisionとProject CIをまとめて確認する仕組み | `guide-audit.yml` | 数回運用し、Issue通知の頻度と実用性を評価する |
