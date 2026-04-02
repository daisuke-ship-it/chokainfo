#!/usr/bin/env python3
"""
釣果スクレイパー v3

変更点（v3）:
  - Open-Meteo API から今日の気象データ（天気コード・最高/最低気温・風速・風向き）を取得
  - 気象庁潮位サイト（東京観測所）から今日の潮名をスクレイピング
  - 上記データを environment_data テーブルに UPSERT（重複実行対応）

使い方:
    python src/scraper.py

環境変数 (.env):
    ANTHROPIC_API_KEY
    SUPABASE_URL
    SUPABASE_KEY
"""

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from typing import Optional

import anthropic
import requests
import yaml
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

# ─── パス設定 ──────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent.parent
CONFIG_DIR = BASE_DIR / "config"
LOGS_DIR   = BASE_DIR / "logs"

# ─── スクレイピング設定 ────────────────────────────────────────────────────────
MAX_CONTENT_CHARS  = 40_000   # Claude に渡すテキストの最大文字数
MAX_RAW_HTML_CHARS = 100_000  # catch_raw に保存する HTML の上限
REQUEST_TIMEOUT    = 20       # HTTP タイムアウト（秒）
INTER_REQUEST_WAIT = 1.5      # 船宿間の待機時間（秒）

# 魚種名の正規化リスト（プロンプトに渡し、Claude にこの中から選ばせる）
VALID_SPECIES = [
    "タチウオ", "アジ", "サバ", "イワシ",
    "イナダ", "ワラサ", "ブリ", "サゴシ", "サワラ", "ヒラマサ", "カンパチ",
    "五目",
    # 「青物」はカテゴリ名のため除外。サゴシ等の具体種で上書きさせる。
    "シーバス", "クロダイ", "メバル", "カサゴ", "マダイ", "真鯛",
    "カレイ", "ヒラメ", "マゴチ", "タコ", "イカ",
    "トラフグ", "フグ",
    "シロギス", "キス",
]

# ─── 気象・潮汐 API 設定 ───────────────────────────────────────────────────────
# 東京湾代表座標（横浜沖）
OPENMETEO_URL = (
    "https://api.open-meteo.com/v1/forecast"
    "?latitude=35.45&longitude=139.65"
    "&daily=weathercode,temperature_2m_max,temperature_2m_min"
    ",windspeed_10m_max,winddirection_10m_dominant"
    "&timezone=Asia%2FTokyo"
    "&wind_speed_unit=ms"       # 風速を m/s 単位で取得（DB カラムが wind_speed_ms のため）
    "&forecast_days=3"          # 今日 + 翌日以降も含めて取得（当日分だけ使う）
)

# WMO 天気コード → 日本語簡略説明
WMO_CODE_MAP = {
    0: "快晴", 1: "おおむね晴れ", 2: "一部曇り", 3: "曇り",
    45: "霧", 48: "霧氷",
    51: "霧雨(弱)", 53: "霧雨", 55: "霧雨(強)",
    61: "小雨", 63: "雨", 65: "大雨",
    71: "小雪", 73: "雪", 75: "大雪",
    80: "にわか雨(弱)", 81: "にわか雨", 82: "にわか雨(強)",
    95: "雷雨", 96: "雷雨+ひょう", 99: "激しい雷雨",
}

