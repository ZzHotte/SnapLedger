"""customer sort order

Revision ID: 3030fe4871e6
Revises: f2a3b4c5d6e7
Create Date: 2026-11-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3030fe4871e6'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('customers', sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))

    # Backfill in the order customers were already displayed in (alphabetical
    # by name) so upgrading doesn't visibly reshuffle anyone's list.
    op.execute("""
        WITH numbered AS (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY name) - 1 AS position
            FROM customers
        )
        UPDATE customers c
        SET sort_order = n.position
        FROM numbered n
        WHERE c.id = n.id
    """)


def downgrade() -> None:
    op.drop_column('customers', 'sort_order')
