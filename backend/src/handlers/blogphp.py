"""
blog.php 独自CMS ハンドラー（6件対応）

確認済みHTML構造（6サイト完全共通）:
  article.mainArea
    section.frame（1日1セクション）
      time              ← 日付「2026年3月30日(月)」
      div.frame-inner
        table.blog_tabel
          thead > tr.check_table > th（釣りもの/大きさ/匹数/詳細）
          tbody > tr
            th[0] ← 魚種
            th[1] ← サイズ
            th[2] ← 数量
            th.details ← 【水深】【水温】【船長】
"""
import re

from bs4 import BeautifulSoup

from handlers.base    import BaseHandler
from utils.fetch      import fetch_html
from utils.normalizer import normalize_num, parse_date_jp, parse_count, parse_size


class BlogPhpHandler(BaseHandler):

    def fetch_raw(self, shipyard: dict) -> str:
        return fetch_html(shipyard["url"])

    def parse(self, raw: str, shipyard: dict) -> list[dict]:
        soup    = BeautifulSoup(raw, "html.parser")
        records = []

        for section in soup.find_all("section", class_="frame"):
            time_el = section.find("time")
            if not time_el:
                continue

            date_str = parse_date_jp(time_el.get_text(strip=True))

            for table in section.find_all("table", class_="blog_tabel"):
                # テーブルの前にある見出しを boat_name として使う
                boat_name = self._find_boat_name(table)
                details   = []
                condition_parts = []

                for tbody in table.find_all("tbody"):
                    row = tbody.find("tr")
                    if not row:
                        continue
                    cells = row.find_all("th")
                    if len(cells) < 2:
                        continue

                    fish      = normalize_num(cells[0].get_text(strip=True))
                    size_raw  = normalize_num(cells[1].get_text(strip=True)) if len(cells) > 1 else ""
                    count_raw = normalize_num(cells[2].get_text(strip=True)) if len(cells) > 2 else ""
                    detail_text = cells[3].get_text(" ", strip=True) if len(cells) > 3 else ""

                    if not fish or fish in ("釣りもの",):
                        continue

                    count_min, count_max = parse_count(count_raw)

                    details.append({
                        "species_name":     fish,
                        "species_name_raw": fish,
                        "count":            count_max,
                        "unit":             "尾",
                        "size_text":        parse_size(size_raw),
                    })

                    if detail_text:
                        condition_parts.append(detail_text)

                if not details:
                    continue

                counts    = [d["count"] for d in details if d.get("count")]
                count_max = max(counts) if counts else None

                records.append({
                    "date":           date_str,
                    "boat_name":      boat_name,
                    "count_min":      None,
                    "count_max":      count_max,
                    "condition_text": " / ".join(condition_parts)[:300] or None,
                    "details":        details,
                })

        return records

    def _find_boat_name(self, table) -> str | None:
        """テーブル直前の見出しタグ（h2-h4, p等）を探す"""
        for sib in table.find_previous_siblings():
            tag  = sib.name
            text = sib.get_text(strip=True)
            if tag in ("h2", "h3", "h4") and text:
                return text
            if tag == "p" and text and len(text) < 40:
                return text
            # frame-inner に入ったら終了
            if sib.get("class") and "frame-inner" in (sib.get("class") or []):
                break
        return None
