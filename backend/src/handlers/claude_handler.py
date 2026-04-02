"""
Claude ハンドラー（フォールバック）

scrape_config 未設定 / handler="claude" の船宿に使用。
現行 scraper.py の全件 Claude API 処理を踏襲する。
"""
import json
from datetime import datetime, timedelta

from handlers.base    import BaseHandler
from utils.fetch      import fetch_html, html_to_text

MAX_CONTENT_CHARS = 40_000
DAYS_WINDOW       = 3

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
        if not self.claude_client:
            self.logger.warning(f"  Claude client 未設定 → スキップ")
            return []

        page_text    = html_to_text(raw)
        yard_name    = shipyard.get("name", "")
        yard_url     = shipyard.get("url", "")
        target_fish  = [sp["name"] for sp in self.species_list if sp.get("name")] or VALID_SPECIES

        return self._extract(page_text, yard_url, yard_name, target_fish)

    def _extract(self, page_text, source_url, shipyard_name, target_fish) -> list[dict]:
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
