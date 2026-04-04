#!/usr/bin/env python3
from __future__ import annotations
"""
釣果スクレイパー v4（ハンドラーパターン）

変更点（v4）:
  - 全件 Claude API → パターン別ハンドラーに切り替え
  - ハンドラー: gyosan / blogphp / wordpress / rss / claude（フォールバック）
  - shipyards.scrape_config.handler でディスパッチ
  - --dry-run オプション: DB 書き込みなしでサンプル抽出

使い方:
    python src/scraper.py
    python src/scraper.py --shipyard-ids 34 --dry-run
    python src/scraper.py --fix-condition-text

環境変数 (.env):
    ANTHROPIC_API_KEY
    SUPABASE_URL
    SUPABASE_KEY
    SITE_URL
    REVALIDATE_SECRET
"""
import argparse
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import anthropic
import requests
import yaml
from dotenv import load_dotenv
from supabase import create_client

# ─── パス設定 ──────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent.parent
CONFIG_DIR = BASE_DIR / "config"
LOGS_DIR   = BASE_DIR / "logs"

# ─── 環境変数 ─────────────────────────────────────────────────────────────────
load_dotenv(BASE_DIR / ".env")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

INTER_REQUEST_WAIT = 1.5


# ── ロガー ────────────────────────────────────────────────────────────────────

def setup_logger() -> logging.Logger:
    LOGS_DIR.mkdir(exist_ok=True)
    log_file = LOGS_DIR / f"scrape_{datetime.now():%Y-%m-%d}.log"
    logger   = logging.getLogger("scraper")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
        fh  = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(fmt)
        ch  = logging.StreamHandler()
        ch.setFormatter(fmt)
        logger.addHandler(fh)
        logger.addHandler(ch)
    return logger


# ── 設定ファイル ───────────────────────────────────────────────────────────────

def load_days_to_fetch() -> int:
    cfg_path = CONFIG_DIR / "extraction.yaml"
    if cfg_path.exists():
        with open(cfg_path, encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
        return cfg.get("days_to_fetch", 3)
    return 3


# ── 気象・潮汐（変更なし） ─────────────────────────────────────────────────────
# 現行実装をそのまま utils として将来分離予定

OPENMETEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=35.45&longitude=139.65"
    "&daily=weathercode,temperature_2m_max,temperature_2m_min"
    ",windspeed_10m_max,winddirection_10m_dominant"
    "&timezone=Asia%2FTokyo&wind_speed_unit=ms&forecast_days=3"
)
WMO_CODE_MAP = {
    0: "快晴", 1: "おおむね晴れ", 2: "一部曇り", 3: "曇り",
    45: "霧", 48: "霧氷",
    51: "霧雨(弱)", 53: "霧雨", 55: "霧雨(強)",
    61: "小雨", 63: "雨", 65: "大雨",
    80: "にわか雨(弱)", 81: "にわか雨", 82: "にわか雨(強)",
    95: "雷雨", 99: "激しい雷雨",
}


def fetch_weather_data(today_str: str, logger) -> dict:
    try:
        resp    = requests.get(OPENMETEO_URL, timeout=20)
        resp.raise_for_status()
        daily   = resp.json().get("daily", {})
        times   = daily.get("time", [])
        if today_str not in times:
            return {}
        idx = times.index(today_str)
        def _get(key):
            v = daily.get(key, [])
            return v[idx] if idx < len(v) else None
        code = _get("weathercode")
        return {
            "weather_code":   code,
            "weather_desc":   WMO_CODE_MAP.get(code, f"コード{code}") if code is not None else None,
            "temp_max":       _get("temperature_2m_max"),
            "temp_min":       _get("temperature_2m_min"),
            "wind_speed_ms":  _get("windspeed_10m_max"),
            "wind_direction": _get("winddirection_10m_dominant"),
        }
    except Exception as e:
        logger.warning(f"  [天気] 取得失敗: {e}")
        return {}


