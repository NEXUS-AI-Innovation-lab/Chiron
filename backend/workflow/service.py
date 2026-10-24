"""Machine à états du workflow anatomopathologique.

Toute la logique métier vit ici : le routeur ne fait que traduire les
exceptions en réponses HTTP. Les règles de transition sont appliquées
côté serveur — le client ne peut pas les contourner.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

import models

from .constants import (
    FIELD_TO_COLUMN,
    FIRST_STEP,
    LAST_STEP,
    REQUIRED_FIELDS,
    STEP_IDS,
    STEP_LABELS,
    column_to_field,
    step_position,
)
from .schemas import StepStateSchema, WorkflowStateSchema


class WorkflowError(Exception):
    """Erreur métier du workflow, traduite en HTTP par le routeur."""

    def __init__(self, code: str, message: str, details: Optional[Any] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def _is_filled(value: Any) -> bool:
    """Une valeur compte comme saisie si elle n'est ni vide ni nulle."""
    if value is None:
        return False
    if isinstance(value, (list, dict, str)):
        return len(value) > 0
    return True


def _legacy_data(extraction: models.Extraction, step: str) -> Dict[str, Any]:
    """Reconstitue les données d'une étape depuis les colonnes historiques."""
    data: Dict[str, Any] = {}
    for column, field in column_to_field(step).items():
        value = getattr(extraction, column, None)
        if value is not None:
            data[field] = value
    return data


def get_or_create_state(
    db: Session, extraction: models.Extraction
) -> models.WorkflowState:
    """Retourne l'état du workflow, en le reconstruisant au premier accès.

    Reprise des extractions antérieures au moteur : les données sont relues
    depuis les colonnes de `extractions`, et une étape est considérée validée
    tant qu'elle porte au moins une valeur — en s'arrêtant à la première étape
    vide. L'étape courante est donc la première non renseignée.
    """
    if extraction.workflow is not None:
        return extraction.workflow

    state = models.WorkflowState(extraction_id=extraction.id, current_step=FIRST_STEP)
    db.add(state)

    still_consecutive = True
    validated_count = 0

    for index, step in enumerate(STEP_IDS):
        data = _legacy_data(extraction, step)
        has_data = any(_is_filled(value) for value in data.values())
        validated = still_consecutive and has_data

        if validated:
            validated_count += 1
        else:
            still_consecutive = False

        state.steps.append(
            models.WorkflowStepState(
                step=step,
                position=index + 1,
                data=data,
                validated_at=datetime.utcnow() if validated else None,
                validated_by=extraction.owner if validated else None,
            )
        )

    if validated_count >= len(STEP_IDS):
        state.current_step = LAST_STEP
        state.completed_at = datetime.utcnow()
    else:
        state.current_step = STEP_IDS[validated_count]

    db.commit()
    db.refresh(state)
    return state


def _step_state(state: models.WorkflowState, step: str) -> models.WorkflowStepState:
    for step_state in state.steps:
        if step_state.step == step:
            return step_state
    raise WorkflowError("unknown_step", "Étape inconnue : {}".format(step))


def max_reached_position(state: models.WorkflowState) -> int:
    """Rang le plus avancé accessible : la première étape non encore validée."""
    validated = {s.position for s in state.steps if s.validated_at is not None}
    consecutive = 0
    for position in range(1, len(STEP_IDS) + 1):
        if position not in validated:
            break
        consecutive = position
    return min(consecutive + 1, len(STEP_IDS))


def _mirror_to_columns(
    extraction: models.Extraction, step: str, data: Dict[str, Any]
) -> None:
    """Projette les champs connus sur les colonnes historiques.

    Les consommateurs existants (viewer, carte patient, détails d'extraction)
    continuent ainsi de fonctionner sans modification, pendant que `data`
    conserve la saisie complète.
    """
    for field, (column, convert) in FIELD_TO_COLUMN[step].items():
        if field in data:
            setattr(extraction, column, convert(data[field]))


def _missing_required(step: str, data: Dict[str, Any]) -> List[str]:
    return [
        field for field in REQUIRED_FIELDS[step] if not _is_filled(data.get(field))
    ]


def save_step(
    db: Session,
    extraction: models.Extraction,
    step: str,
    data: Dict[str, Any],
    validated_by: Optional[str],
    validate_step: bool,
) -> models.WorkflowState:
    """Enregistre une étape, éventuellement en la validant.

    Une étape ne peut être validée que si toutes celles qui la précèdent le
    sont : c'est le blocage de transition, appliqué côté serveur.
    """
    if step not in STEP_IDS:
        raise WorkflowError("unknown_step", "Étape inconnue : {}".format(step))
    if not isinstance(data, dict):
        raise WorkflowError("invalid_payload", "Le champ `data` doit être un objet.")

    state = get_or_create_state(db, extraction)
    target = _step_state(state, step)
    position = step_position(step)
    reachable = max_reached_position(state)

    if position > reachable:
        raise WorkflowError(
            "step_locked",
            "Cette étape n'est pas encore accessible : validez d'abord les précédentes.",
            {"max_reached_position": reachable},
        )

    if validate_step:
        missing = _missing_required(step, data)
        if missing:
            raise WorkflowError(
                "missing_fields",
                "Des champs obligatoires ne sont pas renseignés.",
                {"missing": missing},
            )

    target.data = dict(data)
    target.updated_at = datetime.utcnow()

    if validate_step:
        target.validated_at = datetime.utcnow()
        target.validated_by = validated_by or extraction.owner
        # L'étape courante avance d'un seul cran : aucun saut possible.
        if position < len(STEP_IDS):
            state.current_step = STEP_IDS[position]
            state.completed_at = None
        else:
            state.current_step = LAST_STEP
            state.completed_at = datetime.utcnow()

    _mirror_to_columns(extraction, step, data)
    state.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(state)
    return state


def goto_step(
    db: Session, extraction: models.Extraction, step: str
) -> models.WorkflowState:
    """Repositionne l'étape courante sur une étape déjà accessible."""
    if step not in STEP_IDS:
        raise WorkflowError("unknown_step", "Étape inconnue : {}".format(step))

    state = get_or_create_state(db, extraction)
    position = step_position(step)
    reachable = max_reached_position(state)

    if position > reachable:
        raise WorkflowError(
            "step_locked",
            "Étape inaccessible : les étapes précédentes ne sont pas validées.",
            {"max_reached_position": reachable},
        )

    state.current_step = step
    state.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(state)
    return state


def to_schema(state: models.WorkflowState) -> WorkflowStateSchema:
    """Sérialise l'état pour le frontend."""
    steps = [
        StepStateSchema(
            step=s.step,
            position=s.position,
            label=STEP_LABELS.get(s.step, s.step),
            data=s.data or {},
            validated_at=s.validated_at,
            validated_by=s.validated_by,
        )
        for s in sorted(state.steps, key=lambda item: item.position)
    ]

    return WorkflowStateSchema(
        extraction_id=state.extraction_id,
        current_step=state.current_step,
        current_position=step_position(state.current_step),
        step_count=len(STEP_IDS),
        is_complete=state.completed_at is not None,
        completed_at=state.completed_at,
        steps=steps,
        max_reached_position=max_reached_position(state),
    )
