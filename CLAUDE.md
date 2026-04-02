# chokainfo プロジェクト設計書

## プロジェクト概要
- **サイト名**: 釣果情報.com
- **URL**: https://www.chokainfo.com
- **目的**: 首都圏（東京湾・相模湾）の船釣り釣果情報を複数船宿から自動収集・集計して提供
- **最優先方針**: まずPVを最大化し、広告収益化する
- **収益化**: Google AdSense（メイン）、釣り関連アフィリエイト、将来：船宿向けSaaS

## リポジトリ構成（モノレポ）
- **リポジトリ**: https://github.com/daisuke-ship-it/chokainfo（Public）
- **本番URL**: https://www.chokainfo.com

### ディレクトリ構造
```
chokainfo/
├── .github/workflows/
│   ├── scraper.yml     # 毎日15〜19時 JST にスクレイピング実行
│   └── verify.yml      # 毎日 09:30 JST にデータ取得状況を検証
├── apps/
│   └── frontend/       # Next.js フロントエンド → Vercel にデプロイ
│       ├── src/
│       ├── public/
│       └── package.json
├── backend/            # Python スクレイパー・AI サマリー → GitHub Actions で実行
│   ├── config/
│   │   ├── extraction.yaml
│   │   └── shipyards.yaml
│   ├── src/
│   │   ├── scraper.py
│   │   ├── summarizer.py
│   │   └── migrate.py
│   ├── logs/           # .gitignore 済み
│   ├── sample/
│   └── requirements.txt
├── .gitignore
└── CLAUDE.md
```

## 技術スタック

### フロントエンド（apps/frontend/）
- **フレームワーク**: Next.js 16 (App Router)
- **UI ライブラリ**: React 19
- **スタイリング**: Tailwind CSS 4
- **グラフ**: Recharts
- **デプロイ**: Vercel（Root Directory: `apps/frontend`）

### バックエンド（backend/）
- **言語**: Python 3.11
- **スクレイピング**: requests + BeautifulSoup
- **AI 解析**: Claude API (claude-haiku-4-5-20251001)
- **実行環境**: GitHub Actions

### データベース
- **Supabase** (PostgreSQL) / URL: https://lkejlcruzydaequbchav.supabase.co

## デプロイ構成

### Vercel 設定
- **Root Directory**: `apps/frontend`
- **Ignored Build Step**: `git diff HEAD^ HEAD --quiet -- apps/frontend/`（backend/ 変更時はビルドをスキップ）
- 環境変数: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REVALIDATE_SECRET`

### GitHub Actions Secrets（chokainfo リポジトリに設定）
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SITE_URL`（`https://www.chokainfo.com`）
- `REVALIDATE_SECRET`

---

## 競合ポジショニング

| 競合 | 特徴 | 対策 |
|------|------|------|
| 船釣り.jp (funaduri.jp) | 情報量多いが古いデザイン・スマホ劣悪 | モダンUI・スマホ特化で差別化 |
| 釣割 (chowari.jp) | 予約サイト・船宿名/潮見表KWを押さえている | 同じ土俵では戦わない |
| ANGLERS | UGCコミュニティ・データ品質が投稿者依存 | 一次情報の正規化で差別化 |
| 海快晴・釣り天気.jp | 天候・海況特化・釣果一次情報は持たない | 釣果×天候の相関で差別化 |

**差別化軸**: 船宿横断の正規化釣果データ＋天候/潮汐との相関分析＋AIサマリー記事
「釣果一覧」では戦えない。「比較・傾向・再現性」を前面に出す。

---

## 差別化戦略

### AIサマリー3階層（最重要・競合にない強み）
```
① 船宿個別サマリー（詳細欄に表示）
　　↓ 集約
② 魚種別サマリー（魚種ページ上部に表示）
　　↓ 集約
③ エリア全体サマリー（トップページに表示）
```

