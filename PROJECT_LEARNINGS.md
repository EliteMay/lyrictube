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

### PL-F-004 新旧Theme Layerが混在して画面内の配色が分裂した

- Date: 2026-08-31
- Status: resolved
- Severity: high
- Cost: medium
- Symptom: Light / Sepia等を選ぶと中央と歌詞は明るいSurfaceになる一方、SidebarだけDark固定のまま残り、HoverやActive歌詞にも別世代の色・Gradientが混在した。
- Expected: 1つのThemeを選んだら、Navigation / Main / Lyrics / Controlsが同じToken体系で一貫して切り替わる。
- Actual: 新しい `sidebar.css` が `#0c0f13 !important` でSidebarを固定し、旧 `styles.css` の `body.theme-*` が高いSpecificityでMain側を上書きした。さらに旧Gradient lyric ruleの `-webkit-text-fill-color: transparent` が残った。
- Trigger / Reproduction: SettingsでLight / Sepia / Midnight / Synthwaveへ切替し、Topbar / Sidebar / Lyrics / Hover状態を比較する。
- Root Cause: Visual refreshでLayoutの正本は追加したが、Theme Colorの正本を定義せずLegacy theme selectorsと新しい固定色を同時に残した。
- Final Fix: `theme.css` をTheme Colorの正本にし、5テーマのPage / Navigation / Surface / Text / Border / Accent Tokenを統一。SidebarもToken参照へ変更し、旧Ambient / Gradient lyric / unrelated hover surfaceを最終Layerで正規化した。
- Affected files / systems: `styles.css`, `workspace.css`, `sidebar.css`, `theme.css`, Tags / Dialog / Bottom PlayerのVisual state
- Detection method: User screenshot + CSS specificity review
- Regression Guard: `tests/theme-consistency.test.js`
- Prevention: 大規模Visual refreshではLayout LayerだけでなくTheme Token OwnershipとLoad Orderを先に決める。Themeごとの主要SurfaceとHover / Active状態をScreenshotで確認する。
- Related Issue / PR / Commit: Theme unification follow-up after Media Workspace refresh
- Guide candidate: yes
- Guide note: Visual Quality BaselineのComponent Consistency / Interactive State / Visual Verificationに該当する実例。

### PL-F-005 完全ランダムShuffleで未再生曲が長時間選ばれなかった

- Date: 2026-08-31
- Status: resolved
- Severity: medium
- Cost: medium
- Symptom: 昨日から何度も流れている曲が再び選ばれる一方、登録済みなのに一度も流れていない曲が残った。
- Expected: Shuffle感は保ちながら、未再生曲や長く聴いていない曲へ十分な再生機会がある。
- Actual: 次曲を選ぶたびに現在曲だけを除外して `Math.random()` で完全ランダム選択していたため、短期・日跨ぎの再生履歴を考慮しなかった。
- Trigger / Reproduction: 複数曲のライブラリでShuffleを長時間利用し、`playCount / lastPlayedAt` と実際の選曲を比較する。
- Root Cause: Shuffleを独立試行として実装し、既に保存している `lastPlayedAt` を候補選択へ利用していなかった。
- Final Fix: `core/fair-shuffle.js` を追加。未再生曲を最優先し、全候補に履歴がある場合は最も長く聴いていない曲群からランダム選択する。既存 `lastPlayedAt` を使うため新しい保存Schemaは追加しない。
- Affected files / systems: `app.js`, `site-shell.js`, `core/fair-shuffle.js`
- Detection method: User long-term usage report + code review
- Regression Guard: `tests/fair-shuffle.test.js`, `tests/fair-shuffle-integration.test.js`
- Prevention: 「ランダム」がUX目的の場合は数学的な完全ランダムだけでなく、重複・公平性・履歴・対象Queueの期待を先に定義する。
- Related Issue / PR / Commit: v0.13.2 build 20260831-1
- Guide candidate: no
- Guide note: Project固有のMedia playback policyとして保持する。

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
- Related files / tests: `workspace.css`, `sidebar.css`, `theme.css`, `docs/VISUAL_BASELINE.md`, visual regression tests
- Guide candidate: no
- Guide note: web-project-guide Visual Design Quality / AP-026〜AP-028をProjectへ適用した実例。2026-08-31にユーザー確認済みVisualをBaseline Commit `230fd87bf027a6d7351a3e41efa761800b945e43` として固定。

### PL-S-004 公開Frontendへ作成キーを置かずServer-side Gateで新規登録する

