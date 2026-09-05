# CHANGELOG

## v0.13.2 YouTube privacy-enhanced embed experiment / build 20260906-1（2026-09-06）

- User実測で `loadVideoById` 発行は1ms、PLAYINGは約4.5秒後となり、Provider側待ちが支配的と確認。
- YouTube公式のprivacy-enhanced embed (`youtube-nocookie.com`) を明示iframeで使用。
- `enablejsapi=1` / `origin` / `strict-origin-when-cross-origin` を明示し、IFrame API契約とClient identificationを維持。
- `youtube-nocookie.com` へのpreconnectを追加。
- 再生診断へ実際のembed hostを追加し、標準hostとのA/B比較を可能にした。
- 非表示Playerの自動先読みはYouTube Developer Policiesのbackground playback / visibility要件に反するため採用しない。

## v0.13.2 Playback stale-restore cancellation / build 20260905-6（2026-09-05）

- Playback Session復元の220/650/1400/2600ms遅延Seekを中央管理し、手動選曲後は即キャンセルする。
- Restore / Version切替の遅延transportはgenerationと` songId + versionId `一致時だけ実行する。
- 通常ページ診断でselectSong同期中のREQUEST/loadVideoByIdも取りこぼさないよう計測開始位置を修正。
- User実測 `BUFFERING 138ms → UNSTARTED 1138ms → PLAYING 10408ms` を根拠にした修正。

## v0.13.2 Playback latency v3 / build 20260905-3（2026-09-05）

- User再確認でbuild `20260905-2` 後も曲クリックから再生開始まで約5秒の体感が変わっていないことを確認。
- A1の曲選択Wrapperが履歴確定・Context作成・Session保存を本体再生要求より前に行う順序を修正し、Autoplay時はPlayerへの要求を先に発行。
- `a1-ui-guards.js` に残っていた最大5秒の `play()` 再試行Loopを削除し、再生開始制御を本体Player経路へ一本化。
- 初期選択動画のYouTube Player warm-upをFull Renderより前へ移動。
- YouTube `onReady` で初期動画と同じPending requestを `loadVideoById` し直さないよう修正。
- Local-onlyの再生開始Timing ring buffer（最大20件）を追加し、次回再発時にクリック→PLAYINGの実測値を残せるようにした。
- Cache revisionを `20260905-3` へ更新。Data Schema 4 / Queue / Cloud履歴 / Local Media保存形式は変更なし。

## v0.13.2 Playback start latency follow-up / build 20260905-2（2026-09-05）

- YouTube IFrame APIをAccess Gate表示中から先行読み込みし、ログイン後の初回Player準備待ちを短縮。
- 曲行の即時再生では、Library / Browse / LyricsのFull Renderより先に動画読込要求を発行。
- Player準備中のクリックは最新のYouTube requestとして保持し、`onReady`で選択中の動画へ適用する。
- YouTube API scriptの二重挿入を防止。
- Cache revisionを `20260905-2` へ更新し、前BuildのJSが残る問題を解消。
- Data Schema 4 / Queue / Session / Cloud履歴 / Local Media保存形式は変更なし。

## v0.13.2 Account registration overflow fix / build 20260903-1（2026-09-03）

- 新規アカウント作成フォームが低い画面・高いZoomでViewportを超えた場合、下部の「作成してログイン」まで到達できない問題を修正。
- `.access-card` にdynamic viewport height基準の最大高さと縦スクロールを追加。
- `100dvh` 非対応環境向けに `100vh` fallbackを維持。
- Login / Guest / Account registrationの機能・Supabase・保存Schemaは変更しない。
- User-validated Visual Baselineの配色・構造は変更せず、overflow behaviorだけを修正。
- 実ブラウザでの学校PC相当Viewport確認は未実施。

## v0.13.2 Song form tagging / build 20260902-1（2026-09-02）

- 「曲を追加 / 曲情報を編集」ダイアログへタグ選択欄を追加。
- 既存タグはチェック式で複数選択でき、保存時に既存の `song.tagIds` へ反映。
- ダイアログ内から新規タグを作成し、そのまま選択可能。
- タグ定義は既存の `library.settings.tags` を再利用し、新しい保存Schemaは追加しない。
- `app.js` はタグ実装へ依存せず、`dialog:song-open` / `song:before-save` Hookで拡張する。
- User-validated Visual Baselineの構造・Theme Tokenは変更しない。追加欄の実ブラウザVisualは未確認。
- Data Schema 4 / `lyrictube.library.v3` を維持。

## v0.13.2 Self-service account registration / build 20260901-1（2026-09-01）

