# LyricTube Ocean Blue UI調整（2026-10-20）
- 背景: 『まだ黒ばかりで地味』『変化が少ない』というユーザーのフィードバック。
- 原因: 全画面の面を占めるDark Theme tokensがほぼ黒に固定されていた。
- 修正: Darkだけ深い青のPaletteへ切り替え、Main/Browse/Sidebar/Topbar/Lyricsを青・紫の濃淡で分離。Midnightを暗色代替として維持。
- 配色: theme.cssに集約。Visual-Art v3は位置・背景合成・状態ごとの装飾だけを担当。
- データ契約: Schema v4 / 再生 / 歌詞同期 / Cloud / YouTube・Local media JSは未変更。
- 確認: CIテスト結果と実ブラウザ目視を別に報告。装飾の過剰化・可読性・低Viewportをレビュー。
