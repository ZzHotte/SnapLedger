import json
from unittest.mock import MagicMock, patch

from app.gemini import EMPTY_EXTRACTION, extract_receipt_fields


def _fake_client(response_text: str) -> MagicMock:
    client = MagicMock()
    client.models.generate_content.return_value = MagicMock(text=response_text)
    return client


def test_extract_receipt_fields_returns_full_extraction():
    payload = {
        "merchant": "Coffee Corner",
        "transaction_date": "2026-08-01",
        "amount": 12.5,
        "currency": "USD",
        "category": "Food",
    }
    with patch("app.gemini._get_client", return_value=_fake_client(json.dumps(payload))):
        result = extract_receipt_fields(b"fake-bytes", "image/png")
    assert result == payload


def test_extract_receipt_fields_fills_missing_keys_with_none():
    partial = {"merchant": "Coffee Corner"}
    with patch("app.gemini._get_client", return_value=_fake_client(json.dumps(partial))):
        result = extract_receipt_fields(b"fake-bytes", "image/png")
    assert result["merchant"] == "Coffee Corner"
    assert result["amount"] is None
    assert result["currency"] is None
    assert result["category"] is None


def test_extract_receipt_fields_falls_back_on_malformed_json():
    with patch("app.gemini._get_client", return_value=_fake_client("not valid json")):
        result = extract_receipt_fields(b"fake-bytes", "image/png")
    assert result == EMPTY_EXTRACTION


def test_extract_receipt_fields_falls_back_on_client_exception():
    client = MagicMock()
    client.models.generate_content.side_effect = RuntimeError("network error")
    with patch("app.gemini._get_client", return_value=client):
        result = extract_receipt_fields(b"fake-bytes", "image/png")
    assert result == EMPTY_EXTRACTION
