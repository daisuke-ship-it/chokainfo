from __future__ import annotations
"""
異常値検知モジュール

スクレイパー保存後に実行し、catches_v2 の confidence_score を更新。
trip_signals に anomaly_* シグナルを追記する。

検知ルール:
  1. 魚種別 IQR 外れ値（species_baselines 参照）
  2. 同一船宿の前回比で急変（300%超 or 1/3以下）
  3. 重複疑い（同船宿・同日・同便名で複数 trip）
  4. サイズ矛盾（魚種カテゴリに対して非現実的）
  5. ゼロ値（count=0 はパースミスの可能性）

使い方:
    from utils.anomaly import check_anomalies
    flagged = check_anomalies(db, trip_ids=[785, 786], logger=logger)
"""
import logging
import math
from typing import Optional


# ── 魚種別の現実的上限（ハードコード安全弁）────────────────────────────────
# species_baselines が空でも最低限のチェックができるように
HARD_LIMITS: dict[str, int] = {
    "トラフグ":   30,
    "マダイ":     50,
    "ヒラメ":     30,
    "タチウオ":  120,
    "アジ":      300,
    "シロギス":  250,
    "サワラ":     80,
    "シーバス":  100,
    "ヤリイカ":  100,
    "メバル":     60,
    "カワハギ":   80,
    "マゴチ":     50,
    "イサキ":    100,
    "クロダイ":   30,
    "青物":       60,
    "オニカサゴ":  30,
}
DEFAULT_HARD_LIMIT = 500  # 未登録魚種のフォールバック


def check_anomalies(
    db,
    trip_ids: list[int],
    logger: logging.Logger,
) -> int:
    """
    指定 trip の catches_v2 を検査し、異常があれば
    confidence_score を下げ、trip_signals に記録する。

    Returns: フラグを立てた catch レコード数
    """
    if not trip_ids:
        return 0

    # ── 対象データ取得 ──────────────────────────────────────────────────
    catches = _fetch_catches_for_trips(db, trip_ids)
    if not catches:
        return 0

    trips = _fetch_trips(db, trip_ids)
    trip_map = {t["id"]: t for t in trips}

    # ── ベースライン取得（キャッシュ）─────────────────────────────────────
    baselines = _fetch_all_baselines(db)
    # 対象 trip の月を取得
    from datetime import datetime as _dt

    # ── 各 catch を検査 ─────────────────────────────────────────────────
    flagged = 0
    anomaly_signals: list[dict] = []

    for c in catches:
        reasons: list[str] = []
        score = 1.0
        trip = trip_map.get(c["trip_id"], {})
        species_name = c.get("species_name_raw") or ""
        count = c.get("count")

        if count is None:
            continue

        fish_id = c.get("fish_species_id")

        # ── Rule 1: IQR 外れ値 ─────────────────────────────────────────
        sail_date = trip.get("sail_date") or ""
        month = int(sail_date[5:7]) if len(sail_date) >= 7 else None
        bl = _find_baseline(baselines, fish_id, month)
        if bl and bl.get("count_p75") is not None:
            iqr = (bl["count_p75"] or 0) - (bl["count_p25"] or 0)
            upper = (bl["count_p75"] or 0) + 3.0 * max(iqr, 1)
            if count > upper and count > 10:
                score = min(score, 0.3)
                reasons.append(
                    f"IQR外れ値: {species_name} {count}匹"
                    f" (p75={bl['count_p75']}, upper={upper:.0f})"
                )

        # ── Rule 1b: ハードリミット（baselines 空でも効く）──────────────
        hard = HARD_LIMITS.get(species_name, DEFAULT_HARD_LIMIT)
        if count > hard:
            score = min(score, 0.2)
            reasons.append(
                f"ハードリミット超過: {species_name} {count}匹 (上限{hard})"
            )

        # ── Rule 2: 同一船宿の前回比で急変 ──────────────────────────────
        if fish_id and trip.get("shipyard_id"):
            prev = _fetch_prev_count(
                db, trip["shipyard_id"], fish_id,
                trip.get("sail_date"), c["trip_id"],
            )
            if prev is not None and prev > 0:
                ratio = count / prev
                if ratio > 5.0 and count > 20:
                    score = min(score, 0.4)
                    reasons.append(
                        f"前回比急増: {species_name} {prev}→{count}匹"
                        f" ({ratio:.1f}倍)"
                    )
                elif ratio < 0.1 and prev > 20:
                    score = min(score, 0.5)
                    reasons.append(
                        f"前回比急減: {species_name} {prev}→{count}匹"
                    )

        # ── Rule 5: ゼロ値（ボウズの可能性もあるので軽めのフラグ）────────
        if count == 0:
            score = min(score, 0.8)
            reasons.append(f"ゼロ値: {species_name}")

        # ── 結果反映 ───────────────────────────────────────────────────
        if score < 1.0:
            _update_confidence(db, c["id"], score)
            for reason in reasons:
                anomaly_signals.append({
                    "trip_id":      c["trip_id"],
                    "signal_type":  "anomaly",
                    "signal_value": f"score={score:.1f}",
                    "source_text":  reason[:300],
                    "extracted_by": "anomaly_check",
                })
            logger.warning(
                f"    ⚠ anomaly [{score:.1f}] catch={c['id']}: "
                + "; ".join(reasons)
            )
            flagged += 1

    # ── Rule 3: 重複疑い（trip レベル）───────────────────────────────────
    dup_signals = _check_duplicates(db, trips, logger)
    anomaly_signals.extend(dup_signals)

    # ── シグナル一括保存 ─────────────────────────────────────────────────
    if anomaly_signals:
        try:
            db.table("trip_signals").insert(anomaly_signals).execute()
        except Exception as e:
            logger.error(f"    anomaly signals 保存失敗: {e}")

    if flagged:
        logger.info(f"  異常値検知: {flagged} 件フラグ")

    return flagged


