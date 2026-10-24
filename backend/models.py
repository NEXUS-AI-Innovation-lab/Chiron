from sqlalchemy import (
    Column, Integer, String, ForeignKey, DateTime, Text, Float, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    age = Column(Integer)
    folder_id = Column(String)
    
    birth_date = Column(String)
    family_history = Column(String)
    medical_history = Column(Text)

    biopsies = relationship("Biopsy", back_populates="patient", cascade="all, delete")
    extractions = relationship("Extraction", back_populates="patient", cascade="all, delete")
    radiology_studies = relationship("RadiologyStudy", back_populates="patient", cascade="all, delete")

class RadiologyStudy(Base):
    __tablename__ = "radiology_studies"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    
    orthanc_study_id = Column(String)
    modality = Column(String)   
    description = Column(String) 
    date = Column(String)
    
    report = Column(Text, nullable=True)
    annotations = Column(Text, nullable=True)
    patient = relationship("Patient", back_populates="radiology_studies")

class Biopsy(Base):
    __tablename__ = "biopsies"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    image_url = Column(String)
    status = Column(String)
    patient = relationship("Patient", back_populates="biopsies")

class Extraction(Base):
    __tablename__ = "extractions"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    
    label = Column(String)
    dzi_url = Column(String) 
    x = Column(Integer, default=0)
    y = Column(Integer, default=0)
    w = Column(Integer, default=0)
    h = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = Column(String, nullable=True) 

    # Formulaire Médical
    prelevement_type = Column(String, nullable=True)
    prelevement_date = Column(String, nullable=True)
    block_number = Column(String, nullable=True)
    fixation = Column(String, nullable=True)
    slide_count = Column(Integer, nullable=True)
    staining = Column(JSON, nullable=True) 

    macro_obs = Column(Text, nullable=True)
    micro_obs = Column(Text, nullable=True)
    histo_type = Column(String, nullable=True)
    sbr_grade = Column(String, nullable=True)
    margins = Column(String, nullable=True)
    hormonal_receptors = Column(String, nullable=True)
    diagnosis = Column(String, nullable=True)
    comments = Column(Text, nullable=True)

    status = Column(String, nullable=True)
    pathologist = Column(String, nullable=True)
    validation_date = Column(String, nullable=True)

    patient = relationship("Patient", back_populates="extractions")
    drawings = relationship("Drawing", back_populates="extraction", cascade="all, delete")
    workflow = relationship(
        "WorkflowState",
        back_populates="extraction",
        uselist=False,
        cascade="all, delete-orphan",
    )

class Drawing(Base):
    __tablename__ = "drawings"
    id = Column(Integer, primary_key=True, index=True)
    extraction_id = Column(Integer, ForeignKey("extractions.id"))
    
    type = Column(String)  # 'rect', 'circle', 'polygon', 'text'
    x = Column(Float)
    y = Column(Float)
    w = Column(Float, nullable=True)
    h = Column(Float, nullable=True)
    radius = Column(Float, nullable=True)
    text = Column(String, nullable=True)
    points = Column(JSON, nullable=True) 

    author = Column(String, nullable=True)
    
    extraction = relationship("Extraction", back_populates="drawings")

class WorkflowState(Base):
    """Avancement du workflow anatomopathologique d'une extraction.

    Table dediee plutot que colonnes supplementaires sur `extractions` :
    `create_all` sait creer une table absente, alors qu'il n'ajoute jamais
    de colonne a une table existante. L'ajout se fait donc sans migration.
    """

    __tablename__ = "workflow_states"

    id = Column(Integer, primary_key=True, index=True)
    extraction_id = Column(
        Integer,
        ForeignKey("extractions.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )

    # Identifiant de l'etape en cours (voir workflow/constants.py).
    current_step = Column(String, nullable=False)
    # Renseigne quand la derniere etape a ete validee.
    completed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    extraction = relationship("Extraction", back_populates="workflow")
    steps = relationship(
        "WorkflowStepState",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowStepState.position",
    )


class WorkflowStepState(Base):
    """Donnees saisies et validation d'une etape.

    `data` accueille l'integralite du formulaire OLGA, y compris les champs
    qui n'ont pas de colonne dediee sur `extractions` : plus aucune saisie
    n'est perdue si un formulaire evolue cote OLGA.
    """

    __tablename__ = "workflow_step_states"
    __table_args__ = (UniqueConstraint("workflow_state_id", "step", name="uq_workflow_step"),)

    id = Column(Integer, primary_key=True, index=True)
    workflow_state_id = Column(
        Integer,
        ForeignKey("workflow_states.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    step = Column(String, nullable=False)
    position = Column(Integer, nullable=False)
    data = Column(JSON, nullable=False, default=dict)

    validated_at = Column(DateTime, nullable=True)
    validated_by = Column(String, nullable=True)

    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    workflow = relationship("WorkflowState", back_populates="steps")
