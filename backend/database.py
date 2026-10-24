"""Connexion à PostgreSQL.

L'URL vient de l'environnement (`DATABASE_URL`, injectée par docker-compose).
Les valeurs en dur ne servent plus que de repli pour un lancement local hors
conteneur : jusqu'ici elles étaient la seule source, ce qui rendait la
variable du compose totalement inopérante.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Repli de développement uniquement. En déploiement, `DATABASE_URL` prime.
_DEFAULT_URL = "postgresql://user:password@p6_postgres:5432/p6_db"

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", _DEFAULT_URL)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # Recycle les connexions coupées par le serveur plutôt que de propager
    # une erreur au premier appel suivant une période d'inactivité.
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# `declarative_base` vient désormais de `sqlalchemy.orm` : l'ancien chemin
# `sqlalchemy.ext.declarative` est déprécié depuis SQLAlchemy 2.0.
Base = declarative_base()


def get_db():
    """Session de base de données, fermée quoi qu'il arrive."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
