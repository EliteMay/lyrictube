# Lyrics

## 自動検索

LyricTubeは1つの検索ボタンから複数Providerを利用します。

### Provider

1. LRCLIB
   - 既存の高精度検索
   - 通常歌詞 / LRC
2. SyncLRC
   - LRCLIB外の候補を補完
   - 同期歌詞を優先
3. lyrics.ovh
   - 通常歌詞だけの最終補完

## 検索方針

- 曲名 + 原曲アーティストを優先
- 既存LRCLIBの表記ゆれ検索は維持
- Provider結果を統合
- 同一Provider IDと歌詞Fingerprintで重複除去
- 一致度を既存Rankingへ渡す

## 非同期検索と検索結果Dialog

歌詞検索は複数Provider / 複数Attemptを非同期で実行するため、検索開始後にユーザーがDialogを閉じたり、別の曲へ移動したり、新しい検索を開始する場合がある。

### 必須挙動

- 各歌詞検索には、その検索を識別できるRequest ID / generation token等を持たせる
- UIへ結果・進捗・Errorを反映できるのは、**現在も有効な最新検索だけ**とする
- 新しい歌詞検索を開始した時点で、それ以前の検索結果はstaleとして扱う
- 歌詞検索結果Dialogをユーザーが閉じた場合、その検索の残りの非同期処理が後から完了してもDialogを自動で再表示しない
- 曲追加 / 曲編集Dialog自体を閉じた場合も、その画面から開始した検索の遅延結果で検索結果Dialogを勝手に表示しない
- 検索対象の曲名・アーティスト・対象Songが変わった場合、古い検索結果を現在の画面へ適用しない
- 別の曲へ移動した場合、以前の曲の検索結果で現在曲のUIを上書きしない
- 古い検索から返ったProvider結果は、必要なら内部的に完了してよいが、staleなら `pendingLyricsResults`、検索進捗、Toast、Dialog表示、歌詞採用状態を更新しない
- AbortController等で実通信をCancelできる場合はCancelしてよい。ただしCancel不能なProviderがあっても、stale result guardによってUI再表示を防ぐこと
- 検索結果Dialogを再び表示してよいのは、ユーザーが新しく歌詞検索を実行した場合、または現在も有効な検索の結果表示が初めて行われる場合だけ

### 実装状態

2026-09-05から `lyrics-providers.js` が検索Sessionをgeneration単位で所有します。

- 新しい検索を開始するとgenerationを進め、以前の検索をstale化する
- SyncLRC / lyrics.ovhは可能な範囲でAbortControllerでも中止する
- LRCLIBのように外部からCancelできない既存Requestも、各`await`後のcurrent-search判定でUI更新を止める
- 検索開始時の曲名 / アーティスト / 編集対象Song / 現在Songをsnapshotし、途中で変わった場合はstale化する
- 曲追加 / 編集Dialogが検索中に閉じた場合は、その検索結果を表示しない
- Provider候補は有効な検索だけが`pendingLyricsResults`へ反映できる
- 検索結果Dialogは、現在も有効な検索についてProvider検索が揃った後に1回だけ開く
- 検索結果Dialogを閉じると、その検索Sessionを無効化する
- staleな検索は結果、進捗、Toast、Error、Dialog表示を更新しない
- 検索中も再検索でき、新しい検索が古い検索を即座に置き換える

このContractの再発防止は `tests/a1-requirements.test.js` で静的Guardを持ち、実ブラウザでは下記の遅延応答ケースを確認する。

### Regression / 実Browser確認

最低限、次を確認する。

1. 検索開始 → 検索中に結果Dialogを閉じる → Providerが遅れて完了しても再表示されない
2. 検索A開始 → すぐ検索B開始 → AがBより後に完了してもBの結果 / UIを上書きしない
3. 曲Aで検索開始 → 曲Bへ移動 → Aの結果が遅れて返っても曲BでDialogを表示しない
4. 曲追加 / 編集Dialogから検索開始 → 元Dialogごと閉じる → 遅延結果で検索結果Dialogが勝手に開かない
5. 有効な検索を普通に待った場合は、従来どおり結果Dialogが1回だけ表示される
6. 検索結果を閉じた後にユーザーが明示的にもう一度検索した場合は、新しい検索結果を正常に表示できる
7. Rate limit / Provider error / timeout等の遅延Errorも、staleな検索から現在UIへToastやError表示を出さない

## 保存

Songへ以下を保存します。

```json
{
  "lyricsSource": "SyncLRC: Track / Artist",
  "lyricsProvider": "synclrc",
  "lyricsProviderId": "..."
}
```

LRCLIB由来の場合は旧互換の `lrclibId` も維持します。

## 手動フォールバック

自動取得できない場合はGoogle検索から歌詞を手動貼り付けできます。

同期歌詞が無い通常歌詞はLyricTubeの同期エディタでLRC化できます。

## 外部サービス障害

各Providerは独立扱いです。SyncLRCやlyrics.ovhが失敗しても、LRCLIB検索自体は利用できます。

## ざっくり自動合わせ

動画専用同期を1行ずつ全部打刻するのが面倒な場合の補助機能です。

1. 同期エディタを開く
2. 序盤・中盤・終盤など2〜5か所で `今の時間（基準点）` を押す
3. `基準点の間を自動補間` を押す
4. 気になる行だけ `±0.1 / ±0.5秒` で仕上げる

元の同期歌詞がある区間は、単純な行数均等配置ではなく元タイムスタンプの間隔比率を使用します。つまりCoverやLiveが少し速い・遅い場合でも、基準点間を一定倍率で伸縮して自然な間隔を維持します。元時間が無い区間だけ行数ベースの均等補間へフォールバックします。

補間対象は最初の基準点から最後の基準点までです。曲全体を自動補間したい場合は、序盤と終盤にも基準点を置きます。基準点は編集時だけの情報で、保存されるLRC形式やデータSchemaは変わりません。
