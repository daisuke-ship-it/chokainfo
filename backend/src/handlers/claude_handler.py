from __future__ import annotations
"""
Claude ハンドラー（フォールバック）

scrape_config 未設定 / handler="claude" の船宿に使用。

コスト削減のため、まず正規表現パーサーで抽出を試み、
失敗した場合のみ Claude API にフォールバックする。
"""
import json
import re
from datetime import datetime, timedelta

from handlers.base    import BaseHandler
from utils.fetch      import fetch_html, html_to_text
from utils.normalizer import normalize_num, parse_date_jp
from utils.regex_parser import extract_catch_details, extract_date_from_text

MAX_CONTENT_CHARS = 40_000
DAYS_WINDOW       = 3

# 正規表現パースの品質閾値: catch タイプの details が全体の50%以上あること
MIN_CATCH_RATIO = 0.5

VALID_SPECIES = [
    "タチウオ", "アジ", "サバ", "イワシ", "イナダ", "ワラサ", "ブリ",
    "サゴシ", "サワラ", "ヒラマサ", "カンパチ", "五目",
    "シーバス", "クロダイ", "メバル", "カサゴ", "マダイ",
    "カレイ", "ヒラメ", "マゴチ", "タコ", "イカ",
    "トラフグ", "フグ", "シロギス", "キス",
]


class ClaudeHandler(BaseHandler):

    def fetch_raw(self, shipyard: dict) -> str:
        return fetch_html(shipyard["url"])

    def parse(self, raw: str, shipyard: dict) -> list[dict]:
        page_text = html_to_text(raw)
        yard_name = shipyard.get("name", "")
        yard_url  = shipyard.get("url", "")

        # Phase 1: 正規表現で抽出を試みる
        records = self._try_regex(page_text, yard_name)
        if records:
            self.logger.info(f"  正規表現パースで {len(records)} 件抽出 → Claude API スキップ")
            return records

        # Phase 2: Claude API フォールバック
        if not self.claude_client:
            self.logger.warning(f"  Claude client 未設定 → スキップ")
            return []

        target_fish = [sp["name"] for sp in self.species_list if sp.get("name")] or VALID_SPECIES
        self.logger.info(f"  正規表現パース失敗 → Claude API にフォールバック")
        return self._extract_with_claude(page_text, yard_url, yard_name, target_fish)

    def _try_regex(self, page_text: str, yard_name: str) -> list[dict]:
        """正規表現でページテキストから釣果を抽出する"""
        now    = datetime.now()
        cutoff = (now - timedelta(days=DAYS_WINDOW)).date()

        # ページ全体を日付ブロックに分割して処理
        records = []
        blocks = self._split_by_date(page_text)

        for date_str, block_text in blocks:
            # 日付フィルタ（過去・未来両方）
            if date_str:
                try:
                    d = datetime.fromisoformat(date_str).date()
                    if d < cutoff or d > now.date() + timedelta(days=1):
                        continue
                except ValueError:
                    pass

            details = extract_catch_details(block_text)
            if not details:
                continue

            # 品質チェック: 魚種名が1文字のものやノイズが多い場合はスキップ
            valid_details = [
                d for d in details
                if d.get("species_name") and len(d["species_name"]) >= 2
            ]
            if not valid_details:
                continue

            counts = [d["count"] for d in valid_details if d.get("count")]
            records.append({
                "date":           date_str,
                "boat_name":      None,
                "count_min":      None,
                "count_max":      max(counts) if counts else None,
                "condition_text": block_text[:300] if block_text else None,
                "details":        valid_details,
            })

        if not records:
            return []

        # 全体品質チェック: ノイズが多すぎる場合は Claude にフォールバック
        all_details = [d for r in records for d in r["details"]]
        catch_count = sum(1 for d in all_details if d.get("count") is not None)
        if len(all_details) > 0 and catch_count / len(all_details) < MIN_CATCH_RATIO:
            # 数量ありのdetailが半分未満 → 信頼度低い
            return []

        return records

    def _split_by_date(self, text: str) -> list[tuple[str | None, str]]:
        """
        テキストを日付ごとのブロックに分割する。

        日付パターン: "2026年4月5日", "4月5日", "04/05" 等
        """
        text = normalize_num(text)
        # 日付区切りパターン
        date_pattern = re.compile(
            r"(?:(\d{4})年\s*)?(\d{1,2})月\s*(\d{1,2})日"
            r"|(\d{1,2})/(\d{1,2})"
        )

        matches = list(date_pattern.finditer(text))
        if not matches:
            # 日付が見つからない場合はページ全体を1ブロックとして返す
            return [(None, text)]

        blocks = []
        year = datetime.now().year

        for idx, m in enumerate(matches):
            # 日付文字列をパース
            if m.group(2) and m.group(3):
                y = int(m.group(1)) if m.group(1) else year
                month, day = int(m.group(2)), int(m.group(3))
            elif m.group(4) and m.group(5):
                y = year
                month, day = int(m.group(4)), int(m.group(5))
            else:
                continue

            try:
                d = datetime(y, month, day).date()
                date_str = d.isoformat()
            except ValueError:
                continue

            # ブロックテキスト: この日付から次の日付まで
            start = m.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            block_text = text[start:end].strip()

            if block_text:
                blocks.append((date_str, block_text))

        return blocks if blocks else [(None, text)]

    def _extract_with_claude(self, page_text, source_url, shipyard_name, target_fish) -> list[dict]:
        today  = datetime.now().strftime("%Y-%m-%d")
        cutoff = (datetime.now() - timedelta(days=DAYS_WINDOW)).strftime("%Y-%m-%d")
        fish_kw         = "、".join(target_fish)
        valid_species_str = "、".join(VALID_SPECIES)
        content = page_text[:MAX_CONTENT_CHARS]
        if len(page_text) > MAX_CONTENT_CHARS:
            content += "\n\n[以降省略]"

        system_prompt = (
            "あなたは釣り船宿の釣果情報を抽出するエキスパートです。"
            "与えられたページテキストを解析し、指定された魚種の釣果データを"
            "JSON 配列として返してください。"
            "JSON 配列以外のテキストは一切出力しないでください。"
        )

        user_prompt = f"""以下は船宿「{shipyard_name}」のウェブページテキストです。

【基本情報】
- ページ URL : {source_url}
- 本日の日付 : {today}
- 抽出対象魚種: {fish_kw}

【抽出条件】
1. {cutoff} ～ {today} の期間（直近 {DAYS_WINDOW} 日分）のデータのみ抽出する
2. 対象魚種の釣果が記載された情報のみ抽出する
3. 釣行コース・便名が複数ある場合は boat_name で分けて別オブジェクトにする
4. 該当データがない場合は空の配列 [] を返す

【魚種名の正規化リスト】
{valid_species_str}

【出力形式】
[
  {{
    "date": "YYYY-MM-DD",
    "boat_name": "午前アジ便",
    "count_min": 0,
    "count_max": 9,
    "details": [
      {{
        "species_name": "タチウオ",
        "species_name_raw": "タチウオ",
        "count": 9,
        "unit": "尾",
        "size_text": "60-80cm"
      }}
    ],
    "condition_text": "船長コメント（300字以内）"
  }}
]

【ページテキスト】
{content}"""

        response_text = ""
        with self.claude_client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        ) as stream:
            for chunk in stream.text_stream:
                response_text += chunk

        response_text = response_text.strip()
        if not response_text.startswith("["):
            start = response_text.find("[")
            end   = response_text.rfind("]") + 1
            if start >= 0 and end > start:
                response_text = response_text[start:end]
            else:
                return []

        return json.loads(response_text)
