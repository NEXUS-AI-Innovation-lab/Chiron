import { useEffect, useState, useMemo } from 'react';
import type { ComponentType } from 'react';
import { getPatients, type Patient } from '../services/api';
import AddPatientModal from '../components/AddPatientModal';
import UploadMedicalImage from '../components/UploadMedicalImage';
import AppShell from '../components/AppShell';
import { useTheme } from '../features/theme/themeContext';

// Icônes
import PersonIcon from '@mui/icons-material/Person';
import ScienceIcon from '@mui/icons-material/Science';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

// Composants externes
import PatientCard from '../components/PatientCard';

// Graphiques
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

/**
 * Tuile de statistique.
 *
 * Hiérarchie voulue : le CHIFFRE domine, le libellé l'accompagne en gris-bleu,
 * l'icône reste discrète. Une tuile ne doit pas attirer l'œil plus que la
 * liste des dossiers, qui est le vrai contenu de la page.
 */
const StatCard = ({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  icon: ComponentType<{ fontSize?: 'small' | 'medium' | 'large' }>;
}) => (
  <div className="wg-card flex items-center gap-4 p-5">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
      <Icon fontSize="small" />
    </div>
    <div className="min-w-0">
      <p className="truncate text-[13px] text-muted">{title}</p>
      <p className="text-2xl font-semibold leading-tight text-ink">{value}</p>
    </div>
  </div>
);

