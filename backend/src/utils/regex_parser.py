from __future__ import annotations
"""
共通正規表現パーサー

船宿ページのフリーテキストから釣果情報を正規表現で抽出する。
gyosan.py / rss.py のパターンを統合し、claude_handler.py の
正規表現優先パースでも使用する。

対応パターン:
  定量: "アジ 23-37cm 16-49匹"  → count=49, detail_type="catch"
  定量: "タチウオ 60-90cm 0-32本" → count=32, detail_type="catch"
  定性: "マダイが好調！"          → count=None, detail_type="note"
  定性: "ポツポツ"               → count=None, detail_type="note"
"""
import re
from datetime import datetime, timedelta
from typing import Optional

from utils.normalizer import normalize_num, parse_count, parse_size, parse_date_jp

# ── 定数 ────────────────────────────────────────────────────────────────────────

# 魚種名として除外するキーワード
SKIP_WORDS = frozenset({
    "船長", "コメント", "ポイント", "水深", "水温", "釣り場",
    "外道", "詳細", "釣果", "天気", "気温", "潮", "風",
    "出船", "沖上がり", "乗船", "定員", "仕掛け", "エサ",
    "posted", "by", "am", "pm", "http", "https",
    # 場所名・テクニック名（誤認防止）
    "ショート", "ロング", "テンヤ", "天秤", "コマセ", "ジグ",
    "午前", "午後", "早朝", "別船", "乗合",
    "沖", "浜", "港", "崎", "島", "丸",
})

# 数量の単位
_UNIT_RE = re.compile(r"(匹|本|尾|杯|枚|kg)")

# ── 同一行パターン ──────────────────────────────────────────────────────────────
# "アジ 23-37cm 16-49匹"
# "マダイ 1.2-2.5kg 0-3枚"
# "タチウオ 32本"（サイズなし）
_LINE_QUANT_RE = re.compile(
    r"^([^\d\s\-～~]{1,12})\s+"                          # 魚種名（非数字・非空白、1-12文字）
    r"(?:([\d.]+\s*[～~\-]\s*[\d.]+\s*(?:cm|kg|g|m))\s*)?" # サイズ（任意）
    r"([\d]+\s*[～~\-]\s*[\d]+\s*(?:匹|本|尾|杯|枚))"     # 数量（必須）
)

# "アジ 43匹"（単一数値）
_LINE_SINGLE_COUNT_RE = re.compile(
    r"^([^\d\s\-～~]{1,12})\s+"
    r"(?:([\d.]+\s*[～~\-]\s*[\d.]+\s*(?:cm|kg|g|m))\s*)?"
    r"([\d]+\s*(?:匹|本|尾|杯|枚))"
)

# "アジ 23-37cm"（サイズのみ、数量なし）
_LINE_SIZE_ONLY_RE = re.compile(
    r"^([^\d\s\-～~]{1,12})\s+"
    r"([\d.]+\s*[～~\-]\s*[\d.]+\s*(?:cm|kg|g|m))"
)

# ── 定性パターン（釣れた情報だが数量なし）─────────────────────────────────────
# 魚種名として有効なのは主にカタカナ・漢字2-6文字
_FISH_NAME_RE = r"([ァ-ヶー\u4e00-\u9fff]{2,6})"
_QUALITATIVE_PATTERNS = [
    re.compile(_FISH_NAME_RE + r"(?:が|も)\s*(?:釣れ|ヒット|上がり|混じ|交じ)"),
    re.compile(_FISH_NAME_RE + r"\s*(?:ポツポツ|パラパラ|ちらほら|ぼちぼち)"),
    re.compile(r"(?:ポツポツ|パラパラ|ちらほら)\s*" + _FISH_NAME_RE),
    re.compile(_FISH_NAME_RE + r"\s*(?:好調|絶好調|爆釣)"),
]

# ── 船長コメント除外マーカー ────────────────────────────────────────────────────
_COMMENT_MARKERS = ["船長コメント", "釣り場と水深", "コメント：", "コメント:"]


