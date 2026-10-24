"""Contrats HTTP du moteur de workflow."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class StepStateSchema(BaseModel):
    """État d'une étape du parcours."""

    step: str
    position: int
    label: str
    data: Dict[str, Any] = Field(default_factory=dict)
    validated_at: Optional[datetime] = None
    validated_by: Optional[str] = None

    @property
    def is_validated(self) -> bool:
        return self.validated_at is not None

    class Config:
        from_attributes = True


class WorkflowStateSchema(BaseModel):
    """Avancement complet, tel que le frontend en a besoin pour s'initialiser."""

    extraction_id: int
    current_step: str
    current_position: int
    step_count: int
    is_complete: bool
    completed_at: Optional[datetime] = None
    steps: List[StepStateSchema]
    #: Étape la plus avancée déjà validée, pour autoriser la navigation arrière.
    max_reached_position: int


class StepSavePayload(BaseModel):
    """Enregistrement d'une étape.

    `validate_step` à False permet d'enregistrer un brouillon sans franchir
    l'étape — le travail partiel n'est plus perdu à la fermeture de l'onglet.
    """

    data: Dict[str, Any] = Field(default_factory=dict)
    validated_by: Optional[str] = None
    validate_step: bool = True


class TransitionPayload(BaseModel):
    """Déplacement explicite vers une étape déjà atteinte."""

    step: str
