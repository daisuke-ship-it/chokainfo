from __future__ import annotations
"""
zekkouchou (釣割系 CMS) ハンドラー

釣果データは船宿サイトの静的 JS ファイルに JSON として埋め込まれている:
  {domain}/site_common/assets/js/choka_{site_no}-3.js

JS 内容:
  var choka_data=[{
    "choka_no": "5204962",
    "choka_date": "04/04",
    "choka_comment": "サバ、カイワリ、イトヨリまじる。",
    "choka_fish": [
      {"name": "アジ", "size": "26&nbsp;-&nbsp;43&nbsp;cm", "count": "0&nbsp;-&nbsp;13&nbsp;匹"},
      ...
    ],
    "choka_img": "https://www.chowari.jp/choka_img/m/5204962_1.jpg",
    "choka_title": ""
  }, ...]

scrape_config 例:
  {"handler": "zekkouchou", "site_no": 426}
"""
import json
import re
from datetime import datetime, timedelta

import requests

from handlers.base import BaseHandler
from utils.fetch import HEADERS, REQUEST_TIMEOUT
from utils.normalizer import parse_count, parse_size

DAYS_WINDOW = 7


class ZekkouchouHandler(BaseHandler):

    def fetch_raw(self, shipyard: dict) -> str:
        config = shipyard.get("scrape_config") or {}
        site_no = config.get("site_no")
        if not site_no:
            raise ValueError("scrape_config に site_no が必要です")

        url = shipyard.get("url", "").rstrip("/")
        # JS パスはサイトごとに異なる場合がある
        js_path = config.get("js_path", f"/site_common/assets/js/choka_{site_no}-3.js")
        js_url = f"{url}{js_path}"

        resp = requests.get(js_url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        return resp.text

    def parse(self, raw: str, shipyard: dict) -> list[dict]:
        # JS: var choka_data=[...]; → JSON 部分を抽出
        m = re.search(r"var\s+choka_data\s*=\s*(\[.*\])", raw, re.DOTALL)
        if not m:
            return []

        data = json.loads(m.group(1))
        now = datetime.now()
        year = now.year
        cutoff = (now - timedelta(days=DAYS_WINDOW)).date()
        records = []

        for entry in data:
            # 日付: "04/04" → YYYY-MM-DD
            date_str = entry.get("choka_date", "")
            sail_date = self._resolve_date(date_str, year)
            if not sail_date:
                continue
            try:
                if datetime.fromisoformat(sail_date).date() < cutoff:
                    continue
            except ValueError:
                pass

            comment = entry.get("choka_comment", "")
            fish_list = entry.get("choka_fish", [])
            details = []

            for fish in fish_list:
                name = self._clean_nbsp(fish.get("name", ""))
                if not name:
                    continue

                size_raw = self._clean_nbsp(fish.get("size", ""))
                count_raw = self._clean_nbsp(fish.get("count", ""))

                _, count_max = parse_count(count_raw)

                details.append({
                    "species_name": name,
                    "species_name_raw": name,
                    "count": count_max,
                    "unit": "尾",
                    "size_text": parse_size(size_raw) if size_raw else None,
                })

            if not details:
                continue

            counts = [d["count"] for d in details if d.get("count")]
            records.append({
                "date": sail_date,
                "boat_name": None,
                "count_min": None,
                "count_max": max(counts) if counts else None,
                "condition_text": comment or None,
                "details": details,
            })

        return records

    @staticmethod
    def _clean_nbsp(text: str) -> str:
        """&nbsp; や HTML エンティティを除去"""
        return (
            text.replace("&nbsp;", " ")
                .replace("\u00a0", " ")
                .replace("&amp;", "&")
                .strip()
        )

    @staticmethod
    def _resolve_date(date_str: str, current_year: int) -> str | None:
        """'04/04' → '2026-04-04' (年またぎ考慮)"""
        m = re.match(r"(\d{1,2})/(\d{1,2})", date_str)
        if not m:
            return None
        month, day = int(m.group(1)), int(m.group(2))
        try:
            d = datetime(current_year, month, day).date()
            # 未来の日付なら前年
            if d > datetime.now().date() + timedelta(days=1):
                d = datetime(current_year - 1, month, day).date()
            return d.isoformat()
        except ValueError:
            return None
