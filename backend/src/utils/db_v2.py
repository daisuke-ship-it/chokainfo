from __future__ import annotations
"""Supabase 操作ユーティリティ v2 — 新スキーマ（fishing_trips + catches_v2）対応"""
import logging
import re
from datetime import datetime
from typing import Optional

from utils.normalizer import normalize_species, extract_signals


# ── catch_raw（変更なし）──────────────────────────────────────────────────────

def get_latest_html_hash(db, shipyard_id: int) -> Optional[str]:
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


def save_catch_raw(db, shipyard_id: int, raw: str, html_hash: str,
                   raw_text: str, source_url: str) -> int:
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


# ── fishing_trips + catches_v2 ────────────────────────────────────────────────

def save_catches(
    db,
    records:      list[dict],
    shipyard_id:  int,
    catch_raw_id: int,
    source_url:   str,
    logger:       logging.Logger,
    species_list: list[dict] | None = None,
) -> int:
    """
    ハンドラーの出力（旧フォーマット）を受け取り、新スキーマに保存する。

    ハンドラーの出力形式（変更なし）:
    {
        "date": "YYYY-MM-DD" | None,
        "boat_name": str | None,
        "count_min": int | None,
        "count_max": int | None,
        "condition_text": str | None,
        "details": [
            {"species_name": str, "species_name_raw": str,
             "count": int|None, "unit": str, "size_text": str|None}
        ]
    }

    新スキーマへのマッピング:
        record → fishing_trips（1レコード = 1釣行）
        detail → catches_v2（1行 = 1魚種）
        condition_text → trip_signals（定性シグナル抽出）
    """
    species_list = species_list or []
    saved = 0

    for rec in records:
        try:
            sail_date  = rec.get("date")
            boat_name  = rec.get("boat_name")
            condition  = (rec.get("condition_text") or "").strip()[:500] or None
            details    = rec.get("details") or []

            if not details:
                continue

            # ── fishing_trips: 重複チェック (shipyard_id, sail_date, boat_name_raw) ──
            q = db.table("fishing_trips").select("id").eq("shipyard_id", shipyard_id)
            q = q.eq("sail_date", sail_date) if sail_date else q.is_("sail_date", "null")
            q = q.eq("boat_name_raw", boat_name) if boat_name else q.is_("boat_name_raw", "null")
            existing = q.limit(1).execute()

            if existing.data:
                trip_id = existing.data[0]["id"]
                # 更新: condition_text, raw_id
                db.table("fishing_trips").update({
                    "condition_text": condition,
                    "raw_id":         catch_raw_id,
                    "source_url":     source_url,
                }).eq("id", trip_id).execute()
                # 既存 catches を差し替え
                db.table("catches_v2").delete().eq("trip_id", trip_id).execute()
                # 既存 signals も差し替え（condition_text が変わっている可能性）
                db.table("trip_signals").delete().eq("trip_id", trip_id).execute()
                logger.info(f"  [trip] 更新: id={trip_id} {sail_date} {boat_name}")
            else:
                row = {
                    "shipyard_id":    shipyard_id,
                    "sail_date":      sail_date,
                    "boat_name_raw":  boat_name,
                    "condition_text": condition,
                    "source_url":     source_url,
                    "raw_id":         catch_raw_id,
                    # trip_plan_id は後からバッチで紐付け（ここでは NULL）
                }
                result  = db.table("fishing_trips").insert(row).execute()
                trip_id = result.data[0]["id"]
                logger.info(f"  [trip] 新規: id={trip_id} {sail_date} {boat_name}")

            # ── catches_v2: 魚種ごと1行 ─────────────────────────────────────────
            catch_rows = []
            for d in details:
                raw_name = d.get("species_name_raw") or d.get("species_name") or ""

                # 正規化: 括弧サイズ抽出 → 成長名分解 → aliases マッチ
                norm = normalize_species(raw_name, species_list)

                catch_rows.append({
                    "trip_id":          trip_id,
                    "fish_species_id":  norm.get("fish_species_id"),
                    "species_name_raw": raw_name,
                    "detail_type":      norm.get("detail_type", "catch"),
                    "count":            d.get("count"),
                    "count_min":        None,  # ハンドラーが魚種別 min を出さない場合
                    "count_max":        d.get("count"),
                    "unit":             d.get("unit") or "尾",
                    "size_text":        norm.get("size_text") or d.get("size_text"),
                    "confidence_score": 1.0,
                })

            if catch_rows:
                db.table("catches_v2").insert(catch_rows).execute()
                logger.info(
                    f"    catches: {len(catch_rows)}件 "
                    + " / ".join(
                        f"{r['species_name_raw']} → {r.get('fish_species_id', '?')}"
                        for r in catch_rows[:5]
                    )
                )

            # ── trip_signals: condition_text からシグナル抽出 ────────────────────
            if condition:
                signals = extract_signals(condition)
                if signals:
                    signal_rows = [
                        {
                            "trip_id":      trip_id,
                            "signal_type":  sig["type"],
                            "signal_value": sig.get("value", "true"),
                            "source_text":  sig.get("source", ""),
                            "extracted_by": "rule",
                        }
                        for sig in signals
                    ]
                    db.table("trip_signals").insert(signal_rows).execute()
                    logger.info(
                        f"    signals: {len(signal_rows)}件 "
                        + ", ".join(s["signal_type"] for s in signals)
                    )

            saved += 1

        except Exception as e:
            logger.error(f"  [trip] 保存失敗: {e}")

    return saved


# ── shipyards ────────────────────────────────────────────────────────────────

def update_last_scraped_at(db, shipyard_id: int, error: str | None = None) -> None:
    """スクレイピング後に last_scraped_at と last_error を更新"""
    now = datetime.now().isoformat()
    updates: dict = {"last_scraped_at": now}
    if error is None:
        updates["last_error"] = None
    else:
        updates["last_error"] = str(error)[:500]
    try:
        db.table("shipyards").update(updates).eq("id", shipyard_id).execute()
    except Exception:
        pass
