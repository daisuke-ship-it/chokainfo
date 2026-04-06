# chokainfo プロジェクト設計書

## Claude への指示

### 作業前に必ず確認すること
- 設計思想・改善方針は `/context` コマンドで Knowledge フォルダを読み込む
- 現在の実装状態・次のアクションは `/status` コマンドで確認する
- 作業後は `/log` コマンドで作業記録 MD に追記する（毎回・指示なくても行う）

### デザインシステム
- UI実装時は必ず `DESIGN.md` を参照（カラー・タイポグラフィ・コンポーネント規約）

### 参照すべきドキュメント

**設計思想・方針（Knowledge フォルダ）**
`/Users/daisuke/Library/Mobile Documents/iCloud~md~obsidian/Documents/BrainDump/Knowledge/project-chokainfo/`
- `Chokainfo構想——釣果情報の民主化とデータ駆動型メディアの設計思想.md` — コアの思想・競合戦略・収益モデル
- `chokainfo_site_improvement_framework.md` — UI/UX 改善フレームワーク
- `サイトデザインの最適化.md` — デザイン方針（スマホファースト）
- `AIっぽくない文章作成法.md` — AI 生成テキストの人間らしさのコツ
- `responsive_design_and_content_architecture.md` — レスポンシブ・コンテンツ設計
- `human_voice_content_generation.md` — 人間らしいコンテンツ生成
- `サイト改善提案.md` — 具体的改善提案

**作業記録**
`/Users/daisuke/Library/Mobile Documents/iCloud~md~obsidian/Documents/BrainDump/Methods/Chokainfo構築ログ_釣果情報サイトをAIで作る.md`

### 設計哲学（必読）

**「DB厳密、Claudeが吸収」の原則**
- DB には信頼できる構造化データのみ（id, shipyard_id, catch_date 等）
- 曖昧なテキスト（location_text, condition_text）は raw のまま保存
- AI 要約時に Claude が解釈・正規化する

**コア方針**
- 「完璧なDB」より「動く MVP」
- 「競争」より「棲み分け」（船釣り.jp との直接対抗ではなくモダン・高速・モバイルで別ポジション）
- スマホファースト（釣り場でスマホで見るユーザーが主）
- 「判断材料を提供するツール」として設計（ニュースサイトではなく）

### カスタムコマンド（`.claude/commands/`）
- `/context` — Knowledge フォルダの設計文書をすべて読み込む
- `/status` — プロジェクトの現在状態・次のアクションを確認する
- `/log`    — 作業内容を作業記録 MD に追記する

---

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
├── backend/            # Python スクレイパー → GitHub Actions で実行
│   ├── src/
│   │   ├── scraper.py           # v4 スリムオーケストレーター
│   │   ├── summarizer.py        # AI サマリー生成
│   │   ├── handlers/            # ハンドラー群（下記参照）
│   │   │   ├── __init__.py      # HANDLER_MAP + get_handler()
│   │   │   ├── base.py          # BaseHandler（fetch→hash→parse→save）
│   │   │   ├── gyosan.py        # gyosan.jp CMS（24件）
│   │   │   ├── blogphp.py       # blog.php CMS（6件）
│   │   │   ├── wordpress.py     # WP REST API + Claude fallback（9件）
│   │   │   ├── rss.py           # RSS/RDF フィード
│   │   │   └── claude_handler.py# Claude Haiku fallback（19件）
│   │   └── utils/
│   │       ├── fetch.py         # fetch_html, compute_md5, html_to_text
│   │       ├── db.py            # get_latest_html_hash, save_catch_raw, save_catches
│   │       └── normalizer.py    # parse_date_jp, parse_count, parse_size
│   ├── config/
│   │   └── extraction.yaml
│   ├── logs/           # .gitignore 済み
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
- **言語**: Python 3.11（GitHub Actions）、ローカルは 3.9 でも動作
- **スクレイピング**: requests + BeautifulSoup4 + lxml
- **AI 解析**: Claude API (claude-haiku-4-5-20251001)
- **実行環境**: GitHub Actions（毎日15〜19時JST）
- **ローカル実行**: `cd backend && python3 src/scraper.py --dry-run --shipyard-ids <ID>`

### データベース
- **Supabase** (PostgreSQL) / URL: https://lkejlcruzydaequbchav.supabase.co

---

## スクレイパー v4 設計

### ハンドラーパターン
`shipyards.scrape_config.handler` の値でディスパッチ。未設定は `claude` フォールバック。

