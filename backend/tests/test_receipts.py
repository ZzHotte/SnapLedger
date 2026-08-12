from datetime import date
from unittest.mock import patch

from app.routers.receipts import _parse_date

FAKE_IMAGE_URL = "https://res.cloudinary.com/demo/image/upload/fake.png"
FAKE_EXTRACTION = {
    "merchant": "COFFEE CORNER",
    "transaction_date": "2026-08-01",
    "amount": 12.5,
    "currency": "USD",
    "category": "Food",
}


async def _register(client) -> str:
    resp = await client.post(
        "/auth/register",
        json={"email": "receipts@example.com", "password": "testpassword123"},
    )
    return resp.json()["access_token"]


def _mocks():
    return (
        patch("app.routers.receipts.upload_receipt_image", return_value=FAKE_IMAGE_URL),
        patch("app.routers.receipts.extract_receipt_fields", return_value=dict(FAKE_EXTRACTION)),
    )


async def test_upload_receipt_extracts_and_returns_pending(client):
    token = await _register(client)
    upload_mock, extract_mock = _mocks()

    with upload_mock, extract_mock:
        resp = await client.post(
            "/receipts/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("receipt.png", b"fake-image-bytes", "image/png")},
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["image_url"] == FAKE_IMAGE_URL
    assert body["merchant"] == "COFFEE CORNER"
    assert body["amount"] == 12.5
    assert body["category"] == "Food"


async def test_upload_rejects_non_image(client):
    token = await _register(client)
    resp = await client.post(
        "/receipts/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400


async def test_confirm_receipt_creates_transaction_and_lists_it(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    upload_mock, extract_mock = _mocks()

    with upload_mock, extract_mock:
        upload_resp = await client.post(
            "/receipts/upload",
            headers=headers,
            files={"file": ("receipt.png", b"fake-image-bytes", "image/png")},
        )
    receipt_id = upload_resp.json()["id"]

    confirm_resp = await client.post(
        f"/receipts/{receipt_id}/confirm",
        headers=headers,
        json={
            "merchant": "Coffee Corner",
            "transaction_date": "2026-08-01",
            "amount": 12.5,
            "currency": "USD",
            "category": "Food",
        },
    )
    assert confirm_resp.status_code == 201
    tx = confirm_resp.json()
    assert tx["merchant"] == "Coffee Corner"
    assert tx["category"] == "Food"
    assert tx["receipt_image_url"] == FAKE_IMAGE_URL

    # confirming twice should fail
    dup_resp = await client.post(
        f"/receipts/{receipt_id}/confirm",
        headers=headers,
        json={
            "merchant": "Coffee Corner",
            "transaction_date": "2026-08-01",
            "amount": 12.5,
            "currency": "USD",
            "category": "Food",
        },
    )
    assert dup_resp.status_code == 409

    list_resp = await client.get("/transactions", headers=headers)
    assert list_resp.status_code == 200
    transactions = list_resp.json()
    assert len(transactions) == 1
    assert transactions[0]["id"] == tx["id"]


async def _upload_receipt(client, headers) -> int:
    upload_mock, extract_mock = _mocks()
    with upload_mock, extract_mock:
        resp = await client.post(
            "/receipts/upload",
            headers=headers,
            files={"file": ("receipt.png", b"fake-image-bytes", "image/png")},
        )
    return resp.json()["id"]


async def test_confirm_rejects_zero_amount(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    receipt_id = await _upload_receipt(client, headers)

    resp = await client.post(
        f"/receipts/{receipt_id}/confirm",
        headers=headers,
        json={
            "merchant": "Coffee Corner",
            "transaction_date": "2026-08-01",
            "amount": 0,
            "currency": "USD",
            "category": "Food",
        },
    )
    assert resp.status_code == 422


async def test_confirm_rejects_negative_amount(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    receipt_id = await _upload_receipt(client, headers)

    resp = await client.post(
        f"/receipts/{receipt_id}/confirm",
        headers=headers,
        json={
            "merchant": "Coffee Corner",
            "transaction_date": "2026-08-01",
            "amount": -50,
            "currency": "USD",
            "category": "Food",
        },
    )
    assert resp.status_code == 422


async def test_confirm_rejects_merchant_longer_than_column(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    receipt_id = await _upload_receipt(client, headers)

    resp = await client.post(
        f"/receipts/{receipt_id}/confirm",
        headers=headers,
        json={
            "merchant": "A" * 400,
            "transaction_date": "2026-08-01",
            "amount": 10,
            "currency": "USD",
            "category": "Food",
        },
    )
    assert resp.status_code == 422


async def test_confirm_unknown_receipt_404s(client):
    token = await _register(client)
    resp = await client.post(
        "/receipts/999/confirm",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "merchant": "Nowhere",
            "transaction_date": "2026-08-01",
            "amount": 1.0,
            "currency": "USD",
            "category": "Other",
        },
    )
    assert resp.status_code == 404


def test_parse_date_accepts_iso_string():
    assert _parse_date("2026-08-01") == date(2026, 8, 1)


def test_parse_date_none_returns_none():
    assert _parse_date(None) is None


def test_parse_date_empty_string_returns_none():
    assert _parse_date("") is None


def test_parse_date_garbage_returns_none():
    assert _parse_date("not-a-date") is None