**実装方針**
- モデル: claude-haiku-4-5-20251001
- 処理: 1日1回バッチ（GitHub Actionsに組み込む）
- コスト: 月$1未満（約150円以下）
- コメントはバラつくので正規化不要、ある情報だけでサマリー生成
- 保存先: Supabaseの`ai_summaries`テーブルにキャッシュ

### その他の差別化
- グラフ可視化（釣果トレンド・昨年同期比）
- スマホ特化のUX（釣り場でスマホで見るユーザー重視）
- 船宿情報の充実（Google評価・港情報・連絡先）

---

## ページ構成

| ページ | URL | 主な目的 |
|--------|-----|---------|
| トップ | `/` | 今日の全魚種サマリー＋エリアAIサマリー |
| 魚種別 | `/fish/tachiuo` | 特定魚種の詳細釣果・グラフ・魚種別AIサマリー |
| 船宿別 | `/yado/[name]` | 特定船宿の全魚種釣果履歴・船宿情報 |
| グラフ・分析 | `/analysis` | 魚種×期間のトレンド比較・昨年比 |

---

## 画面設計（スマホ優先）

### トップページ構成
1. ヘッダー（エリア切り替え）
2. エリアAIサマリー（1〜2行）
3. 魚種トレンドバー（直近7日 vs 前7日・好調/横ばい/鈍化）
4. フィルター（エリア / 魚種 / 期間）
5. 本日の釣果サマリー（3列2行: 天気・潮汐・出船数 / 平均釣果・釣果範囲・サイズcm）
6. 釣果一覧テーブル（船宿+釣り方サブテキスト / 釣果 / サイズ / 日付 / 記事リンク）
7. グラフタブ（直近30日釣果平均推移）
8. AdSense枠（カード間・テーブル下）

### スマホUI方針
- ナビ：下部固定タブバー
- 魚種カード：横スクロール or 2列グリッド
- テーブル：横スクロール対応（左固定カラム）
- グラフ：タップでデータポイント表示

### デザイン方針
- 和風・渋めデザイン（深海ブルー・墨色・金色アクセント）
- スマホファーストのレスポンシブ
- 競合（funaduri.jp）がレガシーなのでモダンUIで差別化

---

## 自動化・差分取得の方針
- 実行タイミング: 毎日15〜19時（JST）毎時実行
- 理由: その日の釣果を見て夕方に予約する釣り人がターゲット
- 差分取得: 前回スクレイピング時のHTMLハッシュと比較し、変化がなければClaude APIを呼ばない
- コスト最適化: HTML差分がある船宿のみClaude APIで再解析する

---

## DBスキーマ

### 既存テーブル
```
areas             -- エリアマスタ（東京湾・相模湾など）
fish_species      -- 魚種マスタ（aliases[]で表記揺れ吸収）
fishing_methods   -- 釣り方マスタ（エサ/ルアー/テンヤ等）
shipyards         -- 船宿マスタ（scrape_configでパース設定管理）
catches           -- 釣果データ（メインテーブル）
catch_raw         -- スクレイピング生データ（html_hash・差分検知・再解析用）
environment_data  -- 天気・潮汐データ（外部APIから取得）
articles          -- AIサマリー記事（daily_summary/weekly/curation）
requests          -- ユーザーリクエストフォーム
tachiuo_catch     -- 初期開発用暫定テーブル（将来廃止予定）
```

### 追加予定テーブル

#### `ports`（港マスタ）
```sql
CREATE TABLE ports (
  id         integer PRIMARY KEY,
  name       text NOT NULL,       -- '走水港'など
  area_id    integer REFERENCES areas(id),
  lat        numeric,             -- 将来の地図表示用
  lng        numeric,
  created_at timestamptz DEFAULT now()
);
```

#### `ai_summaries`（AIサマリー格納）
```sql
CREATE TABLE ai_summaries (
  id            bigint PRIMARY KEY,
  summary_type  text NOT NULL,    -- 'shipyard' | 'fish_species' | 'area'
  target_id     integer,          -- shipyard_id or fish_species_id or area_id
  target_date   date NOT NULL,
  summary_text  text NOT NULL,
  raw_input     text,             -- 元テキスト（ハルシネーション対策）
  model_used    text,             -- 'claude-haiku-4-5-20251001'
  created_at    timestamptz DEFAULT now()
);
```