- Date: 2026-09-01
- Goal / Problem: 別端末から自分でクラウドアカウントを作れるようにしつつ、誰でも無制限に登録できる状態とFrontendへの秘密情報露出を避ける。
- Adopted Pattern: Login UI → Edge Function `register_account` → Server-side key digest check + rate limit → Transactional account/state creation → Session発行。
- Why it worked: GitHub Pages側へ作成キーの平文やService Role権限を置かず、既存の独自Session / Supabase構成を再利用できる。
- Trade-off: 作成キーを共有した相手は登録できるため、完全なPublic SignupではなくInvite-key方式として運用する必要がある。
- Reuse when: 個人・少人数向けCloud Toolで、メール認証までは不要だが新規登録を所有者が制御したいとき。
- Avoid when: 不特定多数向けサービス、本人確認・Password reset・Account recoveryが必要なProduct。
- Related files / systems: `site-shell.js`, `auth-ui.css`, Supabase `lyrictube-api` v3, `lyrictube_register_account`
- Guide candidate: no
- Guide note: 現行Security Baselineの「公開FrontendへSecretを置かない」をProjectへ適用した実例。

---

## Guide Feedback Queue

| ID | Type | Summary | Evidence | Next action |
|---|---|---|---|---|
| PL-Q-001 | success | 定期的にGuide revisionとProject CIをまとめて確認する仕組み | `guide-audit.yml` | 数回運用し、Issue通知の頻度と実用性を評価する |
| PL-Q-002 | failure | Visual refresh時にTheme token ownershipを曖昧にすると新旧CSSが混在する | `theme.css`, `tests/theme-consistency.test.js` | web-project-guideのVisual review / Theme ownership例へ還元候補として評価する |

## PL-F-006 Account registration formが低いViewportで最後まで操作できなかった

- **Status:** Resolved
- **Symptom:** 新規アカウント作成フォームを開くと、画面高さやZoomによって下部の「作成してログイン」までスクロールできない。
- **Trigger:** Login用の短いCardへ後から長いRegistration Formを追加したが、Card自身にViewport基準のmax-height / overflow contractがなかった。
- **Root cause:** Desktopの十分な縦解像度だけを前提にし、低いViewport・学校PCの表示Scale・Browser ZoomをRegression対象にしていなかった。
- **Fix:** `.access-card` に `max-height: calc(100dvh - ...)` と `overflow-y:auto` を持たせ、`100vh` fallbackを追加。
- **Regression guard:** `tests/account-register-scroll.test.js` でdynamic viewport / overflow / cache revisionを確認する。
- **Prevention:** Modal / Gateへ内容を追加したときは、横幅だけでなく低ViewportとZoom時にPrimary Actionへ到達できるか確認する。


## PL-F-007 Playback開始遅延の初回診断が不完全で、A1の前処理と二重Autoplay制御が残った

- **Date:** 2026-09-05
- **Status:** v3 implemented / User validation pending
- **Symptom:** 曲を押してから動画開始まで約5秒待つ。build `20260905-2` を公開後もUser確認で体感が変わらなかった。
- **Expected:** 曲クリック直後にYouTubeの読込要求を出し、既にReadyなら即座に再生開始へ進む。
- **Actual:** 本体 `app.js` をmedia-firstへしても、A1 wrapperがその外側で履歴・Context・Session処理を先に実行し、さらにUI guardが最大5秒 `play()` を再試行していた。初期Player `onReady` では同じ動画を再度 `loadVideoById` する経路も残った。
- **Trigger:** A1導入後のSidebar曲行からの即時再生。特にログイン直後・初回Player準備中。
- **Root Cause:** Playback ownershipが `app.js` / `playback-a1.js` / `a1-ui-guards.js` の3層へ分散したまま、前回は本体層だけを高速化していた。Cache問題は実在したが、約5秒症状の唯一の原因ではなかった。
- **Final Fix:** Autoplay時はA1の重いfinalize/session/context side effectをmedia request後へ遅延。UI guardの5秒retryを削除。本体Player warm-upを初回Full Renderより前へ移し、初期 `onReady` の同一動画二重Loadを防止。
- **Affected files / systems:** `app.js`, `playback-a1.js`, `a1-ui-guards.js`, A1 regression tests, build cache revision
- **Cost / Severity:** Major。主要操作の体感性能に直結し、前回Fix後も再発。
- **Detection method:** User実利用による「変わってない」の再確認 + Runtime ownership追跡。
- **Regression Guard:** `tests/a1-requirements.test.js` で5秒retryの不在、media request前後順序、初期Player warm-up順、同一動画二重Load防止を確認。Local diagnosticsにクリック→PLAYING実測を最大20件保存。
- **Prevention:** 性能Bugでは内側関数だけでなく、User actionを包む全Wrapper / Hook / Monkey patchを順に追い、外側で同期処理やretryが残っていないか確認する。User確認前にResolvedと断定しない。
- **Guide candidate:** yes — Interactive Media AppのPerformance調査ではcontrol ownershipとWrapper順序を診断対象にする。


