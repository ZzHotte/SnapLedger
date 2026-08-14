// Business-tunable constants — which categories/countries/currencies the UI
// shows, and mock-data knobs — kept in one place since these are still being
// decided/adjusted. Mirrors backend/app/constants.py; keep the two in sync
// where they overlap (e.g. CATEGORIES must match the backend's default set).

export const CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Entertainment", "Other"] as const;

// How many mock transactions the "Generate mock data" button creates.
export const MOCK_DATA_COUNT = 10_000;

// Currencies offered in the market-data exchange rate converter.
export const CURRENCIES = ["CNY", "AUD", "USD", "EUR", "GBP", "JPY", "HKD", "CAD", "NZD", "SGD"];

// Countries shown on the market-data page (bank rates + macro indicators).
// Must match what's seeded in backend/alembic/versions/818cc17b1aff_market_data.py
// for bank rates to have data — GDP per capita works for any ISO 3166-1
// alpha-3 code, so this list is really "which ones we feature", not a hard
// backend limit.
export const MARKET_DATA_COUNTRIES = [
  { code: "CHN", label: "China" },
  { code: "AUS", label: "Australia" },
  { code: "USA", label: "United States" },
  { code: "GBR", label: "United Kingdom" },
  { code: "JPN", label: "Japan" },
];
