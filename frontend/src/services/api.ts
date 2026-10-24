import axios from 'axios';

// L'adresse de ton backend Python
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8002';

export interface Biopsy {
  id: number;
  image_url: string;
  status: string;
}

export interface Patient {
  id: number;
  name: string;
  age: number;
  folder_id: string;
  biopsies: Biopsy[];
  birth_date?: string;
  family_history?: string;
  medical_history?: string;
}

export interface PatientInput {
  name: string;
  age: number;
  birth_date?: string;
  family_history?: string;
  medical_history?: string;
}

export const createPatient = async (patient: PatientInput): Promise<Patient> => {
  const response = await axios.post<Patient>(`${API_URL}/patients`, patient);
  return response.data;
};

export const uploadMedicalImage = async (
  patientId: number,
  type: 'biopsy' | 'radiology',
  file: File,
  onProgress: (progress: number) => void,
) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axios.post(
    `${API_URL}/patients/${patientId}/upload-${type}`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (event.total) onProgress(Math.round((event.loaded * 100) / event.total));
      },
    },
  );
  return response.data;
};

// Fonction pour récupérer la liste des patients
export const getPatients = async (): Promise<Patient[]> => {
  try {
    const response = await axios.get(`${API_URL}/patients`);
    return response.data;
  } catch (error) {
    console.error("Erreur lors de la récupération des patients", error);
    return [];
  }
};

export interface DeletePatientReport {
  message: string;
  minio_objects: number;
  dzi_paths: number;
  orthanc_studies_kept: number;
  warnings: string[];
}

/**
 * Supprime un patient et tout ce qui lui appartient (lame, extractions,
 * annotations, avancement du workflow, tuiles DZI).
 *
 * Les études DICOM restent dans Orthanc : purger le PACS est une opération
 * distincte, que le backend ne fait pas ici.
 */
export const deletePatient = async (id: number): Promise<DeletePatientReport> => {
  const response = await axios.delete(`${API_URL}/patients/${id}`);
  return response.data;
};

export interface DeleteBiopsyReport {
  message: string;
  minio_objects: number;
  dzi_paths: number;
  extractions_conservees: number;
  warnings: string[];
}

/** Supprime la lame d'un dossier : objet source, tuiles, puis la ligne. */
export const deleteBiopsy = async (id: number): Promise<DeleteBiopsyReport> => {
  const response = await axios.delete(`${API_URL}/biopsies/${id}`);
  return response.data;
};

/**
 * Détache un examen radiologique du dossier.
 *
 * L'étude reste dans Orthanc : elle pourra donc être réimportée, y compris
 * sur un autre dossier patient.
 */
export const deleteRadiologyStudy = async (id: number): Promise<{ message: string }> => {
  const response = await axios.delete(`${API_URL}/radiology-studies/${id}`);
  return response.data;
};
