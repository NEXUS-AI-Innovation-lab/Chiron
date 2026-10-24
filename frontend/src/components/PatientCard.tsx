import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import DescriptionIcon from '@mui/icons-material/Description';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import axios from 'axios';

import { deleteBiopsy, deletePatient, deleteRadiologyStudy } from '../services/api';

interface Biopsy {
  id: number;
  image_url: string;
  status: string;
  date?: string;
}

interface RadiologyStudy {
  id: number;
  orthanc_study_id: string;
  modality: string;
  description: string;
}

interface Patient {
  id: number;
  name: string;
  age: number;
  folder_id: string;
  birth_date?: string;
  biopsies: Biopsy[];
  radiology_studies?: RadiologyStudy[];
  motif?: string;
}

interface Extraction {
  id: number;
  filename: string;
  roi: { x: number; y: number; w: number; h: number };
  status?: string;
  owner?: string;
}

/** Une ligne d'information du dossier : libellé à gauche, valeur à droite. */
const Ligne = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-2">
    <span className="shrink-0 text-[13px] text-muted">{label}</span>
    <span className="truncate text-[13px] font-medium text-ink">{children}</span>
  </div>
);

const PatientCard = ({ patient, onDeleted }: { patient: Patient; onDeleted?: () => void }) => {
  const navigate = useNavigate();
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [hasExtractions, setHasExtractions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    titre: string;
    message: string;
    libelle: string;
    action: () => Promise<void>;
  } | null>(null);

  const doctorName = localStorage.getItem("biopsie_user") || "Dr. Non assigné";

  // Aucune donnée clinique n'est inventée : on n'affiche que ce que la base
  // contient réellement, et « Non renseigné » sinon.
  const motifConsultation = patient.motif || "Non renseigné";
  const birthDate = patient.birth_date
    ? new Date(patient.birth_date).toLocaleDateString("fr-FR")
    : "Non renseignée";

  useEffect(() => {
    if (!patient.folder_id) return;

    const checkExisting = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8002';
            const res = await fetch(`${apiUrl}/patients/${patient.folder_id}/extractions`);
            const data = await res.json();
            if (data && data.length > 0) {
                setHasExtractions(true);
                setExtractions(data);
            } else {
                setHasExtractions(false);
            }
        } catch (e) { console.error("Erreur check extractions", e); }
    };
    checkExisting();
  }, [patient.folder_id]);

  const handleAnnotateClick = async () => {
    if (extractions.length > 0) {
        setShowModal(true);
    } else {
        openViewer();
    }
  };

  const supprimerExtraction = (id: number) =>
    demanderConfirmation(
      "Supprimer ce dossier d'analyse ?",
      'Son image extraite, ses annotations et son avancement seront perdus.',
      'Supprimer',
      () => executerSuppressionExtraction(id),
    );

  const executerSuppressionExtraction = async (id: number) => {
    try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8002';
        const res = await fetch(`${apiUrl}/extractions/${id}?username=${encodeURIComponent(doctorName)}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            const newExtractions = extractions.filter(ex => ex.id !== id);
            setExtractions(newExtractions);
            if (newExtractions.length === 0) setHasExtractions(false);
        } else {
            const err = await res.json();
            setErreur(typeof err.detail === 'string' ? err.detail : 'Suppression refusée.');
        }
    } catch { setErreur('Serveur injoignable.'); }
  };

  const openViewer = (extractionData?: Extraction) => {
    const mainImageUrl = (patient.biopsies && patient.biopsies.length > 0)
        ? patient.biopsies[0].image_url
        : "biopsie_cmu_1.dzi";

    navigate(`/viewer?url=${encodeURIComponent(mainImageUrl)}`, {
        state: {
            patientName: patient.name,
            folderId: patient.folder_id,
            image_url: mainImageUrl,
            roi: extractionData ? extractionData.roi : null,
            extractionId: extractionData ? extractionData.id : null,
        }
    });
  };

  const mainBiopsyUrl = (patient.biopsies && patient.biopsies.length > 0)
      ? patient.biopsies[0].image_url
      : "";

  /** Message d'erreur lisible, quelle que soit la forme de la réponse. */
  const messageErreur = (cause: unknown, repli: string): string =>
    axios.isAxiosError(cause) && typeof cause.response?.data?.detail === 'string'
      ? cause.response.data.detail
      : repli;

  /**
   * Les confirmations passent par une modale de l'application, et non par
   * `window.confirm`.
   *
   * Le dialogue natif est supprimé par le navigateur dès que l'utilisateur
   * coche « Empêcher cette page de créer des boîtes de dialogue
   * supplémentaires ». `confirm()` renvoie alors `false` immédiatement : le
   * clic ne produisait plus rien, sans le moindre message, et aucune requête
   * n'atteignait le serveur.
   */
  const demanderConfirmation = (
    titre: string,
    message: string,
    libelle: string,
    action: () => Promise<void>,
  ) => {
    setErreur(null);
    setConfirmation({ titre, message, libelle, action });
  };

  const executerConfirmation = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    try {
      // La modale reste affichée pendant toute l'opération : c'est le seul
      // retour visuel dont dispose l'utilisateur, et certaines suppressions
      // demandent plusieurs secondes.
      await confirmation.action();
      setConfirmation(null);
    } finally {
      setBusy(false);
    }
  };

  const supprimerDossier = () =>
    demanderConfirmation(
      'Supprimer ce dossier patient ?',
      `Le dossier de ${patient.name} sera définitivement supprimé : sa lame, ses ` +
        'extractions, ses annotations et son avancement. Les études DICOM restent ' +
        'dans Orthanc.',
      'Supprimer définitivement',
      async () => {
        try {
          setDeleting(true);
          const rapport = await deletePatient(patient.id);
          if (rapport.warnings?.length) {
            setErreur(`Supprimé, avec réserves : ${rapport.warnings.join(' ; ')}`);
          }
          onDeleted?.();
        } catch (cause) {
          setDeleting(false);
          setErreur(messageErreur(cause, 'Vérifiez que le backend répond.'));
        }
      },
    );

  const supprimerLame = () => {
    const biopsy = patient.biopsies?.[0];
    if (!biopsy) return;
    demanderConfirmation(
      'Supprimer la lame ?',
      "Son image et ses tuiles seront effacées. Les extractions déjà réalisées sont " +
        'conservées. Vous pourrez ensuite importer une autre lame.',
      'Supprimer la lame',
      async () => {
        try {
          const rapport = await deleteBiopsy(biopsy.id);
          if (rapport.warnings?.length) {
            setErreur(`Supprimée, avec réserves : ${rapport.warnings.join(' ; ')}`);
          }
          onDeleted?.();
        } catch (cause) {
          setErreur(messageErreur(cause, 'Vérifiez que le backend répond.'));
        }
      },
    );
  };

  const supprimerRadiologie = () => {
    const study = patient.radiology_studies?.[0];
    if (!study) return;
    demanderConfirmation(
      "Détacher l'examen radiologique ?",
      "L'étude reste dans Orthanc : elle pourra être réimportée, sur ce dossier ou " +
        'sur un autre.',
      'Détacher',
      async () => {
        try {
          await deleteRadiologyStudy(study.id);
          onDeleted?.();
        } catch (cause) {
          setErreur(messageErreur(cause, 'Vérifiez que le backend répond.'));
        }
      },
    );
  };

  // Composition reelle du dossier. Uniquement des champs que le backend
  // ecrit vraiment : presence d'une lame, d'un examen radiologique, et nombre
  // de dossiers d'analyse ouverts. Rien n'est deduit ni invente.
  const aUneImagerie =
    (patient.biopsies?.length ?? 0) > 0 ||
    (patient.radiology_studies?.length ?? 0) > 0;

  /**
   * Liseré de lame, sur le bord gauche de la carte.
   *
   * Emprunté à l'objet du métier : sur une lame de verre, la bande dépolie
   * porte la référence, et c'est elle qu'on lit en premier dans un rack. Ici
   * elle encode la composition du dossier, lisible d'un coup d'oeil sur une
   * grille de douze cartes :
   *   vert   : au moins un dossier d'analyse est ouvert
   *   gris   : de l'imagerie est rattachée, l'analyse n'a pas commencé
   *   pâle   : dossier vide
   *
   * La couleur ne porte JAMAIS l'information seule : les boutons « Lame » et
   * « Radiologie » ci-dessous sont désactivés quand la pièce est absente, et
   * le bouton d'analyse annonce son nombre en toutes lettres.
   */
  const liseré = hasExtractions
    ? 'var(--wg-accent)'
    : aUneImagerie
      ? 'var(--wg-line-strong)'
      : 'var(--wg-line)';

  return (
    <div
      className="wg-card flex flex-col border-l-[3px] p-5 pl-[17px]"
      style={{ borderLeftColor: liseré }}
    >
      {/* ---------- En-tête : identité du patient ---------- */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-muted"
          >
            <PersonIcon fontSize="small" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ink">{patient.name}</h3>
            <span className="wg-chip wg-id mt-1">{patient.folder_id}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={supprimerDossier}
          disabled={deleting}
          title={`Supprimer le dossier de ${patient.name}`}
          aria-label={`Supprimer le dossier de ${patient.name}`}
          className="wg-btn wg-btn-danger-quiet wg-btn-icon wg-btn-sm"
        >
          <DeleteOutlineIcon fontSize="small" />
        </button>
      </div>

      {erreur && (
        <div className="wg-note wg-note-danger mt-4">
          <p className="flex-1">{erreur}</p>
          <button
            type="button"
            onClick={() => setErreur(null)}
            className="shrink-0 font-semibold"
            aria-label="Masquer le message"
          >
            ✕
          </button>
        </div>
      )}

      {/* ---------- Informations cliniques ----------
          Aucune donnée n'est inventée : « Non renseigné » quand la base est
          vide, plutôt qu'une valeur plausible mais fausse. */}
      <div className="mt-4 divide-y divide-line border-y border-line">
        <Ligne label="Motif">
          <span title={motifConsultation}>{motifConsultation}</span>
        </Ligne>
        <Ligne label="Naissance">{birthDate}</Ligne>
        <Ligne label="Âge">{patient.age} ans</Ligne>
      </div>

      {/* ---------- Imagerie rattachée ---------- */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => mainBiopsyUrl && openViewer()}
            disabled={!mainBiopsyUrl}
            title={mainBiopsyUrl ? 'Ouvrir la lame numérisée' : 'Aucune lame importée'}
            className="wg-btn wg-btn-secondary wg-btn-sm flex-1"
          >
            <VisibilityIcon fontSize="small" /> Lame
          </button>
          {patient.biopsies && patient.biopsies.length > 0 && (
            <button
              type="button"
              onClick={supprimerLame}
              disabled={busy}
              title="Supprimer la lame de ce dossier"
              aria-label="Supprimer la lame"
              className="wg-btn wg-btn-danger-quiet wg-btn-icon wg-btn-sm"
            >
              <DeleteOutlineIcon fontSize="small" />
            </button>
          )}
        </div>

        {patient.radiology_studies && patient.radiology_studies.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/radiology?patient=${patient.folder_id}&study=${patient.radiology_studies![0].orthanc_study_id}`)}
              title="Ouvrir l'examen radiologique"
              className="wg-btn wg-btn-secondary wg-btn-sm flex-1"
            >
              <VisibilityIcon fontSize="small" /> Radiologie
            </button>
            <button
              type="button"
              onClick={supprimerRadiologie}
              disabled={busy}
              title="Détacher cet examen du dossier"
              aria-label="Détacher l'examen radiologique"
              className="wg-btn wg-btn-danger-quiet wg-btn-icon wg-btn-sm"
            >
              <DeleteOutlineIcon fontSize="small" />
            </button>
          </div>
        )}
      </div>

      {/* ---------- Action principale ---------- */}
      {hasExtractions && (
        <button
          onClick={handleAnnotateClick}
          className="wg-btn wg-btn-primary mt-4 w-full"
          title="Ouvrir un dossier d'analyse de ce patient"
        >
          <EditIcon fontSize="small" /> Dossiers d'analyse ({extractions.length})
        </button>
      )}

      {/* ---------- Modale : choix du dossier d'analyse ---------- */}
      {showModal && (
        <div className="wg-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wg-modal max-w-md">
            <div className="wg-modal-head">
              <div className="min-w-0">
                <h4 className="wg-modal-title">Dossiers d'analyse</h4>
                <p className="truncate text-[13px] text-muted">{patient.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="wg-btn wg-btn-quiet wg-btn-icon wg-btn-sm"
                title="Fermer"
                aria-label="Fermer"
              >
                <CloseIcon fontSize="small" />
              </button>
            </div>

            <ul className="max-h-72 overflow-y-auto p-3">
              {extractions.map((file) => (
                <li
                  key={file.id}
                  className="mb-2 flex items-center gap-2 rounded-lg border border-line p-2 last:mb-0 hover:border-line-strong"
                >
                  <button
                    type="button"
                    onClick={() => openViewer(file)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    title="Ouvrir ce dossier d'analyse"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-raised text-muted">
                      <DescriptionIcon fontSize="small" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {file.filename}
                      </span>
                      <span className="flex items-baseline gap-2 truncate text-xs text-muted">
                        <span className="truncate">Créé par {file.owner || "un auteur inconnu"}</span>
                        <span className="wg-id shrink-0 text-faint">#{file.id}</span>
                      </span>
                    </span>
                  </button>

                  {/* Seul le propriétaire peut supprimer son dossier : c'est la
                      règle de collaboration appliquée par le backend. */}
                  {file.owner === doctorName && (
                    <button
                      onClick={(e) => { e.stopPropagation(); supprimerExtraction(file.id); }}
                      className="wg-btn wg-btn-danger-quiet wg-btn-icon wg-btn-sm"
                      title="Supprimer mon dossier d'analyse"
                      aria-label="Supprimer mon dossier d'analyse"
                    >
                      <DeleteIcon fontSize="small" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="wg-modal-foot">
              <button onClick={() => setShowModal(false)} className="wg-btn wg-btn-secondary">
                Fermer
              </button>
              <button onClick={() => openViewer()} className="wg-btn wg-btn-primary">
                <AddIcon fontSize="small" /> Nouveau dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modale de confirmation ----------
          Voir `demanderConfirmation` : le dialogue natif du navigateur peut
          être désactivé par l'utilisateur, ce qui rendait les suppressions
          silencieusement inopérantes. */}
      {confirmation && (
        <div className="wg-modal-backdrop" style={{ zIndex: 60 }} role="dialog" aria-modal="true">
          <div className="wg-modal max-w-sm">
            <div className="wg-modal-body">
              <h4 className="wg-modal-title">{confirmation.titre}</h4>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{confirmation.message}</p>
              {busy && (
                <p className="mt-4 flex items-center gap-2 text-xs text-muted">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  Opération en cours, veuillez patienter…
                </p>
              )}
            </div>
            <div className="wg-modal-foot">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                disabled={busy}
                className="wg-btn wg-btn-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={executerConfirmation}
                disabled={busy}
                autoFocus
                className="wg-btn wg-btn-danger"
              >
                {busy ? 'Suppression…' : confirmation.libelle}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientCard;