def extract_catch_details(
    text: str,
    *,
    skip_comment: bool = True,
    include_qualitative: bool = True,
) -> list[dict]:
    """
    フリーテキストから釣果詳細を抽出する。

    Args:
        text: 船宿ページのテキスト（HTML除去済み）
        skip_comment: 船長コメント以降を除外するか
        include_qualitative: 定性パターンも抽出するか

    Returns:
        [
            {
                "species_name": "アジ",
                "species_name_raw": "アジ",
                "count": 49,
                "unit": "尾",
                "size_text": "23-37cm",
                "detail_type": "catch",
            },
            {
                "species_name": "マダイ",
                "species_name_raw": "マダイが釣れました",
                "count": None,
                "unit": "尾",
                "size_text": None,
                "detail_type": "note",
            },
        ]
    """
    text = normalize_num(text)

    # 船長コメント以降を除外
    if skip_comment:
        for marker in _COMMENT_MARKERS:
            idx = text.find(marker)
            if idx != -1:
                text = text[:idx]

    lines = [l.strip() for l in text.splitlines()]
    details: list[dict] = []
    seen_species: set[str] = set()

    i = 0
    while i < len(lines):
        line = lines[i]
        if not line or len(line) < 2:
            i += 1
            continue

        # スキップキーワード
        if _should_skip(line):
            i += 1
            continue

        # パターン1: 同一行に魚種+数量（範囲）
        m = _LINE_QUANT_RE.match(line)
        if m:
            d = _build_detail(m.group(1), m.group(2), m.group(3))
            if d and d["species_name"] not in seen_species:
                details.append(d)
                seen_species.add(d["species_name"])
            i += 1
            continue

        # パターン2: 同一行に魚種+数量（単一）
        m = _LINE_SINGLE_COUNT_RE.match(line)
        if m:
            d = _build_detail(m.group(1), m.group(2), m.group(3))
            if d and d["species_name"] not in seen_species:
                details.append(d)
                seen_species.add(d["species_name"])
            i += 1
            continue

        # パターン3: 同一行に魚種+サイズのみ
        m = _LINE_SIZE_ONLY_RE.match(line)
        if m:
            d = _build_detail(m.group(1), m.group(2), None)
            if d and d["species_name"] not in seen_species:
                details.append(d)
                seen_species.add(d["species_name"])
            i += 1
            continue

        # パターン4: 魚種名のみの行 → 次の行にサイズ/数量
        is_fish_only = re.match(r"^[^\d\s]{1,12}$", line) and not re.search(r"\d", line)
        if is_fish_only and not _should_skip(line):
            d = _try_multiline(line, lines, i)
            if d and d["species_name"] not in seen_species:
                details.append(d)
                seen_species.add(d["species_name"])
                # consumed lines を進める
                i = d.pop("_next_i", i + 1)
                continue

        i += 1

    # 定性パターン（定量で未抽出の魚種のみ）
    if include_qualitative:
        full_text = "\n".join(lines)
        for pat in _QUALITATIVE_PATTERNS:
            for m in pat.finditer(full_text):
                fish = _clean_fish_name(m.group(1))
                if fish and fish not in seen_species and not _should_skip(fish):
                    details.append({
                        "species_name": fish,
                        "species_name_raw": m.group(0).strip(),
                        "count": None,
                        "unit": "尾",
                        "size_text": None,
                        "detail_type": "note",
                    })
                    seen_species.add(fish)

    return details


def extract_date_from_text(text: str) -> Optional[str]:
    """テキストから日付を抽出する"""
    text = normalize_num(text)
    return parse_date_jp(text)


def extract_boat_name(text: str) -> Optional[str]:
    """テキストから便名を抽出する"""
    m = re.search(r"(午前|午後|早朝|夕方)?[^\d]{2,10}(船|便|乗合)", text)
    if m:
        return m.group(0)
    return None


def extract_condition(text: str) -> Optional[str]:
    """テキストから船長コメントを抽出する"""
    text = normalize_num(text)
    m = re.search(r"船長コメント[：:]\s*(.+)", text, re.DOTALL)
    if m:
        return m.group(1).strip()[:300]
    return None


# ── 内部ヘルパー ────────────────────────────────────────────────────────────────

def _should_skip(line: str) -> bool:
    """スキップすべき行かどうか"""
    lower = line.lower().strip()
    for skip in SKIP_WORDS:
        if skip in lower:
            return True
    # URL
    if lower.startswith("http"):
        return True
    return False