| handler | 対象 | 件数 | Claude 使用 |
|---------|------|------|------------|
| `gyosan` | gyosan.jp CMS（/category/Choka/） | 24件 | 不要 |
| `blogphp` | blog.php CMS | 6件 | 不要 |
| `wordpress` | WordPress REST API | 9件 | テーブルなし時のみ |
| `rss` | RSS/RDF フィード | 0件（現在） | 不要 |
| `claude` | その他・未分類 | 19件 | 常時 |

### scrape_config の例
```json
{ "handler": "gyosan" }
{ "handler": "gyosan", "list_path": "/category/Realtime/1/" }
{ "handler": "wordpress", "catch_category_id": 5 }
{ "handler": "wordpress", "feed_path": null }
{ "handler": "blogphp" }
```

### html_hash 差分検知
- `catch_raw` テーブルに前回の html_hash（MD5）を保存
- ハッシュが変化していない船宿はパース・DB保存をスキップ（Claude API コール削減）

### ローカルテスト
```bash
cd backend
python3 src/scraper.py --dry-run --shipyard-ids 4        # 中山丸1件
python3 src/scraper.py --dry-run --shipyard-ids 4 37 9   # 複数指定
python3 src/scraper.py --shipyard-ids 4                  # 実際に保存
```
※ローカルの `.env` は `backend/.env`（git 管理外）

---

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

### GitHub Actions 手動実行（gh CLI がない場合）
```bash
TOKEN=$(security find-internet-password -s github.com -w)
curl -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/daisuke-ship-it/chokainfo/actions/workflows/scraper.yml/dispatches" \
  -d '{"ref":"main"}'
```

---

## 競合ポジショニング

| 競合 | 特徴 | 対策 |
|------|------|------|
| 船釣り.jp (funaduri.jp) | 情報量多いが古いデザイン・スマホ劣悪 | モダンUI・スマホ特化で差別化 |
| 釣割 (chowari.jp) | 予約サイト・船宿名/潮見表KWを押さえている | 同じ土俵では戦わない |
| ANGLERS | UGCコミュニティ・データ品質が投稿者依存 | 一次情報の正規化で差別化 |
| 海快晴・釣り天気.jp | 天候・海況特化・釣果一次情報は持たない | 釣果×天候の相関で差別化 |

**差別化軸**: 船宿横断の正規化釣果データ＋天候/潮汐との相関分析＋AIサマリー記事

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
- 保存先: Supabase の `ai_summaries` テーブルにキャッシュ

---

## ページ構成

| ページ | URL | 主な目的 |
|--------|-----|---------|
| トップ | `/` | 今日の全魚種サマリー＋エリアAIサマリー |
| 魚種別 | `/fish/tachiuo` | 特定魚種の詳細釣果・グラフ・魚種別AIサマリー |
| 船宿別 | `/yado/[name]` | 特定船宿の全魚種釣果履歴・船宿情報 |
| グラフ・分析 | `/analysis` | 魚種×期間のトレンド比較・昨年比 |
| **管理画面** | `/admin/shipyards` | 船宿追加・ハンドラー設定・dry-run（実装予定） |

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
articles          -- AIサマリー記事
requests          -- ユーザーリクエストフォーム
```

### `shipyards` の重要カラム
- `scrape_config` (jsonb): ハンドラー設定。`{"handler": "gyosan"}` 等
- `is_active` (boolean): false にすればスクレイパーがスキップ
- `url`: スクレイピング対象 URL

### `catches` の重要カラム
- `catch_type`: 'ship_total' / 'personal' / 'top_angler'
- `sail_date`: 出船日（≠投稿日）
- `boat_name`: 便名（午前船・午後船等）
- `condition_text`: 船長コメント原文

---

## 設計方針（重要）
- 船宿ごとのフォーマット差異は Claude API で吸収する
- 生データ(catch_raw)は必ず保持し、html_hash で差分検知・再解析できるようにする
- 同じ船宿で複数船・午前午後がある場合は count_max/size_max_cm の最大値を採用
- 個人名・顔写真は保持しない（竿頭情報は匿名化）

---

## 次のアクション（優先順）

### 直近（管理画面フェーズA）
1. **管理画面** `apps/frontend/src/app/admin/shipyards/`
   - 船宿一覧・ステータス表示（ハンドラー / is_active / 最終取得日時）
   - 新規船宿追加フォーム（URL入力 → ハンドラー自動判定 → dry-run → 保存）
   - 認証: 環境変数 `ADMIN_PASSWORD` によるシンプルなパスワード認証

### 中期
2. **DB カラム追加**: `shipyards.last_scraped_at`（管理画面表示用）
3. **AIサマリー実装**: summarizer.py の本格稼働
4. **魚種別・船宿別ページ**: `/fish/[slug]`、`/yado/[slug]`
5. **船宿・魚種の拡充**（全国展開への布石）
