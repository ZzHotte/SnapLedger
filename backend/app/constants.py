"""Business-tunable constants — external APIs the backend calls, category
defaults, and mock-data knobs — kept in one place since these are still
being decided/adjusted, unlike settings that come from the environment
(see app/config.py) or purely internal implementation details.

Note: Alembic migrations under alembic/versions/ deliberately do NOT import
from here. A migration has to stay reproducible exactly as it ran, even
after these values change later — see the market-data migration's own
hand-copied bank rate seed data for an example.
"""

from datetime import timedelta

# --- Default expense categories ---
# Used both to seed a new ledger (app/routers/auth.py) and to steer the
# Gemini receipt-extraction prompt (app/gemini.py) — kept as a single list
# so the two can't silently drift apart.
CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Entertainment", "Other"]

# --- External public APIs ---
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest"
WORLD_BANK_GDP_URL = "https://api.worldbank.org/v2/country/{country}/indicator/NY.GDP.PCAP.CD"

# --- Market data cache TTLs (see app/market_data.py for why this is
# fetch-on-read + TTL instead of a scheduled job) ---
EXCHANGE_RATE_TTL = timedelta(hours=12)
GDP_TTL = timedelta(days=30)

# Which indicators /market-data/macro supports lives in app/market_data.py
# (SUPPORTED_MACRO_INDICATORS, derived from MACRO_INDICATOR_FETCHERS) rather
# than here — it has to stay coupled to the actual fetcher functions, not be
# a free-floating list a new entry could be added to without also wiring up
# real data for it.

# --- Mock data generator (app/routers/transactions.py) ---
MAX_MOCK_COUNT = 20_000
DEFAULT_MOCK_COUNT = 10_000
MOCK_MERCHANTS = [
    "Trader Joe's",
    "Shell Gas Station",
    "Amazon",
    "Target",
    "Starbucks",
    "Uber",
    "Netflix",
    "Whole Foods",
    "Costco",
    "Corner Cafe",
    "AMC Theatres",
    "Home Depot",
    "IKEA",
    "CVS Pharmacy",
    "Chipotle",
]