- ログイン画面へ「＋ 新しいアカウントを作る」を追加。
- アカウント名 / 表示名 / ログインパスワード / 確認用パスワード / アカウント作成キーを入力して登録できる。
- 登録成功後は新しいクラウドアカウントへ自動ログインし、空のライブラリから開始する。
- アカウント作成キーの平文は公開Frontend / GitHub / localStorage / sessionStorageへ保存しない。
- Supabase Edge Function `lyrictube-api` v3 に未ログイン用 `register_account` Actionを追加し、作成キーをServer-side SHA-256で照合。
- 作成キー誤入力はHash化した接続元Rate Keyで制限し、5回失敗後は15分間ブロック。
- DB Migration `add_public_account_registration` でCase-insensitive username unique indexと、Account + initial StateをTransactionで作る `lyrictube_register_account` を追加。
- ゲストモードは従来どおりRead-only。
- Data Schema 4 / `lyrictube.library.v3` は変更なし。

## v0.13.2 Fair Shuffle / build 20260831-1（2026-08-31）

- Shuffleの次曲選択を、現在曲以外から毎回完全ランダムに引く方式から再生履歴を考慮する方式へ変更。
- 既存 `lastPlayedAt` が無い未再生曲を最優先し、登録済みなのに一度も流れない曲を減らす。
- 全候補に履歴がある場合は、最も長く聴いていない曲群からランダム選択する。
- 昨日までの `lastPlayedAt` も既存ライブラリに保存されているため、日を跨いだ偏り抑制に利用する。
- `core/fair-shuffle.js` をPure logicとして追加し、`tests/fair-shuffle.test.js` / `tests/fair-shuffle-integration.test.js` を追加。
- 現在の表示・プレイリスト・タグ等から作られる既存Queue semanticsは変更しない。
- 新しいShuffle専用Storageは追加せず、`lyrictube.library.v3` / Data Schema 4を維持。
- ユーザー確認済みの現在Visualを `docs/VISUAL_BASELINE.md` にBaseline Commit `230fd87bf027a6d7351a3e41efa761800b945e43` として記録。今回のShuffle変更ではCSS / Visual hierarchyを変更しない。
- Cache revisionを `20260831-1` へ更新。

## v0.13.2 Theme consistency follow-up（2026-08-31）

- Media Workspace refresh後に発生した、SidebarとMainでTheme色が分裂する問題を修正。
- `theme.css` をTheme Colorの正本として追加。
- Dark / Light / Synthwave / Midnight / Sepiaの5ThemeをPage / Navigation / Surface / Text / Border / Accentの共通Token体系へ統一。
- SidebarのDark固定色を撤去し、Theme-awareなNavigation Surfaceへ変更。
- Light / Sepia等で旧CSSがMainだけを明るくし、SidebarだけDarkに残るSpecificity競合を解消。
- Hover / Active controlが別ThemeのDark Surfaceへ変わる問題を正規化。
- Active lyricに残っていた旧Gradient text / transparent text-fillをresetし、Accent marker + readable textへ統一。
- Legacy Ambient / Aurora背景を現行Media Workspaceでは無効化。
- `tests/theme-consistency.test.js` を追加。
- `PROJECT_LEARNINGS.md` に `PL-F-004` として原因・修正・再発防止を記録。
- Runtime / Storage / Data Schema変更なし。

## v0.13.2 Visual refresh（2026-08-31）

- `web-project-guide` v1.5.0 の Visual Design Quality / AP-026〜AP-028を基準にMedia Workspace方向へ再設計。
- `workspace.css` を追加し、Library → Player → Lyricsを主役にしたVisual compositionを定義。
- Browseの巨大Hero / Brand artを縮小し、Marketing PageではなくLibrary viewとして整理。
- Player設定群のGradient / Card / Shadowを減らし、Section / Divider中心へ変更。
- Lyricsを独立したReading Surfaceとして整理し、Active lyricのGlowを撤去。
- Sidebarを高密度なLibrary railとして再調整し、選択状態・見出し・曲リスト・常設ツールの階層を改善。
- Tags画面のHero / Summary Card依存も抑制。
- `prefers-reduced-motion` をVisual layerで尊重。
- `tests/visual-workspace.test.js` を追加。
- 保存形式 `lyrictube.library.v3` / Data Schema 4 / Runtime logicは変更なし。

## v0.13.2 Sidebar安定化 / build 20260830-8（2026-08-30）

- Sidebarをブランド / 独立Scroll / 操作ツールの3領域へ整理。
- 低い画面やモバイルで設定・ヘルプ・書き出し・読み込みが消える問題を修正。
- Sidebar見出しの視認性を改善。
- Sidebar LayoutのRegression Guardを追加。
- 保存Schema変更なし。

## v0.13.2 Player Controller仕上げ（2026-08-30）

- 下部シークバーに残っていたYouTube直接シークを共通Player Controller経路へ変更。
- Local Media側の重複シークListenerを削除。
- Player Controller移行後に不要になった旧 `restartLocal` shimを削除。
- 再発防止Guardを追加。
- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。

