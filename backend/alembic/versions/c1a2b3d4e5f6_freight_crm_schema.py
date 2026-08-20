"""freight CRM schema — replaces the personal-ledger domain with the
freight-forwarding domain (workspaces/customers/carriers/shipments/documents/
quotes/tracking-events). No production data existed to migrate at the time
of this cut, so old tables are dropped rather than transformed.

Revision ID: c1a2b3d4e5f6
Revises: 818cc17b1aff
Create Date: 2026-08-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PGEnum


# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, None] = '818cc17b1aff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- drop the old personal-ledger domain (respecting FK order) ---
    op.drop_table('transactions')
    op.drop_table('budgets')
    op.drop_table('receipts')
    op.drop_table('categories')
    op.drop_table('ledger_members')
    op.drop_table('ledger_invites')
    op.drop_table('ledgers')
    op.execute('DROP TYPE IF EXISTS ledger_role')
    op.execute('DROP TYPE IF EXISTS receipt_status')

    # --- workspaces (renamed ledgers — same team/role/invite mechanics) ---
    op.create_table(
        'workspaces',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'workspace_members',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.Enum('owner', 'editor', 'viewer', name='workspace_role'), nullable=False),
        # member_status already exists (created by the old ledger_members table,
        # which this migration drops but the Postgres enum TYPE outlives the
        # table) — reuse it instead of trying to recreate it.
        sa.Column('status', PGEnum('invited', 'active', name='member_status', create_type=False), nullable=False),
        sa.Column('invited_by', sa.Integer(), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['invited_by'], ['users.id']),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('workspace_id', 'user_id', name='uq_workspace_member'),
    )
    op.create_table(
        'workspace_invites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('invite_code', sa.String(length=32), nullable=False),
        sa.Column('role', sa.Enum('owner', 'editor', 'viewer', name='workspace_role'), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('used_by', sa.Integer(), nullable=True),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.ForeignKeyConstraint(['used_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('invite_code'),
    )

    # --- CRM domain ---
    op.create_table(
        'customers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('contact_name', sa.String(length=255), nullable=True),
        sa.Column('contact_email', sa.String(length=255), nullable=True),
        sa.Column('contact_phone', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'carriers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('mode', sa.Enum('FCL', 'LCL', 'AIR', 'RAIL', 'ROAD', name='freight_mode'), nullable=False),
        sa.Column('contact_email', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('uploaded_by', sa.Integer(), nullable=False),
        sa.Column('file_url', sa.String(length=500), nullable=False),
        sa.Column('extracted_doc_type', sa.String(length=50), nullable=True),
        sa.Column('extracted_bl_number', sa.String(length=100), nullable=True),
        sa.Column('extracted_shipper', sa.String(length=255), nullable=True),
        sa.Column('extracted_consignee', sa.String(length=255), nullable=True),
        sa.Column('extracted_port_of_loading', sa.String(length=255), nullable=True),
        sa.Column('extracted_port_of_discharge', sa.String(length=255), nullable=True),
        sa.Column('extracted_cargo_description', sa.String(length=500), nullable=True),
        sa.Column('extracted_weight_kg', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('ocr_raw_json', sa.JSON(), nullable=True),
        sa.Column('status', sa.Enum('pending', 'confirmed', 'rejected', name='document_status'), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'shipments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=True),
        sa.Column('carrier_id', sa.Integer(), nullable=True),
        sa.Column('freight_mode', sa.Enum('FCL', 'LCL', 'AIR', 'RAIL', 'ROAD', name='freight_mode'), nullable=False),
        sa.Column('origin_port', sa.String(length=255), nullable=True),
        sa.Column('destination_port', sa.String(length=255), nullable=True),
        sa.Column('cargo_description', sa.String(length=500), nullable=True),
        sa.Column('container_no', sa.String(length=50), nullable=True),
        sa.Column('weight_kg', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('freight_cost', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column(
            'status',
            sa.Enum(
                'inquiry', 'quoted', 'booked', 'in_transit', 'arrived', 'customs', 'delivered', 'cancelled',
                name='shipment_status',
            ),
            nullable=False,
        ),
        sa.Column('shipment_date', sa.Date(), nullable=False),
        sa.Column('eta', sa.Date(), nullable=True),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('document_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id']),
        sa.ForeignKeyConstraint(['carrier_id'], ['carriers.id']),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('document_id'),
    )
    op.create_index('ix_shipments_workspace_date', 'shipments', ['workspace_id', 'shipment_date'])
    op.create_table(
        'quotes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shipment_id', sa.Integer(), nullable=False),
        sa.Column('carrier_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('valid_until', sa.Date(), nullable=True),
        sa.Column('status', sa.Enum('pending', 'accepted', 'rejected', name='quote_status'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id']),
        sa.ForeignKeyConstraint(['carrier_id'], ['carriers.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'tracking_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shipment_id', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            PGEnum(
                'inquiry', 'quoted', 'booked', 'in_transit', 'arrived', 'customs', 'delivered', 'cancelled',
                name='shipment_status',
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column('location', sa.String(length=255), nullable=True),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    # Only tears down the freight-CRM schema — it does not restore the old
    # personal-ledger tables/data, since upgrade() drops them unconditionally.
    op.drop_table('tracking_events')
    op.drop_table('quotes')
    op.drop_index('ix_shipments_workspace_date', table_name='shipments')
    op.drop_table('shipments')
    op.drop_table('documents')
    op.drop_table('carriers')
    op.drop_table('customers')
    op.execute('DROP TYPE IF EXISTS shipment_status')
    op.execute('DROP TYPE IF EXISTS freight_mode')
    op.execute('DROP TYPE IF EXISTS document_status')
    op.execute('DROP TYPE IF EXISTS quote_status')
    op.drop_table('workspace_invites')
    op.drop_table('workspace_members')
    op.drop_table('workspaces')
    op.execute('DROP TYPE IF EXISTS workspace_role')
