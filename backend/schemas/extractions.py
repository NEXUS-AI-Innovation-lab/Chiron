"""Schémas des extractions (régions découpées dans une lame) et de l'analyse IA."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class DrawingSchema(BaseModel):
    """Annotation dessinée sur une extraction (rectangle, cercle, texte, tracé...).

    Attention : `w` et `h` changent de sens selon `type` (piège B4).
    """

    type: str
    x: float
    y: float
    w: Optional[float] = 0
    h: Optional[float] = 0
    radius: Optional[float] = 0
    text: Optional[str] = ""
    points: Optional[List[Dict[str, float]]] = []
    author: Optional[str] = "Inconnu"


class AnalysisPayload(BaseModel):
    """Corps partagé par trois routes (dette C3 de docs/09-pieges-et-bugs.md).

    * `POST /analyze-ai`     : n'utilise que la région et `patient_folder` ;
    * `POST /extract-roi`    : crée l'extraction avec tous les champs du formulaire ;
    * `POST /annotations/save` : met à jour l'extraction `extraction_id`.
    """

    x: int
    y: int
    width: int
    height: int
    patient_folder: str
    patient_name: str
    annotation_label: str
    extraction_id: Optional[int] = None
    owner: Optional[str] = "Inconnu"
    birth_date: Optional[str] = ""
    family_history: Optional[str] = ""
    medical_history: Optional[str] = ""
    prelevement_type: Optional[str] = ""
    prelevement_date: Optional[str] = ""
    block_number: Optional[str] = ""
    fixation: Optional[str] = ""
    slide_count: Optional[Any] = None
    staining: Optional[List[str]] = []
    macro_obs: Optional[str] = ""
    micro_obs: Optional[str] = ""
    histo_type: Optional[str] = ""
    sbr_grade: Optional[str] = ""
    margins: Optional[str] = ""
    hormonal_receptors: Optional[str] = ""
    diagnosis: Optional[str] = ""
    comments: Optional[str] = ""
    status: Optional[str] = ""
    pathologist: Optional[str] = ""
    validation_date: Optional[str] = ""
    drawings: List[DrawingSchema] = []
