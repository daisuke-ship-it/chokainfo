from __future__ import annotations
"""HTTP取得 / MD5 / テキスト変換 ユーティリティ"""
import hashlib
import requests
from bs4 import BeautifulSoup

REQUEST_TIMEOUT = 20

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en;q=0.9",
}


def fetch_html(url: str, ssl_verify: bool = True, encoding: str | None = None) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT, verify=ssl_verify)
    resp.raise_for_status()
    if encoding:
        resp.encoding = encoding
    else:
        resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def fetch_bytes(url: str, ssl_verify: bool = True) -> bytes:
    resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT, verify=ssl_verify)
    resp.raise_for_status()
    return resp.content


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header",
                     "noscript", "iframe", "aside"]):
        tag.decompose()
    text  = soup.get_text(separator="\n", strip=True)
    lines = [line for line in text.splitlines() if line.strip()]
    return "\n".join(lines)


def compute_md5(text: str) -> str:
    return hashlib.md5(text.encode("utf-8", errors="replace")).hexdigest()
