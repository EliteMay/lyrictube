# ASMRTube v1

YouTube上のASMRを自分用に整理・再生するための静的Webアプリです。

## 目的

- ASMRをタイトル・配信者・タグで整理する
- YouTubeコメント欄のタイムスタンプを貼り付けて再利用する
- 好きなASMRをすぐ再生できるようにする
- 睡眠向け機能をまとめる
- GitHub PagesでURLを開くだけで使えるようにする

## 崩してはいけない仕様

- YouTube IFrame Playerによる再生
- GitHub Pagesだけで動作する静的構成
- APIキー不要
- localStorage保存
- JSON書き出し / 読み込み
- YouTube動画IDで重複登録を防止
- LyricTube本体の `lyrictube.library.v3` へ干渉しない
- ASMRTubeは `asmrtube.library.v1` を使用する

## 主な機能

- YouTube ASMR登録 / 編集 / 削除
- 配信者管理
- 複数タグ
- 右耳 / 左耳 / 両耳 / 交互タグ
- お気に入り
- 最近聴いた
- 睡眠向け一覧
- プレイリスト
- 検索 / タグ絞り込み
- 評価（未評価 / 普通 / 好き / かなり好き / 神）
- 作品ごとの音量保存
- YouTubeコメント欄のタイムスタンプ貼り付け解析
- `m:ss` / `mm:ss` / `h:mm:ss` 対応
- タイムスタンプの重複防止
- タイムスタンプからシーク
- タイムスタンプ名からタグ候補を自動付与
- A-B区間リピート
- スリープタイマー 15 / 30 / 45 / 60 / 90分
- JSONバックアップ / 復元
- PC / スマホ向けレスポンシブUI

## タイムスタンプ取り込み

YouTubeコメント欄からタイムスタンプ付きコメントをコピーし、詳細画面の「時刻コメント取込」へ貼り付けます。

例:

```text
タイムスタンプです！
0:00 開始
3:24 右耳かき
10:51 囁き
18:22 オノマトペ
1:02:18 おやすみ
```

「タイムスタンプを解析」を押すと時間行だけを抽出します。保存前に時間と名前を編集できます。

## 保存場所

ブラウザ `localStorage` の次のキーへ保存します。

```text
asmrtube.library.v1
```

ブラウザのサイトデータ削除で消えるため、重要なライブラリはJSON書き出しを推奨します。

## ファイル構成

```text
asmrtube/
├ index.html
├ styles.css
├ app.js
├ README.md
├ 作業報告書.md
└ data/
   └ tags.json
```

## GitHub Pages

このフォルダをGitHub Pagesで公開されているリポジトリ内へ置いた場合、通常は以下のようなURLで開けます。

```text
https://<user>.github.io/<repo>/asmrtube/
```

現在の開発版は `asmrtube-v1` ブランチ上にあり、LyricTubeの `main` ブランチは変更していません。

## 注意点

- 埋め込みを禁止しているYouTube動画は再生できません。
- YouTubeコメント自体は自動取得しません。コメント本文を手動コピーして使います。
- YouTube Data APIキーは使用しません。
- タイトル / 配信者は現状手動入力です。
- ブラウザやYouTube側の仕様変更でIFrame Playerの動作が変わる可能性があります。

## 未確認

- GitHub Pages実公開環境での再生確認
- iPhone / Android実機
- 長時間連続再生時の挙動
- YouTube側で埋め込み制限された動画の詳細エラー表示
