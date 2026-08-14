"""market data

Revision ID: 818cc17b1aff
Revises: b04aefae9719
Create Date: 2026-08-14 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '818cc17b1aff'
down_revision: Union[str, None] = 'b04aefae9719'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


bank_rates_table = sa.table(
    "bank_rates",
    sa.column("country_code", sa.String),
    sa.column("bank_name", sa.String),
    sa.column("product_type", sa.String),
    sa.column("term_months", sa.Integer),
    sa.column("rate", sa.Numeric),
    sa.column("source_url", sa.String),
)

# Hand-curated reference rates — there's no free, unified API for bank deposit
# rates (per the architecture doc), so these are illustrative snapshot figures
# rather than a live feed. Meant for the "what does a savings account even pay
# these days" reference card, not as financial advice; update by hand as rates
# drift materially.
BANK_RATE_SEED = [
    {"country_code": "CHN", "bank_name": "ICBC", "product_type": "demand", "term_months": None, "rate": 0.20},
    {"country_code": "CHN", "bank_name": "ICBC", "product_type": "term", "term_months": 36, "rate": 1.90},
    {"country_code": "AUS", "bank_name": "Commonwealth Bank", "product_type": "demand", "term_months": None, "rate": 0.05},
    {"country_code": "AUS", "bank_name": "Commonwealth Bank", "product_type": "term", "term_months": 12, "rate": 4.50},
    {"country_code": "USA", "bank_name": "Chase", "product_type": "demand", "term_months": None, "rate": 0.01},
    {"country_code": "USA", "bank_name": "Chase", "product_type": "term", "term_months": 12, "rate": 4.25},
    {"country_code": "GBR", "bank_name": "HSBC", "product_type": "demand", "term_months": None, "rate": 1.50},
    {"country_code": "GBR", "bank_name": "HSBC", "product_type": "term", "term_months": 12, "rate": 4.00},
    {"country_code": "JPN", "bank_name": "MUFG Bank", "product_type": "demand", "term_months": None, "rate": 0.02},
    {"country_code": "JPN", "bank_name": "MUFG Bank", "product_type": "term", "term_months": 12, "rate": 0.03},
]


def upgrade() -> None:
    op.create_table(
        "exchange_rates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("base_currency", sa.String(length=3), nullable=False),
        sa.Column("target_currency", sa.String(length=3), nullable=False),
        sa.Column("rate", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("base_currency", "target_currency", name="uq_exchange_rate_pair"),
    )

    op.create_table(
        "bank_rates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("country_code", sa.String(length=3), nullable=False),
        sa.Column("bank_name", sa.String(length=100), nullable=False),
        sa.Column("product_type", sa.String(length=20), nullable=False),
        sa.Column("term_months", sa.Integer(), nullable=True),
        sa.Column("rate", sa.Numeric(precision=6, scale=3), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "macro_indicators",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("country_code", sa.String(length=3), nullable=False),
        sa.Column("indicator", sa.String(length=50), nullable=False),
        sa.Column("value", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("country_code", "indicator", name="uq_macro_indicator_country"),
    )

    op.bulk_insert(bank_rates_table, BANK_RATE_SEED)


def downgrade() -> None:
    op.drop_table("macro_indicators")
    op.drop_table("bank_rates")
    op.drop_table("exchange_rates")
