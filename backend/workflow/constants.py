"""Définition des étapes et correspondance avec les colonnes historiques.

Les étapes sont décrites ici et nulle part ailleurs : ordre, libellé, et
projection des champs de formulaire vers les colonnes de `extractions`.
"""

from typing import Any, Callable, Dict, List, Optional

# Ordre du workflow. L'identifiant est celui utilisé par le frontend
# (`features/workflow/steps.ts`) et stocké en base.
STEP_IDS: List[str] = ["prelevement", "preparation", "microscopie", "diagnostic"]

STEP_LABELS: Dict[str, str] = {
    "prelevement": "Prélèvement",
    "preparation": "Préparation",
    "microscopie": "Microscopie",
    "diagnostic": "Diagnostic",
}

FIRST_STEP = STEP_IDS[0]
LAST_STEP = STEP_IDS[-1]


def step_position(step: str) -> int:
    """Rang 1-based d'une étape. Lève `ValueError` si l'étape est inconnue."""
    return STEP_IDS.index(step) + 1


def _to_int(value: Any) -> Optional[int]:
    """`slide_count` est un entier en base ; le formulaire envoie du texte."""
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_list(value: Any) -> List[str]:
    """`staining` est une colonne JSON : toujours une liste, même à un élément."""
    if value in (None, ""):
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def _to_str_or_none(value: Any) -> Optional[str]:
    """Les colonnes de date sont des chaînes nullables : `""` doit valoir NULL."""
    if value in (None, ""):
        return None
    return str(value)


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return ", ".join(str(item) for item in value)
    return str(value)


# Clé de formulaire OLGA -> (colonne `extractions`, convertisseur).
#
# Cette projection maintient les contrats existants : `GET /extractions/{id}/details`,
# la carte patient et le viewer continuent de lire les colonnes historiques,
# pendant que `workflow_step_states.data` conserve la saisie complète — y
# compris les champs qu'OLGA ajouterait sans colonne correspondante.
FIELD_TO_COLUMN: Dict[str, Dict[str, Any]] = {
    "prelevement": {
        "prelevementType": ("prelevement_type", _to_str),
        "prelevementDate": ("prelevement_date", _to_str_or_none),
        "blockNumber": ("block_number", _to_str),
        "fixation": ("fixation", _to_str),
    },
    "preparation": {
        "slideCount": ("slide_count", _to_int),
        "staining": ("staining", _to_list),
        "macroObs": ("macro_obs", _to_str),
    },
    "microscopie": {
        "microObs": ("micro_obs", _to_str),
        "histoType": ("histo_type", _to_str),
        "sbrGrade": ("sbr_grade", _to_str),
        "margins": ("margins", _to_str),
    },
    "diagnostic": {
        "hormonalReceptors": ("hormonal_receptors", _to_str),
        "diagnosis": ("diagnosis", _to_str),
        "comments": ("comments", _to_str),
        "pathologist": ("pathologist", _to_str),
        "validationDate": ("validation_date", _to_str_or_none),
    },
}


def column_to_field(step: str) -> Dict[str, str]:
    """Correspondance inverse (colonne -> clé de formulaire) pour la reprise."""
    return {column: field for field, (column, _) in FIELD_TO_COLUMN[step].items()}


# Champs exigés par Chiron pour valider une étape, indépendamment d'OLGA.
# Vide aujourd'hui : aucun formulaire OLGA ne marque de champ obligatoire.
# Le moteur applique la règle dès qu'une entrée est ajoutée ici.
REQUIRED_FIELDS: Dict[str, List[str]] = {step: [] for step in STEP_IDS}
