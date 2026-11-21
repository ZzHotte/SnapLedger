"""shipment port coordinates

Revision ID: a1b2c3d4e5f7
Revises: 3030fe4871e6
Create Date: 2026-11-21 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = '3030fe4871e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shipments', sa.Column('origin_lat', sa.Float(), nullable=True))
    op.add_column('shipments', sa.Column('origin_lng', sa.Float(), nullable=True))
    op.add_column('shipments', sa.Column('destination_lat', sa.Float(), nullable=True))
    op.add_column('shipments', sa.Column('destination_lng', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('shipments', 'destination_lng')
    op.drop_column('shipments', 'destination_lat')
    op.drop_column('shipments', 'origin_lng')
    op.drop_column('shipments', 'origin_lat')
