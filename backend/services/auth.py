"""Vérification des jetons Supabase et identité de l'utilisateur connecté.

Les comptes sont gérés par Supabase Auth : création, mot de passe,
réinitialisation. Le backend ne voit jamais de mot de passe. Le frontend
envoie à chaque requête le jeton d'accès reçu de Supabase
(`Authorization: Bearer <jeton>`), et ce module vérifie :

* la **signature** (ES256), avec la clé publique de Supabase, téléchargée
  sur son point JWKS puis mise en cache ;
* l'**émetteur** (`iss`) et le **public** (`aud`), pour refuser un jeton
  émis par un autre projet Supabase ;
* l'**expiration** (`exp`).

Aucun appel à Supabase n'a lieu par requête : seule la clé publique est
récupérée, une fois, puis gardée en mémoire.
"""

from dataclasses import dataclass
from typing import Optional

import jwt
from jwt import PyJWKClient

import config
from services.errors import ServiceUnavailable, Unauthorized

# Client JWKS partagé : il garde les clés en cache et ne recontacte Supabase
# que si un jeton porte un identifiant de clé (`kid`) inconnu.
_jwks_client = PyJWKClient(config.SUPABASE_JWKS_URL, cache_keys=True, lifespan=3600)

# Algorithmes acceptés : uniquement les signatures asymétriques de Supabase.
# Ne jamais accepter « none » ni HS256 avec une clé publique.
_ALGORITHMS = ["ES256", "RS256"]


@dataclass(frozen=True)
class CurrentUser:
    """L'utilisateur connecté, tel que décrit par son jeton."""

    id: str
    email: str
    full_name: str
    profession: Optional[str] = None

    @property
    def display_name(self) -> str:
        """Nom affiché dans l'application (auteur, signataire...)."""
        return self.full_name or self.email


def verify_token(token: str) -> CurrentUser:
    """Vérifie un jeton d'accès Supabase et renvoie l'utilisateur.

    :raises Unauthorized: jeton invalide, expiré ou d'un autre projet.
    :raises ServiceUnavailable: clé publique de Supabase impossible à récupérer.
    """
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as error:
        raise ServiceUnavailable(f"Service d'authentification injoignable : {error}")
    except (jwt.PyJWKClientError, jwt.DecodeError):
        raise Unauthorized("Jeton d'authentification invalide.")

    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=_ALGORITHMS,
            audience=config.SUPABASE_JWT_AUDIENCE,
            issuer=config.SUPABASE_JWT_ISSUER,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError:
        raise Unauthorized("Session expirée : reconnectez-vous.")
    except jwt.InvalidTokenError:
        raise Unauthorized("Jeton d'authentification invalide.")

    metadata = claims.get("user_metadata") or {}
    return CurrentUser(
        id=claims["sub"],
        email=claims.get("email", ""),
        full_name=(metadata.get("full_name") or "").strip(),
        profession=metadata.get("profession"),
    )
