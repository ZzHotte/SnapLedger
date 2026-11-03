"""shipment ref numbers

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-11-03 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Hand-copied from app.constants.SHIPMENT_REF_PREFIX at the time this ran —
# migrations don't import app constants (see app/constants.py's docstring).
PREFIX = 'MFT'


def upgrade() -> None:
    op.create_table(
        'shipment_ref_counters',
        sa.Column('workspace_id', sa.Integer(), sa.ForeignKey('workspaces.id'), primary_key=True),
        sa.Column('year', sa.Integer(), primary_key=True),
        sa.Column('last_seq', sa.Integer(), nullable=False),
    )
    op.add_column('shipments', sa.Column('ref', sa.String(length=20), nullable=True))

    # Backfill existing shipments in id (= creation) order, numbered per
    # workspace per creation year, then seed the counters to carry on from there.
    op.execute(f"""
        WITH numbered AS (
            SELECT id,
                   workspace_id,
                   EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC')::int AS yr,
                   ROW_NUMBER() OVER (
                       PARTITION BY workspace_id, EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC')
                       ORDER BY id
                   ) AS seq
            FROM shipments
        )
        UPDATE shipments s
        SET ref = '{PREFIX}-' || LPAD((n.yr % 100)::text, 2, '0') || '-' ||
                  CASE WHEN n.seq < 10000 THEN LPAD(n.seq::text, 4, '0') ELSE n.seq::text END
        FROM numbered n
        WHERE s.id = n.id
    """)
    op.execute("""
        INSERT INTO shipment_ref_counters (workspace_id, year, last_seq)
        SELECT workspace_id, EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC')::int, COUNT(*)
        FROM shipments
        GROUP BY 1, 2
    """)

    op.alter_column('shipments', 'ref', nullable=False)
    op.create_unique_constraint('uq_shipments_workspace_ref', 'shipments', ['workspace_id', 'ref'])


def downgrade() -> None:
    op.drop_constraint('uq_shipments_workspace_ref', 'shipments', type_='unique')
    op.drop_column('shipments', 'ref')
    op.drop_table('shipment_ref_counters')