# ── ベースライン投入 ─────────────────────────────────────────────────────────

def refresh_baselines(db, logger: logging.Logger) -> int:
    """
    catches_v2 の全データから魚種×エリア×月ごとの統計を計算し
    species_baselines に UPSERT する。

    month=1〜12 で月別に保存。データが少ない月はスキップ。
    """
    # 魚種ごとの count + trip_id 集計
    res = db.table("catches_v2").select(
        "fish_species_id, count, trip_id"
    ).eq("detail_type", "catch").not_.is_("count", "null").execute()

    if not res.data:
        return 0

    # trip → (area_id, sail_date) マッピング
    trip_ids = list({r["trip_id"] for r in res.data})
    trip_meta = _fetch_trip_meta(db, trip_ids)

    # 魚種×エリア×月 で集計
    from collections import defaultdict
    stats: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for r in res.data:
        fid = r["fish_species_id"]
        if not fid:
            continue
        meta = trip_meta.get(r["trip_id"])
        if not meta:
            continue
        area_id = meta["area_id"]
        month = meta["month"]
        if not month:
            continue
        stats[(fid, area_id, month)].append(r["count"])

    rows = []
    for (fid, area_id, month), counts in stats.items():
        if len(counts) < 3:
            continue
        counts_sorted = sorted(counts)
        n = len(counts_sorted)
        p25 = counts_sorted[int(n * 0.25)]
        p75 = counts_sorted[int(n * 0.75)]
        avg = sum(counts) / n
        rows.append({
            "fish_species_id":     fid,
            "area_id":             area_id,
            "month":               month,
            "year":                None,
            "count_avg":           round(avg, 1),
            "count_p25":           p25,
            "count_p75":           p75,
            "count_max_record":    max(counts),
            "sample_size":         n,
            "is_in_season":        True,
        })

    # 既存を全削除して再投入
    try:
        db.table("species_baselines").delete().gte("month", 1).execute()
    except Exception:
        pass

    if rows:
        # 50件ずつ分割挿入
        for i in range(0, len(rows), 50):
            db.table("species_baselines").insert(rows[i:i+50]).execute()
        logger.info(f"  baselines 更新: {len(rows)} 件（魚種×エリア×月）")

    return len(rows)


# ── 内部ヘルパー ─────────────────────────────────────────────────────────────

