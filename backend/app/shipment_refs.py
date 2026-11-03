"""Shipment reference numbers — `MFT-26-0042`: a fixed prefix, the two-digit
year the shipment was created, and its sequence within that year.

Sequences live in `shipment_ref_counters`, one row per (workspace, year),
bumped with a single atomic upsert so two concurrent creates can never be
handed the same number. Numbers are never reused: deleting a shipment leaves
a gap rather than freeing its ref, so a ref quoted on a document or an
email always means the one shipment it was issued to.
"""

from datetime import date

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import SHIPMENT_REF_PREFIX
from app.models import ShipmentRefCounter


def format_ref(year: int, seq: int) -> str:
    # At least 4 digits; a workspace that passes 9,999 in a year just gets a
    # 5th rather than wrapping or colliding.
    return f"{SHIPMENT_REF_PREFIX}-{year % 100:02d}-{seq:04d}"


async def allocate_refs(db: AsyncSession, workspace_id: int, count: int = 1, today: date | None = None) -> list[str]:
    """Reserves `count` consecutive refs for the current year, in the caller's
    transaction — if the caller rolls back, the reservation goes with it."""
    year = (today or date.today()).year
    # Postgres in production, SQLite in tests — both support ON CONFLICT ...
    # RETURNING, but SQLAlchemy builds the statement per dialect.
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    stmt = insert(ShipmentRefCounter).values(workspace_id=workspace_id, year=year, last_seq=count)
    stmt = stmt.on_conflict_do_update(
        index_elements=[ShipmentRefCounter.workspace_id, ShipmentRefCounter.year],
        set_={"last_seq": ShipmentRefCounter.last_seq + count},
    ).returning(ShipmentRefCounter.last_seq)
    last_seq = (await db.execute(stmt)).scalar_one()
    return [format_ref(year, seq) for seq in range(last_seq - count + 1, last_seq + 1)]
