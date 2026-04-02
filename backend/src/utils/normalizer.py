from __future__ import annotations
"""日付・数量・魚種名 の正規化ユーティリティ"""
import re
import unicodedata
from datetime import datetime
from typing import Optional


# ── 日付パース ────────────────────────────────────────────────────────────────

def parse_date_jp(text: str) -> Optional[str]:
    """
    日本語日付文字列を YYYY-MM-DD に変換。

    対応パターン:
      "2026年3月30日(月)"  → "2026-03-30"
      "3月30日"            → "<今年>-03-30"
      "03月30日釣果"       → "<今年>-03-30"
    """
    text = normalize_num(text)
    # YYYY年M月D日
    m = re.search(r"(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日", text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    # M月D日（年なし）
    m = re.search(r"(\d{1,2})月\s*(\d{1,2})日", text)
    if m:
        year = datetime.now().year
        return f"{year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return None


# ── 数値正規化 ────────────────────────────────────────────────────────────────

def normalize_num(text: str) -> str:
    """全角数字・記号を半角に変換する"""
    return unicodedata.normalize("NFKC", text)


def parse_count(text: str) -> tuple[Optional[int], Optional[int]]:
    """
    "0～20匹" → (0, 20)
    "43尾"    → (None, 43)
    "0-20"    → (0, 20)
    """
    text = normalize_num(text)
    m = re.search(r"(\d+)\s*[～~\-]\s*(\d+)", text)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"(\d+)", text)
    if m:
        return None, int(m.group(1))
    return None, None


def parse_size(text: str) -> Optional[str]:
    """
    "23-37cm" / "0.3～2.6kg" などをそのまま正規化して返す。
    数字がなければ None。
    """
    text = normalize_num(text).strip()
    if re.search(r"\d", text):
        return text
    return None


# ── 魚種・釣り方マッチング ─────────────────────────────────────────────────────

def match_fish_species(fish_name: Optional[str], species_list: list[dict]) -> Optional[int]:
    if not fish_name:
        return None
    needle = fish_name.lower()
    for sp in species_list:
        if needle in (sp.get("name") or "").lower():
            return sp["id"]
        aliases = sp.get("aliases") or []
        if isinstance(aliases, str):
            import json
            try:
                aliases = json.loads(aliases)
            except Exception:
                aliases = [aliases]
        for alias in aliases:
            if alias.lower() in needle or needle in alias.lower():
                return sp["id"]
    return None


def match_fishing_method(method_text: Optional[str], methods_list: list[dict]) -> Optional[int]:
    if not method_text:
        return None
    needle = method_text.lower()
    for m in methods_list:
        name = (m.get("name") or "").lower()
        if name and (name in needle or needle in name):
            return m["id"]
    return None
