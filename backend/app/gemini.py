import json
import logging

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
  "weight_kg": number (total gross weight in kilograms) or null
}}
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
}


def extract_document_fields(file_bytes: bytes, mime_type: str) -> dict:
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
        return {**EMPTY_EXTRACTION, **data}
    except Exception:
        logger.exception("Gemini document extraction failed")
        return dict(EMPTY_EXTRACTION)
