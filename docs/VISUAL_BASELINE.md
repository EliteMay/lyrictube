# LyricTube Visual Baseline

## Status

- Baseline date: 2026-08-31
- Baseline commit: `230fd87bf027a6d7351a3e41efa761800b945e43`
- Validation state: **User Validated** for the current desktop appearance
- Guide baseline: `web-project-guide` v1.11.0 Visual Quality Baseline

この文書は、現在のLyricTubeの見た目を今後のUI変更時に比較するための**Visual Reference / Golden Baseline**です。

ユーザー確認の結果、上記Commitの見た目を「現時点で最も良い状態」として扱います。今後の機能追加やCSS整理では、明確な改善理由がない限りこのVisual hierarchy・Theme consistency・Densityを悪化させません。

## Canonical Visual Files

| Role | Source of Truth |
|---|---|
| Media Workspace composition | `workspace.css` |
| Sidebar layout / density | `sidebar.css` |
| Theme colors / surfaces / states | `theme.css` |
| Legacy base styles | `styles.css`（段階整理対象。現行Visual判断の正本ではない） |

## Visual Invariants

### 1. Signature layout

- Desktopは **Library → Player → Lyrics** のMedia Workspaceを維持する。
- Sidebar / Player / Lyricsの役割が一目で分かれる。
- Marketing的な巨大Heroを通常利用画面へ戻さない。

### 2. Density / hierarchy

- Sidebarは高密度だが、検索・分類・曲一覧・下部操作の階層が明確であること。
- PlayerとLyricsをPrimary surfaceとして扱い、編集・補助操作を同じ強さのCard群へ戻さない。
- Typography / spacing / dividerで優先度を表現し、DecorationだけでHierarchyを作らない。

### 3. Theme consistency

Dark / Light / Synthwave / Midnight / Sepiaの5テーマは、同じToken契約で以下を一体として切り替える。

- Page background
- Sidebar / Navigation
- Main surfaces
- Lyrics surface
- Text / muted text
- Border / divider
- Accent / active / selected / hover
- Dialog / Bottom player / Tag UI

SidebarだけDark固定、MainだけLight、Hoverだけ旧Theme色のような分裂を再発させない。

### 4. Effects

- Gradient / Glow / Glass / Shadowの常用へ戻さない。
- ShadowはPlayer / Overlay等、Elevationが意味を持つ場所に限定する。
- 旧Aurora / Ambient / active lyric gradient textを通常Visualへ復活させない。

### 5. Sidebar usability

- Brand / middle scroll / bottom toolsの3領域を維持する。
- `設定 / ? / 書き出し / 読み込み` をContent量で押し出さない。
- 低いViewportやZoomでも主要操作へ到達できる構造を維持する。

## Regression Guards

現在の自動Guard:

- `tests/visual-workspace.test.js`
- `tests/sidebar-layout.test.js`
- `tests/theme-consistency.test.js`

自動TestはVisualの完全な代替ではありません。意味のあるUI変更後は、主ViewportのScreenshotまたは実ブラウザでこのBaselineと比較します。

## Change Policy

今後このBaselineから意図的に外す場合は、少なくとも次を明記します。

1. 何を改善するための変更か
2. どのVisual invariantを変更するか
3. 既存の操作性・Theme consistencyを悪化させない根拠
4. Screenshot / Browser review結果
5. 必要ならこの文書のBaseline commitを更新

単なる「新しく見える」「派手になる」だけではBaselineを更新しません。
