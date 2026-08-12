from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.config import get_settings
from app.security import ALGORITHM, create_access_token, decode_access_token, hash_password, verify_password

settings = get_settings()


def test_hash_password_roundtrip():
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert verify_password("correct horse battery staple", hashed)


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("correct horse battery staple")
    assert not verify_password("wrong password", hashed)


def test_create_and_decode_access_token_roundtrip():
    token = create_access_token(user_id=42)
    assert decode_access_token(token) == 42


def test_decode_rejects_garbage_token():
    with pytest.raises(ValueError):
        decode_access_token("not.a.jwt")


def test_decode_rejects_expired_token():
    expired_payload = {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(days=1)}
    expired_token = jwt.encode(expired_payload, settings.jwt_secret, algorithm=ALGORITHM)
    with pytest.raises(ValueError):
        decode_access_token(expired_token)


def test_decode_rejects_token_signed_with_wrong_secret():
    payload = {"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(days=1)}
    forged_token = jwt.encode(payload, "not-the-real-secret", algorithm=ALGORITHM)
    with pytest.raises(ValueError):
        decode_access_token(forged_token)
