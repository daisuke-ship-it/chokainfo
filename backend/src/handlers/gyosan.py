from __future__ import annotations
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
        """
        ChokaDetail ページ構造:
          <h2>2026年04月01日</h2>
          <div class="blog-top"><h3 class="title">船名</h3></div>
          <div class="blog-middle">魚種\nサイズ　数量\n船長コメント：...</div>
          <div class="blog-bottom">posted by ...</div>
        """
        soup     = BeautifulSoup(html, "html.parser")
        records  = []

        # 日付
        h2       = soup.find("h2")
        date_str = parse_date_jp(h2.get_text()) if h2 else None

        # blog-top / blog-middle のペアを処理
        blog_tops = soup.find_all("div", class_="blog-top")
        if blog_tops:
            for top in blog_tops:
                h3        = top.find("h3")
                boat_name = h3.get_text(strip=True) if h3 else None

                # 直後の blog-middle を取得
                middle = top.find_next_sibling("div", class_="blog-middle")
                if not middle:
                    continue
                block_text = middle.get_text("\n")
                details    = self._extract_details_from_text(block_text)
                if not details:
                    continue

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

        # フォールバック: blog-top なし → ページ全体テキストから抽出
        details = self._extract_details_from_text(soup.get_text("\n"))
        if details:
            counts = [d["count"] for d in details if d.get("count")]
            records.append({
                "date":           date_str,
                "boat_name":      None,
                "count_min":      None,
                "count_max":      max(counts) if counts else None,
                "condition_text": None,
                "details":        details,
            })
        return records

    def _extract_details_from_text(self, text: str) -> list[dict]:
        """
        gyosan.jp の blog-middle テキストから釣果詳細を抽出する。

        2パターンに対応:
          A) 同一行: "アジ 23-37cm 16-49匹"
          B) 複数行: 行1="トラフグ"  行2="2.0-3.5 kg　0-1 匹"
             gyosan CMS はサイズ・数量を改行で分断することがある:
               "55-" / "65 cm" / "5-" / "27 匹"
             → 隣接行を結合してパースする。
        船長コメント以降はパース対象外。
        """
        details = []
        text    = normalize_num(text)

        # 船長コメント以降を除外
        for marker in ("船長コメント", "釣り場と水深"):
            idx = text.find(marker)
            if idx != -1:
                text = text[:idx]

        lines   = [l.strip() for l in text.splitlines()]

        i = 0
        while i < len(lines):
            line = lines[i]
            if not line or len(line) < 2:
                i += 1
                continue

            # スキップキーワード
            if any(skip in line for skip in _FISH_SKIP):
                i += 1
                continue

            # パターン A: 同一行に魚種+サイズ+数量
            m_a = re.match(
                r"^([^\d\s]+?)\s+"
                r"([\d.]+[^\d\s]*[\d.]+\s*(?:cm|kg|g))?\s*"
                r"([\d]+[^\d]*[\d]+\s*(?:匹|本|尾|杯))",
                line
            )
            if m_a:
                fish      = m_a.group(1).strip("【】「」（）()・")
                size_raw  = (m_a.group(2) or "").strip()
                count_raw = (m_a.group(3) or "").strip()
                count_min, count_max = parse_count(count_raw)
                details.append({
                    "species_name":     fish,
                    "species_name_raw": fish,
                    "count":            count_max,
                    "unit":             self._detect_unit(count_raw),
                    "size_text":        parse_size(size_raw) if size_raw else None,
                })
                i += 1
                continue

            # パターン B: この行が魚種名のみ → 近傍行にサイズ/数量
            is_fish_only = re.match(r"^[^\d\s]{1,10}$", line) and not re.search(r"\d", line)
            if is_fish_only:
                # 改行分断を結合: 空行をスキップして非空行を集め、1行にまとめてパース
                collected: list[str] = []
                j = i + 1
                while j < min(i + 10, len(lines)):
                    if lines[j]:
                        collected.append(lines[j])
                        # 「匹|本|尾|杯」が出たら終端
                        if re.search(r"匹|本|尾|杯", lines[j]):
                            j += 1
                            break
                    j += 1

                # ハイフン末尾行（"55-"）と次の行（"65 cm"）を直結
                merged_parts: list[str] = []
                for part in collected:
                    if merged_parts and merged_parts[-1].endswith("-"):
                        merged_parts[-1] = merged_parts[-1] + part
                    else:
                        merged_parts.append(part)
                merged = " ".join(merged_parts)
                m_b = re.search(
                    r"([\d.]+[^\d\s]*[\d.]+\s*(?:cm|kg|g))?"
                    r"[\s　]*([\d]+[^\d]*[\d]+\s*(?:匹|本|尾|杯))",
                    merged
                )
                if m_b:
                    fish      = line.strip("【】「」（）()・")
                    size_raw  = (m_b.group(1) or "").strip()
                    count_raw = (m_b.group(2) or "").strip()
                    count_min, count_max = parse_count(count_raw)
                    details.append({
                        "species_name":     fish,
                        "species_name_raw": fish,
                        "count":            count_max,
                        "unit":             self._detect_unit(count_raw),
                        "size_text":        parse_size(size_raw) if size_raw else None,
                    })
                    i = j
                else:
                    i += 1
                continue

            i += 1

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
