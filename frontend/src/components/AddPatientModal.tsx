import { useState } from 'react';
import type { FormEvent } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { createPatient, type Patient } from '../services/api';

interface AddPatientModalProps {
  onClose: () => void;
  onCreated: (patient: Patient) => void;
}

/**
 * Création d'un dossier patient.
 *
 * Deux champs obligatoires seulement (nom, âge) : le reste est facultatif et
 * clairement signalé comme tel. Un formulaire médical qui exige des données
 * dont le praticien ne dispose pas encore le pousse à inventer.
 */
export default function AddPatientModal({ onClose, onCreated }: AddPatientModalProps) {
  const [form, setForm] = useState({ name: '', age: '', birth_date: '', family_history: '', medical_history: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const patient = await createPatient({
        name: form.name,
        age: Number(form.age),
        birth_date: form.birth_date || undefined,
        family_history: form.family_history || undefined,
        medical_history: form.medical_history || undefined,
      });
      onCreated(patient);
    } catch {
      setError('Impossible de créer le patient.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wg-modal-backdrop" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="wg-modal max-w-lg">
        <div className="wg-modal-head">
          <h2 className="wg-modal-title">Nouveau dossier patient</h2>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="wg-label" htmlFor="patient-name">Nom complet</label>
              <input
                id="patient-name"
                required
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                className="wg-input"
                placeholder="Nom et prénom"
              />
            </div>

            <div>
              <label className="wg-label" htmlFor="patient-age">Âge</label>
              <input
                id="patient-age"
                required
                min="0"
                max="150"
                type="number"
                value={form.age}
                onChange={(event) => update('age', event.target.value)}
                className="wg-input"
              />
            </div>

            <div>
              <label className="wg-label" htmlFor="patient-birth">
                Date de naissance <span className="text-faint">(facultatif)</span>
              </label>
              <input
                id="patient-birth"
                type="date"
                value={form.birth_date}
                onChange={(event) => update('birth_date', event.target.value)}
                className="wg-input"
              />
            </div>

            <div>
              <label className="wg-label" htmlFor="patient-family">
                Antécédents familiaux <span className="text-faint">(facultatif)</span>
              </label>
              <textarea
                id="patient-family"
                rows={3}
                value={form.family_history}
                onChange={(event) => update('family_history', event.target.value)}
                className="wg-input"
              />
            </div>

            <div>
              <label className="wg-label" htmlFor="patient-history">
                Historique médical <span className="text-faint">(facultatif)</span>
              </label>
              <textarea
                id="patient-history"
                rows={3}
                value={form.medical_history}
                onChange={(event) => update('medical_history', event.target.value)}
                className="wg-input"
              />
            </div>
          </div>

          {error && <div className="wg-note wg-note-danger mt-4">{error}</div>}
        </div>

        <div className="wg-modal-foot">
          <button type="button" onClick={onClose} className="wg-btn wg-btn-secondary">
            Annuler
          </button>
          <button disabled={saving} className="wg-btn wg-btn-primary">
            {saving ? 'Création…' : 'Créer le dossier'}
          </button>
        </div>
      </form>
    </div>
  );
}
