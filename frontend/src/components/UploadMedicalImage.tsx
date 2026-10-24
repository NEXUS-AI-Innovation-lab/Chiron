import { useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import axios from 'axios';
import { uploadMedicalImage, type Patient } from '../services/api';

interface UploadMedicalImageProps {
  patients: Patient[];
  onClose: () => void;
  onUploaded: () => void;
}

type ImageType = 'biopsy' | 'radiology';

/**
 * Onglet de choix du type d'imagerie.
 *
 * Déclaré HORS du composant parent : un composant défini dans le corps d'un
 * autre reçoit une identité neuve à chaque rendu, et React démonte puis
 * remonte tout son sous-arbre à chaque frappe au clavier.
 */
const TypeTab = ({
  value,
  label,
  hint,
  current,
  onPick,
}: {
  value: ImageType;
  label: string;
  hint: string;
  current: ImageType;
  onPick: (value: ImageType) => void;
}) => (
  <button
    type="button"
    onClick={() => onPick(value)}
    aria-pressed={current === value}
    className={`flex-1 rounded-lg border px-3 py-2.5 text-left ${
      current === value ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'
    }`}
  >
    <span className={`block text-[13px] font-medium ${current === value ? 'text-accent-text' : 'text-ink'}`}>
      {label}
    </span>
    <span className="block text-xs text-muted">{hint}</span>
  </button>
);

/**
 * Import d'une imagerie dans un dossier existant.
 *
 * Les deux chaînes techniques du projet (lame numérisée et examen DICOM)
 * n'acceptent pas les mêmes fichiers. Le type attendu est donc choisi AVANT
 * le fichier, et les extensions autorisées sont affichées en clair : c'est ce
 * qui évite un rejet incompréhensible après plusieurs minutes d'envoi.
 */
export default function UploadMedicalImage({ patients, onClose, onUploaded }: UploadMedicalImageProps) {
  const [patientId, setPatientId] = useState('');
  const [type, setType] = useState<ImageType>('biopsy');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  /** Changer de type invalide le fichier choisi : les extensions diffèrent. */
  const pickType = (value: ImageType) => {
    setType(value);
    setFile(null);
    setError(null);
  };

  const chooseFile = (candidate?: File) => {
    if (!candidate) return;
    const valid = type === 'biopsy' ? /\.(svs|tif|tiff)$/i.test(candidate.name) : /\.dcm$/i.test(candidate.name);
    if (!valid) {
      setError(type === 'biopsy' ? 'Choisissez un fichier .svs, .tif ou .tiff.' : 'Choisissez un fichier .dcm.');
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  };

  const submit = async () => {
    if (!patientId || !file) {
      setError('Sélectionnez un dossier patient et un fichier.');
      return;
    }
    setSending(true);
    setProgress(0);
    setError(null);
    try {
      await uploadMedicalImage(Number(patientId), type, file, setProgress);
      onUploaded();
      onClose();
    } catch (cause) {
      // Le backend refuse explicitement certains imports (dossier possedant
      // deja une lame, examen deja rattache a un autre patient...). Afficher
      // son message evite l'impression que « rien ne se passe ».
      const detail =
        axios.isAxiosError(cause) && typeof cause.response?.data?.detail === 'string'
          ? cause.response.data.detail
          : "L'envoi a échoué. Vérifiez que le service concerné répond.";
      setError(detail);
    } finally {
      setSending(false);
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0]);

  return (
    <div className="wg-modal-backdrop" role="dialog" aria-modal="true">
      <div className="wg-modal max-w-lg">
        <div className="wg-modal-head">
          <h2 className="wg-modal-title">Importer une imagerie</h2>
          <button
            type="button"
            onClick={onClose}
            className="wg-btn wg-btn-quiet wg-btn-icon wg-btn-sm"
            title="Fermer"
            aria-label="Fermer"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <div className="wg-modal-body">
          <div className="mb-4">
            <label className="wg-label" htmlFor="upload-patient">Dossier patient</label>
            <select
              id="upload-patient"
              required
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              className="wg-input"
            >
              <option value="">Sélectionner un dossier…</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.name}</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <span className="wg-label">Type d'imagerie</span>
            <div className="flex gap-2">
              <TypeTab value="biopsy" label="Lame numérisée" hint=".svs, .tif, .tiff" current={type} onPick={pickType} />
              <TypeTab value="radiology" label="Radiologie" hint=".dcm (DICOM)" current={type} onPick={pickType} />
            </div>
          </div>

          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`rounded-lg border border-dashed p-8 text-center ${
              dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-raised'
            }`}
          >
            <CloudUploadIcon className="mb-2 text-muted" />
            <p className="text-[13px] text-ink">
              {file ? file.name : 'Glissez votre fichier ici'}
            </p>
            <p className="mb-3 text-xs text-muted">
              {type === 'biopsy' ? 'Formats acceptés : .svs, .tif, .tiff' : 'Format accepté : .dcm'}
            </p>
            <label className="wg-btn wg-btn-secondary wg-btn-sm cursor-pointer">
              Parcourir
              <input
                type="file"
                accept={type === 'biopsy' ? '.svs,.tif,.tiff' : '.dcm'}
                onChange={onInput}
                className="hidden"
              />
            </label>
          </div>

          {/* Une lame pèse jusqu'à plusieurs gigaoctets : sans barre de
              progression, l'utilisateur croit l'application figée. */}
          {sending && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>Envoi en cours…</span>
                <span>{progress} %</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && <div className="wg-note wg-note-danger mt-4">{error}</div>}
        </div>

        <div className="wg-modal-foot">
          <button onClick={onClose} className="wg-btn wg-btn-secondary">Annuler</button>
          <button onClick={submit} disabled={sending} className="wg-btn wg-btn-primary">
            {sending ? 'Envoi…' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}
