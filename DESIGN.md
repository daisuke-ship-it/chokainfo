# 釣果情報.com — Design System

> 深海をモチーフにした暗背景 × スカイブルーアクセントのデータ駆動型フィッシングメディア。
> スマホファースト設計。釣り場で片手で操作する想定。

---

## 1. Visual Theme & Atmosphere

- **コンセプト**: 深海の静謐さ × データの正確性。余白を贅沢に使い、情報密度が高くても圧迫感のないUI
- **モード**: ダークモード専用（ライトモード未対応）
- **背景**: `#040810` 深海グラデーション + スカイブルー微細グリッド（48px, 1.5%透過）固定背景
- **アクセント**: スカイブルー `#38BDF8` — CTAボタン、アクティブ状態、リンク、グロー
- **データ表現**: 数値はモノスペース、トレンドは色で直感的に（緑=好調/灰=横ばい/赤=不調）
- **トーン**: 落ち着いた・信頼感・プロフェッショナル。派手さより読みやすさ

---

## 2. Color Palette

### Core Palette
| Token | Value | Usage |
|-------|-------|-------|
| `--color-cyan` | `#38BDF8` | プライマリアクセント、CTA、アクティブ状態 |
| `--color-cyan-bright` | `#7DD3FC` | ホバー、ハイライトテキスト |
| `--color-cyan-dim` | `rgba(56,189,248,0.12)` | アクティブ背景、選択状態 |
| `--color-cyan-glow` | `rgba(56,189,248,0.25)` | グロー効果、ボックスシャドウ |

### Backgrounds & Depths
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#040810` | ページ背景 |
| `--bg-mid` | `#0A1428` | グラデーション中間 |
| `--bg-surface` | `rgba(12,24,48,0.50)` | カード・モーダル背景 |
| `--bg-card` | `rgba(255,255,255,0.03)` | ガラスカード |
| `--bg-card-hover` | `rgba(255,255,255,0.06)` | カードホバー |

### Text Hierarchy
| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `#EDF2F7` | 見出し、重要テキスト |
| `--text-secondary` | `#8FA3B0` | 補足テキスト、ラベル |
| `--text-muted` | `rgba(143,163,176,0.55)` | 注釈、日付 |
| `--text-dim` | `rgba(143,163,176,0.30)` | 非アクティブ、プレースホルダー |

### Semantic / Trend Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Green | `#34D399` / `#16A34A` | 好調、上昇トレンド |
| Teal | `#0D9488` | 上がり調子 |
| Gray | `#6B7280` | 横ばい |
| Amber | `#D97706` | 鈍化 |
| Red | `#F87171` / `#DC2626` | 不調、下降トレンド |

### Borders
| Token | Value |
|-------|-------|
| `--border-subtle` | `rgba(255,255,255,0.06)` |
| `--border-default` | `rgba(255,255,255,0.10)` |
| `--border-accent` | `rgba(56,189,248,0.35)` |

---

## 3. Typography

### Font Families
| Token | Family | Usage |
|-------|--------|-------|
| `--font-serif` | Shippori Mincho B1 | 見出し（h1〜h3）、`.serif` |
| `--font-body` | Noto Sans JP | 本文、ラベル、ボタン |
| `--font-data` | DM Mono | 数値、釣果データ、統計 |

### Type Scale
| Element | Size | Weight | Font | Notes |
|---------|------|--------|------|-------|
| h1 | `clamp(22px, 4.5vw, 32px)` | 600 | serif | ページタイトル、letter-spacing: 0.05em |
| h2 | `clamp(16px, 3vw, 20px)` | 600 | serif | セクション見出し |
| h3 | `clamp(14px, 2.5vw, 16px)` | 600 | serif | サブセクション |
| Body | 14px | 400 | body | line-height: 1.65 |
| Section Label | 11px | 600 | body | uppercase, letter-spacing: 0.10em |
| Data Label | 11px | 500 | body | uppercase, letter-spacing: 0.06em, `--text-secondary` |
| Data Value | — | 400 | data | tabular-nums |
| Filter Pill | 12px | 400/600 | body | active: 600 |
| Stale Note | 10px | 400 | body | `--text-muted`, opacity: 0.7 |
| Card Summary | 9-10px | 400 | body | `--text-muted` |