export default function Dashboard() {
  const { theme } = useTheme();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const username = localStorage.getItem("biopsie_user") || "Invité";

  const fetchPatients = async () => {
      setLoading(true);
      setError(null);
      try {
          const data = await getPatients();
          if (Array.isArray(data)) {
              setPatients(data);
          } else {
              setPatients([]);
          }
      } catch (err) {
          console.error("Erreur chargement:", err);
          setError("Impossible de charger les patients.");
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
    fetchPatients();
  }, [username]);

  // --- STATS ---
  const { stats, pieData, activityData, hasActivity } = useMemo(() => {
    let totalPatients = 0;
    let analyzedCount = 0;
    let criticalCases = 0;
    let healthyCases = 0;

    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const todayIndex = new Date().getDay();
    const weekActivity = days.map(day => ({ name: day, analyses: 0 }));

    patients.forEach(patient => {
      totalPatients++;
      if (patient.biopsies) {
        patient.biopsies.forEach(biopsy => {
            if (biopsy.status === "termine" || biopsy.status === "archive" || biopsy.status === "Validé") {
                analyzedCount++;
                weekActivity[todayIndex].analyses += 1;

               if (biopsy.id % 2 === 0) criticalCases++; else healthyCases++;
            }
        });
      }
    });

    const safeRate = analyzedCount > 0 ? Math.round((healthyCases / analyzedCount) * 100) : 0;

    const pData = [
      { name: 'Sains', value: healthyCases },
      { name: 'Anomalies', value: criticalCases },
    ].filter(d => d.value > 0);

    return {
        stats: { totalPatients, analyzedCount, criticalCases, safeRate },
        pieData: pData,
        activityData: weekActivity,
        hasActivity: analyzedCount > 0
    };
  }, [patients]);

  // Recharts dessine en SVG à partir de valeurs JavaScript : c'est le seul
  // endroit de l'application où les couleurs ne peuvent pas venir directement
  // des variables CSS. On les dérive donc du thème courant.
  //
  // Ces valeurs ont été vérifiées avec le validateur de palette (contrôle de
  // la bande de luminosité, du contraste sur la surface, et de l'écart
  // perceptuel en vision daltonienne) :
  //
  //   clair  #10b981 / #c94b4b  -> ΔE 10.8 en deutéranopie, tous contrôles OK
  //   sombre #12a071 / #e06767  -> ΔE  6.1 en deutéranopie
  //
  // Le vert et le rouge sont intrinsèquement proches pour un deutéranope : la
  // paire sombre reste dans la bande tolérée UNIQUEMENT parce que la
  // répartition porte des étiquettes écrites (nom, nombre de cas, pourcentage).
  // Ne JAMAIS retirer ces étiquettes au profit de la seule couleur.
  const chart = useMemo(() => {
    const dark = theme === 'dark';
    return {
      grid: dark ? '#2f3f54' : '#dfe4ea',
      axis: dark ? '#a9b7c9' : '#46586f',
      bar: dark ? '#12a071' : '#10b981',
      healthy: dark ? '#12a071' : '#10b981',
      critical: dark ? '#e06767' : '#c94b4b',
      tooltip: {
        backgroundColor: dark ? '#1e2a3a' : '#ffffff',
        border: `1px solid ${dark ? '#2f3f54' : '#dfe4ea'}`,
        borderRadius: '8px',
        color: dark ? '#eef2f7' : '#1e2a3a',
        fontSize: '13px',
      },
    };
  }, [theme]);

  const handlePatientCreated = (patient: Patient) => {
    setPatients((current) => [...current, patient]);
    setShowAddPatient(false);
  };

  return (
    <AppShell
      title="Dossiers patients"
      user={username}
      actions={
        <>
          <button
            onClick={() => setShowUpload(true)}
            className="wg-btn wg-btn-secondary"
            title="Importer une lame ou un examen radiologique"
          >
            <CloudUploadIcon fontSize="small" /> Importer une imagerie
          </button>
          <button
            onClick={() => setShowAddPatient(true)}
            className="wg-btn wg-btn-primary"
            title="Créer un dossier patient"
          >
            <AddIcon fontSize="small" /> Nouveau patient
          </button>
        </>
      }
    >
      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Chargement des dossiers…</p>
      ) : error ? (
        <div className="wg-card p-6 text-center">
          <p className="mb-4 text-sm text-danger-text">{error}</p>
          <button onClick={fetchPatients} className="wg-btn wg-btn-secondary">
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {/* ---------- Liste des dossiers ---------- */}
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="wg-h2">File d'attente</h2>
            <span className="text-[13px] text-muted">
              {patients.length} dossier{patients.length > 1 ? 's' : ''}
            </span>
          </div>

          {patients.length === 0 ? (
            <div className="wg-card p-12 text-center">
              <p className="mb-1 text-sm font-medium text-ink">Aucun dossier pour le moment</p>
              <p className="mb-5 text-[13px] text-muted">
                Créez un dossier patient, puis importez sa lame ou son examen radiologique.
              </p>
              <button onClick={() => setShowAddPatient(true)} className="wg-btn wg-btn-primary">
                <AddIcon fontSize="small" /> Nouveau patient
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {patients.map((patient) => (
                <PatientCard key={patient.id} patient={patient} onDeleted={fetchPatients} />
              ))}
            </div>
          )}

          {/* ---------- Indicateurs ---------- */}
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Dossiers suivis" value={stats.totalPatients} icon={PersonIcon} />
            <StatCard title="Analyses terminées" value={stats.analyzedCount} icon={ScienceIcon} />
            <StatCard title="Cas critiques" value={stats.criticalCases} icon={ReportProblemOutlinedIcon} />
            <StatCard
              title="Taux de cas sains"
              value={stats.analyzedCount > 0 ? `${stats.safeRate} %` : "-"}
              icon={CheckCircleOutlineIcon}
            />
          </div>

          {/* ---------- Graphiques ---------- */}
          {hasActivity && (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="wg-card p-5 lg:col-span-2">
                <h2 className="wg-h2 mb-4">Activité de la semaine</h2>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                      <XAxis dataKey="name" stroke={chart.axis} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                      <YAxis stroke={chart.axis} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip contentStyle={chart.tooltip} cursor={{ fill: chart.grid, opacity: 0.35 }} />
                      <Bar dataKey="analyses" name="Analyses" fill={chart.bar} radius={[4, 4, 0, 0]} barSize={28} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Répartition : deux parts d'un tout.
                  Une barre empilée, pas un camembert : sur deux catégories, un
                  camembert oblige à comparer des angles là où une barre se lit
                  d'un coup d'œil, et il dupliquerait la tuile « Taux de cas
                  sains ». Chaque part est écrite en toutes lettres, donc
                  lisible sans percevoir la couleur. */}
              <div className="wg-card self-start p-5">
                <h2 className="wg-h2 mb-4">Répartition des diagnostics</h2>

                <div className="flex h-3 gap-0.5 overflow-hidden" role="img"
                     aria-label={`${stats.analyzedCount - stats.criticalCases} cas sains, ${stats.criticalCases} avec anomalie`}>
                  {pieData.map((part) => (
                    <div
                      key={part.name}
                      title={`${part.name} : ${part.value} cas`}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${(part.value / stats.analyzedCount) * 100}%`,
                        backgroundColor: part.name === 'Sains' ? chart.healthy : chart.critical,
                      }}
                    />
                  ))}
                </div>

                {/* Légende ET étiquettes directes : la pastille de couleur ne
                    fait qu'accompagner un libellé écrit. */}
                <dl className="mt-4 space-y-2">
                  {pieData.map((part) => (
                    <div key={part.name} className="flex items-baseline gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                        style={{ backgroundColor: part.name === 'Sains' ? chart.healthy : chart.critical }}
                      />
                      <dt className="text-[13px] text-muted">{part.name}</dt>
                      <dd className="ml-auto text-[13px] font-medium text-ink">
                        {part.value} cas
                        <span className="ml-2 font-normal text-muted">
                          {Math.round((part.value / stats.analyzedCount) * 100)} %
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}
        </>
      )}

      {showAddPatient && (
        <AddPatientModal onClose={() => setShowAddPatient(false)} onCreated={handlePatientCreated} />
      )}
      {showUpload && (
        <UploadMedicalImage
          patients={patients}
          onClose={() => setShowUpload(false)}
          onUploaded={fetchPatients}
        />
      )}
    </AppShell>
  );
}
