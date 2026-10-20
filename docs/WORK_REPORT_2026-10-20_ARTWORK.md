## 2026-10-20 LyricTube 生成背景のUI統合

- 目的: ユーザーが選んだ音波アートを既存のメディア管理/歌詞アプリに組み込む。
- 変更: `assets/lyrictube-wave.webp` (生成背景を軽量化)、`visual-art.css`、`index.html` にCSS参照、Regression test、README、Visual Baseline。
- 適用: 曲探索のヘッダーを主な画像領域にし、再生ヘッダーと歌詞面へ弱い装飾を追加。モックアップ専用の架空の曲/ホーム機能は追加しない。
- データ/再生/Supabase/テーマ保存: 未変更。旧データの移行不要。
- 検証: CIの静的テストで確認予定。ブラウザの画面比較は未検証。