### Typography Rules
- 和文見出しにはセリフ体（Shippori Mincho B1）を使い、格調と信頼感を演出
- 本文はゴシック体（Noto Sans JP）で可読性確保
- 数値データは必ずモノスペース（DM Mono）でtabular-nums
- `-webkit-font-smoothing: antialiased` を全体に適用

---

## 4. Component Styling

### Glass Card（メインカード）
```css
background: linear-gradient(160deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%) padding-box,
            linear-gradient(135deg, rgba(56,189,248,0.30) 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.03) 70%, rgba(56,189,248,0.08) 100%) border-box;
border: 1px solid transparent;
backdrop-filter: blur(16px) saturate(160%);
box-shadow: var(--shadow-card);
border-radius: var(--radius-lg); /* 20px */
padding: 20px;
```
- ホバー時: `translateY(-2px)` + グラデーション強度UP + `--shadow-hover`

### Glass（非インタラクティブ）
```css
background: linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
border: 1px solid var(--border-subtle);
backdrop-filter: blur(12px);
border-radius: var(--radius-lg);
padding: 20px;
```

### Filter Pill（フィルターボタン）
- 通常: `border: 1px solid rgba(255,255,255,0.15)`, `background: rgba(255,255,255,0.04)`
- アクティブ: `border-color: --color-cyan`, `background: --color-cyan-dim`, `box-shadow: 0 0 12px var(--color-cyan-glow)`
- 無効: `opacity: 0.5`, `cursor: not-allowed`

### AI Summary Card
- `background: rgba(56,189,248,0.06)`
- `border-left: 4px solid var(--color-cyan)` + 三辺 `1px solid rgba(56,189,248,0.22)`
- ラベル: 10px, 700weight, uppercase, opacity: 0.7
- テキスト: 13px, `#7DD3FC`(エリア) / `#93DBFD`(魚種), line-height: 1.6
- 日付バッジ（右上）: `background: rgba(255,255,255,0.06)`, `border-radius: pill`, `--text-muted`

### Trend Card（魚種カード）
- 2列グリッド `grid-template-columns: repeat(2, 1fr)`, gap: 8px
- アクティブ: `border: 1.5px solid rgba(56,189,248,0.60)`, `background: rgba(56,189,248,0.10)`
- 通常: `border: 0.5px solid rgba(180,210,255,0.12)`, `background: rgba(8,18,55,0.28)`
- Stale（出船なし）: `opacity: 0.6`, dimmer border/background

### Stats Card（天気・潮汐・出船数）
- 3列グリッド、各カードに上辺アクセント（`border-top: 2px solid --color-cyan`）
- アイコン + ラベル（uppercase 9px）+ 値（data font 20-26px）

---

## 5. Layout Principles

### Container
- `max-width: 1080px`, `margin: 0 auto`
- Mobile: `padding: 0 16px`
- Desktop (≥768px): `padding: 0 32px`

### Spacing
- コンポーネント間: 14px（`gap: 14`）
- カード内部: 20px padding
- フィルター内部: 14px-16px padding
- 最小タッチターゲット: 44px（スマホ操作考慮）

### Breakpoints
| Name | Width | Behavior |
|------|-------|----------|
| Mobile | < 768px | 1カラム、BottomNav表示、`padding-bottom: 64px` |
| Tablet | ≥ 768px | 2カラムグリッド可 |
| Desktop | ≥ 1080px | max-width制限 |

### Background
```css
background-image:
  linear-gradient(rgba(56,189,248,0.015) 1px, transparent 1px),
  linear-gradient(90deg, rgba(56,189,248,0.015) 1px, transparent 1px),
  radial-gradient(ellipse 140% 60% at 50% 0%, var(--bg-mid) 0%, #060E20 50%, var(--bg-deep) 85%);
background-size: 48px 48px, 48px 48px, 100% 100%;
background-attachment: fixed;
```