def fetch_tide_data(today_str: str, logger) -> str | None:
    try:
        from datetime import date as _date
        d   = _date.fromisoformat(today_str)
        a   = (14 - d.month) // 12
        y   = d.year + 4800 - a
        m   = d.month + 12 * a - 3
        jdn = d.day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
        jd  = jdn + 0.5
        age = (jd - 2451550.759) % 29.530589
        if   age <= 1.5 or age >= 28.0: tide = "大潮"
        elif age <= 6.5:                 tide = "中潮"
        elif age <= 9.5:                 tide = "小潮"
        elif age <= 10.5:                tide = "長潮"
        elif age <= 12.0:                tide = "若潮"
        elif age <= 13.5:                tide = "中潮"
        elif age <= 16.5:                tide = "大潮"
        elif age <= 19.5:                tide = "中潮"
        elif age <= 23.0:                tide = "小潮"
        elif age <= 24.0:                tide = "長潮"
        elif age <= 25.0:                tide = "若潮"
        else:                            tide = "中潮"
        logger.info(f"  [潮汐] 月齢={age:.1f} → {tide}")
        return tide
    except Exception as e:
        logger.warning(f"  [潮汐] 計算失敗: {e}")
        return None


def save_environment_data(db, today_str, weather, tide_info, logger):
    if not weather and tide_info is None:
        return
    parts = []
    if weather:
        desc = weather.get("weather_desc", "")
        tmin = weather.get("temp_min")
        tmax = weather.get("temp_max")
        wind = weather.get("wind_speed_ms")
        if desc:   parts.append(desc)
        if tmin is not None and tmax is not None:
            parts.append(f"気温{tmin}〜{tmax}°C")
        if wind is not None:
            parts.append(f"風{wind:.1f}m/s")
    weather_summary = " ".join(parts) or None
    try:
        existing = (
            db.table("environment_data").select("id").eq("date", today_str).limit(1).execute()
        )
        if existing.data:
            upd = {}
            if weather_summary: upd["weather"] = weather_summary
            if tide_info:        upd["tide_type"] = tide_info
            if upd:
                db.table("environment_data").update(upd).eq("date", today_str).execute()
        else:
            db.table("environment_data").insert({
                "date":          today_str,
                "weather":       weather_summary,
                "wind_speed_ms": weather.get("wind_speed_ms") if weather else None,
                "tide_type":     tide_info,
                "source":        "open-meteo,jma",
            }).execute()
        logger.info(f"  [環境データ] 保存: {today_str} 天気={weather_summary} 潮={tide_info}")
    except Exception as e:
        logger.error(f"  [環境データ] 保存失敗: {e}")


