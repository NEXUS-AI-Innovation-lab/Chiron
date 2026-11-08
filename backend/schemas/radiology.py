"""Schémas des examens radiologiques (DICOM, stockés dans Orthanc)."""

from typing import Optional

from pydantic import BaseModel, ConfigDict


class RadiologySchema(BaseModel):
    """Examen radiologique rattaché à un dossier patient."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    orthanc_study_id: str
    modality: str
    description: str
    date: str


class ReportPayload(BaseModel):
    """Compte-rendu radiologique et annotations sérialisées du viewer."""

    report: str
    annotations: Optional[str] = ""
