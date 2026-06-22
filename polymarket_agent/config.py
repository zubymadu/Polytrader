import os
from dotenv import load_dotenv

load_dotenv()

# Polymarket API endpoints
CLOB_URL = "https://clob.polymarket.com"
GAMMA_URL = "https://gamma-api.polymarket.com"
DATA_URL = "https://data-api.polymarket.com"

# Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AI_MODEL = "claude-sonnet-4-6"

# Telegram
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

# Polymarket trading keys (optional)
POLYMARKET_PRIVATE_KEY = os.getenv("POLYMARKET_PRIVATE_KEY", "")
POLYMARKET_API_KEY = os.getenv("POLYMARKET_API_KEY", "")
POLYMARKET_API_SECRET = os.getenv("POLYMARKET_API_SECRET", "")
POLYMARKET_API_PASSPHRASE = os.getenv("POLYMARKET_API_PASSPHRASE", "")

# Agent behaviour
WALLET_MONITOR_COUNT = int(os.getenv("WALLET_MONITOR_COUNT", "1000"))
COPY_TRADE_MAX_WALLETS = int(os.getenv("COPY_TRADE_MAX_WALLETS", "7"))
ARB_MIN_PROFIT_PCT = float(os.getenv("ARB_MIN_PROFIT_PCT", "0.015"))  # 1.5%
SCAN_INTERVAL = int(os.getenv("SCAN_INTERVAL_SECONDS", "30"))
AI_ANALYSIS_INTERVAL = int(os.getenv("AI_ANALYSIS_INTERVAL_MINUTES", "15")) * 60

# Database
DB_PATH = os.getenv("DB_PATH", "polytrader.db")

# Wallet scoring weights (AI updates these over time)
DEFAULT_SCORE_WEIGHTS = {
    "win_rate": 0.30,
    "roi_30d": 0.25,
    "trade_count": 0.10,
    "avg_position_size_consistency": 0.10,
    "timing_alpha": 0.15,    # how early they get in vs market move
    "arb_specialization": 0.10,
}
