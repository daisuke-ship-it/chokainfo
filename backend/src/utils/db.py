from __future__ import annotations
"""Supabase 操作ユーティリティ"""
import logging
from datetime import datetime
from typing import Optional


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


def save_catches(
    db,
    records:      list[dict],
    shipyard_id:  int,
    catch_raw_id: int,
    source_url:   str,
    logger:       logging.Logger,
) -> int:
    """
    catches + catch_details に保存。
    重複キー: (shipyard_id, sail_date, boat_name)
    既存: condition_text・count を更新 + catch_details を差し替え
    """
    saved = 0
    for rec in records:
        try:
            sail_date = rec.get("date")
            boat_name = rec.get("boat_name")
            condition = (rec.get("condition_text") or "").strip()[:500] or None
            details   = rec.get("details") or []
            count_min = rec.get("count_min")
            count_max = rec.get("count_max")

            if not details:
                continue

            # 重複チェック
            q = db.table("catches").select("id").eq("shipyard_id", shipyard_id)
            q = q.eq("sail_date", sail_date) if sail_date else q.is_("sail_date", "null")
            q = q.eq("boat_name", boat_name) if boat_name else q.is_("boat_name", "null")
            existing = q.limit(1).execute()

            if existing.data:
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
                f"    details: {len(detail_rows)}件 "
                + " / ".join(
                    f"{d.get('species_name')} {d.get('count')}{d.get('unit','尾')}"
                    for d in details
                )
            )
            saved += 1

        except Exception as e:
            logger.error(f"  [catches] 保存失敗: {e}")

    return saved
