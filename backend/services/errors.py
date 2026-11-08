"""Erreurs métier, traduites en réponses HTTP par un seul gestionnaire (main.py).

Les services lèvent ces exceptions au lieu de `HTTPException` : ils restent
ainsi indépendants de FastAPI et testables sans serveur. La réponse produite
est identique à celle d'une `HTTPException` : `{"detail": ...}` avec le même
code de statut.
"""

from typing import Any, Optional


class ServiceError(Exception):
    """Erreur métier générique. `status_code` est le code HTTP correspondant."""

    status_code = 500

    def __init__(self, detail: Any, status_code: Optional[int] = None):
        super().__init__(detail)
        self.detail = detail
        if status_code is not None:
            self.status_code = status_code


class InvalidInput(ServiceError):
    """Donnée refusée (format de fichier, champ manquant...)."""

    status_code = 400


class Forbidden(ServiceError):
    """Action interdite à cet utilisateur."""

    status_code = 403


class NotFound(ServiceError):
    """Entité absente de la base ou du stockage."""

    status_code = 404


class Conflict(ServiceError):
    """L'action contredit l'état actuel (lame déjà présente, examen déjà rattaché...)."""

    status_code = 409


class UpstreamError(ServiceError):
    """Un service voisin (Orthanc...) a refusé ou mal répondu."""

    status_code = 502


class ServiceUnavailable(ServiceError):
    """Un service voisin (InstanSeg...) est injoignable."""

    status_code = 503
