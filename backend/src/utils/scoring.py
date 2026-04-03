from __future__ import annotations
"""
daily_conditions 集計ロジック

毎日のスクレイプ後に実行し、魚種×エリアごとの「状況スコア」を算出する。
「釣れている/釣れていない」を文脈付きで判断するための分析層。

使い方:
    from utils.scoring import compute_daily_conditions
    compute_daily_conditions(db, target_date="2026-04-03", logger=logger)
"""
import logging
from datetime import datetime, timedelta
from typing import Optional


def compute_daily_conditions(
    db,
    target_date: str,
    logger: logging.Logger,
) -> int:
    """
    指定日の daily_conditions を算出して UPSERT する。

    処理フロー:
    1. 当日の catches_v2 + fishing_trips を集計（魚種×エリア）
    2. species_baselines からベースライン取得
    3. 前年同日データを取得
    4. 直近7日のトレンドを算出
    5. trip_signals の定性スコアを集計
    6. 総合判定
    """
    updated = 0

    # ── 1. 当日の実績を魚種×エリアで集計 ─────────────────────────────────
    actuals = _fetch_daily_actuals(db, target_date)
    if not actuals:
        logger.info(f"  [scoring] {target_date}: 釣果データなし")
        return 0

    logger.info(f"  [scoring] {target_date}: {len(actuals)} 魚種×エリア")

    for key, actual in actuals.items():
        fish_species_id, area_id = key

        try:
            # ── 2. ベースライン取得 ──────────────────────────────────────
            month = int(target_date[5:7])
            baseline = _fetch_baseline(db, fish_species_id, area_id, month)

            # ── 3. 定量スコア（ベースライン比）──────────────────────────
            quantity_score = _calc_quantity_score(actual, baseline)

            # ── 4. 前年比 ───────────────────────────────────────────────
            yoy = _calc_yoy(db, fish_species_id, area_id, target_date)

            # ── 5. 直近7日トレンド ──────────────────────────────────────
            trend = _calc_trend_7d(db, fish_species_id, area_id, target_date)

            # ── 6. 定性スコア（シグナルから）─────────────────────────────
            qual = _calc_qualitative_score(db, fish_species_id, area_id, target_date)

            # ── 7. 総合判定 ─────────────────────────────────────────────
            overall = _determine_overall_rating(
                quantity_score, qual["score"], baseline, yoy
            )

            # ── 8. UPSERT ──────────────────────────────────────────────
            row = {
                "date":                target_date,
                "fish_species_id":     fish_species_id,
                "area_id":             area_id,
                "quantity_score":      quantity_score,
                "actual_count_avg":    actual["count_avg"],
                "baseline_count_avg":  baseline.get("count_avg") if baseline else None,
                "qualitative_score":   qual["score"],
                "signal_summary":      qual["summary"],
                "yoy_ratio":           yoy.get("ratio") if yoy else None,
                "yoy_sample_size":     yoy.get("sample_size") if yoy else None,
                "trend_7d":            trend.get("direction") if trend else None,
                "trend_score_7d":      trend.get("slope") if trend else None,
                "trip_count":          actual["trip_count"],
                "trip_count_yoy_ratio": yoy.get("trip_ratio") if yoy else None,
                "overall_rating":      overall["rating"],
                "rating_reason":       overall["reason"],
            }
            _upsert_daily_condition(db, row)
            updated += 1

            logger.info(
                f"    {fish_species_id}@{area_id}: "
                f"qty={quantity_score:+.1f} qual={qual['score']:+.1f} "
                f"yoy={'x'+str(yoy['ratio']) if yoy else '-'} "
                f"trend={trend.get('direction','?') if trend else '-'} "
                f"→ {overall['rating']}"
            )

        except Exception as e:
            logger.error(f"    {fish_species_id}@{area_id}: スコア算出失敗: {e}")

    return updated


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 内部関数
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _fetch_daily_actuals(db, target_date: str) -> dict:
    """
    当日の catches_v2 を魚種×エリアで集計。

    戻り値: {(fish_species_id, area_id): {count_avg, count_max, trip_count}}
    """
    # catches_v2 → fishing_trips → shipyards → areas で JOIN
    result = db.table("catches_v2").select(
        "fish_species_id, count, count_max, "
        "fishing_trips!inner(sail_date, shipyard_id, "
        "shipyards!inner(area_id))"
    ).eq(
        "fishing_trips.sail_date", target_date
    ).eq(
        "detail_type", "catch"
    ).not_.is_(
        "fish_species_id", "null"
    ).execute()

    if not result.data:
        return {}

    # 集計
    agg = {}
    for row in result.data:
        fid = row["fish_species_id"]
        trip = row.get("fishing_trips") or {}
        shipyard = trip.get("shipyards") or {}
        aid = shipyard.get("area_id")
        if not fid or not aid:
            continue

        key = (fid, aid)
        if key not in agg:
            agg[key] = {"counts": [], "trip_ids": set()}

        count_val = row.get("count_max") or row.get("count")
        if count_val is not None:
            agg[key]["counts"].append(count_val)
        # trip_id での重複排除は fishing_trips 側で
        agg[key]["trip_ids"].add(trip.get("shipyard_id"))

    # 平均・最大・出船数
    result_dict = {}
    for key, data in agg.items():
        counts = data["counts"]
        result_dict[key] = {
            "count_avg": sum(counts) / len(counts) if counts else 0,
            "count_max": max(counts) if counts else 0,
            "trip_count": len(data["trip_ids"]),
        }
    return result_dict


