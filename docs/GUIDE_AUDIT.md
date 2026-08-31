# web-project-guide 定期監査

LyricTubeは `EliteMay/web-project-guide` を制作ルールのSource of Truthとして参照します。

## 正本

- Guide: https://github.com/EliteMay/web-project-guide
- LyricTube側の確認済みRevision: `project-guide.json`
- Project固有の再発防止知識: `PROJECT_LEARNINGS.md`

## 自動監査

GitHub Actions `Web Project Guide Audit` を毎週実行します。

1. `web-project-guide/main` の最新Commitと `guide-version.json` を取得
2. `project-guide.json` の最後に確認したVersion / Commitと比較
3. 定期実行時は `Validate LyricTube` も再利用して通常のStatic / Logic検証を実施
4. Guideに未確認の変更があればGitHub Issueを1件作成または更新
5. Guideを確認し、必要なLyricTube修正を別作業で行う
6. Review完了後に `project-guide.json` のVersion / Commitを更新
7. 次回監査で一致していれば監査Issueを自動Close

## 方針

定期監査はLyricTubeのコードや保存形式を自動変更しません。

Guide更新には、単なる文言修正からUI / Storage / Security方針の変更まで含まれるため、差分を確認せず自動適用すると回帰や保存互換性破壊につながるためです。

そのため、定期処理が自動で行う範囲は次に限定します。

- Guide revisionの取得
- LyricTubeの既存自動検証
- 差分の検出
- GitHub IssueによるReview通知
- Review baseline一致後の監査Issue Close

## Schedule

- Weekly: Monday 00:23 UTC（日本時間 月曜 09:23頃）
- Manual: GitHub Actionsから `workflow_dispatch` でいつでも実行可能

GitHub Scheduled Actionsは混雑により開始が遅れる場合があります。
