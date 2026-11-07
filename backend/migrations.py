"""Mise à jour du schéma de la base au démarrage, via Alembic."""

from pathlib import Path


def apply_migrations() -> None:
    """Amène la base au dernier schéma connu (`alembic upgrade head`).

    Remplace `create_all`, qui créait les tables absentes mais n'ajoutait
    jamais de colonne à une table existante : toute évolution du modèle
    cassait silencieusement les bases déjà déployées.
    """
    from alembic import command
    from alembic.config import Config

    root = Path(__file__).resolve().parent
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(config, "head")


def apply_migrations_safely() -> None:
    """Applique les migrations sans empêcher l'API de démarrer.

    L'application démarre malgré un échec pour que /health puisse rapporter
    l'incident, mais l'erreur est explicite dans les journaux.
    """
    try:
        apply_migrations()
        print("✅ Schéma de base à jour (Alembic).")
    except Exception as e:
        print(f"❌ ÉCHEC DES MIGRATIONS : {e}")