def _fetch_baseline(db, fish_species_id: int, area_id: int, month: int) -> Optional[dict]:
    """species_baselines から通年平均ベースラインを取得"""
    result = db.table("species_baselines").select("*").eq(
        "fish_species_id", fish_species_id
    ).eq(
        "area_id", area_id
    ).eq(
        "month", month
    ).is_(
        "year", "null"  # 通年平均
    ).limit(1).maybeSingle().execute()

    return result.data if result.data else None


def _calc_quantity_score(actual: dict, baseline: Optional[dict]) -> float:
    """
    定量スコア算出。ベースラインとの比較。

    スコア:
      +2.0 = 爆釣（p75 を大きく超える）
      +1.0 = 好調（p75 付近）
       0.0 = 平均的
      -1.0 = 不調（p25 付近）
      -2.0 = 絶望的（p25 を大きく下回る）

    ベースラインがない場合は 0.0（判断不能）
    """
    if not baseline or not baseline.get("count_avg"):
        return 0.0

    avg = actual["count_avg"]
    bl_avg = baseline["count_avg"]
    bl_p25 = baseline.get("count_p25") or bl_avg * 0.5
    bl_p75 = baseline.get("count_p75") or bl_avg * 1.5

    # IQR（四分位範囲）ベースのスコア
    iqr = bl_p75 - bl_p25
    if iqr <= 0:
        iqr = bl_avg * 0.5 or 1  # ゼロ除算防止

    score = (avg - bl_avg) / iqr

    # -2.0 〜 +2.0 にクランプ
    return max(-2.0, min(2.0, round(score, 1)))


def _calc_yoy(db, fish_species_id: int, area_id: int, target_date: str) -> Optional[dict]:
    """
    前年同時期比を算出。
    前年の同日 ±3日 のデータを使う。
    """
    from datetime import date

    try:
        d = date.fromisoformat(target_date)
        last_year_start = (d.replace(year=d.year - 1) - timedelta(days=3)).isoformat()
        last_year_end = (d.replace(year=d.year - 1) + timedelta(days=3)).isoformat()
    except ValueError:
        return None

    # 前年データを取得
    result = db.table("catches_v2").select(
        "count, count_max, "
        "fishing_trips!inner(sail_date, shipyard_id, "
        "shipyards!inner(area_id))"
    ).eq(
        "detail_type", "catch"
    ).eq(
        "fish_species_id", fish_species_id
    ).gte(
        "fishing_trips.sail_date", last_year_start
    ).lte(
        "fishing_trips.sail_date", last_year_end
    ).execute()

    if not result.data:
        return None

    # 前年の同エリアのみフィルタ
    counts = []
    trip_ids = set()
    for row in result.data:
        trip = row.get("fishing_trips") or {}
        shipyard = trip.get("shipyards") or {}
        if shipyard.get("area_id") != area_id:
            continue
        count_val = row.get("count_max") or row.get("count")
        if count_val is not None:
            counts.append(count_val)
        trip_ids.add(trip.get("shipyard_id"))

    if not counts:
        return None

    last_year_avg = sum(counts) / len(counts)
    if last_year_avg <= 0:
        return None

    # 今年のデータは _fetch_daily_actuals で既に取得済みだが、
    # ここでは daily_conditions に保存する値だけ返す
    return {
        "last_year_avg": round(last_year_avg, 1),
        "sample_size": len(counts),
        "ratio": None,  # 呼び出し元で actual と組み合わせて算出
        "trip_ratio": None,
        "trip_count_last_year": len(trip_ids),
    }


