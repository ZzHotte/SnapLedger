"""document extracted freight cost/currency

Revision ID: d4e5f6a7b8c9
Revises: c1a2b3d4e5f6
Create Date: 2026-08-20 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c1a2b3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('extracted_freight_cost', sa.Numeric(precision=12, scale=2), nullable=True))
    op.add_column('documents', sa.Column('extracted_currency', sa.String(length=3), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'extracted_currency')
    op.drop_column('documents', 'extracted_freight_cost')
