"""shipment etd

Revision ID: e1f2a3b4c5d6
Revises: d4e5f6a7b8c9
Create Date: 2026-11-03 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shipments', sa.Column('etd', sa.Date(), nullable=True))
    op.create_index('ix_shipments_workspace_etd', 'shipments', ['workspace_id', 'etd'])


def downgrade() -> None:
    op.drop_index('ix_shipments_workspace_etd', table_name='shipments')
    op.drop_column('shipments', 'etd')
