import json
import logging
import time

from google import genai
from google.genai import types

from app.config import get_settings
from app.constants import DOCUMENT_TYPES

logger = logging.getLogger(__name__)
settings = get_settings()

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client

EXTRACTION_PROMPT = f"""You are extracting structured data from a photo or scan of a freight
shipping document (a bill of lading, commercial invoice, or packing list).
Return ONLY JSON (no markdown, no explanation) matching exactly this shape:
{{
  "doc_type": one of {DOCUMENT_TYPES}, your best guess, or null,
  "bl_number": string (bill of lading / booking number) or null,
  "shipper": string (shipper company name) or null,
  "consignee": string (consignee company name) or null,
  "origin_port": string (port/place of loading) or null,
  "destination_port": string (port/place of discharge) or null,
  "cargo_description": string (short description of the goods) or null,
  "weight_kg": number (total gross weight in kilograms) or null,
  "freight_cost": number (the freight/shipping charge, or total invoice value on a
    commercial invoice — NOT the value of the goods on a packing list) or null,
  "currency": 3-letter ISO currency code for freight_cost, your best guess if an
    amount is present but no currency is stated, or null
}}
A bill of lading often only states "Freight: Prepaid" or "Collect" with no dollar
amount — leave freight_cost null in that case rather than guessing.
If a field can't be determined, use null for it. Still make your best guess for the others."""

EMPTY_EXTRACTION = {
    "doc_type": None,
    "bl_number": None,
    "shipper": None,
    "consignee": None,
    "origin_port": None,
    "destination_port": None,
    "cargo_description": None,
    "weight_kg": None,
    "freight_cost": None,
    "currency": None,
}


# Gemini's 503 "model overloaded" response explicitly says to retry — a couple
# of quick attempts clears most of these transient blips without the caller
# (or the user staring at a blank review form) ever noticing.
EXTRACTION_RETRIES = 3
RETRY_DELAY_SECONDS = 1.5


def extract_document_fields(file_bytes: bytes, mime_type: str) -> tuple[dict, bool]:
    """Returns (extracted_fields, ok). `ok` is False when every attempt failed —
    the caller still gets EMPTY_EXTRACTION back so upload never hard-fails, but
    can use `ok` to tell the user AI extraction didn't run rather than silently
    presenting an all-blank form as if nothing was found in the image."""
    last_error: Exception | None = None
    for attempt in range(EXTRACTION_RETRIES):
        try:
            response = _get_client().models.generate_content(
                model="gemini-flash-latest",
                contents=[
                    types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
                    EXTRACTION_PROMPT,
                ],
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            data = json.loads(response.text)
            return {**EMPTY_EXTRACTION, **data}, True
        except Exception as exc:  # noqa: BLE001 — deliberately broad, see docstring
            last_error = exc
            if attempt < EXTRACTION_RETRIES - 1:
                time.sleep(RETRY_DELAY_SECONDS)

    logger.exception("Gemini document extraction failed after %d attempts", EXTRACTION_RETRIES, exc_info=last_error)
    return dict(EMPTY_EXTRACTION), False