def _clean_fish_name(name: str) -> Optional[str]:
    """魚種名をクリーンアップ"""
    name = name.strip("【】「」（）()・、。≪≫《》 ")
    if not name or len(name) > 10:
        return None
    # 数字を含む場合はスキップ
    if re.search(r"\d", name):
        return None
    if _should_skip(name):
        return None
    # 地名パターン（〜沖、〜港、〜崎 等で終わる）
    if re.search(r"(?:沖|港|崎|島|浜|丸|湾|岬|灯台|堤防|磯)$", name):
        return None
    # 「〜」を含む（「鴨居〜」「〜久里浜沖」等の地名結合）
    if "〜" in name or "～" in name:
        return None
    # 「船」「便」で終わる（「マダイ五目船」等）
    if re.search(r"(?:船|便|乗合)$", name):
        return None
    # ひらがな・句読点のみ（「です」「ました」等の文断片）
    if re.fullmatch(r"[ぁ-ん、。！？\s]+", name):
        return None
    # 「他」で始まる（「他クロダイ、アジ」等）
    if name.startswith("他"):
        return None
    # 文末表現を含む（「です」「ました」「ますよ」等）
    if re.search(r"(?:です|ます|ました|ません|ですよ|ますよ|!!|！！)", name):
        return None
    # 括弧を含む（「金)にて」等の壊れたテキスト）
    if re.search(r"[())\]）]", name):
        return None
    return name


def _detect_unit(text: str) -> str:
    """テキストから単位を検出"""
    if not text:
        return "尾"
    m = _UNIT_RE.search(text)
    if m:
        unit = m.group(1)
        if unit in ("匹", "本", "尾", "杯", "枚"):
            return unit
    return "尾"


def _build_detail(
    fish_raw: str,
    size_raw: Optional[str],
    count_raw: Optional[str],
) -> Optional[dict]:
    """魚種名・サイズ・数量から detail dict を構築"""
    fish = _clean_fish_name(fish_raw)
    if not fish:
        return None

    size_text = parse_size(size_raw) if size_raw else None
    count_max = None
    unit = "尾"

    if count_raw:
        _, count_max = parse_count(count_raw)
        unit = _detect_unit(count_raw)

    return {
        "species_name": fish,
        "species_name_raw": fish,
        "count": count_max,
        "unit": unit,
        "size_text": size_text,
        "detail_type": "catch",
    }


def _try_multiline(
    fish_line: str,
    lines: list[str],
    start_i: int,
) -> Optional[dict]:
    """
    魚種名のみの行から、後続行のサイズ/数量を結合して抽出する。
    gyosan CMS の改行分断パターン対応。
    """
    collected: list[str] = []
    j = start_i + 1
    while j < min(start_i + 8, len(lines)):
        if lines[j]:
            collected.append(lines[j])
            # 単位が出たら終端
            if re.search(r"匹|本|尾|杯|枚", lines[j]):
                j += 1
                break
        j += 1

    if not collected:
        return None

    # ハイフン末尾行（"55-"）と次の行（"65 cm"）を直結
    merged_parts: list[str] = []
    for part in collected:
        if merged_parts and merged_parts[-1].rstrip().endswith("-"):
            merged_parts[-1] = merged_parts[-1] + part
        else:
            merged_parts.append(part)
    merged = " ".join(merged_parts)

    # サイズ+数量 or 数量のみを探す
    m = re.search(
        r"([\d.]+[^\d\s]*[\d.]+\s*(?:cm|kg|g))?"
        r"[\s　]*([\d]+[^\d]*[\d]+\s*(?:匹|本|尾|杯|枚))",
        merged
    )
    if m:
        fish = _clean_fish_name(fish_line)
        if not fish:
            return None
        size_raw = (m.group(1) or "").strip()
        count_raw = (m.group(2) or "").strip()
        _, count_max = parse_count(count_raw)
        d = {
            "species_name": fish,
            "species_name_raw": fish,
            "count": count_max,
            "unit": _detect_unit(count_raw),
            "size_text": parse_size(size_raw) if size_raw else None,
            "detail_type": "catch",
            "_next_i": j,
        }
        return d

    return None
