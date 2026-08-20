from unittest.mock import patch

from app.gemini import EMPTY_EXTRACTION

FAKE_IMAGE_URL = "https://res.cloudinary.com/demo/image/upload/fake.png"
FAKE_EXTRACTION = {
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


async def _register(client) -> str:
    resp = await client.post(
        "/auth/register",
        json={"email": "documents@example.com", "password": "testpassword123"},
    )
    return resp.json()["access_token"]


def _mocks():
    return (
        patch("app.routers.documents.upload_document_file", return_value=FAKE_IMAGE_URL),
        patch("app.routers.documents.extract_document_fields", return_value=(dict(FAKE_EXTRACTION), True)),
    )


async def _create_customer(client, headers) -> int:
    resp = await client.post("/customers", headers=headers, json={"name": "Acme Corp"})
    return resp.json()["id"]


async def test_upload_document_extracts_and_returns_pending(client):
    token = await _register(client)
    upload_mock, extract_mock = _mocks()

    with upload_mock, extract_mock:
        resp = await client.post(
            "/documents/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("document.png", b"fake-image-bytes", "image/png")},
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["file_url"] == FAKE_IMAGE_URL
    assert body["bl_number"] == "BL123456"
    assert body["shipper"] == "Acme Shippers"
    assert body["weight_kg"] == 1200.5
    assert body["freight_cost"] == 3500.0
    assert body["currency"] == "USD"
    assert body["extraction_failed"] is False


async def test_upload_surfaces_extraction_failure_without_failing_the_upload(client):
    token = await _register(client)
    with (
        patch("app.routers.documents.upload_document_file", return_value=FAKE_IMAGE_URL),
        patch("app.routers.documents.extract_document_fields", return_value=(dict(EMPTY_EXTRACTION), False)),
    ):
        resp = await client.post(
            "/documents/upload",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("document.png", b"fake-image-bytes", "image/png")},
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["extraction_failed"] is True
    assert body["bl_number"] is None


async def test_upload_rejects_non_image(client):
    token = await _register(client)
    resp = await client.post(
        "/documents/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400


async def test_confirm_document_creates_shipment_and_lists_it(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    customer_id = await _create_customer(client, headers)
    upload_mock, extract_mock = _mocks()

    with upload_mock, extract_mock:
        upload_resp = await client.post(
            "/documents/upload",
            headers=headers,
            files={"file": ("document.png", b"fake-image-bytes", "image/png")},
        )
    document_id = upload_resp.json()["id"]

    confirm_resp = await client.post(
        f"/documents/{document_id}/confirm",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "FCL",
            "origin_port": "Shanghai, CN",
            "destination_port": "Los Angeles, US",
            "cargo_description": "Electronics components",
            "weight_kg": 1200.5,
            "freight_cost": 3500,
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert confirm_resp.status_code == 201
    shipment = confirm_resp.json()
    assert shipment["customer_name"] == "Acme Corp"
    assert shipment["freight_mode"] == "FCL"
    assert shipment["document_file_url"] == FAKE_IMAGE_URL

    # confirming twice should fail
    dup_resp = await client.post(
        f"/documents/{document_id}/confirm",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "FCL",
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert dup_resp.status_code == 409

    list_resp = await client.get("/shipments", headers=headers)
    assert list_resp.status_code == 200
    body = list_resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == shipment["id"]
    assert body["items"][0]["customer_name"] == "Acme Corp"


async def _upload_document(client, headers) -> int:
    upload_mock, extract_mock = _mocks()
    with upload_mock, extract_mock:
        resp = await client.post(
            "/documents/upload",
            headers=headers,
            files={"file": ("document.png", b"fake-image-bytes", "image/png")},
        )
    return resp.json()["id"]


async def test_confirm_rejects_zero_weight(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    customer_id = await _create_customer(client, headers)
    document_id = await _upload_document(client, headers)

    resp = await client.post(
        f"/documents/{document_id}/confirm",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "FCL",
            "weight_kg": 0,
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert resp.status_code == 422


async def test_confirm_rejects_negative_freight_cost(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    customer_id = await _create_customer(client, headers)
    document_id = await _upload_document(client, headers)

    resp = await client.post(
        f"/documents/{document_id}/confirm",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "FCL",
            "freight_cost": -50,
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert resp.status_code == 422


async def test_confirm_rejects_cargo_description_longer_than_column(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    customer_id = await _create_customer(client, headers)
    document_id = await _upload_document(client, headers)

    resp = await client.post(
        f"/documents/{document_id}/confirm",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "FCL",
            "cargo_description": "A" * 600,
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert resp.status_code == 422


async def test_confirm_rejects_invalid_freight_mode(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    customer_id = await _create_customer(client, headers)
    document_id = await _upload_document(client, headers)

    resp = await client.post(
        f"/documents/{document_id}/confirm",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "TRUCK",
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert resp.status_code == 422


async def test_confirm_unknown_document_404s(client):
    token = await _register(client)
    headers = {"Authorization": f"Bearer {token}"}
    customer_id = await _create_customer(client, headers)

    resp = await client.post(
        "/documents/999/confirm",
        headers=headers,
        json={
            "customer_id": customer_id,
            "freight_mode": "FCL",
            "currency": "USD",
            "shipment_date": "2026-08-01",
        },
    )
    assert resp.status_code == 404
