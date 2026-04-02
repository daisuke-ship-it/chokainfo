#!/usr/bin/env python3
"""
AIサマリーバッチ処理

毎日複数回実行し、catchesテーブルの当日データから ai_summaries テーブルに
以下のサマリーを生成・保存する。

  1. shipyard     : 船宿サマリー（80〜150文字、catches_count変化時に再生成）
  2. fish_species : エリア×魚種サマリー（80〜150文字、1日1回）
  3. area         : エリア全体サマリー（40〜80文字、1日1回）

使い方:
    python src/summarizer.py

環境変数 (.env):
    ANTHROPIC_API_KEY
    SUPABASE_URL
    SUPABASE_KEY
"""

import argparse
import logging
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import anthropic
import requests
from dotenv import load_dotenv
from supabase import create_client

# ─── パス設定 ──────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
LOGS_DIR = BASE_DIR / "logs"

# ─── モデル ────────────────────────────────────────────────────────────────────
HAIKU_MODEL  = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-6"

# ─── 天気取得 ──────────────────────────────────────────────────────────────────
_OPENMETEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=35.45&longitude=139.65"
    "&daily=weathercode,temperature_2m_max,temperature_2m_min"
    "&timezone=Asia%2FTokyo"
    "&forecast_days=3"
)
_WMO_CODE_MAP = {
    0: "快晴", 1: "おおむね晴れ", 2: "一部曇り", 3: "曇り",
    45: "霧", 48: "霧氷",
    51: "霧雨(弱)", 53: "霧雨", 55: "霧雨(強)",
    61: "小雨", 63: "雨", 65: "大雨",
    71: "小雪", 73: "雪", 75: "大雪",
    80: "にわか雨(弱)", 81: "にわか雨", 82: "にわか雨(強)",
    95: "雷雨", 96: "雷雨+ひょう", 99: "激しい雷雨",
}


# ──────────────────────────────────────────────────────────────────────────────
# ロガー
# ──────────────────────────────────────────────────────────────────────────────

