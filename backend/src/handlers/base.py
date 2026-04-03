from __future__ import annotations
"""ハンドラー抽象基底クラス"""
from abc import ABC, abstractmethod
import logging
from typing import Any

import anthropic

from utils.fetch import compute_md5, fetch_html, html_to_text
from utils.db_v2 import get_latest_html_hash, save_catch_raw, save_catches


class BaseHandler(ABC):
    """
    全ハンドラーの基底クラス。

    サブクラスは fetch_raw() と parse() を実装するだけでよい。
    html_hash 差分チェック・DB保存・dry_run 制御はここで吸収する。
    """

    def __init__(
        self,
        db,
        logger:        logging.Logger,
        claude_client: anthropic.Anthropic | None = None,
        species_list:  list[dict] | None          = None,
    ):
        self.db            = db
        self.logger        = logger
        self.claude_client = claude_client
        self.species_list  = species_list or []

    @abstractmethod
    def fetch_raw(self, shipyard: dict) -> str:
        """HTML / JSON / XML など生データを文字列で返す"""

    @abstractmethod
    def parse(self, raw: str, shipyard: dict) -> list[dict]:
        """
        釣果レコードのリストを返す。
        各レコードは以下の形式:
        {
            "date": "YYYY-MM-DD" | None,
            "boat_name": str | None,
            "count_min": int | None,
            "count_max": int | None,
            "condition_text": str | None,
            "details": [
                {
                    "species_name":     str,
                    "species_name_raw": str,
                    "count":            int | None,
                    "unit":             str,
                    "size_text":        str | None,
                }
            ]
        }
        """

    def run(self, shipyard: dict, dry_run: bool = False) -> dict[str, Any]:
        """
        実行エントリーポイント。

        Returns:
            {
                "handler":   str,
                "saved":     int,
                "skipped":   bool,
                "error":     str | None,
                "sample":    list[dict],   # dry_run 時は全レコード、通常時は先頭3件
            }
        """
        yard_id   = shipyard["id"]
        yard_name = shipyard.get("name", f"ID:{yard_id}")
        yard_url  = shipyard.get("url", "")
        handler   = self.__class__.__name__

        try:
            raw       = self.fetch_raw(shipyard)
            html_hash = compute_md5(raw)

            # ── 差分チェック ──────────────────────────────────────────────────
            if not dry_run:
                prev_hash = get_latest_html_hash(self.db, yard_id)
                if prev_hash and prev_hash == html_hash:
                    self.logger.info(f"  HTML 変化なし → スキップ")
                    return {"handler": handler, "saved": 0, "skipped": True,
                            "error": None, "sample": []}

            self.logger.info(f"  HTML 更新あり (hash: {html_hash[:8]}...)")

            # ── パース ────────────────────────────────────────────────────────
            records = self.parse(raw, shipyard)
            self.logger.info(f"  抽出: {len(records)} 件")

            if dry_run:
                return {"handler": handler, "saved": 0, "skipped": False,
                        "error": None, "sample": records}

            if not records:
                return {"handler": handler, "saved": 0, "skipped": False,
                        "error": None, "sample": []}

            # ── DB 保存 ───────────────────────────────────────────────────────
            raw_text     = html_to_text(raw) if raw.lstrip().startswith("<") else raw
            catch_raw_id = save_catch_raw(
                self.db, yard_id, raw, html_hash, raw_text, yard_url
            )
            saved = save_catches(
                self.db, records, yard_id, catch_raw_id, yard_url, self.logger,
                species_list=self.species_list,
            )
            if saved > 0:
                self.db.table("catch_raw").update(
                    {"is_parsed": True}
                ).eq("id", catch_raw_id).execute()

            return {"handler": handler, "saved": saved, "skipped": False,
                    "error": None, "sample": records[:3]}

        except Exception as e:
            self.logger.error(f"  [{yard_name}] エラー: {e}", exc_info=True)
            return {"handler": handler, "saved": 0, "skipped": False,
                    "error": str(e), "sample": []}
