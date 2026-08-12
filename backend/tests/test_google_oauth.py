from unittest.mock import AsyncMock, MagicMock, patch

from app.google_oauth import build_google_auth_url, exchange_code_for_userinfo


def test_build_google_auth_url_includes_required_params():
    url = build_google_auth_url("some-state")
    assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "state=some-state" in url
    assert "response_type=code" in url
    assert "openid" in url  # part of the url-encoded scope param


async def test_exchange_code_for_userinfo_returns_profile():
    token_resp = MagicMock()
    token_resp.json.return_value = {"access_token": "fake-access-token"}

    userinfo_resp = MagicMock()
    userinfo_resp.json.return_value = {
        "email": "user@example.com",
        "email_verified": True,
        "name": "Test User",
        "sub": "12345",
    }

    mock_client = AsyncMock()
    mock_client.post.return_value = token_resp
    mock_client.get.return_value = userinfo_resp
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False

    with patch("app.google_oauth.httpx.AsyncClient", return_value=mock_client):
        result = await exchange_code_for_userinfo("fake-code")

    assert result["email"] == "user@example.com"
    assert result["sub"] == "12345"
    mock_client.post.assert_called_once()
    mock_client.get.assert_called_once()
    token_resp.raise_for_status.assert_called_once()
    userinfo_resp.raise_for_status.assert_called_once()