# ── メイン ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="釣果スクレイパー v4")
    parser.add_argument("--dry-run", action="store_true",
                        help="DB 書き込みなしでサンプル抽出（テスト用）")
    parser.add_argument("--shipyard-ids", type=int, nargs="+", metavar="ID",
                        help="処理する船宿 ID を指定（例: --shipyard-ids 3 9 15）")
    parser.add_argument("--fix-condition-text", action="store_true",
                        help="condition_text が NULL のレコードを再取得")
    args = parser.parse_args()

    logger = setup_logger()
    logger.info("=" * 60)
    logger.info(f"釣果スクレイパー v4 開始{'（dry-run）' if args.dry_run else ''}")
    logger.info("=" * 60)

    # ── API キー確認 ──────────────────────────────────────────────────────
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY が設定されていません")
        sys.exit(1)
    claude_client = anthropic.Anthropic(api_key=api_key)

    # ── Supabase 接続 ─────────────────────────────────────────────────────
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL / SUPABASE_KEY が設定されていません")
        sys.exit(1)
    try:
        db = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info(f"Supabase 接続OK")
    except Exception as e:
        logger.error(f"Supabase 接続失敗: {e}")
        sys.exit(1)

    # ── ハンドラーインポート（sys.path 調整）─────────────────────────────
    sys.path.insert(0, str(Path(__file__).parent))
    from handlers import get_handler, HANDLER_MAP
    from utils.db_v2 import update_last_scraped_at
    from utils.anomaly import check_anomalies, refresh_baselines

    # ── マスタデータ取得 ──────────────────────────────────────────────────
    try:
        species_list = db.table("fish_species").select("id, name, aliases, growth_names").execute().data or []
        logger.info(f"fish_species: {len(species_list)} 件")
    except Exception as e:
        logger.warning(f"マスタ取得失敗（空リストで続行）: {e}")
        species_list = []

    # ── 気象・潮汐データ ─────────────────────────────────────────────────
    if not args.dry_run:
        today_str    = datetime.now().strftime("%Y-%m-%d")
        weather_data = fetch_weather_data(today_str, logger)
        tide_info    = fetch_tide_data(today_str, logger)
        save_environment_data(db, today_str, weather_data, tide_info, logger)

    # ── 船宿一覧取得 ──────────────────────────────────────────────────────
    try:
        yards_result = db.table("shipyards").select("*").eq("is_active", True).execute()
        active_yards = yards_result.data or []
    except Exception as e:
        logger.error(f"shipyards 取得失敗: {e}")
        sys.exit(1)

    if args.shipyard_ids:
        active_yards = [y for y in active_yards if y["id"] in args.shipyard_ids]
        logger.info(f"--shipyard-ids 指定: {args.shipyard_ids} → {len(active_yards)} 件")

    if not active_yards:
        logger.warning("対象船宿が 0 件です")
        sys.exit(0)

    logger.info(f"対象船宿: {len(active_yards)} 件")

    # ── スクレイピングループ ──────────────────────────────────────────────
    total_saved  = 0
    skipped      = 0
    errors       = []
    all_trip_ids: list[int] = []  # 異常値検知用

    for yard in active_yards:
        yard_id   = yard["id"]
        yard_name = yard.get("name", f"ID:{yard_id}")
        yard_url  = yard.get("url", "")

        if not yard_url:
            logger.warning(f"  {yard_name}: URL 未設定 → スキップ")
            continue

        config  = yard.get("scrape_config") or {}
        handler = get_handler(
            config,
            db=db,
            logger=logger,
            claude_client=claude_client,
            species_list=species_list,
        )

        logger.info(f"\n▶ [{yard_id}] {yard_name} [{handler.__class__.__name__}]")
        logger.info(f"  URL: {yard_url}")

        result = handler.run(yard, dry_run=args.dry_run)

        if result["error"]:
            errors.append(f"{yard_name}: {result['error']}")
            if not args.dry_run:
                update_last_scraped_at(db, yard_id, error=result["error"])
        elif result["skipped"]:
            skipped += 1
        else:
            total_saved += result["saved"]
            if not args.dry_run:
                update_last_scraped_at(db, yard_id)
            if args.dry_run and result["sample"]:
                logger.info(f"  [dry-run] サンプル:")
                import json
                logger.info(json.dumps(result["sample"], ensure_ascii=False, indent=2)[:500])

        time.sleep(INTER_REQUEST_WAIT)

    # ── 異常値検知 ─────────────────────────────────────────────────────
    if not args.dry_run and total_saved > 0:
        try:
            # 今日保存/更新された trip を取得
            today_str = datetime.now().strftime("%Y-%m-%d")
            recent = db.table("fishing_trips").select("id").gte(
                "created_at", today_str
            ).execute()
            recent_ids = [r["id"] for r in (recent.data or [])]

            if recent_ids:
                # ベースライン更新（軽量: 全 catches_v2 集計）
                refresh_baselines(db, logger)
                # 異常値チェック
                check_anomalies(db, recent_ids, logger)
        except Exception as e:
            logger.warning(f"  異常値検知でエラー: {e}")

    # ── サマリー ──────────────────────────────────────────────────────────
    logger.info("\n" + "=" * 60)
    if args.dry_run:
        logger.info("dry-run 完了（DB 書き込みなし）")
    else:
        logger.info(f"完了: {total_saved} 件保存 / {skipped} 件スキップ（HTML 変化なし）")
    if errors:
        logger.info(f"エラー: {len(errors)} 件")
        for err in errors:
            logger.info(f"  ✗ {err}")
    logger.info("=" * 60)

    # ── Vercel revalidation ───────────────────────────────────────────────
    if not args.dry_run and total_saved > 0:
        site_url = os.environ.get("SITE_URL", "").rstrip("/")
        secret   = os.environ.get("REVALIDATE_SECRET", "")
        if site_url and secret:
            try:
                resp = requests.post(
                    f"{site_url}/api/revalidate",
                    headers={"x-revalidate-secret": secret},
                    timeout=10,
                )
                logger.info(f"Vercel revalidation: {resp.status_code}")
            except Exception as e:
                logger.warning(f"Vercel revalidation 失敗: {e}")


if __name__ == "__main__":
    main()
