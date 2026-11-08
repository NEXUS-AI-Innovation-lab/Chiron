"""Schémas des dossiers patients."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from schemas.biopsies import BiopsySchema
from schemas.radiology import RadiologySchema


class PatientSchema(BaseModel):
    """Dossier patient complet, avec ses lames et ses examens radiologiques."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    age: int
    folder_id: str
    birth_date: Optional[str] = None
    family_history: Optional[str] = None
    medical_history: Optional[str] = None
    biopsies: List[BiopsySchema] = []
    radiology_studies: List[RadiologySchema] = []


class PatientCreate(BaseModel):
    """Corps de `POST /patients`. Le `folder_id` est généré par le serveur."""

    name: str
    age: int
    birth_date: Optional[str] = None
    family_history: Optional[str] = None
    medical_history: Optional[str] = None
