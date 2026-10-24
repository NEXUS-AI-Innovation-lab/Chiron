"""Environnement Alembic de Chiron.

L'URL de connexion n'est PAS lue depuis `alembic.ini` : elle vient de la même
source que l'application (`database.SQLALCHEMY_DATABASE_URL`, elle-même
alimentée par la variable d'environnement `DATABASE_URL`). Une seule source
de vérité, donc aucun risque de migrer une base différente de celle que le
backend utilise.
"""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# `database` et `models` sont importables car le conteneur exécute depuis /app.
import database
import models  # noqa: F401 - l'import peuple Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Cible des comparaisons d'`--autogenerate`.
target_metadata = database.Base.metadata


def get_url() -> str:
    """URL de la base à migrer.

    `ALEMBIC_URL` permet de viser une base jetable le temps de générer une
    révision, sans toucher à la base de travail.
    """
    return os.getenv("ALEMBIC_URL") or database.SQLALCHEMY_DATABASE_URL


def run_migrations_offline() -> None:
    """Génère le SQL sans se connecter (mode `--sql`)."""
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Applique les migrations sur une connexion réelle."""
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        section, prefix="sqlalchemy.", poolclass=pool.NullPool
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Détecte aussi les changements de type de colonne, pas seulement
            # les ajouts et suppressions.
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
