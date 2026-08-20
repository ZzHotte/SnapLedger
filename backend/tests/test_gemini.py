import json
from unittest.mock import MagicMock, patch

from app.gemini import EMPTY_EXTRACTION, extract_document_fields


def _fake_client(response_text: str) -> MagicMock:
    client = MagicMock()
    client.models.generate_content.return_value = MagicMock(text=response_text)
    return client


def test_extract_document_fields_returns_full_extraction():
    payload = {
        "doc_type": "bill_of_lading",
        "bl_number": "BL123456",
        "shipper": "Acme Shippers",
        "consignee": "Acme Consignee",
        "origin_port": "Shanghai, CN",
        "destination_port": "Los Angeles, US",
        "cargo_description": "Electronics components",
        "weight_kg": 1200.5,
    }
    with patch("app.gemini._get_client", return_value=_fake_client(json.dumps(payload))):
        result = extract_document_fields(b"fake-bytes", "image/png")
    assert result == payload


def test_extract_document_fields_fills_missing_keys_with_none():
    partial = {"shipper": "Acme Shippers"}
    with patch("app.gemini._get_client", return_value=_fake_client(json.dumps(partial))):
        result = extract_document_fields(b"fake-bytes", "image/png")
    assert result["shipper"] == "Acme Shippers"
    assert result["bl_number"] is None
    assert result["consignee"] is None
    assert result["weight_kg"] is None


def test_extract_document_fields_falls_back_on_malformed_json():
    with patch("app.gemini._get_client", return_value=_fake_client("not valid json")):
        result = extract_document_fields(b"fake-bytes", "image/png")
    assert result == EMPTY_EXTRACTION


def test_extract_document_fields_falls_back_on_client_exception():
    client = MagicMock()
    client.models.generate_content.side_effect = RuntimeError("network error")
    with patch("app.gemini._get_client", return_value=client):
        result = extract_document_fields(b"fake-bytes", "image/png")
    assert result == EMPTY_EXTRACTION
