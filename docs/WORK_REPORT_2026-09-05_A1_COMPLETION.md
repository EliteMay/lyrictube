# Work Report — A1 Requirement Completion

Date: 2026-09-05

## Scope

`REQUIREMENTS.md` のA1追加要件のうち、初回A1実装後に残っていた次を実装した。

- Sidebar曲行クリック / タップで選択と同時に即再生
- Playlist追加 / More等の補助操作では曲を切り替えない
- Sidebar曲行のサムネイル / メタ情報 / 補助操作を1行へ固定
- More操作を大きな独立Buttonから控えめな補助Actionへ整理
- Sidebar Footerの `設定 / ? / 書き出し / 読み込み` の高さ・baseline・hit areaを統一
- 歌詞検索のgeneration / stale-result guard
- 新しい検索、検索対象変更、元Dialog Close、結果Dialog Closeによる古い検索の無効化
- staleな検索からの結果 / Progress / Toast / Error / Dialog更新防止

## Implementation

### `a1-ui-guards.js`

Sidebarの主操作だけをCapture phaseで受け、既存の「選択のみ」Handlerを抑止して `selectSong(songId, true)` へ接続する。

Playlist追加とMoreは `.song-item` のSiblingなので、このHandlerの対象外となる。

### `playback-a1.css`

A1で追加されたMore actionを含め、曲行を `main + playlist + more` の3列へ固定した。長い曲名 / Artistはellipsisで省略し、補助Actionが次段へ落ちないようにした。

Sidebar Footerは4操作を共通38px高で揃えた。MobileではSong actionを34pxへ広げる。

### `lyrics-providers.js`

各検索にgenerationとtarget snapshotを持たせる。

- 新規検索は前検索をstale化
- SyncLRC / lyrics.ovhはAbortControllerでも中止を試す
- LRCLIBは各`await`後にcurrent-search判定
- targetには曲名 / Artist / editing Song ID / selected Song IDを含める
- Source Dialogが閉じた検索は結果を表示しない
- Results Dialogを閉じた検索は再表示しない
- Provider結果は有効な最新検索だけが`pendingLyricsResults`へ反映できる

結果Dialogは有効な検索についてProvider検索が揃った後に1回だけ表示する。

## Compatibility

- Data Schema: 4のまま
- Library storage key変更なし
- Manual Queue / Playback Sessionの保存方式変更なし
- Cloud playback history API / DB変更なし
- Release表示は `v0.13.2` / Build `20260903-1` のまま

## Regression Guards

`tests/a1-requirements.test.js` を追加し、次をCIで確認する。

- Sidebar main rowの即再生契約
- A1 UI guard bootstrap
- Song row 3-column layout / ellipsis
- Footer tool共通高さ
- lyrics search generation / ownership / target guard
- Results / Origin Dialog close時のinvalidating
- 新しい検索を妨げる旧single-flight lockの再混入防止

## Remaining Manual Verification

自動CIでは実ネットワーク遅延やYouTube / Local Mediaの実再生までは確認できないため、公開サイトでは次を実操作確認対象として残す。

1. Sidebar曲行クリックで即再生される
2. Playlist追加 / More操作で再生中曲が変わらない
3. 長い曲名でもMoreが次段へ落ちない
4. 検索A→BでAの遅延結果がBを上書きしない
5. 検索中に元Dialogを閉じた場合、遅延結果で結果Dialogが開かない
6. 有効な検索では結果Dialogが1回だけ正常に開く
7. YouTube / Local Media / Queueの既存A1動作が維持される