### `catches`テーブル重要カラム
- `catch_type`: 'ship_total'（船中）/ 'personal'（個人）/ 'top_angler'（竿頭）
- `time_slot`: '午前' / '午後' / '終日'（text型のまま）
- `fishing_method_id`: 釣り方（釣り方が違う場合は別レコード）
- `sail_date`: 出船日（≠投稿日）
- `confidence_score`: 抽出信頼度 0.0〜1.0（将来のレビューUI用）
- `source_trace`: どの段落・行から抽出したか（再解析用）

### `catches`追加予定カラム
```sql
ALTER TABLE catches ADD COLUMN boat_name     text;         -- 複数隻対応
ALTER TABLE catches ADD COLUMN location_text text;         -- '走水沖'など
ALTER TABLE catches ADD COLUMN depth_min_m   integer;
ALTER TABLE catches ADD COLUMN depth_max_m   integer;
ALTER TABLE catches ADD COLUMN condition_text text;        -- 船長コメント原文
ALTER TABLE catches ADD COLUMN no_sail       boolean DEFAULT false;
ALTER TABLE catches ADD COLUMN is_relay      boolean DEFAULT false;
ALTER TABLE catches ADD COLUMN relay_group   text;
```

### `shipyards`追加予定カラム
```sql
ALTER TABLE shipyards ADD COLUMN port_id              integer REFERENCES ports(id);
ALTER TABLE shipyards ADD COLUMN phone                text;
ALTER TABLE shipyards ADD COLUMN address              text;
ALTER TABLE shipyards ADD COLUMN reservation_url      text;
ALTER TABLE shipyards ADD COLUMN google_rating        numeric;
ALTER TABLE shipyards ADD COLUMN google_review_count  integer;
ALTER TABLE shipyards ADD COLUMN google_place_id      text;
ALTER TABLE shipyards ADD COLUMN google_updated_at    timestamptz;
```

---

## 対象エリア・魚種

### エリア
- 初期: 東京湾、相模湾

### 魚種
- 現在対応済み: タチウオ・アジ・シーバス・サワラ
- 拡張予定（優先順）: ヤリイカ・マルイカ・カワハギ・トラフグ・マゴチ・マダイ・シロギス

### 船宿拡充方針
東京湾の金沢八景・横浜周辺を優先（検索流入が多いエリア）

---

## SEO戦略（PV最大化）
- 「魚種 × エリア × 月」の長尾KWを大量生成
- AIサマリー記事で「今週の東京湾タチウオ釣果まとめ」等を自動生成
- 天候・潮汐との相関データで「一次情報に匹敵する独自価値」を付与
- Googleの低品質コンテンツ判定を避けるため、統計・グラフ・比較を必ず入れる

---

## 設計方針（重要）
- 船宿ごとのフォーマット差異はClaude APIで吸収する
- 生データ(catch_raw)は必ず保持し、html_hashで差分検知・再解析できるようにする
- 同じ船宿で複数船・午前午後がある場合はcount_max/size_max_cmの最大値を採用
- 釣り方（エサ/ルアー/テンヤ）が違う場合は別レコードとして管理
- 個人名・顔写真は保持しない（竿頭情報は匿名化）
- 信頼度スコアはMVPでは表示しないが、カラムとして必ず格納する

---

## 次のアクション（優先順）
1. DBマイグレーション実行（ports・ai_summariesテーブル追加、既存テーブルへのカラム追加）
2. AIサマリー実装（スクレイパーにコメント取得 → Haiku呼び出し → Supabase保存）
3. ページ追加実装（魚種別・船宿別・グラフ分析）
4. 船宿・魚種の拡充
5. AdSense枠の最適化
6. 昨年同月比・グラフ強化
7. リクエスト募集フォーム
8. 船宿への送客導線（予約リンク）
9. 信頼度スコア表示・レビューUI
