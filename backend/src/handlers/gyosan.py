"""
gyosan.jp CMS ハンドラー（24件対応）

URL構造:
  一覧: {base}/category/Choka/  または scrape_config.list_path 指定
  詳細: {base}/search/ChokaDetail/{id}/

ChokaDetail ページ構造:
  <h2>2026年04月01日</h2>
  <h3>ショートアジ船</h3>
  アジ 23-37cm 16-49匹
  ...
"""
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from handlers.base       import BaseHandler
from utils.fetch         import fetch_html
from utils.normalizer    import normalize_num, parse_date_jp, parse_count, parse_size

# 1ページあたり取得する最新釣果ID数（スキップ済みは DB で除外）
MAX_DETAIL_PAGES = 10

# 魚種・サイズ・数量を一行から抽出するパターン群
# 例: "アジ 23-37cm 16-49匹"  "タチウオ 60-90cm 0-32本"
_CATCH_LINE_RE = re.compile(
    r"([^\s\d]+)\s+"          # 魚種名
    r"([\d.]+[^\d\s]*[\d.]+\s*(?:cm|kg|g))?"  # サイズ（任意）
    r"\s*([\d]+[^\d]*[\d]+\s*(?:匹|本|尾|杯))?"  # 数量（任意）
)
_COUNT_ONLY_RE = re.compile(r"([\d]+)\s*[^\d]*\s*([\d]+)\s*(?:匹|本|尾|杯)")
_FISH_SKIP = {"船長", "コメント", "ポイント", "水深", "水温", "釣り場", "外道", "詳細", "釣果"}


class GyosanHandler(BaseHandler):

    def fetch_raw(self, shipyard: dict) -> str:
        base_url    = shipyard.get("url", "")
        config      = shipyard.get("scrape_config") or {}
        list_path   = config.get("list_path", "/category/Choka/")

        # URLからベースを組み立てる（shipyard.url が個別ページを指している場合も考慮）
        parsed   = urlparse(base_url)
        base     = f"{parsed.scheme}://{parsed.netloc}"
        list_url = urljoin(base, list_path)

        html = fetch_html(list_url)
        return html

    def parse(self, raw: str, shipyard: dict) -> list[dict]:
        parsed   = urlparse(shipyard.get("url", ""))
        base     = f"{parsed.scheme}://{parsed.netloc}"
        soup     = BeautifulSoup(raw, "html.parser")

        # ChokaDetail ID を一覧ページから抽出
        detail_links = soup.find_all("a", href=re.compile(r"/search/ChokaDetail/(\d+)/"))
        seen_ids: set[str] = set()
        ordered_ids: list[str] = []
        for a in detail_links:
            m = re.search(r"/search/ChokaDetail/(\d+)/", a["href"])
            if m:
                cid = m.group(1)
                if cid not in seen_ids:
                    seen_ids.add(cid)
                    ordered_ids.append(cid)

        records: list[dict] = []
        for cid in ordered_ids[:MAX_DETAIL_PAGES]:
            detail_url = f"{base}/search/ChokaDetail/{cid}/"
            try:
                detail_html = fetch_html(detail_url)
                recs        = self._parse_detail(detail_html, detail_url)
                records.extend(recs)
            except Exception as e:
                self.logger.warning(f"  ChokaDetail/{cid} 取得失敗: {e}")

        return records

    # ── 内部メソッド ──────────────────────────────────────────────────────────

    def _parse_detail(self, html: str, source_url: str) -> list[dict]:
        soup    = BeautifulSoup(html, "html.parser")
        records = []

        # 日付
        h2      = soup.find("h2")
        date_str = parse_date_jp(h2.get_text()) if h2 else None

        # h3 ブロックを船種として扱う
        # h3 が複数ある場合は複数の boat_name に分ける
        h3_list = soup.find_all("h3")

        if not h3_list:
            # h3 なし: ページ全体を1レコードとして扱う
            details = self._extract_details_from_text(soup.get_text("\n"))
            if details:
                records.append({
                    "date":           date_str,
                    "boat_name":      None,
                    "count_min":      None,
                    "count_max":      None,
                    "condition_text": None,
                    "details":        details,
                })
            return records

        for h3 in h3_list:
            boat_name = h3.get_text(strip=True)
            # h3 直後のテキストノードを収集（次の h3 または h2 まで）
            text_lines = []
            for sibling in h3.next_siblings:
                if sibling.name in ("h3", "h2"):
                    break
                if hasattr(sibling, "get_text"):
                    text_lines.append(sibling.get_text("\n"))
                elif isinstance(sibling, str):
                    text_lines.append(sibling)

            block_text = "\n".join(text_lines)
            details    = self._extract_details_from_text(block_text)
            if not details:
                continue

            # 数量の集計（全魚種の最大数をトップレベルに）
            counts    = [d["count"] for d in details if d.get("count")]
            count_max = max(counts) if counts else None

            records.append({
                "date":           date_str,
                "boat_name":      boat_name,
                "count_min":      None,
                "count_max":      count_max,
                "condition_text": self._extract_condition(block_text),
                "details":        details,
            })

        return records

    def _extract_details_from_text(self, text: str) -> list[dict]:
        details = []
        text    = normalize_num(text)

        for line in text.splitlines():
            line = line.strip()
            if not line or len(line) < 2:
                continue

            # スキップキーワード
            if any(skip in line for skip in _FISH_SKIP):
                continue

            # 魚種 + サイズ + 数量のパターン
            # 例: "アジ 23-37cm 16-49匹"
            m = re.match(
                r"^([^\d\s]+)\s+"
                r"([\d.]+[^\d\s]*[\d.]+\s*(?:cm|kg|g))?\s*"
                r"([\d]+[^\d]*[\d]+\s*(?:匹|本|尾|杯))?",
                line
            )
            if not m or not m.group(1):
                continue

            fish = m.group(1).strip("【】「」（）()・")
            if len(fish) < 1 or fish.isdigit():
                continue

            size_raw  = (m.group(2) or "").strip()
            count_raw = (m.group(3) or "").strip()

            # 数量が取れなければ行全体から探す
            if not count_raw:
                cm = re.search(r"(\d+)[^\d]*(\d+)\s*(?:匹|本|尾|杯)", line)
                if cm:
                    count_raw = cm.group(0)

            count_min, count_max = parse_count(count_raw) if count_raw else (None, None)

            details.append({
                "species_name":     fish,
                "species_name_raw": fish,
                "count":            count_max,
                "unit":             self._detect_unit(count_raw or line),
                "size_text":        parse_size(size_raw) if size_raw else None,
            })

        return details

    def _detect_unit(self, text: str) -> str:
        if re.search(r"杯", text):  return "杯"
        if re.search(r"kg|g",  text, re.I): return "尾"
        return "尾"

    def _extract_condition(self, text: str) -> str | None:
        text = normalize_num(text)
        m    = re.search(r"船長コメント[：:]\s*(.+)", text, re.DOTALL)
        if m:
            return m.group(1).strip()[:300]
        return None
