# LyricTube GitHub v30

YouTube動画と歌詞を同じ画面で管理・再生する、個人利用向けの静的Webアプリです。

## 目的

GitHub PagesでURLを開くだけで使える構成です。Node.jsやローカルサーバーは不要です。

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

ブラウザ `localStorage` の `lyrictube.library.v3` に保存します。

GitHubリポジトリへ曲データや個人バックアップを自動保存しません。

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
- `styles.css`
- `app.js`
- `data/defaults.json`
- `.nojekyll`
- `.gitignore`
- `README.md`
- `作業報告書.md`
- `docs/README_v27_local.md`

## 注意点

- ブラウザのサイトデータ削除でlocalStorageも消えるのでJSONバックアップ推奨。
- 埋め込み禁止のYouTube動画は再生できません。
- LRCLIBやYouTube側の障害時は外部機能のみ一時的に使えない場合があります。
- APIキーやパスワードをGitHubへ追加しないでください。

## 未確認

生成環境から外部LRCLIBへ実通信できないため、本番LRCLIB CORS通信は実URL未確認です。
LRCLIB公式ドキュメントでは、ブラウザJavaScriptでUser-Agentを設定できない場合に `X-User-Agent` または `Lrclib-Client` を使用できるとされています。


## v30 不具合修正
- 左ライブラリ一覧のスクロールをデスクトップ/スマホとも修正。
- `A− / A＋` を設定画面の歌詞フォントサイズと同じ値へ統一し、確実に反映。
- ヘルプ導線を32pxの完全な丸い `?` アイコンへ統一。
- テーマ変更時に固定の紫色が残っていたアクティブ状態をアクセント色へ統一。
- ライト/セピアで暗い固定背景が残って文字が読めなくなる箇所をテーマ変数へ変更。
