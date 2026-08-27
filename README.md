# LyricTube GitHub v31

YouTube動画と歌詞を同じ画面で管理・再生する、個人利用向けの静的Webアプリです。

## 目的

GitHub PagesでURLを開くだけで使える構成です。Node.jsやローカルサーバーは不要です。
PCだけでなく、v31からスマホでも操作しやすい画面構成に対応しています。

## 崩してはいけない仕様

- YouTube IFrame Playerによる再生
- 曲 / 動画バージョン / Cover / Live管理
- プレイリスト、お気に入り、最近聴いた曲
- 曲開始 / 終了、途中スキップ
- 歌詞表示と自動スクロール
- LRC時間同期
- `♪ 間奏を追加`
- 各歌詞行だけ `-0.5 / -0.1 / +0.1 / +0.5秒`
- JSON書き出し / 読み込み
- `lyrictube.library.v3` 互換
- 同じYouTube動画IDの重複登録防止

## 自動歌詞検索

LRCLIBへブラウザから直接アクセスします。

曲名＋原曲アーティスト、曲名のみ、自由検索、表記ゆれ候補、取得済みYouTubeタイトルを順番に試します。
LRCLIBの仕様に従って `Lrclib-Client` ヘッダーを使用し、検索間隔も空けています。

## YouTube

- 再生: YouTube IFrame Player API
- 動画情報取得: IFrame Playerから取得できる情報を利用

YouTube Data APIキーは使用しません。

## v29 追加内容

- サイトアイコン追加（favicon対応）
- ブランド強化（ロゴ導入・公式感を意識したUI調整）
- 設定追加（起動画面 / コンパクト表示 / サムネ表示 / ガラス風質感 / 動き抑制 / ヘルプ導線）
- ヘルプダイアログ追加（？ボタン）
- 同期エディタで `Shift + T` による選択行への現在時間打刻
- PowerToys Text Extractor (`Win + Shift + T`) の歌詞OCR手順をヘルプへ追加
- 起動時画面を現在の表示画面とは別設定として保存

### Win + Shift + T と歌詞OCR

WindowsでPowerToys Text Extractorを使っている場合、通常は `Win + Shift + T` で画面上の歌詞を範囲選択して文字化し、LyricTubeの歌詞欄へ `Ctrl + V` で貼り付けできます。

これはWindows側のショートカットなので、GitHub PagesのWebサイト自体がグローバルに取得するものではありません。同期画面では別途 `Shift + T` を使うと、選択中の歌詞行へ現在時間を打刻できます。

## GitHub Pages化で削除したもの

- `server.mjs`
- `start.bat`
- `launcher.ps1`
- YouTube Data APIキー設定
- LyricTube内のYouTube Data API動画検索

YouTube動画はURLを貼って登録します。

## データ保存

通常の編集内容はブラウザ `localStorage` の `lyrictube.library.v3` に保存します。

v31では、初めて開いた端末にlocalStorageの曲データがまだ無い場合、`data/library.json` を共通ライブラリとして読み込みます。設定画面の「共有JSONを再読み込み」から、あとで明示的に読み直すこともできます。

GitHub Pagesは静的サイトなので、サイト上で曲を追加・編集しても `data/library.json` 自体へ自動書き込みはされません。各端末で行った変更は、その端末のlocalStorageへ保存されます。

### 友達へ同じ曲データを配る方法

1. 自分のLyricTubeで `書き出し` を押す
2. 出力されたJSONの内容をリポジトリの `data/library.json` に置く
3. 友達が初めてサイトを開くと、そのJSONが初期ライブラリとして読み込まれる
4. すでに使ったことがある端末では、設定の `共有JSONを再読み込み` を押す

`共有JSONを再読み込み` は、その端末の現在の曲・プレイリストを共有JSONで置き換えるため、必要なら先に `書き出し` でバックアップしてください。

## 簡易パスワード

v31は友達向けの簡易ロックとして、`data/site-config.json` の `password` を使います。

初期値は以下です。

```json
{
  "enabled": true,
  "password": "lyrictube",
  "rememberSession": true,
  "sharedLibrary": true
}
```

パスワードを変える場合は `password` の文字だけ変更してください。`enabled` を `false` にするとパスワード画面を無効化できます。

