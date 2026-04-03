from __future__ import annotations
"""日付・数量・魚種名・シグナル の正規化ユーティリティ"""
import json
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


# ── 魚種・釣り方マッチング（旧 API — 後方互換）──────────────────────────────

def match_fish_species(fish_name: Optional[str], species_list: list[dict]) -> Optional[int]:
    if not fish_name:
        return None
    needle = fish_name.lower()
    for sp in species_list:
        if needle in (sp.get("name") or "").lower():
            return sp["id"]
        aliases = sp.get("aliases") or []
        if isinstance(aliases, str):
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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# v2: 魚種正規化 + 定性シグナル抽出
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ── 括弧内サイズ抽出パターン ──────────────────────────────────────────────────

# 全角・半角括弧内にサイズ情報（数値+単位）が含まれるパターン
_RE_PAREN_SIZE = re.compile(
    r"[\uff08(][^\uff09)]*?\d+\.?\d*\s*(?:cm|kg|m|号|本)[^\uff09)]*?[\uff09)]"
)
# 任意の括弧
_RE_PAREN_ANY = re.compile(r"[\uff08(][^\uff09)]+[\uff09)]")

# ── 「魚名っぽくない」判定パターン ────────────────────────────────────────────

_NOT_FISH_PATTERNS = [
    re.compile(r"(?:です|ます|ました|ません|よ！|ね！|ください)"),  # 文末表現
    re.compile(r"(?:率|割|％|%)"),        # 統計表現（白子率など）
    re.compile(r"(?:募集|受付|予約|お問|連絡|電話)"),  # 事務連絡
    re.compile(r"(?:休船|定休|欠航|中止)"),  # 運航情報
]


def normalize_species(raw: str, species_list: list[dict]) -> dict:
    """
    船宿の生テキストを正規化する。

    入力例と出力:
      "サワラ"           → {species_name: "サワラ", fish_species_id: 12, detail_type: "catch"}
      "サワラ（78cm以上）" → {species_name: "サワラ", fish_species_id: 12, size_text: "78cm以上", detail_type: "catch"}
      "サゴシ〜サワラ"    → {species_name: "サワラ", fish_species_id: 12, detail_type: "catch"}
      "白子率も高めです！" → {species_name: None, fish_species_id: None, detail_type: "note"}
      "マダイ（1.2kg）"   → {species_name: "マダイ", fish_species_id: 5, size_text: "1.2kg", detail_type: "catch"}
    """
    if not raw or not raw.strip():
        return {"species_name": None, "fish_species_id": None,
                "size_text": None, "detail_type": "note"}

    raw = normalize_num(raw).strip()
    size_text = None

    # Step 1: 括弧内のサイズ情報を抽出・分離
    size_match = _RE_PAREN_SIZE.search(raw)
    if size_match:
        # 括弧内のテキスト全体からサイズ部分を取得
        paren_text = size_match.group(0)
        # 括弧を除去
        size_text = paren_text[1:-1].strip()
        # 元テキストから括弧部分を除去
        raw = raw.replace(paren_text, "").strip()
    else:
        # サイズ以外の括弧も除去（「マダイ（放流）」等）
        raw = _RE_PAREN_ANY.sub("", raw).strip()

    # Step 2: 〜 / ～ / ~ で繋がった成長名を分解
    #   "サゴシ〜サワラ" → ["サゴシ", "サワラ"]
    #   "ワカシ〜イナダ" → ["ワカシ", "イナダ"]
    parts = re.split(r"[〜～~]", raw)
    parts = [p.strip() for p in parts if p.strip()]

    # Step 3: 各パートで fish_species にマッチを試みる
    #   成長名の場合: growth_names に含まれていれば親魚種にマッチ
    #   aliases の場合: aliases に含まれていればマッチ
    best_match_id = None
    best_match_name = None

    for part in parts:
        # 直接名前マッチ
        fid = _match_species_extended(part, species_list)
        if fid is not None:
            best_match_id = fid
            # マッチした魚種の正規名を取得
            for sp in species_list:
                if sp["id"] == fid:
                    best_match_name = sp["name"]
                    break
            break  # 最初にマッチしたものを採用

    # 分割前の全体テキストでも試す（"サゴシ〜サワラ" → "サワラ" でマッチしなかった場合）
    if best_match_id is None and len(parts) > 1:
        for part in reversed(parts):  # 後ろ（成魚名）を優先
            fid = _match_species_extended(part, species_list)
            if fid is not None:
                best_match_id = fid
                for sp in species_list:
                    if sp["id"] == fid:
                        best_match_name = sp["name"]
                        break
                break

    # Step 4: マッチしない場合 → 魚名っぽいかどうか判定
    if best_match_id is None:
        # 魚名っぽくなければ note
        if _is_not_fish(raw):
            return {"species_name": None, "fish_species_id": None,
                    "size_text": size_text, "detail_type": "note"}
        # 魚名っぽいがマスタにない → catch として保存（fish_species_id=NULL）
        return {"species_name": raw, "fish_species_id": None,
                "size_text": size_text, "detail_type": "catch"}

    return {
        "species_name":   best_match_name,
        "fish_species_id": best_match_id,
        "size_text":       size_text,
        "detail_type":     "catch",
    }


