"""Appels HTTP vers Orthanc, le PACS qui stocke les examens DICOM.

Fonctions synchrones (bibliothèque `requests`) : les appelants asynchrones
doivent les exécuter via `run_in_threadpool`.
"""

from typing import Any, Dict

import requests

import config

_AUTH = (config.ORTHANC_USER, config.ORTHANC_PASSWORD)


def upload_instance(fileobj) -> requests.Response:
    """Envoie un fichier DICOM brut. Orthanc répond 200 ou 202 s'il l'accepte."""
    return requests.post(
        f"{config.ORTHANC_URL}/instances",
        data=fileobj,
        auth=_AUTH,
        timeout=300,
    )


def get_study(study_id: str) -> Dict[str, Any]:
    """Détail d'une étude (contient les tags date et description)."""
    return requests.get(
        f"{config.ORTHANC_URL}/studies/{study_id}", auth=_AUTH, timeout=60
    ).json()


def get_series(series_id: str) -> Dict[str, Any]:
    """Détail d'une série (contient le tag de modalité : CT, MR, ...)."""
    return requests.get(
        f"{config.ORTHANC_URL}/series/{series_id}", auth=_AUTH, timeout=60
    ).json()
