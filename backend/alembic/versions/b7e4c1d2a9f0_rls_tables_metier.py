"""Active RLS sur les tables métier (base hébergée par Supabase)

Dans Supabase, les rôles `anon` et `authenticated` sont ceux des visiteurs et
des utilisateurs connectés du frontend. Activer Row Level Security SANS
politique leur ferme l'accès aux tables, même si un droit leur était rendu
par erreur. Le backend, lui, se connecte avec le rôle `postgres`,
propriétaire des tables : RLS ne s'applique pas à lui.

Fonctionne aussi sur un PostgreSQL ordinaire (RLS est une fonction standard).

Toute nouvelle table métier doit, elle aussi, activer RLS dans sa migration.

Revision ID: b7e4c1d2a9f0
Revises: 719b309ce4d3
Create Date: 2026-11-07
"""

from alembic import op

revision = "b7e4c1d2a9f0"
down_revision = "719b309ce4d3"
branch_labels = None
depends_on = None

TABLES = (
    "patients",
    "biopsies",
    "extractions",
    "drawings",
    "radiology_studies",
    "workflow_states",
    "workflow_step_states",
    "alembic_version",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    for table in TABLES:
        op.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')
