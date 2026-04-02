"""
RSS/RDF ハンドラー（Seesaa・Livedoor 等）

特徴:
  - SSL証明書エラーを ssl_verify: false で回避可能（Seesaa の証明書問題）
  - description にテキストで釣果が記載されているパターンに対応
"""
import re
from datetime import datetime, timedelta
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from handlers.base    import BaseHandler
from utils.fetch      import HEADERS, REQUEST_TIMEOUT, fetch_html
from utils.normalizer import normalize_num, parse_date_jp, parse_count, parse_size

import requests

DAYS_WINDOW = 7


class RssHandler(BaseHandler):

    def fetch_raw(self, shipyard: dict) -> str:
        config     = shipyard.get("scrape_config") or {}
        base_url   = shipyard["url"].rstrip("/")
        feed_path  = config.get("feed_path", "/feed/")
        ssl_verify = config.get("ssl_verify", True)

        # feed_url が直接指定されている場合
        feed_url = config.get("feed_url") or urljoin(base_url + "/", feed_path.lstrip("/"))

        resp = requests.get(
            feed_url, headers=HEADERS, timeout=REQUEST_TIMEOUT, verify=ssl_verify
        )
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        return resp.text

    def parse(self, raw: str, shipyard: dict) -> list[dict]:
        soup    = BeautifulSoup(raw, "xml")
        records = []
        cutoff  = (datetime.now() - timedelta(days=DAYS_WINDOW)).date()

        for item in soup.find_all("item"):
            # 日付
            pub     = item.find("pubDate") or item.find("dc:date")
            pub_str = pub.get_text(strip=True) if pub else ""
            date_str = self._parse_date(pub_str)

            try:
                if date_str and datetime.fromisoformat(date_str).date() < cutoff:
                    continue
            except ValueError:
                pass

            # タイトルで釣果記事を絞り込む（「釣果」「漁獲」等を含む）
            title_el = item.find("title")
            title    = title_el.get_text(strip=True) if title_el else ""
            subject  = (item.find("dc:subject") or item.find("category"))
            subject_text = subject.get_text(strip=True) if subject else ""

            is_catch = any(k in (title + subject_text) for k in
                           ["釣果", "漁獲", "チョカ", "ちょか"])
            if not is_catch:
                continue

            # 本文取得（content:encoded > description）
            content_tag = item.find("content:encoded") or item.find("description")
            content     = content_tag.get_text("\n", strip=True) if content_tag else ""

            details = self._extract_details(content)
            if not details:
                continue

            counts = [d["count"] for d in details if d.get("count")]
            records.append({
                "date":           date_str or parse_date_jp(normalize_num(title)),
                "boat_name":      self._extract_boat_name(title),
                "count_min":      None,
                "count_max":      max(counts) if counts else None,
                "condition_text": content[:300] or None,
                "details":        details,
            })

        return records

    def _extract_details(self, text: str) -> list[dict]:
        """フリーテキストから魚種・サイズ・数量を抽出"""
        details = []
        text    = normalize_num(text)

        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue

            # パターン: "アジ 17-28cm 56-77匹"
            m = re.match(
                r"([^\d\s\-～【】]{1,10})\s+"
                r"([\d.]+[^\d\s]*[\d.]+\s*(?:cm|kg))?\s*"
                r"([\d]+[^\d]*[\d]+\s*(?:匹|本|尾|杯))?",
                line
            )
            if m and m.group(1) and (m.group(2) or m.group(3)):
                fish = m.group(1).strip("【】「」（）()・、。")
                if not fish or len(fish) > 8:
                    continue
                _, count_max = parse_count(m.group(3) or "")
                details.append({
                    "species_name":     fish,
                    "species_name_raw": fish,
                    "count":            count_max,
                    "unit":             "尾",
                    "size_text":        parse_size(m.group(2) or ""),
                })

        return details

    def _extract_boat_name(self, title: str) -> str | None:
        """タイトルから「午前○○船」等の便名を抽出"""
        m = re.search(r"(午前|午後|早朝|夕方)?[^\d]{2,10}(船|便|乗合)", title)
        if m:
            return m.group(0)
        return None

    def _parse_date(self, text: str) -> str | None:
        m = re.match(r"(\d{4}-\d{2}-\d{2})", text)
        if m:
            return m.group(1)
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(text).strftime("%Y-%m-%d")
        except Exception:
            return parse_date_jp(text)