これは本格的な認証ではなく、GitHub Pages上のファイルを見ればパスワードや共有JSONを確認できる簡易方式です。私的利用・友達間利用を前提としています。

## スマホ対応

v31では900px以下をスマホ/小型画面向けとして扱います。

- 左サイドバーを `☰` で開くドロワーへ変更
- 再生画面を1列に変更
- 動画・歌詞・設定カードを画面幅へ最適化
- 歌詞操作ボタンを横スクロール可能にして画面外へのはみ出しを抑制
- 曲一覧 / プレイリストをサイドバー内でスクロール可能
- ダイアログをスマホ画面内へ収める
- 歌詞同期の各行操作をスマホ幅へ再配置
- ボトムプレイヤーをスマホ向けに縮小
- iPhone等のsafe-areaへ対応
- 「曲を探す」は基本2列、非常に狭い画面では1列

## 旧ローカル版から移行

GitHub Pagesと `127.0.0.1` は別オリジンなのでlocalStorageは自動移行されません。

1. 旧v27で `書き出し`
2. GitHub Pages版を開く
3. `読み込み`
4. JSONを選択

## GitHub Pages公開方法

1. このファイル一式をリポジトリのルートへ置く
2. `Settings` → `Pages`
3. `Deploy from a branch`
4. Branch: `main`
5. Folder: `/ (root)`
6. `Save`

## ファイル構成

- `index.html`
- `styles.css` — PCを含む基本UI
- `mobile.css` — v31のスマホUI / パスワード画面
- `app.js` — LyricTube本体
- `site-shell.js` — v31の簡易ロック / 共有JSON / スマホメニュー
- `data/defaults.json`
- `data/library.json` — 友達へ配布する共通ライブラリ
- `data/site-config.json` — 簡易パスワード設定
- `.nojekyll`
- `.gitignore`
- `README.md`
- `作業報告書.md`
- `docs/README_v27_local.md`

## 注意点

- ブラウザのサイトデータ削除でlocalStorageも消えるのでJSONバックアップ推奨。
- 埋め込み禁止のYouTube動画は再生できません。
- LRCLIBやYouTube側の障害時は外部機能のみ一時的に使えない場合があります。
- v31のパスワードは公開リポジトリ上の平文設定であり、秘密情報を守る用途には使わないでください。
- APIキーなど、本当に秘密にする必要がある情報はリポジトリへ追加しないでください。

## 未確認

生成環境から外部LRCLIBへ実通信できないため、本番LRCLIB CORS通信は実URL未確認です。
実機のiPhone / Androidでの最終タップ操作も未確認です。
LRCLIB公式ドキュメントでは、ブラウザJavaScriptでUser-Agentを設定できない場合に `X-User-Agent` または `Lrclib-Client` を使用できるとされています。

## v30 不具合修正

- 左ライブラリ一覧のスクロールをデスクトップ/スマホとも修正。
- `A− / A＋` を設定画面の歌詞フォントサイズと同じ値へ統一し、確実に反映。
- ヘルプ導線を32pxの完全な丸い `?` アイコンへ統一。
- テーマ変更時に固定の紫色が残っていたアクティブ状態をアクセント色へ統一。
- ライト/セピアで暗い固定背景が残って文字が読めなくなる箇所をテーマ変数へ変更。

## v30.2 YouTube動画の重複登録防止

- URL文字列ではなくYouTube動画IDで重複を判定します。
- 新しい曲・Cover・Liveなど、全曲/全動画バージョンを横断して確認します。
- 登録済みの場合は、どの曲/バージョンに存在するか表示して保存を中止します。
- 動画バージョン編集時も、別の登録済み動画IDへの変更をブロックします。
- 既存データ内の重複は自動削除せず、そのまま保持します。

## v31 スマホ対応・友達向け共有

- スマホ用ドロワーサイドバーを追加。
- プレイヤー / 歌詞 / 各ダイアログをスマホ向けに再配置。
- `site-shell.js` で簡易パスワード解除後にLyricTube本体を起動。
- `data/library.json` から初回の共通曲データを配布可能。
- 設定から共通JSONを読み込み直す機能を追加。
- 各端末の編集は従来通りlocalStorageへ保存し、GitHub上のJSONを勝手に変更しない。
- `lyrictube.library.v3` の形式と既存機能は維持。