# ─── 環境変数 ─────────────────────────────────────────────────────────────────
load_dotenv(BASE_DIR / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")


# ──────────────────────────────────────────────────────────────────────────────
# ロガー
# ──────────────────────────────────────────────────────────────────────────────

def setup_logger() -> logging.Logger:
    LOGS_DIR.mkdir(exist_ok=True)
    log_file = LOGS_DIR / f"scrape_{datetime.now():%Y-%m-%d}.log"
    logger = logging.getLogger("scraper")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
        fh = logging.FileHandler(log_file, encoding="utf-8")
        fh.setFormatter(fmt)
        ch = logging.StreamHandler()
        ch.setFormatter(fmt)
        logger.addHandler(fh)
        logger.addHandler(ch)
    return logger


# ──────────────────────────────────────────────────────────────────────────────
# 設定ファイル（days_to_fetch のみ extraction.yaml から読む）
# ──────────────────────────────────────────────────────────────────────────────

def load_days_to_fetch() -> int:
    cfg_path = CONFIG_DIR / "extraction.yaml"
    if cfg_path.exists():
        with open(cfg_path, encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
        return cfg.get("days_to_fetch", 3)
    return 3


# ──────────────────────────────────────────────────────────────────────────────
# HTML 取得 / テキスト変換 / MD5
# ──────────────────────────────────────────────────────────────────────────────

def fetch_html(url: str) -> str:
    """URL から生 HTML を取得して返す"""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "ja,en;q=0.9",
    }
    resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def html_to_text(html: str) -> str:
    """HTML からナビ・スクリプト等を除去してプレーンテキストを返す"""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header",
                     "noscript", "iframe", "aside"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    lines = [line for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def compute_md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


# ──────────────────────────────────────────────────────────────────────────────
# Supabase ユーティリティ
# ──────────────────────────────────────────────────────────────────────────────

def get_latest_html_hash(db, shipyard_id: int) -> Optional[str]:
    """catch_raw から該当船宿の最新 html_hash を返す（なければ None）"""
    try:
        result = (
            db.table("catch_raw")
            .select("html_hash")
            .eq("shipyard_id", shipyard_id)
            .order("scraped_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0].get("html_hash")
    except Exception:
        pass
    return None


def save_catch_raw(db, shipyard_id: int, html: str, html_hash: str, raw_text: str, source_url: str) -> int:
    """catch_raw に生データを INSERT して採番された id を返す"""
    row = {
        "shipyard_id": shipyard_id,
        "scraped_at":  datetime.now().isoformat(),
        "html_hash":   html_hash,
        "raw_text":    raw_text[:50_000],
        "source_url":  source_url,
        "is_parsed":   False,
    }
    result = db.table("catch_raw").insert(row).execute()
    return result.data[0]["id"]


# ──────────────────────────────────────────────────────────────────────────────
# 気象・潮汐データ取得
# ──────────────────────────────────────────────────────────────────────────────

def fetch_weather_data(today_str: str, logger: logging.Logger) -> dict:
    """
    Open-Meteo API（無料・APIキー不要）から今日の気象データを取得する。

    Returns:
        {weather_code, weather_desc, temp_max, temp_min, wind_speed_ms, wind_direction} または空 dict
    """
    try:
        resp = requests.get(OPENMETEO_URL, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()
        daily = payload.get("daily", {})
        times = daily.get("time", [])

        if today_str not in times:
            logger.warning(f"  [天気] {today_str} のデータが API レスポンスに含まれていません")
            return {}

        idx = times.index(today_str)

        def _get(key: str):
            vals = daily.get(key, [])
            return vals[idx] if idx < len(vals) else None

        weather_code = _get("weathercode")
        weather_desc = WMO_CODE_MAP.get(weather_code, f"コード{weather_code}") if weather_code is not None else None

        result = {
            "weather_code":   weather_code,
            "weather_desc":   weather_desc,
            "temp_max":       _get("temperature_2m_max"),
            "temp_min":       _get("temperature_2m_min"),
            "wind_speed_ms":  _get("windspeed_10m_max"),    # &wind_speed_unit=ms で m/s 取得
            "wind_direction": _get("winddirection_10m_dominant"),
        }
        logger.info(
            f"  [天気] {weather_desc}(コード{weather_code}) "
            f"気温:{result['temp_min']}〜{result['temp_max']}°C "
            f"風:{result['wind_speed_ms']}m/s {result['wind_direction']}°"
        )
        return result

    except Exception as e:
        logger.warning(f"  [天気] 取得失敗: {e}")
        return {}


def fetch_tide_data(today_str: str, logger: logging.Logger) -> Optional[str]:
    """
    月齢から日本の潮名を計算して返す。

    月齢は Meeus アルゴリズムの簡易版で計算。
    2000-01-06 18:14 UTC (JD 2451550.759) を朔（新月）の基準とする。

    Returns:
        "大潮" / "中潮" / "小潮" / "長潮" / "若潮" のいずれか
    """
    try:
        from datetime import date as _date
        d = _date.fromisoformat(today_str)
        # ユリウス通日 (JDN) を計算
        a = (14 - d.month) // 12
        y = d.year + 4800 - a
        m = d.month + 12 * a - 3
        jdn = d.day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
        jd = jdn + 0.5  # 正午基準
        # 基準新月 (2000-01-06 18:14 UTC)
        ref_jd = 2451550.759
        lunar_cycle = 29.530589
        age = (jd - ref_jd) % lunar_cycle  # 月齢 0=新月, ~14.75=満月

        # 日本標準の潮名分類
        if age <= 1.5 or age >= 28.0:    tide = "大潮"
        elif age <= 3.5:                  tide = "中潮"
        elif age <= 6.5:                  tide = "中潮"
        elif age <= 9.5:                  tide = "小潮"
        elif age <= 10.5:                 tide = "長潮"
        elif age <= 12.0:                 tide = "若潮"
        elif age <= 13.5:                 tide = "中潮"
        elif age <= 16.5:                 tide = "大潮"
        elif age <= 19.5:                 tide = "中潮"
        elif age <= 23.0:                 tide = "小潮"
        elif age <= 24.0:                 tide = "長潮"
        elif age <= 25.0:                 tide = "若潮"
        else:                             tide = "中潮"

        logger.info(f"  [潮汐] {today_str} 月齢={age:.1f} → {tide}")
        return tide

    except Exception as e:
        logger.warning(f"  [潮汐] 月齢計算失敗: {e}")
        return None


def save_environment_data(
    db,
    today_str:  str,
    weather:    dict,
    tide_info:  Optional[str],
    logger:     logging.Logger,
) -> bool:
    """
    environment_data テーブルに今日の気象・潮汐データを UPSERT する。

    実際のテーブルカラム:
        id, area_id, date, weather, wind_speed_ms, tide_type,
        tide_max_cm, tide_min_cm, source, created_at

    Returns:
        True: 保存成功 / False: スキップまたは失敗
    """
    if not weather and tide_info is None:
        logger.info("  [環境データ] 取得データなし → 保存スキップ")
        return False

    # weather カラム: "曇り(コード53) 気温3.5〜7.5°C 風15.5m/s" のような文字列で格納
    weather_summary = None
    if weather:
        desc     = weather.get("weather_desc", "")
        t_min    = weather.get("temp_min")
        t_max    = weather.get("temp_max")
        wind_ms  = weather.get("wind_speed_ms")
        wind_dir = weather.get("wind_direction")
        parts = [desc] if desc else []
        if t_min is not None and t_max is not None:
            parts.append(f"気温{t_min}〜{t_max}°C")
        if wind_ms is not None:
            dir_str = f"{wind_dir}°" if wind_dir is not None else ""
            parts.append(f"風{wind_ms:.1f}m/s{dir_str}")
        weather_summary = " ".join(parts) or None

    try:
        # 既存レコードの有無で INSERT / UPDATE を切り替え
        existing = (
            db.table("environment_data")
            .select("id, weather, wind_speed_ms")
            .eq("date", today_str)
            .limit(1)
            .execute()
        )
        if existing.data:
            # UPDATE: 天気取得失敗（weather_summary が None）の場合は既存値を保持して上書きしない
            existing_row = existing.data[0]
            update_row: dict = {}
            if weather_summary is not None:
                update_row["weather"]       = weather_summary
                update_row["wind_speed_ms"] = weather.get("wind_speed_ms")
            elif existing_row.get("weather") is None:
                # 既存も None の場合のみ None で更新（初回失敗ケース）
                update_row["weather"]       = None
                update_row["wind_speed_ms"] = None
            if tide_info is not None:
                update_row["tide_type"] = tide_info
            update_row["source"] = "open-meteo,jma"

            if update_row:
                db.table("environment_data").update(update_row).eq("date", today_str).execute()
            logger.info(f"  [環境データ] 更新完了: {today_str} / 天気:{weather_summary} 潮:{tide_info}")
        else:
            row = {
                "date":          today_str,
                "weather":       weather_summary,
                "wind_speed_ms": weather.get("wind_speed_ms") if weather else None,
                "tide_type":     tide_info,
                "source":        "open-meteo,jma",
            }
            db.table("environment_data").insert(row).execute()
            logger.info(f"  [環境データ] 保存完了: {today_str} / 天気:{weather_summary} 潮:{tide_info}")
        return True
    except Exception as e:
        logger.error(f"  [環境データ] 保存失敗: {e}")
        return False


# ──────────────────────────────────────────────────────────────────────────────
# マスタマッチング
# ──────────────────────────────────────────────────────────────────────────────

def match_fish_species(fish_name: Optional[str], species_list: list[dict]) -> Optional[int]:
    """
    抽出された魚種名を fish_species テーブルにマッチングして id を返す。
    name または aliases（配列）を総当たりで照合する。
    """
    if not fish_name:
        return None
    needle = fish_name.lower()
    for sp in species_list:
        # name 直接マッチ
        if needle in (sp.get("name") or "").lower():
            return sp["id"]
        # aliases マッチ（PostgreSQL 配列 or JSON 文字列どちらにも対応）
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
    """
    抽出された釣り方テキストを fishing_methods テーブルにマッチングして id を返す。
    テンヤ / ルアー / エサ 等のキーワードで前方一致。
    """
    if not method_text:
        return None
    needle = method_text.lower()
    for m in methods_list:
        name = (m.get("name") or "").lower()
        if name and (name in needle or needle in name):
            return m["id"]
    return None


# ──────────────────────────────────────────────────────────────────────────────
# Claude API 構造化抽出
# ──────────────────────────────────────────────────────────────────────────────

def extract_catches_with_claude(
    claude_client: anthropic.Anthropic,
    page_text: str,
    source_url: str,
    shipyard_name: str,
    target_fish: list[str],
    days_to_fetch: int,
) -> list[dict]:
    """
    Claude API にページテキストを渡し、釣果データを JSON 配列で抽出する。

    Returns:
        釣果レコードのリスト（空配列も含む）

    Raises:
        anthropic.APIError / json.JSONDecodeError
    """
    today  = datetime.now().strftime("%Y-%m-%d")
    cutoff = (datetime.now() - timedelta(days=days_to_fetch)).strftime("%Y-%m-%d")
    fish_kw = "、".join(target_fish)

    content = page_text[:MAX_CONTENT_CHARS]
    if len(page_text) > MAX_CONTENT_CHARS:
        content += "\n\n[以降省略]"

    system_prompt = (
        "あなたは釣り船宿の釣果情報を抽出するエキスパートです。"
        "与えられたページテキストを解析し、指定された魚種の釣果データを"
        "JSON 配列として返してください。"
        "JSON 配列以外のテキストは一切出力しないでください。"
    )

    valid_species_str = "、".join(VALID_SPECIES)

    user_prompt = f"""以下は船宿「{shipyard_name}」のウェブページテキストです。

【基本情報】
- ページ URL : {source_url}
- 本日の日付 : {today}
- 抽出対象魚種: {fish_kw}

【抽出条件】
1. {cutoff} ～ {today} の期間（直近 {days_to_fetch} 日分）のデータのみ抽出する
2. 対象魚種（{fish_kw}）の釣果が記載された情報のみ抽出する
3. 釣行コース・便名・船名が複数ある場合は boat_name で分けて別オブジェクトにする
4. 1 記事に複数日分が含まれる場合、期間内の日付のものだけ抽出する
5. 該当データがない場合は空の配列 [] を返す

【魚種名の正規化リスト】
{valid_species_str}
- species_name はこのリストの中から最も近いものを選ぶこと
- リストにない魚種はそのまま出力する（フォールバック）
- species_name_raw にはページから読み取った元の文字列をそのまま入れること

【出力形式】
以下の JSON 配列のみを返すこと：
[
  {{
    "date":       "YYYY-MM-DD",     // 出船日（投稿日ではなく釣行日）。不明は null
                                    // 【重要】「12日の」「3月12日」など日付が明記されている場合はその日付をそのまま使うこと
                                    // スクレイプ実行日（今日）を基準にずらさないこと。「12日」→2026-03-12（3/13に実行しても3/12のまま）
    "boat_name":  "午前アジ便",     // 船名 or 釣行コース名・便名（例: 「タチウオ船」「午前アジ」「ルアー五目」「アジキスリレー」「フグ船」）
                                    // 複数コース・複数船がある場合は必ず分けて別オブジェクトにする
                                    // 船宿に釣行区分が1種類のみで特定できない場合は null
    "count_min": 0,       // 【1人あたり】の最少釣果数（「0〜9尾/人」なら 0）。不明は null
                          // ※「船中合計」「船中総数」「トータル〇本」は絶対に使わない。必ず1人あたりの数
    "count_max": 9,       // 【1人あたり】の最多釣果数（竿頭=1人の最高記録）。不明は null
                          // ※ 例：「釣果: 船中合計30本、1人1〜9本」→ count_min=1, count_max=9（30ではない）
    "details": [
      {{
        "species_name":     "タチウオ",   // 正規化後の魚種名（正規化リストから選ぶ）
        "species_name_raw": "ルアー青物", // ページ記載の元の魚種文字列
        "count":            25,           // 竿頭（その魚種で最も多く釣った1人）の釣果数。不明は null
                          // ※「船中合計」「総数」ではなく、1人あたりの最高記録を記録すること
        "unit":             "尾",         // 単位。以下のルールで正規化すること：
                                    //   魚類（タチウオ含む）→「尾」（「本」「匹」は「尾」に統一）
                                    //   イカ・タコ類 →「杯」
                                    //   貝・カニ類  →「枚」「匹」
                                    //   不明の場合  →「尾」
        "size_text":        "60-80cm"     // サイズ情報（原文のまま）。なければ null
      }}
    ],
    "condition_text": "船長コメントや釣り場の状況（原文・300字以内）。なければ null"
  }}
]

【ページテキスト】
{content}"""

    response_text = ""
    with claude_client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        for chunk in stream.text_stream:
            response_text += chunk

    # JSON 部分だけ抽出（余計なテキストが混入した場合の保険）
    response_text = response_text.strip()
    if not response_text.startswith("["):
        start = response_text.find("[")
        end   = response_text.rfind("]") + 1
        if start >= 0 and end > start:
            response_text = response_text[start:end]
        else:
            return []

    return json.loads(response_text)


# ──────────────────────────────────────────────────────────────────────────────
# catches テーブルへの保存
# ──────────────────────────────────────────────────────────────────────────────

def save_catches(
    db,
    records:      list[dict],
    shipyard_id:  int,
    catch_raw_id: int,
    source_url:   str,
    logger:       logging.Logger,
) -> int:
    """
    catches + catch_details テーブルに保存する。

    重複判定キー: shipyard_id + sail_date + boat_name
    既存レコードがある場合: condition_text・raw_id を更新し、catch_details を削除して再 INSERT。
    新規レコードの場合: catches に INSERT して catch_id を取得し、catch_details を INSERT。

    Returns:
        保存した catches 件数（新規 + 更新）
    """
    saved = 0

    for rec in records:
        try:
            sail_date  = rec.get("date")
            boat_name  = rec.get("boat_name")
            condition  = (rec.get("condition_text") or "").strip()[:500] or None
            details    = rec.get("details") or []
            count_min  = rec.get("count_min")
            count_max  = rec.get("count_max")

            if not details:
                logger.info(f"  [catches] details なし → スキップ: {sail_date} {boat_name}")
                continue

            # ── 重複チェック: (shipyard_id, sail_date, boat_name) ──────
            q = db.table("catches").select("id").eq("shipyard_id", shipyard_id)
            if sail_date is not None:
                q = q.eq("sail_date", sail_date)
            else:
                q = q.is_("sail_date", "null")
            if boat_name:
                q = q.eq("boat_name", boat_name)
            else:
                q = q.is_("boat_name", "null")
            existing = q.limit(1).execute()

            if existing.data:
                # 既存: catches を更新 + catch_details を差し替え
                catch_id = existing.data[0]["id"]
                db.table("catches").update({
                    "condition_text": condition,
                    "raw_id":         catch_raw_id,
                    "count_min":      count_min,
                    "count_max":      count_max,
                }).eq("id", catch_id).execute()
                db.table("catch_details").delete().eq("catch_id", catch_id).execute()
                logger.info(f"  [catches] 更新: id={catch_id} {sail_date} {boat_name}")
            else:
                # 新規: catches に INSERT
                row = {
                    "shipyard_id":      shipyard_id,
                    "raw_id":           catch_raw_id,
                    "sail_date":        sail_date,
                    "boat_name":        boat_name,
                    "condition_text":   condition,
                    "source_url":       source_url,
                    "catch_type":       "ship_total",
                    "confidence_score": 1.0,
                    "count_min":        count_min,
                    "count_max":        count_max,
                }
                result   = db.table("catches").insert(row).execute()
                catch_id = result.data[0]["id"]
                logger.info(f"  [catches] 新規: id={catch_id} {sail_date} {boat_name}")

            # ── catch_details を INSERT ─────────────────────────────────
            detail_rows = [
                {
                    "catch_id":         catch_id,
                    "species_name":     d.get("species_name"),
                    "species_name_raw": d.get("species_name_raw"),
                    "count":            d.get("count"),
                    "unit":             d.get("unit") or "尾",
                    "size_text":        d.get("size_text"),
                }
                for d in details
            ]
            db.table("catch_details").insert(detail_rows).execute()
            logger.info(
                f"    catch_details: {len(detail_rows)} 件 "
                + " / ".join(
                    f"{d.get('species_name')} {d.get('count')}{d.get('unit','尾')}"
                    for d in details
                )
            )
            saved += 1

        except Exception as e:
            logger.error(f"  [catches] 保存失敗: {e}")

    return saved


# ──────────────────────────────────────────────────────────────────────────────
# condition_text 強制再取得
# ──────────────────────────────────────────────────────────────────────────────

def fix_condition_text(db, claude_client, logger):
    """condition_text が NULL の catches を再スクレイピングして更新する"""
    logger.info("=" * 60)
    logger.info("condition_text 強制再取得 開始")
    logger.info("=" * 60)

    days_to_fetch = load_days_to_fetch()

    # 対象魚種リスト取得（プロンプト用）
    try:
        species_list = db.table("fish_species").select("id, name").execute().data or []
        all_fish_names = [sp["name"] for sp in species_list if sp.get("name")]
    except Exception as e:
        logger.error(f"マスタ取得失敗: {e}")
        return

    # condition_text IS NULL の catches を取得
    try:
        result = db.table("catches").select(
            "id, shipyard_id, sail_date, boat_name"
        ).is_("condition_text", "null").execute()
        null_catches = result.data or []
    except Exception as e:
        logger.error(f"クエリ失敗: {e}")
        return

    if not null_catches:
        logger.info("condition_text が NULL のレコードはありません")
        return

    logger.info(f"対象レコード: {len(null_catches)} 件")

    # shipyard_id でグループ化
    by_yard: dict[int, list[dict]] = defaultdict(list)
    for c in null_catches:
        by_yard[c["shipyard_id"]].append(c)

    # 船宿マスタ取得
    try:
        yards_result = db.table("shipyards").select("id, name, url").execute()
        yards_map = {y["id"]: y for y in (yards_result.data or [])}
    except Exception as e:
        logger.error(f"shipyards 取得失敗: {e}")
        return

    updated_total = 0

    for yard_id, catches in by_yard.items():
        yard = yards_map.get(yard_id)
        if not yard:
            continue

        yard_name = yard.get("name") or f"ID:{yard_id}"
        yard_url  = yard.get("url") or ""

        if not yard_url:
            logger.warning(f"  {yard_name}: URL 未設定のためスキップ")
            continue

        logger.info(f"\n▶ {yard_name} ({len(catches)} 件対象)")

        try:
            html      = fetch_html(yard_url)
            page_text = html_to_text(html)

            extracted = extract_catches_with_claude(
                claude_client, page_text, yard_url, yard_name, all_fish_names, days_to_fetch
            )

            if not extracted:
                logger.info("  抽出レコードなし")
                time.sleep(INTER_REQUEST_WAIT)
                continue

            updated = 0
            # 抽出結果を (sail_date, boat_name) をキーにマップ化
            extracted_map = {
                (rec.get("date"), rec.get("boat_name")): rec
                for rec in extracted
            }

            for catch in catches:
                key       = (catch.get("sail_date"), catch.get("boat_name"))
                rec       = extracted_map.get(key)
                if not rec:
                    continue
                condition = (rec.get("condition_text") or "").strip()[:500] or None
                if not condition:
                    continue
                try:
                    db.table("catches").update(
                        {"condition_text": condition}
                    ).eq("id", catch["id"]).execute()
                    logger.info(
                        f"  UPDATE id={catch['id']} sail={catch.get('sail_date')} "
                        f"text={condition[:40]}..."
                    )
                    updated += 1
                except Exception as e:
                    logger.error(f"  UPDATE 失敗 id={catch['id']}: {e}")

            logger.info(f"  → {updated} 件更新")
            updated_total += updated

        except Exception as e:
            logger.error(f"  {yard_name}: エラー - {e}", exc_info=True)

        time.sleep(INTER_REQUEST_WAIT)

    logger.info(f"\n合計 {updated_total} 件の condition_text を更新しました")
    logger.info("=" * 60)


# ──────────────────────────────────────────────────────────────────────────────
# メイン
# ──────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="釣果スクレイパー")
    parser.add_argument(
        "--fix-condition-text", action="store_true",
        help="condition_text が NULL の catches を再スクレイピングして更新する",
    )
    parser.add_argument(
        "--shipyard-ids", type=int, nargs="+", metavar="ID",
        help="テスト用: 処理する船宿 ID を指定（例: --shipyard-ids 19 22 25 30）",
    )
    args = parser.parse_args()

    logger = setup_logger()
    logger.info("=" * 60)
    logger.info("釣果スクレイパー v2 開始")
    logger.info("=" * 60)

    days_to_fetch = load_days_to_fetch()

    # ── API キー確認 ──
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY が設定されていません")
        sys.exit(1)

    claude_client = anthropic.Anthropic(api_key=api_key)

    # ── Supabase 接続 ──
    try:
        db = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info(f"Supabase 接続OK: {SUPABASE_URL}")
    except Exception as e:
        logger.error(f"Supabase 接続失敗: {e}")
        sys.exit(1)

    # ── --fix-condition-text モード ──
    if args.fix_condition_text:
        fix_condition_text(db, claude_client, logger)
        return

    # ── マスタデータ取得 ──
    try:
        species_list = db.table("fish_species").select("id, name").execute().data or []
        logger.info(f"fish_species: {len(species_list)} 件")
    except Exception as e:
        logger.warning(f"マスタ取得失敗（空リストで続行）: {e}")
        species_list = []

    # 対象魚種リストを構築（DB から取得、なければフォールバック）
    fallback_fish = ["タチウオ", "アジ", "シーバス", "サワラ"]
    target_fish = [sp["name"] for sp in species_list if sp.get("name")] or fallback_fish
    logger.info(f"対象魚種: {' / '.join(target_fish)}")

    # ── 気象・潮汐データ取得・保存 ──
    today_str = datetime.now().strftime("%Y-%m-%d")
    logger.info(f"\n▶ 気象・潮汐データ取得（{today_str}）")
    weather_data = fetch_weather_data(today_str, logger)
    tide_info    = fetch_tide_data(today_str, logger)
    save_environment_data(db, today_str, weather_data, tide_info, logger)

    # ── 船宿一覧を Supabase から取得 ──
    try:
        yards_result = db.table("shipyards").select("*").eq("is_active", True).execute()
        active_yards = yards_result.data or []
    except Exception as e:
        logger.error(f"shipyards テーブル取得失敗: {e}")
        sys.exit(1)

    if not active_yards:
        logger.warning("is_active=true の船宿が 0 件です。処理を終了します。")
        sys.exit(0)

    if args.shipyard_ids:
        active_yards = [y for y in active_yards if y["id"] in args.shipyard_ids]
        logger.info(f"--shipyard-ids 指定: {args.shipyard_ids} → {len(active_yards)} 件に絞り込み")

    logger.info(f"対象船宿: {len(active_yards)} 件 | 直近 {days_to_fetch} 日分")

    total_saved = 0
    skipped     = 0
    errors      = []

    for yard in active_yards:
        yard_id   = yard["id"]
        yard_name = yard.get("name") or f"ID:{yard_id}"
        yard_area = yard.get("area") or yard.get("area_name") or ""
        yard_url  = yard.get("url") or ""

        if not yard_url:
            logger.warning(f"  {yard_name}: URL 未設定のためスキップ")
            continue

        logger.info(f"\n▶ {yard_name}（{yard_area}）")
        logger.info(f"  URL: {yard_url}")

        try:
            # 1. HTML 取得
            html      = fetch_html(yard_url)
            html_hash = compute_md5(html)

            # 2. 差分チェック ─ 変化なしなら Claude API をスキップ
            prev_hash = get_latest_html_hash(db, yard_id)
            if prev_hash and prev_hash == html_hash:
                logger.info("  HTML 変化なし → Claude API スキップ")
                skipped += 1
                time.sleep(INTER_REQUEST_WAIT)
                continue

            logger.info(f"  HTML 更新あり（hash: {html_hash[:8]}...）")

            # 3. テキスト変換
            page_text = html_to_text(html)
            logger.info(f"  テキスト変換完了（{len(page_text):,} 文字）")

            # 4. catch_raw に生データ保存
            catch_raw_id = save_catch_raw(db, yard_id, html, html_hash, page_text, yard_url)
            logger.info(f"  catch_raw 保存 (id={catch_raw_id})")

            # 5. Claude API で釣果抽出
            records = extract_catches_with_claude(
                claude_client, page_text, yard_url, yard_name, target_fish, days_to_fetch
            )
            logger.info(f"  抽出レコード数: {len(records)} 件")

            if not records:
                logger.info("  → 該当データなし")
                time.sleep(INTER_REQUEST_WAIT)
                continue

            # ログ出力
            for r in records:
                boat = r.get("boat_name") or "（船名不明）"
                dets = r.get("details") or []
                logger.info(f"    [{r.get('date')}] {boat}: {len(dets)} 魚種")
                for d in dets:
                    logger.info(
                        f"      - {d.get('species_name')} "
                        f"{d.get('count')}{d.get('unit','尾')} "
                        f"{d.get('size_text') or ''}"
                    )

            # 6. catches + catch_details に保存
            saved = save_catches(
                db, records, yard_id, catch_raw_id, yard_url, logger
            )
            logger.info(f"  → catches に {saved} 件保存")

            # 7. catch_raw の is_parsed を True に更新
            if saved > 0:
                db.table("catch_raw").update({"is_parsed": True}).eq("id", catch_raw_id).execute()
            total_saved += saved

        except requests.RequestException as e:
            msg = f"{yard_name}: HTTP エラー - {e}"
            logger.error(f"  {msg}")
            errors.append(msg)

        except json.JSONDecodeError as e:
            msg = f"{yard_name}: JSON パースエラー - {e}"
            logger.error(f"  {msg}")
            errors.append(msg)

        except anthropic.APIError as e:
            msg = f"{yard_name}: Claude API エラー - {e}"
            logger.error(f"  {msg}")
            errors.append(msg)

        except Exception as e:
            msg = f"{yard_name}: 予期しないエラー - {e}"
            logger.error(f"  {msg}", exc_info=True)
            errors.append(msg)

        time.sleep(INTER_REQUEST_WAIT)

    # ── サマリー ──
    logger.info("\n" + "=" * 60)
    logger.info(f"完了: {total_saved} 件保存 / {skipped} 件スキップ（HTML 変化なし）")
    if errors:
        logger.info(f"エラー: {len(errors)} 件")
        for err in errors:
            logger.info(f"  ✗ {err}")
    logger.info("=" * 60)

    # ── Vercel on-demand revalidation ──
    if total_saved > 0:
        site_url   = os.environ.get("SITE_URL", "").rstrip("/")
        secret     = os.environ.get("REVALIDATE_SECRET", "")
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
        else:
            logger.info("SITE_URL/REVALIDATE_SECRET 未設定 → revalidation スキップ")


if __name__ == "__main__":
    main()