def setup_logger() -> logging.Logger:
    LOGS_DIR.mkdir(exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = LOGS_DIR / f"summarizer_{today}.log"

    logger = logging.getLogger("summarizer")
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return logger

    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%H:%M:%S")

    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    return logger


# ──────────────────────────────────────────────────────────────────────────────
# 翌日天気取得
# ──────────────────────────────────────────────────────────────────────────────

def fetch_tomorrow_weather(logger: logging.Logger) -> Optional[str]:
    """
    Open-Meteo から翌日の天気概況を取得して日本語文字列で返す。
    例: "おおむね晴れ、最高8°C"
    取得失敗時は None を返す。
    """
    try:
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        resp = requests.get(_OPENMETEO_URL, timeout=10)
        resp.raise_for_status()
        daily = resp.json().get("daily", {})
        times = daily.get("time", [])
        if tomorrow not in times:
            return None
        idx = times.index(tomorrow)
        code     = (daily.get("weathercode") or [])[idx] if idx < len(daily.get("weathercode") or []) else None
        temp_max = (daily.get("temperature_2m_max") or [])[idx] if idx < len(daily.get("temperature_2m_max") or []) else None
        desc = _WMO_CODE_MAP.get(code, f"コード{code}") if code is not None else None
        if not desc:
            return None
        result = desc
        if temp_max is not None:
            result += f"、最高{temp_max}°C"
        logger.info(f"  [翌日天気] {tomorrow}: {result}")
        return result
    except Exception as e:
        logger.warning(f"  [翌日天気] 取得失敗: {e}")
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Supabase ヘルパー
# ──────────────────────────────────────────────────────────────────────────────

def upsert_summary(db, summary_type: str, target_id: Optional[int], target_date: str,
                   summary_text: str, raw_input: str,
                   catches_count: Optional[int] = None) -> None:
    """ai_summaries テーブルに UPSERT（on_conflict: summary_type, target_id, target_date）"""
    row = {
        "summary_type": summary_type,
        "target_id":    target_id,
        "target_date":  target_date,
        "summary_text": summary_text,
        "raw_input":    raw_input[:2000],
        "model_used":   HAIKU_MODEL,
    }
    if catches_count is not None:
        row["catches_count"] = catches_count

    db.table("ai_summaries").upsert(
        row, on_conflict="summary_type,target_id,target_date"
    ).execute()


# ──────────────────────────────────────────────────────────────────────────────
# データ取得
# ──────────────────────────────────────────────────────────────────────────────

def fetch_existing_summaries(db, today: str) -> dict[tuple, dict]:
    """今日の既存サマリーを {(summary_type, target_id): {catches_count}} で返す"""
    resp = (db.table("ai_summaries")
              .select("summary_type, target_id, catches_count")
              .eq("target_date", today)
              .execute())
    return {
        (r["summary_type"], r["target_id"]): {"catches_count": r["catches_count"]}
        for r in (resp.data or [])
    }


def fetch_today_catches(db, today: str) -> list[dict]:
    """当日の catches を JOIN して取得（catch_details も含む）"""
    resp = (db.table("catches")
              .select("""
                  id,
                  count_min, count_max,
                  size_min_cm, size_max_cm,
                  condition_text,
                  shipyards ( id, name, areas ( id, name ) ),
                  fish_species ( id, name ),
                  catch_details ( species_name, count, unit )
              """)
              .eq("sail_date", today)
              .execute())
    return resp.data or []


def fetch_areas(db) -> list[dict]:
    resp = db.table("areas").select("id, name").execute()
    return resp.data or []


def fetch_fish_species(db) -> list[dict]:
    resp = db.table("fish_species").select("id, name").execute()
    return resp.data or []


# ──────────────────────────────────────────────────────────────────────────────
# テキスト整形
# ──────────────────────────────────────────────────────────────────────────────

def format_catch(min_val, max_val) -> str:
    if min_val is None and max_val is None:
        return "不明"
    if min_val is not None and max_val is not None and min_val != max_val:
        return f"{min_val}〜{max_val}"
    return str(max_val if max_val is not None else min_val)


def build_shipyard_input(catches: list[dict], shipyard_name: str) -> str:
    """shipyard サマリー用の入力テキストを構築"""
    lines = [f"【{shipyard_name} 本日の釣果】"]
    for c in catches:
        fish_name = (c.get("fish_species") or {}).get("name", "不明")
        catch_str = format_catch(c.get("count_min"), c.get("count_max"))
        size_str  = format_catch(c.get("size_min_cm"), c.get("size_max_cm"))
        line = f"・{fish_name}: {catch_str}尾"
        if size_str != "不明":
            line += f" / {size_str}cm"
        if c.get("condition_text"):
            line += f" / {c['condition_text'][:100]}"
        lines.append(line)
    return "\n".join(lines)


def build_fish_input(catches: list[dict], area_name: str, fish_name: str, target_date: str) -> str:
    """fish_species サマリー用の入力テキストを構築"""
    y, m, d = int(target_date[:4]), int(target_date[5:7]), int(target_date[8:10])
    date_str = f"{y}年{m}月{d}日"
    lines = [f"【{area_name} / {fish_name} {date_str}の釣果】"]
    for c in catches:
        shipyard = (c.get("shipyards") or {}).get("name", "不明")
        # catch_details から対象魚種の釣果・サイズを取得（新形式）
        fish_detail = next(
            (d for d in (c.get("catch_details") or [])
             if fish_name in (d.get("species_name") or "")),
            None,
        )
        if fish_detail:
            max_count = fish_detail.get("count")
            min_count = c.get("count_min")
            catch_str = format_catch(min_count, max_count)
        else:
            catch_str = format_catch(c.get("count_min"), c.get("count_max"))
        size_str = format_catch(c.get("size_min_cm"), c.get("size_max_cm"))
        line = f"・{shipyard}: {catch_str}尾"
        if size_str != "不明":
            line += f" / {size_str}cm"
        if c.get("condition_text"):
            line += f" / {c['condition_text'][:100]}"
        lines.append(line)
    return "\n".join(lines)


def build_area_input(catches: list[dict], area_name: str,
                     fish_species_list: list[dict]) -> str:
    """area サマリー用の入力テキストを構築"""
    fish_stats: dict[str, dict] = {}
    for c in catches:
        shipyard = (c.get("shipyards") or {}).get("name")
        # 魚種名を取得: fish_species JOIN（旧形式）→ catch_details（新形式）の順で確認
        joined_name = (c.get("fish_species") or {}).get("name")
        species_names: list[str] = []
        if joined_name:
            species_names.append(joined_name)
        else:
            for d in (c.get("catch_details") or []):
                sn = d.get("species_name")
                if sn and sn not in species_names:
                    species_names.append(sn)

        for fn in species_names:
            if fn not in fish_stats:
                fish_stats[fn] = {"counts": [], "shipyards": set()}
            if shipyard:
                fish_stats[fn]["shipyards"].add(shipyard)
            if c.get("count_max") is not None:
                fish_stats[fn]["counts"].append(c["count_max"])
            elif c.get("count_min") is not None:
                fish_stats[fn]["counts"].append(c["count_min"])

    if not fish_stats:
        return f"【{area_name} 本日の釣果データなし】"

    lines = [f"【{area_name} 本日の全体集計】"]
    for fn, stats in fish_stats.items():
        yard_count = len(stats["shipyards"])
        avg = round(sum(stats["counts"]) / len(stats["counts"]), 1) if stats["counts"] else None
        avg_str = f" 平均{avg}尾" if avg else ""
        lines.append(f"・{fn}: {yard_count}船宿出船{avg_str}")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────────────
# 魚種マッチング
# ──────────────────────────────────────────────────────────────────────────────

def _catch_has_species(catch: dict, fish_name: str) -> bool:
    """
    catch レコードが指定魚種を含むか判定する。
    fish_species JOIN（fish_species_id が NULL の新形式レコード対応）と
    catch_details.species_name テキストの両方を確認する。
    """
    # 旧形式: fish_species_id がある場合
    joined = (catch.get("fish_species") or {}).get("name")
    if joined and fish_name in joined:
        return True
    # 新形式: catch_details.species_name で判定
    for d in (catch.get("catch_details") or []):
        sn = d.get("species_name") or ""
        if sn and (fish_name in sn or sn in fish_name):
            return True
    return False


# ──────────────────────────────────────────────────────────────────────────────
# 船宿サマリー スキップ判定
# ──────────────────────────────────────────────────────────────────────────────

def get_catch_count(catches: list[dict], shipyard_id: int) -> int:
    """メモリ上の catches から該当船宿の件数を返す"""
    return sum(1 for c in catches if (c.get("shipyards") or {}).get("id") == shipyard_id)


def _should_generate(
    summary_type: str,
    target_id: int,
    current_count: int,
    existing_summaries: dict[tuple, dict],
) -> tuple[bool, str]:
    """catches_count の変化を見て再生成要否を返す（全サマリー種別共通）"""
    key = (summary_type, target_id)
    if key not in existing_summaries:
        return True, "新規生成"
    stored_count = existing_summaries[key]["catches_count"]
    if stored_count == current_count:
        return False, f"スキップ(catches_count={current_count})"
    return True, f"再生成(catches_count: {stored_count} → {current_count})"


def should_generate_shipyard_summary(
    shipyard_id: int,
    current_count: int,
    existing_summaries: dict[tuple, dict],
) -> tuple[bool, str]:
    return _should_generate("shipyard", shipyard_id, current_count, existing_summaries)


# ──────────────────────────────────────────────────────────────────────────────
# Claude API 呼び出し
# ──────────────────────────────────────────────────────────────────────────────

def generate_shipyard_summary(claude_client: anthropic.Anthropic, input_text: str,
                              shipyard_name: str) -> str:
    prompt = f"""{input_text}

上記データをもとに、{shipyard_name}の本日の釣果について80〜150文字の自然な日本語でサマリーを書いてください。
・出船魚種、釣果の概況、状況（好調/普通/低調）を含める
・船長コメントの内容があれば釣り場や潮況もひとことで
・箇条書きではなく文章で
・文体は「です・ます調」ベース、体言止め混じりOK
・サマリー文のみ出力（前置き不要）"""

    resp = claude_client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text.strip()


def generate_fish_summary(claude_client: anthropic.Anthropic, input_text: str,
                          area_name: str, fish_name: str, target_date: str) -> str:
    y, m, d = int(target_date[:4]), int(target_date[5:7]), int(target_date[8:10])
    date_str = f"{y}年{m}月{d}日"
    prompt = f"""{input_text}

上記データをもとに、{area_name}の{fish_name}釣果について80〜250文字の自然な日本語でサマリーを書いてください。
・冒頭または文中で「{date_str}は」など実際の日付（{date_str}）を自然に使う（「本日」「今日」は使わない）
・出船船宿数、釣果のトップ・平均、サイズ感、状況（好調/普通/低調）を含める
・海況や季節感を表す比喩・情景描写を1文加える（例：「春の濁り潮の中」「風が落ち着いた穏やかな海況で」）
・翌日への展望か釣り人へのひとことを1文加える（例：「潮回りが良くなる明日以降に期待したい」）
・箇条書きではなく文章で
・文体は「です・ます調」ベース、体言止め混じりOK
・断定的な表現は避け、「〜のようです」「〜が見込まれます」など柔らかい表現を使う
・サマリー文のみ出力（前置き不要）"""

    resp = claude_client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text.strip()


def generate_area_summary(claude_client: anthropic.Anthropic, input_text: str,
                          area_name: str,
                          target_date: str,
                          tomorrow_weather: Optional[str] = None) -> str:
    weather_line = (
        f"・翌日の天気は「{tomorrow_weather}」の予報。天気に触れる場合は一言だけ自然に添える\n"
        if tomorrow_weather else ""
    )
    prompt = f"""{input_text}

上記データをもとに、{area_name}全体の釣況について60〜150文字の日本語でサマリーを書いてください。
・冒頭は「{area_name}は、」で始める（日付は含めない）
・「本日は」「今日は」など日付・時点を示す表現は使わない
・好調な魚種と出船全体の雰囲気を含める
・潮汐（大潮・中潮・小潮・長潮・若潮など）や潮の動きに関する現況を1文加える
・季節感や海の情景を表す描写を1文加える（例：「春の訪れを感じさせる暖かな一日」「北風が強まる中」）
{weather_line}・箇条書きではなく文章で
・文体は「です・ます調」ベース、体言止め混じりOK
・サマリー文のみ出力（前置き不要）"""

    resp = claude_client.messages.create(
        model=SONNET_MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text.strip()


# ──────────────────────────────────────────────────────────────────────────────
# メイン
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AIサマリーバッチ")
    parser.add_argument(
        "--mode",
        choices=["shipyard", "summary"],
        default=None,
        help="shipyard: 船宿サマリーのみ / summary: 魚種・エリアサマリーのみ / 省略: 全実行",
    )
    parser.add_argument(
        "--date",
        default=None,
        help="対象日付を YYYY-MM-DD で指定（省略時は当日）",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="既存サマリーを無視して強制再生成（catches_count チェックをスキップ）",
    )
    args = parser.parse_args()
    run_shipyard = args.mode in (None, "shipyard")
    run_summary  = args.mode in (None, "summary")

    logger = setup_logger()
    logger.info("=" * 60)
    logger.info(f"AIサマリーバッチ 開始（mode={args.mode or 'all'}）")
    logger.info("=" * 60)

    load_dotenv(BASE_DIR / ".env")
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    supabase_url  = os.environ.get("SUPABASE_URL")
    supabase_key  = os.environ.get("SUPABASE_KEY")

    if not all([anthropic_key, supabase_url, supabase_key]):
        logger.error("環境変数が不足しています (ANTHROPIC_API_KEY / SUPABASE_URL / SUPABASE_KEY)")
        sys.exit(1)

    claude_client = anthropic.Anthropic(api_key=anthropic_key)
    db = create_client(supabase_url, supabase_key)
    logger.info(f"Supabase 接続OK / Claude モデル: {HAIKU_MODEL}")

    today = args.date if args.date else datetime.now().strftime("%Y-%m-%d")
    logger.info(f"対象日付: {today}")

    # ─── データ取得 ─────────────────────────────────────────────
    catches            = fetch_today_catches(db, today)
    areas              = fetch_areas(db)
    fish_species       = fetch_fish_species(db)
    existing_summaries = fetch_existing_summaries(db, today)
    logger.info(f"当日 catches: {len(catches)} 件 / エリア: {len(areas)} / 魚種: {len(fish_species)}")
    logger.info(f"既存サマリー: {len(existing_summaries)} 件")

    if not catches:
        logger.info("当日の釣果データなし → サマリー生成をスキップ")
        return

    # ─── 船宿別にcatchesをグループ化 ────────────────────────────
    shipyard_catches: dict[int, list[dict]] = defaultdict(list)
    shipyard_names:   dict[int, str]        = {}
    for c in catches:
        sy = c.get("shipyards") or {}
        sy_id = sy.get("id")
        if sy_id:
            shipyard_catches[sy_id].append(c)
            shipyard_names[sy_id] = sy.get("name", f"ID:{sy_id}")

    # ─── dry-run スキャン（API呼び出し前に件数を確認） ──────────
    logger.info("\n▶ [dry-run] 生成予定スキャン")
    shipyard_plan:    list[tuple[int, int, str]] = []  # (id, count, reason)
    fish_plan:        list[tuple[int, str, int]] = []  # (fish_id, fish_name, fish_count)
    area_plan:        list[tuple[int, str, int]] = []  # (area_id, area_name, area_count)

    if run_shipyard:
        for sy_id, sy_catches in shipyard_catches.items():
            current_count = len(sy_catches)
            should_gen, reason = should_generate_shipyard_summary(sy_id, current_count, existing_summaries)
            status = "→ 生成" if should_gen else "→ スキップ"
            logger.info(f"  船宿[{shipyard_names[sy_id]}] {status} ({reason})")
            if should_gen:
                shipyard_plan.append((sy_id, current_count, reason))

    if run_summary:
        # ── 魚種サマリー：全エリア横断で1魚種1サマリー ──────────────
        for fish in fish_species:
            fish_id, fish_name = fish["id"], fish["name"]
            target = [c for c in catches if _catch_has_species(c, fish_name)]
            if not target:
                continue
            should_gen, reason = (True, "強制再生成") if args.force else _should_generate("fish_species", fish_id, len(target), existing_summaries)
            logger.info(f"  魚種[{fish_name}] → {'生成' if should_gen else 'スキップ'}({reason})")
            if should_gen:
                fish_plan.append((fish_id, fish_name, len(target)))

        # ── エリアサマリー ────────────────────────────────────────────
        for area in areas:
            area_id, area_name = area["id"], area["name"]
            area_catches = [
                c for c in catches
                if (c.get("shipyards") or {}).get("areas", {}) and
                   (c.get("shipyards") or {}).get("areas", {}).get("id") == area_id
            ]
            if not area_catches:
                continue
            should_gen, reason = (True, "強制再生成") if args.force else _should_generate("area", area_id, len(area_catches), existing_summaries)
            logger.info(f"  エリア[{area_name}] → {'生成' if should_gen else 'スキップ'}({reason})")
            if should_gen:
                area_plan.append((area_id, area_name, len(area_catches)))

    total_plan = len(shipyard_plan) + len(fish_plan) + len(area_plan)
    logger.info(f"\n  生成対象: 船宿={len(shipyard_plan)} / 魚種={len(fish_plan)} / エリア={len(area_plan)} / 合計={total_plan}件")

    if total_plan == 0:
        logger.info("生成対象なし → 終了")
        return

    total_saved = 0

    # ─── 1. 船宿サマリー ─────────────────────────────────────────
    if shipyard_plan:
        logger.info("\n▶ shipyard サマリー生成")
    for sy_id, current_count, reason in shipyard_plan:
        sy_name    = shipyard_names[sy_id]
        sy_catches = shipyard_catches[sy_id]
        logger.info(f"  [{sy_name}] {len(sy_catches)} 件 ({reason})")
        input_text = build_shipyard_input(sy_catches, sy_name)
        try:
            summary = generate_shipyard_summary(claude_client, input_text, sy_name)
            upsert_summary(db, "shipyard", sy_id, today, summary, input_text, catches_count=current_count)
            logger.info(f"    → {summary[:60]}…")
            total_saved += 1
        except Exception as e:
            logger.error(f"    [ERROR] {e}")

    # ─── 2. fish_species サマリー（全エリア横断・1魚種1サマリー） ──
    if fish_plan:
        logger.info("\n▶ fish_species サマリー生成")
    for fish_id, fish_name, fish_count in fish_plan:
        target = [c for c in catches if _catch_has_species(c, fish_name)]
        logger.info(f"  [{fish_name}] {len(target)} 件（全エリア）")
        input_text = build_fish_input(target, "関東圏", fish_name, today)
        try:
            summary = generate_fish_summary(claude_client, input_text, "関東圏", fish_name, today)
            upsert_summary(db, "fish_species", fish_id, today, summary, input_text, catches_count=fish_count)
            logger.info(f"    → {summary[:60]}…")
            total_saved += 1
        except Exception as e:
            logger.error(f"    [ERROR] {e}")

    # ─── 3. area サマリー（エリア全体） ──────────────────────────
    if area_plan:
        logger.info("\n▶ area サマリー生成")
        tomorrow_weather = fetch_tomorrow_weather(logger)
        logger.info(f"  翌日天気: {tomorrow_weather or '取得失敗'}")
    else:
        tomorrow_weather = None
    for area_id, area_name, area_count in area_plan:
        target = [
            c for c in catches
            if (c.get("shipyards") or {}).get("areas", {}) and
               (c.get("shipyards") or {}).get("areas", {}).get("id") == area_id
        ]
        logger.info(f"  [{area_name}] {len(target)} 件")
        input_text = build_area_input(target, area_name, fish_species)
        try:
            summary = generate_area_summary(claude_client, input_text, area_name, today, tomorrow_weather)
            upsert_summary(db, "area", area_id, today, summary, input_text, catches_count=area_count)
            logger.info(f"    → {summary[:60]}…")
            total_saved += 1
        except Exception as e:
            logger.error(f"    [ERROR] {e}")

    logger.info("\n" + "=" * 60)
    logger.info(f"完了: {total_saved} 件のサマリーを保存")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
