"""
WordPress ハンドラー（14件対応）

取得優先順:
  1. WP REST API  GET /wp-json/wp/v2/{post_type}?categories={id}&per_page=10
  2. RSS フィード  /feed/ or scrape_config.feed_path

content.rendered のパース:
  - テーブル形式 (<table>) → ルールベース
  - テキスト形式            → Claude Haiku（html_hash 変化時のみ）
"""
import json
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from handlers.base    import BaseHandler
from utils.fetch      import HEADERS, REQUEST_TIMEOUT
from utils.normalizer import normalize_num, parse_date_jp, parse_count, parse_size

MAX_POSTS   = 10
DAYS_WINDOW = 7   # 直近何日分を取得するか

# Claude に渡す魚種リスト（現行 scraper.py から）
VALID_SPECIES = [
    "タチウオ", "アジ", "サバ", "イワシ", "イナダ", "ワラサ", "ブリ",
    "サゴシ", "サワラ", "ヒラマサ", "カンパチ", "五目",
    "シーバス", "クロダイ", "メバル", "カサゴ", "マダイ",
    "カレイ", "ヒラメ", "マゴチ", "タコ", "イカ",
    "トラフグ", "フグ", "シロギス", "キス",
]


class WordPressHandler(BaseHandler):

    def fetch_raw(self, shipyard: dict) -> str:
        config      = shipyard.get("scrape_config") or {}
        base_url    = self._base(shipyard["url"])
        post_type   = config.get("custom_post_type", "posts")
        cat_id      = config.get("catch_category_id")

        # ── REST API 試行 ──────────────────────────────────────────────────
        api_url = f"{base_url}/wp-json/wp/v2/{post_type}"
        params  = {"per_page": MAX_POSTS, "orderby": "date", "order": "desc"}
        if cat_id:
            params["categories"] = cat_id

        try:
            resp = requests.get(api_url, params=params, headers=HEADERS,
                                timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200:
                return resp.text   # JSON 文字列
        except Exception:
            pass

        # ── RSS フォールバック ─────────────────────────────────────────────
        feed_path = config.get("feed_path", "/feed/")
        feed_url  = urljoin(base_url + "/", feed_path.lstrip("/"))
        resp = requests.get(feed_url, headers=HEADERS, timeout=REQUEST_TIMEOUT,
                            verify=config.get("ssl_verify", True))
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text

    def parse(self, raw: str, shipyard: dict) -> list[dict]:
        # JSON（REST API）か XML（RSS）かを判定
        stripped = raw.lstrip()
        if stripped.startswith("[") or stripped.startswith("{"):
            return self._parse_rest(raw, shipyard)
        return self._parse_rss(raw, shipyard)

    # ── REST API パース ───────────────────────────────────────────────────

    def _parse_rest(self, raw: str, shipyard: dict) -> list[dict]:
        posts   = json.loads(raw)
        records = []
        cutoff  = (datetime.now() - timedelta(days=DAYS_WINDOW)).date()

        for post in posts:
            pub_date = post.get("date", "")[:10]   # "2026-04-01"
            try:
                if datetime.fromisoformat(pub_date).date() < cutoff:
                    continue
            except ValueError:
                pass

            title   = BeautifulSoup(post.get("title", {}).get("rendered", ""), "html.parser").get_text()
            content = post.get("content", {}).get("rendered", "")

            records.extend(self._parse_content(content, pub_date, title))

        return records

    # ── RSS パース ────────────────────────────────────────────────────────

    def _parse_rss(self, raw: str, shipyard: dict) -> list[dict]:
        soup    = BeautifulSoup(raw, "xml")
        records = []
        cutoff  = (datetime.now() - timedelta(days=DAYS_WINDOW)).date()

        for item in soup.find_all("item"):
            # 日付
            pub = item.find("pubDate") or item.find("dc:date")
            pub_str = pub.get_text(strip=True) if pub else ""
            date_str = self._parse_rss_date(pub_str)

            try:
                if date_str and datetime.fromisoformat(date_str).date() < cutoff:
                    continue
            except ValueError:
                pass

            title   = (item.find("title") or "").get_text(strip=True) if item.find("title") else ""
            # content:encoded > description の優先順
            content_tag = item.find("content:encoded") or item.find("description")
            content     = content_tag.get_text("\n") if content_tag else ""

            records.extend(self._parse_content(content, date_str, title))

        return records

    # ── コンテンツパース（テーブル or テキスト） ──────────────────────────

    def _parse_content(self, content: str, date_str: str | None, title: str) -> list[dict]:
        soup = BeautifulSoup(content, "html.parser")

        # タイトルから日付抽出（記事本文の日付がない場合）
        date_from_title = parse_date_jp(normalize_num(title)) if title else None
        sail_date       = date_from_title or date_str

        # テーブル形式かどうか確認
        tables = soup.find_all("table")
        if tables:
            return self._parse_table(tables, sail_date, title)

        # プレーンテキスト形式 → Claude Haiku で抽出
        text = soup.get_text("\n", strip=True)
        if not text.strip():
            return []

        if self.claude_client:
            return self._parse_with_claude(text, sail_date, title)

        # Claude なし: シンプル正規表現フォールバック
        return self._parse_text_simple(text, sail_date, title)

    def _parse_table(self, tables, date_str, boat_name_hint: str) -> list[dict]:
        records = []
        for table in tables:
            details = []
            for row in table.find_all("tr"):
                cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
                if len(cells) < 2:
                    continue
                # ヘッダー行スキップ
                if cells[0] in ("ターゲット", "魚種", "釣りもの", "魚"):
                    continue
                fish = normalize_num(cells[0])
                if not fish or fish.isdigit():
                    continue

                size_text  = None
                count_raw  = None
                for cell in cells[1:]:
                    cell = normalize_num(cell)
                    if re.search(r"cm|kg", cell, re.I):
                        size_text = cell
                    elif re.search(r"匹|本|尾|杯|\d+.*\d+", cell):
                        count_raw = cell

                _, count_max = parse_count(count_raw or "")
                details.append({
                    "species_name":     fish,
                    "species_name_raw": fish,
                    "count":            count_max,
                    "unit":             "尾",
                    "size_text":        parse_size(size_text or ""),
                })

            if details:
                counts = [d["count"] for d in details if d.get("count")]
                records.append({
                    "date":           date_str,
                    "boat_name":      boat_name_hint or None,
                    "count_min":      None,
                    "count_max":      max(counts) if counts else None,
                    "condition_text": None,
                    "details":        details,
                })
        return records

    def _parse_text_simple(self, text: str, date_str, boat_name_hint: str) -> list[dict]:
        """シンプルな正規表現フォールバック（Claude 不使用）"""
        details = []
        for line in text.splitlines():
            line = normalize_num(line.strip())
            m    = re.match(r"([^\d\s]{2,})\s+([\d.]+.*(?:cm|kg))[^\d]+([\d]+.*(?:匹|本|尾))", line)
            if m:
                _, count_max = parse_count(m.group(3))
                details.append({
                    "species_name":     m.group(1),
                    "species_name_raw": m.group(1),
                    "count":            count_max,
                    "unit":             "尾",
                    "size_text":        m.group(2).strip(),
                })
        if not details:
            return []
        return [{
            "date":           date_str,
            "boat_name":      boat_name_hint or None,
            "count_min":      None,
            "count_max":      max((d["count"] for d in details if d.get("count")), default=None),
            "condition_text": None,
            "details":        details,
        }]

    def _parse_with_claude(self, text: str, date_str, boat_name_hint: str) -> list[dict]:
        """Claude Haiku でテキストから釣果を抽出"""
        import anthropic as ant

        prompt = (
            f"以下は釣り船宿の釣果テキストです。\n"
            f"出船日: {date_str or '不明'}\n\n"
            f"{text[:3000]}\n\n"
            "上記から釣果を以下のJSONで返してください。JSON以外出力禁止。\n"
            '[{"fish":"魚種","size":"サイズ","count_max":数,"unit":"尾"}]'
        )
        resp = self.claude_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_json = resp.content[0].text.strip()
        # JSON 部分だけ抽出
        start = raw_json.find("[")
        end   = raw_json.rfind("]") + 1
        if start < 0 or end <= start:
            return []
        items   = json.loads(raw_json[start:end])
        details = [
            {
                "species_name":     d.get("fish", ""),
                "species_name_raw": d.get("fish", ""),
                "count":            d.get("count_max"),
                "unit":             d.get("unit", "尾"),
                "size_text":        d.get("size"),
            }
            for d in items if d.get("fish")
        ]
        if not details:
            return []
        return [{
            "date":           date_str,
            "boat_name":      boat_name_hint or None,
            "count_min":      None,
            "count_max":      max((d["count"] for d in details if d.get("count")), default=None),
            "condition_text": None,
            "details":        details,
        }]

    # ── ユーティリティ ────────────────────────────────────────────────────

    def _base(self, url: str) -> str:
        p = urlparse(url)
        return f"{p.scheme}://{p.netloc}"

    def _parse_rss_date(self, text: str) -> str | None:
        """RSS の pubDate / dc:date を YYYY-MM-DD に変換"""
        # ISO 形式: "2026-04-01T15:06:18+09:00"
        m = re.match(r"(\d{4}-\d{2}-\d{2})", text)
        if m:
            return m.group(1)
        # RFC2822 形式: "Wed, 01 Apr 2026 15:06:18 +0900"
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(text)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            return parse_date_jp(text)
