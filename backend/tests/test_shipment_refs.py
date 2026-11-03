from datetime import date

from app.models import User, Workspace
from app.shipment_refs import allocate_refs, format_ref


async def _workspace(db, n: int = 1) -> int:
    user = User(email=f"refs{n}@example.com", name="Refs")
    db.add(user)
    await db.flush()
    workspace = Workspace(name=f"WS {n}", owner_id=user.id)
    db.add(workspace)
    await db.flush()
    return workspace.id


def test_format_ref_pads_to_four_digits_and_grows_past_9999():
    assert format_ref(2026, 42) == "MFT-26-0042"
    assert format_ref(2026, 12345) == "MFT-26-12345"
    assert format_ref(2030, 1) == "MFT-30-0001"


async def test_refs_are_sequential_per_workspace(db_session):
    ws_a = await _workspace(db_session, 1)
    ws_b = await _workspace(db_session, 2)
    today = date(2026, 11, 3)

    assert await allocate_refs(db_session, ws_a, today=today) == ["MFT-26-0001"]
    assert await allocate_refs(db_session, ws_a, count=3, today=today) == ["MFT-26-0002", "MFT-26-0003", "MFT-26-0004"]
    # Another workspace has its own sequence.
    assert await allocate_refs(db_session, ws_b, today=today) == ["MFT-26-0001"]


async def test_sequence_restarts_each_year(db_session):
    ws = await _workspace(db_session)
    await allocate_refs(db_session, ws, count=5, today=date(2026, 12, 31))
    assert await allocate_refs(db_session, ws, today=date(2027, 1, 1)) == ["MFT-27-0001"]
    assert await allocate_refs(db_session, ws, today=date(2026, 12, 31)) == ["MFT-26-0006"]
