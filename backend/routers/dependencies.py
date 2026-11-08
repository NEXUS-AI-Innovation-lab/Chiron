"""Dépendances FastAPI partagées par les routeurs."""

from typing import Optional

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services.auth import CurrentUser, verify_token
from services.errors import Unauthorized

# auto_error=False : on lève notre propre 401, au même format
# `{"detail": ...}` que les autres erreurs, au lieu du 403 par défaut.
_bearer = HTTPBearer(auto_error=False, description="Jeton d'accès Supabase")


def require_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> CurrentUser:
    """Exige un utilisateur connecté et le renvoie.

    Branchée sur tous les routeurs métier dans main.py : sans jeton valide,
    aucune route ne répond (sauf /health et les tuiles /dzi_data).
    """
    if credentials is None or not credentials.credentials:
        raise Unauthorized("Authentification requise.")
    return verify_token(credentials.credentials)
