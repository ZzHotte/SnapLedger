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
        "freight_cost": 3500.0,
        "currency": "USD",
    }
    with patch("app.gemini._get_client", return_value=_fake_client(json.dumps(payload))):
        result, ok = extract_document_fields(b"fake-bytes", "image/png")
    assert result == payload
    assert ok is True


def test_extract_document_fields_fills_missing_keys_with_none():
    partial = {"shipper": "Acme Shippers"}
    with patch("app.gemini._get_client", return_value=_fake_client(json.dumps(partial))):
        result, ok = extract_document_fields(b"fake-bytes", "image/png")
    assert result["shipper"] == "Acme Shippers"
    assert result["bl_number"] is None
    assert result["consignee"] is None
    assert result["weight_kg"] is None
    assert ok is True


def test_extract_document_fields_falls_back_on_malformed_json():
    with patch("app.gemini._get_client", return_value=_fake_client("not valid json")):
        with patch("app.gemini.time.sleep"):
            result, ok = extract_document_fields(b"fake-bytes", "image/png")
    assert result == EMPTY_EXTRACTION
    assert ok is False


def test_extract_document_fields_falls_back_on_client_exception():
    client = MagicMock()
    client.models.generate_content.side_effect = RuntimeError("network error")
    with patch("app.gemini._get_client", return_value=client):
        with patch("app.gemini.time.sleep"):
            result, ok = extract_document_fields(b"fake-bytes", "image/png")
    assert result == EMPTY_EXTRACTION
    assert ok is False


def test_extract_document_fields_retries_transient_failures_then_succeeds():
    payload = {"shipper": "Acme Shippers"}
    client = MagicMock()
    client.models.generate_content.side_effect = [
        RuntimeError("503 UNAVAILABLE"),
        MagicMock(text=json.dumps(payload)),
    ]
    with patch("app.gemini._get_client", return_value=client):
        with patch("app.gemini.time.sleep") as sleep_mock:
            result, ok = extract_document_fields(b"fake-bytes", "image/png")
    assert ok is True
    assert result["shipper"] == "Acme Shippers"
    assert client.models.generate_content.call_count == 2
    sleep_mock.assert_called_once()


def test_extract_document_fields_gives_up_after_all_retries_fail():
    client = MagicMock()
    client.models.generate_content.side_effect = RuntimeError("503 UNAVAILABLE")
    with patch("app.gemini._get_client", return_value=client):
        with patch("app.gemini.time.sleep") as sleep_mock:
            result, ok = extract_document_fields(b"fake-bytes", "image/png")
    assert ok is False
    assert result == EMPTY_EXTRACTION
    assert client.models.generate_content.call_count == 3
    assert sleep_mock.call_count == 2