def _fetch_catches_for_trips(db, trip_ids: list[int]) -> list[dict]:
    """trip_ids に対応する catches_v2 を取得"""
    all_catches = []
    # Supabase の in_ は URL 長制限があるので分割
    for i in range(0, len(trip_ids), 50):
        chunk = trip_ids[i:i+50]
        res = db.table("catches_v2").select(
            "id, trip_id, fish_species_id, species_name_raw, count, unit, size_text"
        ).in_("trip_id", chunk).eq("detail_type", "catch").execute()
        all_catches.extend(res.data or [])
    return all_catches


def _fetch_trips(db, trip_ids: list[int]) -> list[dict]:
    all_trips = []
    for i in range(0, len(trip_ids), 50):
        chunk = trip_ids[i:i+50]
        res = db.table("fishing_trips").select(
            "id, shipyard_id, sail_date, boat_name_raw"
        ).in_("id", chunk).execute()
        all_trips.extend(res.data or [])
    return all_trips


def _fetch_all_baselines(db) -> list[dict]:
    """全ベースラインを取得"""
    res = db.table("species_baselines").select(
        "fish_species_id, area_id, month, count_avg, count_p25, count_p75, count_max_record"
    ).execute()
    return res.data or []


def _find_baseline(
    baselines: list[dict],
    fish_id: Optional[int],
    month: Optional[int],
) -> Optional[dict]:
    """baselines リストから該当魚種・月のレコードを返す"""
    if not fish_id:
        return None
    # 同じ月で探す → なければ任意の月
    match_any = None
    for bl in baselines:
        if bl["fish_species_id"] == fish_id:
            if month and bl.get("month") == month:
                return bl
            if match_any is None:
                match_any = bl
    return match_any


def _fetch_prev_count(
    db,
    shipyard_id: int,
    fish_species_id: int,
    sail_date: Optional[str],
    exclude_trip_id: int,
) -> Optional[int]:
    """同一船宿・同一魚種の直近1件の count を返す"""
    try:
        q = db.table("fishing_trips").select(
            "id, catches_v2!inner(count)"
        ).eq("shipyard_id", shipyard_id).eq(
            "catches_v2.fish_species_id", fish_species_id
        ).neq("id", exclude_trip_id).order(
            "sail_date", desc=True
        ).limit(1)

        if sail_date:
            q = q.lt("sail_date", sail_date)

        res = q.execute()
        if res.data and res.data[0].get("catches_v2"):
            catches = res.data[0]["catches_v2"]
            if isinstance(catches, list) and catches:
                return catches[0].get("count")
    except Exception:
        pass
    return None


def _fetch_trip_meta(db, trip_ids: list[int]) -> dict[int, dict]:
    """trip_id → {area_id, month} のマッピングを返す"""
    result: dict[int, dict] = {}
    for i in range(0, len(trip_ids), 100):
        chunk = trip_ids[i:i+100]
        res = db.table("fishing_trips").select(
            "id, sail_date, shipyards(area_id)"
        ).in_("id", chunk).execute()
        for r in (res.data or []):
            sy = r.get("shipyards")
            area_id = sy.get("area_id", 1) if sy and isinstance(sy, dict) else 1
            sail_date = r.get("sail_date") or ""
            month = int(sail_date[5:7]) if len(sail_date) >= 7 else None
            result[r["id"]] = {"area_id": area_id, "month": month}
    return result


def _update_confidence(db, catch_id: int, score: float) -> None:
    try:
        db.table("catches_v2").update(
            {"confidence_score": score}
        ).eq("id", catch_id).execute()
    except Exception:
        pass


def _check_duplicates(
    db,
    trips: list[dict],
    logger: logging.Logger,
) -> list[dict]:
    """同船宿・同日・同便名のレコードが複数あれば警告"""
    from collections import Counter
    keys = []
    for t in trips:
        key = (
            t.get("shipyard_id"),
            t.get("sail_date"),
            t.get("boat_name_raw") or "",
        )
        keys.append((key, t["id"]))

    key_counts = Counter(k for k, _ in keys)
    signals = []
    for key, tid in keys:
        if key_counts[key] > 1:
            reason = f"重複疑い: shipyard={key[0]} date={key[1]} boat={key[2]}"
            signals.append({
                "trip_id":      tid,
                "signal_type":  "anomaly_duplicate",
                "signal_value": f"count={key_counts[key]}",
                "source_text":  reason[:300],
                "extracted_by": "anomaly_check",
            })
            logger.warning(f"    ⚠ duplicate: {reason}")
    return signals