## PL-F-008 Playback Session復元の遅延Seekが手動選曲後の新しい動画へ残留した

- **Date:** 2026-09-05
- **Status:** fix implemented / User validation pending
- **Severity:** Major
- **Symptom:** 曲クリック後、App同期処理は1ms程度なのにYouTubeが一度BUFFERINGへ入り、約1秒後にUNSTARTEDへ戻ってから約10秒後にPLAYINGになった。
- **Evidence:** build `20260905-5` の通常ページ診断で `BUFFERING 138ms → UNSTARTED 1138ms → BUFFERING 10383ms → PLAYING 10408ms`。Main Threadは最大59msで、App描画が主因ではなかった。
- **Expected:** Playback Session復元のSeek retryは復元対象の曲/Versionにだけ作用し、ユーザーが別曲を手動再生した時点で失効する。
- **Actual:** `restoreSession()` が220/650/1400/2600ms後のSeekを無条件に予約し、User selection後もTimerをcancelせず、実行時の現在PlayerへSeekしていた。
- **Root Cause:** Restore retryにgeneration / expected song-version guard / timer ownershipが無かった。Async restorationとmanual playbackのownershipが分離されていなかった。
- **Final Fix:** A1の遅延transportを中央管理し、manual song/version selectionや通常のplayReferenceで既存Timerをcancel。Restore / version-switch retryはgenerationとexpected `songId + versionId` が一致する場合だけ実行する。
- **Affected files / systems:** `playback-a1.js`, `a1-ui-guards.js`, A1 regression tests, playback diagnostics
- **Detection method:** User supplied runtime timing + delayed transport code review。
- **Regression Guard:** `tests/a1-requirements.test.js` でtimer centralization、manual cancellation、expected ref guard、旧unguarded restore retryの不在を確認。
- **Prevention:** User操作より後に実行するSeek/Play/Restore retryには必ずgenerationまたはAbort相当のownershipを持たせ、対象Entityを再確認してからTransportへ触る。
- **Guide candidate:** yes — Interactive Mediaのstale async action / delayed timer ownershipの実例。


### PL-F-009 YouTube埋め込みの動画切替待ちはApp処理ではなくProvider側に残った

- Date: 2026-09-06
- Status: experiment implemented / User validation pending
- Severity: major
- Cost: high
- Symptom: build `20260905-6` で曲クリックから `loadVideoById` までは1msだが、PLAYINGまで約4.5秒かかる。
- Expected: 曲行クリック後、YouTube再生が体感上すぐ開始する。
- Actual: `REQUEST 1ms → loadVideoById 1ms → BUFFERING 74ms → UNSTARTED 389ms → BUFFERING 4526ms → PLAYING 4552ms`。Main Thread Long Taskは0ms。
- Trigger / Reproduction: 通常ページでYouTube曲を別曲へ切り替える。
- Root Cause: LyricTube内の同期処理・描画・stale restoreは主要因ではなく、標準YouTube iframeが新しい動画データを取得し始めるまでのProvider待ちがCritical Pathに残った。
- Experiment: YouTube公式のprivacy-enhanced embed (`youtube-nocookie.com`) を明示iframe + `enablejsapi=1` + `origin` + `strict-origin-when-cross-origin` で構築し、同じ診断で標準hostと比較する。
- Affected files / systems: `app.js`, `a1-ui-guards.js`, `index.html`, playback diagnostics
- Detection method: User supplied normal-page runtime diagnostics across builds `20260905-5` and `20260905-6`.
- Regression Guard: `tests/a1-requirements.test.js` でprivacy-enhanced host / origin / referrer / diagnostic hostを確認する。
- Prevention: Provider待ちが支配的になった時はApp側の同期処理を繰り返し最適化せず、公式に許可されたProvider構成のA/Bと実測を行う。
- Guide candidate: yes — MEDIA Profileの外部Provider latency切り分け例。
