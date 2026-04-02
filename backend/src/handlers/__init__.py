from .gyosan        import GyosanHandler
from .blogphp       import BlogPhpHandler
from .wordpress     import WordPressHandler
from .rss           import RssHandler
from .claude_handler import ClaudeHandler

HANDLER_MAP = {
    "gyosan":    GyosanHandler,
    "blogphp":   BlogPhpHandler,
    "wordpress": WordPressHandler,
    "rss":       RssHandler,
    "claude":    ClaudeHandler,   # fallback / scrape_config 未設定の船宿
}

def get_handler(scrape_config: dict | None, **kwargs):
    name = (scrape_config or {}).get("handler", "claude")
    cls  = HANDLER_MAP.get(name, ClaudeHandler)
    return cls(**kwargs)
