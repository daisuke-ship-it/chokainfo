from __future__ import annotations
"""
ブログ RSS ハンドラー（ameblo / livedoor / FC2）

各ブログサービスの RSS フィードから釣果情報を取得し、
正規表現パーサーで抽出する。Claude API 不要。

RSS エンドポイント:
  ameblo:   {url}/rss.html
  livedoor: {url}/index.rdf
  FC2:      {url}/?xml

scrape_config 例:
  {"handler": "blog_rss"}
  {"handler": "blog_rss", "feed_url": "https://ameblo.jp/xxx/rss.html"}
"""
import re
import warnings
from datetime import datetime, timedelta

import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

from handlers.base import BaseHandler
from utils.fetch import HEADERS, REQUEST_TIMEOUT
from utils.normalizer import normalize_num, parse_count, parse_date_jp, parse_size
from utils.regex_parser import extract_catch_details, extract_boat_name

DAYS_WINDOW = 7

# ブログサービスごとの RSS パス自動判定
_FEED_PATHS = {
    "ameblo.jp":   "/rss.html",
    "livedoor.jp": "/index.rdf",
    "fc2.com":     "/?xml",
}

# 釣果記事フィルタ用キーワード
_CATCH_KEYWORDS = ["釣果", "釣行", "チョカ", "ちょか", "出船", "沖上がり",
                   "匹", "本", "尾", "cm", "kg", "釣れ", "ゲット",
                   "マダイ", "ヒラメ", "アジ", "タチウオ", "サワラ"]

# タイトル・本文から魚種名を抽出するパターン（カタカナ＋一部漢字魚名）
_KNOWN_FISH = [
    "マダイ", "真鯛", "ヒラメ", "アジ", "タチウオ", "サワラ", "サバ",
    "イナダ", "ワラサ", "ブリ", "ヒラマサ", "カンパチ", "シーバス",
    "クロダイ", "メバル", "カサゴ", "マゴチ", "タコ", "イカ",
    "トラフグ", "フグ", "シロギス", "キス", "カレイ", "マハタ",
    "イワシ", "サゴシ", "カイワリ", "イトヨリ", "アカイサキ",
    "黒メバル", "鯛", "青物",
]

# 正規化マッピング（漢字→カタカナ）
_FISH_NORMALIZE = {
    "真鯛": "マダイ", "鯛": "マダイ", "黒メバル": "メバル", "青物": "ブリ",
}

# ブログ固有の数量パターン
_BLOG_COUNT_RE = re.compile(
    r"(?:枚数|匹数|尾数|本数)[、,：:]\s*([\d]+\s*[～~\-]\s*[\d]+\s*(?:枚|匹|尾|本))"
)
_BLOG_SIZE_RE = re.compile(
    r"(?:キロ数|サイズ|型)[、,：:]\s*([\d.]+\s*[～~\-]\s*[\d.]+\s*(?:キロ|kg|cm))"
)