def _calc_trend_7d(db, fish_species_id: int, area_id: int, target_date: str) -> Optional[dict]:
    """
    直近7日のトレンドを算出。
    daily_conditions の過去データから線形回帰の傾きを見る。
    """
    from datetime import date

    d = date.fromisoformat(target_date)
    start = (d - timedelta(days=7)).isoformat()

    result = db.table("daily_conditions").select(
        "date, actual_count_avg"
    ).eq(
        "fish_species_id", fish_species_id
    ).eq(
        "area_id", area_id
    ).gte("date", start).lt("date", target_date
    ).order("date").execute()

    if not result.data or len(result.data) < 3:
        return None

    # 簡易線形回帰（最小二乗法）
    n = len(result.data)
    xs = list(range(n))
    ys = [row.get("actual_count_avg") or 0 for row in result.data]

    x_mean = sum(xs) / n
    y_mean = sum(ys) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    denominator = sum((x - x_mean) ** 2 for x in xs)

    if denominator == 0:
        return {"direction": "stable", "slope": 0.0}

    slope = numerator / denominator

    # 傾きの判定
    # y_mean に対する相対的な傾き
    relative_slope = slope / y_mean if y_mean > 0 else 0

    if relative_slope > 0.1:
        direction = "rising"
    elif relative_slope < -0.1:
        direction = "declining"
    else:
        direction = "stable"

    return {"direction": direction, "slope": round(slope, 2)}


def _calc_qualitative_score(
    db, fish_species_id: int, area_id: int, target_date: str
) -> dict:
    """
    当日の trip_signals を集計して定性スコアを算出。

    スコア加算ルール:
      everyone_caught: +1.0
      limit_reached:   +1.5
      record_catch:    +2.0
      size_up:         +0.5
      season_start:    +0.5
      tough_bite:      -1.0
      early_return:    -0.5
      season_end:      -0.5
    """
    SIGNAL_WEIGHTS = {
        "everyone_caught": +1.0,
        "limit_reached":   +1.5,
        "record_catch":    +2.0,
        "size_up":         +0.5,
        "season_start":    +0.5,
        "tough_bite":      -1.0,
        "early_return":    -0.5,
        "season_end":      -0.5,
        "bait_situation":  +0.3,
        "depth_info":       0.0,  # 情報のみ、スコアに影響なし
        "technique_tip":    0.0,
    }

    # 当日の trip_signals を取得
    result = db.table("trip_signals").select(
        "signal_type, trip_id, "
        "fishing_trips!inner(sail_date, shipyard_id, "
        "shipyards!inner(area_id))"
    ).eq(
        "fishing_trips.sail_date", target_date
    ).execute()

    if not result.data:
        return {"score": 0.0, "summary": {}}

    # エリアでフィルタ + シグナル集計
    signal_counts = {}
    for row in result.data:
        trip = row.get("fishing_trips") or {}
        shipyard = trip.get("shipyards") or {}
        if shipyard.get("area_id") != area_id:
            continue

        sig_type = row["signal_type"]
        signal_counts[sig_type] = signal_counts.get(sig_type, 0) + 1

    # スコア算出
    total_score = 0.0
    for sig_type, count in signal_counts.items():
        weight = SIGNAL_WEIGHTS.get(sig_type, 0)
        # 複数船宿からのシグナルは重みを増やすが、上限あり
        multiplier = min(count, 3)  # 3件以上は頭打ち
        total_score += weight * multiplier

    # -2.0 〜 +2.0 にクランプ
    total_score = max(-2.0, min(2.0, round(total_score, 1)))

    return {"score": total_score, "summary": signal_counts}


def _determine_overall_rating(
    quantity_score: float,
    qualitative_score: float,
    baseline: Optional[dict],
    yoy: Optional[dict],
) -> dict:
    """
    総合判定。

    rating: 'excellent' / 'good' / 'average' / 'poor' / 'off_season'
    reason: 判定理由テキスト
    """
    # シーズンオフ判定
    if baseline and baseline.get("season_rank") == "off":
        return {
            "rating": "off_season",
            "reason": "シーズンオフ",
        }

    # 加重平均スコア（定量70% + 定性30%）
    combined = quantity_score * 0.7 + qualitative_score * 0.3

    # 判定
    if combined >= 1.2:
        rating = "excellent"
    elif combined >= 0.4:
        rating = "good"
    elif combined >= -0.4:
        rating = "average"
    else:
        rating = "poor"

    # 理由テキスト生成
    reasons = []
    if quantity_score >= 1.0:
        reasons.append("ベースライン上位")
    elif quantity_score <= -1.0:
        reasons.append("ベースライン下位")

    if qualitative_score >= 1.0:
        reasons.append("好シグナル多数")
    elif qualitative_score <= -1.0:
        reasons.append("不調シグナルあり")

    if yoy and yoy.get("ratio"):
        r = yoy["ratio"]
        if r >= 1.3:
            reasons.append(f"昨年比+{int((r-1)*100)}%")
        elif r <= 0.7:
            reasons.append(f"昨年比{int((r-1)*100)}%")

    return {
        "rating": rating,
        "reason": " / ".join(reasons) if reasons else rating,
    }


def _upsert_daily_condition(db, row: dict) -> None:
    """daily_conditions に UPSERT"""
    db.table("daily_conditions").upsert(
        row,
        on_conflict="date,fish_species_id,area_id",
    ).execute()