def _match_species_extended(name: str, species_list: list[dict]) -> Optional[int]:
    """
    名前 → fish_species.id のマッチ。
    name, aliases, growth_names すべてを検索。
    """
    if not name:
        return None
    needle = name.lower().strip()
    if not needle:
        return None

    for sp in species_list:
        sp_name = (sp.get("name") or "").lower()
        # 完全一致 or 部分一致（名前）
        if sp_name and (needle == sp_name or needle in sp_name or sp_name in needle):
            return sp["id"]

        # aliases チェック
        aliases = _to_list(sp.get("aliases"))
        for alias in aliases:
            a = alias.lower()
            if a and (needle == a or needle in a or a in needle):
                return sp["id"]

        # growth_names チェック
        growth = _to_list(sp.get("growth_names"))
        for g in growth:
            if g.lower() == needle:
                return sp["id"]

    return None


def _to_list(val) -> list[str]:
    """jsonb の値を list[str] に変換"""
    if val is None:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
        return [val]
    return []


def _is_not_fish(text: str) -> bool:
    """テキストが魚名ではなくコメント/メモかどうかを判定"""
    # 文末表現、統計表現、事務連絡パターン
    for pat in _NOT_FISH_PATTERNS:
        if pat.search(text):
            return True
    # 長すぎるテキスト（10文字以上でスペースなし → 文章の可能性が高い）
    if len(text) > 15:
        return True
    return False


# ── 定性シグナル抽出 ──────────────────────────────────────────────────────────

SIGNAL_PATTERNS: dict[str, list[re.Pattern]] = {
    "everyone_caught": [
        re.compile(r"全員安打"),
        re.compile(r"全員釣果"),
        re.compile(r"全員.*?[釣獲]れ"),
    ],
    "limit_reached": [
        re.compile(r"リミット"),
        re.compile(r"制限"),
        re.compile(r"規定数"),
    ],
    "season_start": [
        re.compile(r"釣れ始め"),
        re.compile(r"シーズンイン"),
        re.compile(r"開幕"),
        re.compile(r"初物"),
        re.compile(r"今季初"),
    ],
    "season_end": [
        re.compile(r"終盤"),
        re.compile(r"落ちてき"),
        re.compile(r"シーズン.*?終"),
        re.compile(r"そろそろ.*?終"),
    ],
    "size_up": [
        re.compile(r"型.*?良"),
        re.compile(r"サイズアップ"),
        re.compile(r"良型"),
        re.compile(r"大型"),
        re.compile(r"キロ.*?級"),
    ],
    "tough_bite": [
        re.compile(r"渋い"),
        re.compile(r"食い渋"),
        re.compile(r"苦戦"),
        re.compile(r"厳し"),
        re.compile(r"不調"),
        re.compile(r"ノー[フヒ]ィッシュ"),
    ],
    "record_catch": [
        re.compile(r"新記録"),
        re.compile(r"過去最高"),
        re.compile(r"爆釣"),
        re.compile(r"入れ食い"),
        re.compile(r"絶好調"),
    ],
    "early_return": [
        re.compile(r"早上がり"),
        re.compile(r"時化"),
        re.compile(r"中止"),
        re.compile(r"出船.*?見合"),
    ],
    "depth_info": [
        re.compile(r"(?:棚|水深|タナ)\s*(\d+)"),
        re.compile(r"(\d+)\s*[m〜~\-]\s*(\d+)\s*m"),
    ],
    "bait_situation": [
        re.compile(r"ベイト.*?[多少豊]"),
        re.compile(r"イワシ.*?[多少回]"),
        re.compile(r"餌.*?[豊少]"),
        re.compile(r"反応.*?[良好多]"),
    ],
    "technique_tip": [
        re.compile(r"(?:棚|タナ).*?\d+.*?m"),
        re.compile(r"(?:ジグ|ワーム|テンヤ|コマセ).*?(?:効|良|有効)"),
    ],
}


def extract_signals(condition_text: str) -> list[dict]:
    """
    船長コメントから定性シグナルを抽出する。

    戻り値:
        [
            {"type": "everyone_caught", "value": "true", "source": "全員安打でした"},
            {"type": "depth_info", "value": "棚20-30m", "source": "棚20〜30mで反応あり"},
        ]
    """
    if not condition_text:
        return []

    text = normalize_num(condition_text)
    results = []
    seen_types = set()

    for signal_type, patterns in SIGNAL_PATTERNS.items():
        for pat in patterns:
            m = pat.search(text)
            if m and signal_type not in seen_types:
                seen_types.add(signal_type)
                # マッチ周辺の文脈を source として保存
                start = max(0, m.start() - 10)
                end = min(len(text), m.end() + 20)
                source = text[start:end].strip()

                # depth_info は値を抽出
                if signal_type == "depth_info":
                    value = m.group(0)
                else:
                    value = "true"

                results.append({
                    "type":   signal_type,
                    "value":  value,
                    "source": source,
                })
                break  # このシグナルタイプは1つ見つかればOK

    return results
