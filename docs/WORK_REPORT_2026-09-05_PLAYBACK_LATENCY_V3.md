# LyricTube Playback Latency v3 Work Report

Date: 2026-09-05  
Build: `20260905-3`  
Status: Implemented / Static validation pending at generation time / User validation required

## User evidence

- build `20260905-2` 公開後も「変わってない」とUserが確認。
- 約5秒の再生開始遅延を未解決として再調査。

## Root cause found

1. `playback-a1.js` の `window.selectSong` wrapperが、`original.selectSong(..., autoplay)` より前に履歴確定・Context capture・Session saveを実行していた。
2. `a1-ui-guards.js` が本体とは別に最大5秒 `PlayerController.play()` を再試行し、Playback ownershipが二重化していた。
3. 初期YouTube Player `onReady` で、既に同じ動画を持つ場合でもPending requestを `loadVideoById` し直していた。
4. 初期Player warm-upが最初のFull Render後だった。

## Changes

- Autoplay時は本体のmedia requestをA1 context/session処理より先に発行。
- Old-track finalizeのStorage/UI side effectをmicrotaskへ遅延。
- 5秒Autoplay retry shimを削除。
- 初期Player warm-upをFull Renderより前へ移動。
- `onReady` 同一動画二重Loadを防止。
- Local-only playback timing diagnosticsを最大20件のring bufferで追加。
- Cache revisionを `20260905-3` へ更新。

## Compatibility

- Display version: `v0.13.2` 維持
- Data Schema: `4` 維持
- Queue / Playback Session / Cloud History semantics: 変更なし
- Local Media storage: 変更なし

## Validation required before completion

- JavaScript syntax
- `tests/a1-requirements.test.js`
- full `Validate LyricTube`
- Web Project Guide Audit
- `tools/validate_static.py`
- cleanup後のMerge Commitに対するPages deployment
- User実ブラウザでの曲クリック→再生開始体感

## Environment limitation

この作業環境のHeadless Chromiumから公開GitHub Pagesへ接続を試したが、`ERR_BLOCKED_BY_ADMINISTRATOR` で外部サイトE2Eを実行できなかった。したがって実YouTube playback latencyはUser browser validationが必要。
