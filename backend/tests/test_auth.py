async def test_register_login_me_flow(client):
    register_resp = await client.post(
        "/auth/register",
        json={"email": "pytest@example.com", "password": "testpassword123", "name": "Pytest User"},
    )
    assert register_resp.status_code == 201
    body = register_resp.json()
    token = body["access_token"]
    assert body["user"]["email"] == "pytest@example.com"

    me_resp = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "pytest@example.com"

    login_resp = await client.post(
        "/auth/login", json={"email": "pytest@example.com", "password": "testpassword123"}
    )
    assert login_resp.status_code == 200


async def test_duplicate_register_rejected(client):
    payload = {"email": "dup@example.com", "password": "testpassword123"}
    first = await client.post("/auth/register", json=payload)
    assert first.status_code == 201
    second = await client.post("/auth/register", json=payload)
    assert second.status_code == 409


async def test_wrong_password_rejected(client):
    await client.post("/auth/register", json={"email": "wrongpw@example.com", "password": "correctpassword"})
    resp = await client.post(
        "/auth/login", json={"email": "wrongpw@example.com", "password": "incorrectpassword"}
    )
    assert resp.status_code == 401


async def test_me_without_token_rejected(client):
    resp = await client.get("/auth/me")
    assert resp.status_code == 403
