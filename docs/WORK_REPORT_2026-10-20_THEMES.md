# LyricTube テーマ分離（2026-10-20）

## 目的
Darkが明るい青になっている問題を是正し、ユーザーが気に入った青配色を捨てず、独立したOceanテーマで保持する。

## 実装
- `theme.css`: 以前のDark PaletteをGit履歴から復元し、直近のBlue PaletteをOceanとして切り出す。
- 汎用Themeセレクタ全体にOceanを参加させ、Dialog / Bottom Player / Lyrics / Tags等で色の分裂を防ぐ。
- `visual-art-v3.css`: 画像のある共通装飾をDark/Oceanで共有し、鮮やかなOcean固有の色面はOceanに移す。
- 設定UIにOceanを追加し、プレビュー6種類に対応する。
- 既存`setTheme -> persistLibrary -> applyTheme`と、再起動時の保存テーマ復元を使用する。
- テーマ関係の回帰テストと文書を更新する。

## 互換性・復旧
- Data Schema v4、設定Key、曲ライブラリ、歌詞同期、アカウント、Cloud同期、再生Runtimeを変更しない。
- Darkを選んでいた端末はDarkへ残る。Oceanにしたい場合は設定で選択する。
- 元に戻すときはこのPRをRevertする。

## 検証
- GitHub Actions静的テスト実行後に追記。
- 実ブラウザでのテーマ視覚確認は別途必要。