---

## 6. Depth & Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| 0 (flat) | none | インライン要素 |
| 1 (card) | `--shadow-card`: `0 4px 24px rgba(0,0,0,0.40)` + `inset 0 1px 0 rgba(255,255,255,0.06)` | ガラスカード |
| 2 (hover) | `--shadow-hover`: `0 8px 40px rgba(0,0,0,0.50)` + cyan glow | カードホバー |
| 3 (float) | `--shadow-float`: `0 16px 48px rgba(0,0,0,0.60)` + cyan glow | ドロップダウン、モーダル |

### Border Radius Scale
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 10px | 小パーツ |
| `--radius-md` | 14px | 魚種カード、インナー |
| `--radius-lg` | 20px | メインカード |
| `--radius-xl` | 28px | ヒーローセクション |
| `--radius-pill` | 100px | フィルターピル、タグ |

---

## 7. Do's and Don'ts

### Do
- ダーク背景に対してコントラスト比を確保する（テキストは最低4.5:1）
- 数値データにはモノスペースフォント + `tabular-nums` を使用
- アクセントカラー（スカイブルー）は重要なインタラクション要素に限定
- ガラスカードには `backdrop-filter` を使い、深度を表現
- トレンド表現は色（緑/灰/赤）+ テキスト（好調/横ばい/不調）の二重表現
- フォールバック表示時は日付バッジで「いつの情報か」を明示

### Don't
- ライトモードを追加しない（デザイン全体がダーク前提）
- `#38BDF8` 以外のアクセントカラーを導入しない（一貫性維持）
- 外部画像や写真を使わない（データ駆動のクリーンなUI）
- `!important` を使わない
- インラインスタイルで直接カラーコードを書く場合もトークンの値に準拠
- AI生成テキストに絵文字を多用しない（🤖ラベルのみ許可）

---

## 8. Responsive Behavior

- **Mobile first**: デフォルトCSS = モバイル、`min-width` メディアクエリでデスクトップ拡張
- **BottomNav**: モバイル時（< 768px）のみ表示。ヘッダーナビはデスクトップ用
- **フィルター**: 横スクロール可能（`.scroll-x`）、スクロールバー非表示
- **テーブル**: モバイル時はカード形式に変換 or 横スクロール
- **グラフ**: Recharts の `ResponsiveContainer` で幅100%
- **タッチ**: ボタンは最低44×44px、ピル型フィルターは `padding: 6px 16px`

---

## 9. Page Structure Pattern

```
SiteHeader（固定ヘッダー）
  └ DropdownNav（デスクトップ: ホバー+クリック）

section.hero
  └ gradient overlay + SECTION-LABEL + h1（serif）

main.page-container（max-width: 1080px）
  ├ AIサマリーカード（日付バッジ付き）
  ├ Stats Grid（天気・潮汐・出船数）
  ├ TrendBar（魚種カード 2列グリッド）
  ├ Filters（エリア / 魚種 / 期間）
  ├ 釣果テーブル or チャート
  └ クロスリンク（関連エリア / 魚種）

footer
BottomNav（モバイル固定）
```

---

## 10. Agent Quick Reference

### 新しいコンポーネントを作るとき
1. 背景: `--bg-card` or `--bg-surface`、ボーダー: `--border-subtle`
2. テキスト: 見出し `--text-primary` / 補足 `--text-secondary` / 注釈 `--text-muted`
3. アクセント: `--color-cyan` はCTA・アクティブのみ
4. 角丸: `--radius-md` (14px) or `--radius-lg` (20px)
5. padding: 内部 20px、コンポーネント間 gap 14px
6. インタラクション: `transition: all 0.15s-0.2s`

### カラーチートシート
```
Brand accent:  #38BDF8 (sky blue)
Dark bg:       #040810
Card bg:       rgba(255,255,255,0.03)
Text primary:  #EDF2F7
Text sub:      #8FA3B0
Border:        rgba(255,255,255,0.06)
Good:          #34D399 / #16A34A
Bad:           #F87171 / #DC2626
```