class BlogRssHandler(BaseHandler):

    def fetch_raw(self, shipyard: dict) -> str:
        config   = shipyard.get("scrape_config") or {}
        base_url = shipyard["url"].rstrip("/")

        # feed_url が直接指定されている場合はそれを使う
        feed_url = config.get("feed_url")
        if not feed_url:
            feed_url = self._guess_feed_url(base_url)

        ssl_verify = config.get("ssl_verify", True)
        resp = requests.get(
            feed_url, headers=HEADERS, timeout=REQUEST_TIMEOUT, verify=ssl_verify
        )
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text

    def parse(self, raw: str, shipyard: dict) -> list[dict]:
        # lxml-xml が利用可能ならそちらを使う、なければ html.parser にフォールバック
        try:
            soup = BeautifulSoup(raw, "xml")
        except Exception:
            soup = BeautifulSoup(raw, "html.parser")
        records = []
        cutoff  = (datetime.now() - timedelta(days=DAYS_WINDOW)).date()

        for item in soup.find_all("item"):
            # 日付
            pub     = item.find("pubDate") or item.find("dc:date")
            pub_str = pub.get_text(strip=True) if pub else ""
            date_str = self._parse_rss_date(pub_str)

            try:
                if date_str and datetime.fromisoformat(date_str).date() < cutoff:
                    continue
            except ValueError:
                pass

            # タイトル
            title_el = item.find("title")
            title    = title_el.get_text(strip=True) if title_el else ""

            # 本文取得
            content_tag = item.find("content:encoded") or item.find("description")
            if not content_tag:
                continue
            content_html = content_tag.get_text() if content_tag else ""

            # HTML からテキストを抽出
            content_soup = BeautifulSoup(content_html, "html.parser")
            content_text = content_soup.get_text("\n", strip=True)

            # タイトル+本文で釣果記事判定
            combined = title + " " + content_text
            if not self._is_catch_article(combined):
                continue

            # Step 1: 正規表現パーサーで定量データ抽出
            details = extract_catch_details(content_text, include_qualitative=False)

            # Step 2: ブログ固有パターン（「枚数、0～4枚」等）
            if not details:
                details = self._extract_blog_format(combined)

            # Step 3: タイトル+本文から魚種名を検出し、定性データとして記録
            if not details:
                details = self._extract_fish_mentions(title, content_text)

            if not details:
                continue

            # 日付がRSSから取れない場合はタイトルから抽出
            if not date_str:
                date_str = parse_date_jp(normalize_num(title))

            counts = [d["count"] for d in details if d.get("count")]
            records.append({
                "date":           date_str,
                "boat_name":      extract_boat_name(title),
                "count_min":      None,
                "count_max":      max(counts) if counts else None,
                "condition_text": content_text[:300] or None,
                "details":        details,
            })

        return records

    def _extract_blog_format(self, text: str) -> list[dict]:
        """ブログ固有の「枚数、0～4枚」パターンを抽出"""
        text = normalize_num(text)
        details = []

        # メイン魚種をタイトルや冒頭から検出
        fish_names = self._find_known_fish(text)
        if not fish_names:
            return []

        # 数量パターン
        count_match = _BLOG_COUNT_RE.search(text)
        count_max = None
        unit = "尾"
        if count_match:
            _, count_max = parse_count(count_match.group(1))
            if "枚" in count_match.group(1):
                unit = "枚"

        # サイズパターン
        size_match = _BLOG_SIZE_RE.search(text)
        size_text = None
        if size_match:
            raw_size = size_match.group(1).replace("キロ", "kg")
            size_text = parse_size(raw_size)

        # メイン魚種に数量・サイズを付与
        main_fish = fish_names[0]
        details.append({
            "species_name": _FISH_NORMALIZE.get(main_fish, main_fish),
            "species_name_raw": main_fish,
            "count": count_max,
            "unit": unit,
            "size_text": size_text,
            "detail_type": "catch" if count_max else "note",
        })

        # ゲスト魚種（「ゲストXXX、YYY」パターン）
        guest_match = re.search(r"ゲスト[、,：:]?\s*(.+?)(?:\s|$|コメント)", text)
        if guest_match:
            guest_text = guest_match.group(1)
            for fish in _KNOWN_FISH:
                if fish in guest_text and fish != main_fish:
                    details.append({
                        "species_name": _FISH_NORMALIZE.get(fish, fish),
                        "species_name_raw": fish,
                        "count": None,
                        "unit": "尾",
                        "size_text": None,
                        "detail_type": "note",
                    })

        return details

    def _extract_fish_mentions(self, title: str, content: str) -> list[dict]:
        """タイトルと本文から魚種名の言及を検出して定性データとして返す"""
        combined = normalize_num(title + " " + content)
        fish_found = self._find_known_fish(combined)

        details = []
        seen = set()
        for fish in fish_found:
            normalized = _FISH_NORMALIZE.get(fish, fish)
            if normalized in seen:
                continue
            seen.add(normalized)
            details.append({
                "species_name": normalized,
                "species_name_raw": fish,
                "count": None,
                "unit": "尾",
                "size_text": None,
                "detail_type": "note",
            })
        return details

    @staticmethod
    def _find_known_fish(text: str) -> list[str]:
        """テキスト中の既知魚種名を出現順で返す"""
        found = []
        seen = set()
        for fish in _KNOWN_FISH:
            if fish in text and fish not in seen:
                found.append(fish)
                seen.add(fish)
        return found

    @staticmethod
    def _guess_feed_url(base_url: str) -> str:
        """ブログ URL からRSSフィードのURLを推測する"""
        for domain, path in _FEED_PATHS.items():
            if domain in base_url:
                return f"{base_url}{path}"
        # デフォルト: /feed/ を試す
        return f"{base_url}/feed/"

    @staticmethod
    def _is_catch_article(text: str) -> bool:
        """テキストが釣果記事かどうか判定"""
        return any(kw in text for kw in _CATCH_KEYWORDS)

    @staticmethod
    def _parse_rss_date(text: str) -> str | None:
        """RSS の日付をパースする"""
        # ISO 8601: "2026-04-05T..."
        m = re.match(r"(\d{4}-\d{2}-\d{2})", text)
        if m:
            return m.group(1)
        # RFC 2822: "Sat, 05 Apr 2026 ..."
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(text).strftime("%Y-%m-%d")
        except Exception:
            return parse_date_jp(text)