## v0.13.1 Player Controller移行（2026-08-30）

- `core/player-controller.js` を追加。
- YouTube / Local Mediaを同じ再生契約へ統合。
- Local Mediaが `currentPlayerTime / duration / state / toggle / seek / restart / playback rules / bottom player` を後から上書きする構造を撤去。
- Local Media側に残す互換Patchは曲追加・バージョン編集Dialogの2か所だけに縮小。
- 開始/終了、スキップ、同期エディタ、キーボード操作を共通Player経路へ統一。
- `player-controller.test.js` と回帰Guardを追加。
- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。

## v0.13.0 段階リファクタ Phase 1（2026-08-30）

- `core/app-utils.js` を追加し、LRC・時刻・文字列・同期保持のPure utilityを `app.js` から分離。
- `core/runtime-hooks.js` を追加。
- `tags.js` に残っていた `viewSongs / renderBrowse / renderAll / renderMainPage` の関数上書きを廃止。
- タグ絞り込みはFilter、描画拡張はRender Hook、タグ画面はhandled Hookへ移行。
- Utility / HookのNodeテストを追加。
- 保存形式 `lyrictube.library.v3` / Schema 4は変更なし。

## v0.11.0 - 2026-08-30

- 同期エディタに「ざっくり自動合わせ」を追加。
- 2〜数個の基準点だけ手動で合わせ、基準点間の歌詞時間を自動補間できるようにした。
- 元の同期歌詞がある場合は、そのタイムスタンプ間隔を保ちながら区間ごとに時間軸を伸縮する。
- 元時間が無い区間は行数ベースの均等補間へフォールバックする。
- 補間後も従来の行単位 `±0.1 / ±0.5秒` 微調整を利用可能。
- 自動補間ロジックを `sync-interpolation.js` へ分離し、Nodeテストを追加。
- 保存Schemaは変更なし。

## v0.10.2 - 2026-08-30

- 土台整理時に意図せず変更されていたLyricTubeの元WebPアイコンを復元。
- VReviewの実際の表示方式に合わせ、タイトル横のバージョンバッジを廃止。
- サイドバー上部を `MY MUSIC · v0.10.2` の控えめな表示に変更。
- Build番号は引き続きキャッシュ・デバッグ専用として通常UIには表示しない。

## v0.10.1 - 2026-08-30

- サイドバー下部の `設定 / ? / 書き出し / 読み込み` を4項目専用グリッドへ修正。
- `?` ボタン追加時に `読み込み` が次の行へ落ちるレイアウト崩れを修正。
- 狭い画面でも同じ4項目レイアウトを維持。

# Changelog

## v0.10.0 — Foundation cleanup

### Architecture

- ユーザー向けSemVerとBuild番号を `version.js` へ一本化
- `library-schema.js` と `data/library.schema.json` を追加
- `window.LyricTubeCore` Facadeを追加し、追加機能がコア内部へ直接依存しすぎない移行を開始

### Local Media

- MP3系とMP4/WebMを `local-media.js` へ統合
- 旧 `local-audio.js / local-audio.css` runtimeを廃止
- 旧IndexedDB `lyrictube.localAudio.v1` から新DBへの移行処理を追加
- 別端末でファイルが無い状態を明示
- 設定画面へ端末ファイル容量表示を追加
- timeupdate時のUI更新を約8fps上限へ抑制

### Cloud

- Cloud writerを `cloud-sync.js` のみに統合
- `site-shell.js` の旧全体保存Writerを削除
- 同期待ち差分をlocalStorageへ保持
- online / session-ready / pagehide / visibilitychangeで再送

### Login

- 前回成功したアカウント名を端末にだけ記憶
- 次回はパスワードのみでログイン可能
- パスワード自体は保存しない
- Supabase側へログイン失敗回数制限を追加

### Lyrics

- LRCLIB + SyncLRC + lyrics.ovh構成を正式文書化
- Provider metadataをSchemaへ追加

### UI / Static

- 巨大Base64ロゴを `assets/lyrictube-icon.svg` へ分離
- HTMLタイトルと表示バージョンを整理
- index.htmlから旧Local Audio資産を除去

### CI

- 一部JSだけでなく全JavaScriptを `node --check`
- 全JSONを検証
- HTMLローカル参照切れを検出
- 旧Local Audio runtime再混入を検出
- Base64画像の再埋め込みを検出

## v0.9.x

- `v35 / v36` の開発番号からSemVer表示へ移行
- MP3 / MP4直接追加
- SyncLRC / lyrics.ovh追加
- 前回アカウント記憶の試験実装

## Legacy v03〜v35

初期の複数YouTubeバージョン、LRC同期、同期エディタ、プレイリスト、ゲスト、Supabaseアカウント、タグ、端末音源などを段階的に追加した世代です。
