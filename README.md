# LyricTube GitHub v28

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

1. ファイル一式をリポジトリのルートへ置く
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
- `.github/workflows/apply-chatgpt-patch.yml`

## 今後の更新方法

初回ファイル配置後は、ChatGPTから小さな差分パッチをGitHubへ置き、GitHub Actionsで適用できる更新ワークフローを用意しています。

## 注意点

- ブラウザのサイトデータ削除でlocalStorageも消えるのでJSONバックアップ推奨。
- 埋め込み禁止のYouTube動画は再生できません。
- LRCLIBやYouTube側の障害時は外部機能のみ一時的に使えない場合があります。
- APIキーやパスワードをGitHubへ追加しないでください。

## 未確認

生成環境から外部LRCLIBへ実通信できないため、本番LRCLIB CORS通信は実URL未確認です。
LRCLIB公式ドキュメントでは、ブラウザJavaScriptでUser-Agentを設定できない場合に `X-User-Agent` または `Lrclib-Client` を使用できるとされています。
