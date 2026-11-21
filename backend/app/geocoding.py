import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/forward"


async def geocode_port(port_text: str | None) -> tuple[float, float] | None:
    """Resolves a free-text port/place name (as typed manually, or extracted by
    the AI from a shipping document) to (lat, lng) via Mapbox. Best-effort: a
    missing token, an unrecognized name, or any request failure all just mean
    no coordinates — never raise, so a geocoding hiccup can't block creating
    a shipment."""
    if not settings.mapbox_token or not port_text or not port_text.strip():
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as http:
            resp = await http.get(
                GEOCODE_URL,
                params={"q": port_text, "limit": 1, "access_token": settings.mapbox_token},
            )
            resp.raise_for_status()
            features = resp.json().get("features", [])
    except Exception:
        logger.exception("Mapbox geocoding failed for %r", port_text)
        return None

    if not features:
        return None
    lng, lat = features[0]["geometry"]["coordinates"]
    return lat, lng
