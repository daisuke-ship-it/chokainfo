#!/usr/bin/env python3
"""
既存 catches データを catch_details へ移行するスクリプト

対象: catches テーブルのうち fish_species_id が NOT NULL のレコード
      （旧フォーマットで投入されたデータ）

処理:
  1. catches を fish_species JOIN して取得
  2. 既に catch_details が存在するレコードはスキップ
  3. catch_details に INSERT（species_name, count=count_max, unit='尾', size_text）

使い方:
    python src/migrate.py           # dry-run（DBには書き込まない）
    python src/migrate.py --execute # 実際に移行する
"""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

BASE_DIR = Path(__file__).parent.parent
load_dotenv(BASE_DIR / ".env")


def main():
    parser = argparse.ArgumentParser(description="catches → catch_details 移行")
    parser.add_argument("--execute", action="store_true", help="実際に DB に書き込む")
    args = parser.parse_args()
    dry_run = not args.execute

    db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    # fish_species マスタ
    species_map = {
        sp["id"]: sp["name"]
        for sp in (db.table("fish_species").select("id, name").execute().data or [])
    }

    # 旧フォーマット: fish_species_id IS NOT NULL の catches
    catches = (
        db.table("catches")
        .select("id, fish_species_id, count_max, size_min_cm, size_max_cm")
        .not_.is_("fish_species_id", "null")
        .execute()
        .data or []
    )
    print(f"移行対象 catches: {len(catches)} 件")

    # 既に catch_details が存在する catch_id を取得してスキップ判定用セットに
    existing_details = (
        db.table("catch_details").select("catch_id").execute().data or []
    )
    already_migrated = {r["catch_id"] for r in existing_details}
    print(f"移行済み (catch_details あり): {len(already_migrated)} 件")

    to_insert = []
    skipped   = 0

    for c in catches:
        catch_id = c["id"]
        if catch_id in already_migrated:
            skipped += 1
            continue

        fish_name = species_map.get(c["fish_species_id"])
        if not fish_name:
            print(f"  WARN: fish_species_id={c['fish_species_id']} が species_map に見つからない → スキップ")
            skipped += 1
            continue

        # size_text: "75〜120cm" 形式に整形、両方 null なら null
        size_min = c.get("size_min_cm")
        size_max = c.get("size_max_cm")
        if size_min is not None and size_max is not None:
            size_text = f"{size_min}〜{size_max}cm"
        elif size_max is not None:
            size_text = f"{size_max}cm"
        elif size_min is not None:
            size_text = f"{size_min}cm"
        else:
            size_text = None

        to_insert.append({
            "catch_id":     catch_id,
            "species_name": fish_name,
            "count":        c.get("count_max"),
            "unit":         "尾",
            "size_text":    size_text,
        })

    print(f"\n処理対象: {len(to_insert)} 件 / スキップ: {skipped} 件")

    if not to_insert:
        print("移行対象なし → 終了")
        return

    # プレビュー（先頭10件）
    print("\n【移行プレビュー（先頭10件）】")
    for row in to_insert[:10]:
        print(f"  catch_id={row['catch_id']}  {row['species_name']}  "
              f"count={row['count']}{row['unit']}  size={row['size_text']}")

    if dry_run:
        print(f"\n--- DRY RUN: 実際の書き込みはしません ---")
        print(f"実行するには: python src/migrate.py --execute")
        return

    # バッチ INSERT（100件ずつ）
    BATCH = 100
    inserted = 0
    for i in range(0, len(to_insert), BATCH):
        batch = to_insert[i:i + BATCH]
        db.table("catch_details").insert(batch).execute()
        inserted += len(batch)
        print(f"  INSERT {inserted}/{len(to_insert)} 件完了")

    print(f"\n移行完了: {inserted} 件を catch_details に挿入しました")


if __name__ == "__main__":
    main()
