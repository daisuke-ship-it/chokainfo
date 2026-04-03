from __future__ import annotations
"""
catches_v2 の fish_species_id が NULL のレコードを backfill するワンショットスクリプト。

使い方:
  python3 backend/scripts/backfill_species_id.py --dry-run   # 確認のみ（DB 更新なし）
  python3 backend/scripts/backfill_species_id.py             # 実際に UPDATE
"""

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

# backend/src を sys.path に追加
_BACKEND_SRC = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(_BACKEND_SRC))

from dotenv import load_dotenv

# .env 読み込み（backend/.env）
_ENV_PATH = Path(__file__).parent.parent / ".env"
load_dotenv(_ENV_PATH)

from supabase import create_client
from utils.normalizer import normalize_species

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

BATCH_SIZE = 100


def fetch_species_list(db) -> list[dict]:
    """fish_species テーブルを全件取得"""
    result = db.table("fish_species").select("id, name, aliases, growth_names").execute()
    return result.data or []


def fetch_null_records(db) -> list[dict]:
    """catches_v2 で fish_species_id IS NULL のレコードを全件取得"""
    all_rows: list[dict] = []
    offset = 0
    page_size = 1000

    while True:
        result = (
            db.table("catches_v2")
            .select("id, species_name_raw, detail_type")
            .is_("fish_species_id", "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size

    return all_rows


def build_updates(records: list[dict], species_list: list[dict]) -> tuple[list[dict], list[str]]:
    """
    各レコードに normalize_species() を適用して更新データを構築。

    戻り値:
        updates       — [{id, fish_species_id, detail_type}, ...]（fish_species_id が確定したもの）
        unmatched_raws — マッチしなかった species_name_raw のリスト
    """
    updates: list[dict] = []
    unmatched: list[str] = []

    for row in records:
        raw = row.get("species_name_raw") or ""
        result = normalize_species(raw, species_list)

        fid = result.get("fish_species_id")
        dtype = result.get("detail_type") or "catch"

        if fid is not None:
            updates.append({
                "id":             row["id"],
                "fish_species_id": fid,
                "detail_type":    dtype,
            })
        else:
            unmatched.append(raw)

    return updates, unmatched


def apply_updates(db, updates: list[dict], dry_run: bool) -> int:
    """バッチサイズ100件ずつ UPDATE を実行"""
    total_updated = 0

    for i in range(0, len(updates), BATCH_SIZE):
        batch = updates[i : i + BATCH_SIZE]

        if dry_run:
            total_updated += len(batch)
            continue

        for item in batch:
            db.table("catches_v2").update(
                {
                    "fish_species_id": item["fish_species_id"],
                    "detail_type":     item["detail_type"],
                }
            ).eq("id", item["id"]).execute()

        total_updated += len(batch)
        print(f"  updated {total_updated}/{len(updates)} records...")

    return total_updated


def summarize_unmatched(unmatched: list[str]) -> None:
    if not unmatched:
        print("\n[未マッチ] なし — 全レコードがマッチしました")
        return

    counter: dict[str, int] = defaultdict(int)
    for raw in unmatched:
        counter[raw] += 1

    print(f"\n[未マッチ] {len(unmatched)} 件 / ユニーク {len(counter)} 種類")
    print("  件数  | species_name_raw")
    print("  ------+------------------")
    for raw, cnt in sorted(counter.items(), key=lambda x: -x[1]):
        print(f"  {cnt:>4}  | {raw!r}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="catches_v2.fish_species_id が NULL のレコードを backfill する"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="DB を更新せずに結果のみ表示する",
    )
    args = parser.parse_args()

    dry_run: bool = args.dry_run
    mode_label = "[DRY-RUN]" if dry_run else "[LIVE]"
    print(f"{mode_label} catches_v2 fish_species_id backfill 開始")

    db = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("fish_species を取得中...")
    species_list = fetch_species_list(db)
    print(f"  → {len(species_list)} 魚種取得")

    print("catches_v2 (fish_species_id IS NULL) を取得中...")
    records = fetch_null_records(db)
    print(f"  → {len(records)} 件取得")

    if not records:
        print("backfill 対象レコードなし。終了します。")
        return

    print("normalize_species() でマッチング中...")
    updates, unmatched = build_updates(records, species_list)
    print(f"  → マッチあり: {len(updates)} 件 / マッチなし: {len(unmatched)} 件")

    if dry_run:
        print(f"\n{mode_label} {len(updates)} 件を UPDATE する予定（実際には更新しません）")
    else:
        print(f"\n{len(updates)} 件を UPDATE 中（バッチサイズ={BATCH_SIZE}）...")
        apply_updates(db, updates, dry_run=False)
        print("UPDATE 完了")

    # サマリー出力
    print("\n====== サマリー ======")
    print(f"  対象レコード数  : {len(records)}")
    print(f"  マッチ成功      : {len(updates)}")
    print(f"  マッチ失敗      : {len(unmatched)}")
    match_rate = len(updates) / len(records) * 100 if records else 0
    print(f"  マッチ率        : {match_rate:.1f}%")
    print(f"  モード          : {'dry-run（DB 未更新）' if dry_run else '本実行（DB 更新済）'}")

    summarize_unmatched(unmatched)


if __name__ == "__main__":
    main()
