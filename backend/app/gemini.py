import json
import logging

from google import genai
from google.genai import types

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


CATEGORIES = ["Food", "Transport", "Shopping", "Bills", "Entertainment", "Other"]

EXTRACTION_PROMPT = f"""You are extracting structured data from a photo of a receipt.
Return ONLY JSON (no markdown, no explanation) matching exactly this shape:
{{
  "merchant": string or null,
  "transaction_date": string in YYYY-MM-DD format, or null,
  "amount": number (the total charged) or null,
  "currency": 3-letter ISO currency code, your best guess, or null,
  "category": one of {CATEGORIES}, your best guess based on merchant/items
}}
If a field can't be determined, use null for it. Still make your best guess for the others."""

EMPTY_EXTRACTION = {
    "merchant": None,
    "transaction_date": None,
    "amount": None,
    "currency": None,
    "category": None,
}


def extract_receipt_fields(image_bytes: bytes, mime_type: str) -> dict:
    try:
        response = _get_client().models.generate_content(
            model="gemini-flash-latest",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                EXTRACTION_PROMPT,
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        data = json.loads(response.text)
        return {**EMPTY_EXTRACTION, **data}
    except Exception:
        logger.exception("Gemini receipt extraction failed")
        return dict(EMPTY_EXTRACTION)
