import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import BrushIcon from "@mui/icons-material/Brush";
import DescriptionIcon from "@mui/icons-material/Description";

// --- ICÔNES POUR LA BARRE D'OUTILS ---
import ContrastIcon from "@mui/icons-material/Contrast";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import StraightenIcon from "@mui/icons-material/Straighten";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import TextFormatIcon from "@mui/icons-material/TextFormat";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import PersonIcon from "@mui/icons-material/Person";

// --- IMPORTATION DU MOTEUR CORNERSTONE (Natif) ---
import cornerstone from "cornerstone-core";
import cornerstoneMath from "cornerstone-math";
import cornerstoneTools from "cornerstone-tools";
import dicomParser from "dicom-parser";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import Hammer from "hammerjs";
import jsPDF from "jspdf";

// Initialisation globale
let isConfigured = false;
/** Outil actif au chargement d'une étude. */
const DEFAULT_TOOL = "Wwwc";

function configureCornerstone() {
  if (isConfigured) return;
  cornerstoneTools.external.cornerstone = cornerstone;
  cornerstoneTools.external.Hammer = Hammer;
  cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneWADOImageLoader.configure({ useWebWorkers: false });
  cornerstoneTools.init({ showSVGCursors: true });
  isConfigured = true;
}


interface RadiologyViewerProps {
  currentUser?: {
    name: string;
    profession: string;
  };
}

/**
 * Bouton d'outil de la barre de travail.
 *
 * Déclaré hors du composant : défini à l'intérieur, il serait recréé à chaque
 * rendu et React remonterait le bouton à chaque frappe dans le compte rendu.
 * Le libellé disparaît sous 1024 px pour que la barre tienne sur une ligne,
 * l'infobulle prenant alors le relais.
 */
const Outil = ({
  tool,
  label,
  icon,
  activeTool,
  onSelect,
}: {
  tool: string;
  label: string;
  icon: ReactNode;
  activeTool: string;
  onSelect: (tool: string) => void;
}) => (
  <button
    onClick={() => onSelect(tool)}
    data-active={activeTool === tool}
    className="wg-overlay-btn"
    title={label}
  >
    {icon}
    <span className="hidden lg:inline">{label}</span>
  </button>
);

export default function RadiologyViewer({ 
  currentUser 
}: RadiologyViewerProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const patientId = searchParams.get("patient") || "Inconnu";
  const studyId = searchParams.get("study");

  const storedName = localStorage.getItem("biopsie_user") || "Inconnu";
  const formattedName = (storedName !== "Inconnu" && !storedName.toLowerCase().startsWith("dr")) 
    ? `Dr. ${storedName}` 
    : storedName;

  const finalUser = {
    name: currentUser?.name && currentUser.name !== "Dr. Inconnu" ? currentUser.name : (formattedName === "Inconnu" ? "Dr. Inconnu" : formattedName),
    profession: currentUser?.profession || "Médecin"
  };

  const [report, setReport] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSource, setSavedSource] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTool, setActiveTool] = useState(DEFAULT_TOOL);
  const [lastModifiedBy, setLastModifiedBy] = useState<string | null>(null);

  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!studyId || !viewerRef.current) return;
    configureCornerstone();

    const element = viewerRef.current;

    const loadDataAndDicom = async () => {
      try {
        const dbRes = await fetch(
          `http://localhost:8002/radiology/${studyId}/report`,
        );
        const dbData = await dbRes.json();
        
        if (dbData.report) setReport(dbData.report);
        if (dbData.lastModifiedBy) setLastModifiedBy(dbData.lastModifiedBy);

        const response = await fetch(`/orthanc/studies/${studyId}/instances`);
        if (!response.ok) throw new Error("Erreur de connexion API Orthanc");

        const instances = await response.json();
        if (!instances || instances.length === 0)
          throw new Error("Aucune image trouvée.");

        const firstInstanceId = instances[0].ID;
        const dicomUrl = `wadouri:${window.location.origin}/orthanc/instances/${firstInstanceId}/file`;

        cornerstone.enable(element);

        // CHARGEMENT DES OUTILS
        const toolsToLoad = [
          cornerstoneTools.WwwcTool,
          cornerstoneTools.ZoomTool,
          cornerstoneTools.PanTool,
          cornerstoneTools.ZoomMouseWheelTool,
          cornerstoneTools.LengthTool,
          cornerstoneTools.RectangleRoiTool,
          cornerstoneTools.EllipticalRoiTool,
          cornerstoneTools.EraserTool,
        ];

        toolsToLoad.forEach((ToolClass) => {
          try {
            cornerstoneTools.addToolForElement(element, ToolClass);
          } catch {
            // Outil deja enregistre sur cet element : sans consequence.
          }
        });

        const arrowConfig = {
          getTextCallback: (
            doneChangingTextCallback: (text: string) => void,
          ) => {
            setTimeout(() => {
              const text = window.prompt("Entrez votre annotation :");
              if (text !== null && text.trim() !== "")
                doneChangingTextCallback(text);
            }, 10);
          },
          changeTextCallback: (
            data: { text?: string },
            _eventData: unknown,
            doneChangingTextCallback: (text: string) => void,
          ) => {
            setTimeout(() => {
              const text = window.prompt("Modifier le texte :", data.text);
              if (text !== null && text.trim() !== "")
                doneChangingTextCallback(text);
            }, 10);
          },
        };
        try {
          cornerstoneTools.addToolForElement(
            element,
            cornerstoneTools.ArrowAnnotateTool,
            { configuration: arrowConfig },
          );
        } catch {
          // ArrowAnnotate deja configure : on garde la configuration en place.
        }

        // Affichage de l'image DICOM
        const image = await cornerstone.loadImage(dicomUrl);
        cornerstone.displayImage(element, image);

        cornerstoneTools.setToolActiveForElement(element, "ZoomMouseWheel", {
          mouseButtonMask: 0,
        });
        cornerstoneTools.setToolActiveForElement(element, DEFAULT_TOOL, {
          mouseButtonMask: 1,
        });

        // Restauration robuste
        if (
          dbData.annotations &&
          dbData.annotations.length > 5 &&
          dbData.annotations !== "{}"
        ) {
          try {
            const parsedState = JSON.parse(dbData.annotations);
            cornerstoneTools.globalImageIdSpecificToolStateManager.toolState = parsedState;

            setTimeout(() => {
              if (viewerRef.current) {
                cornerstone.updateImage(viewerRef.current);
              }
            }, 100);
          } catch (e) {
            console.error("Erreur restauration des dessins", e);
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Erreur de chargement :", error);
        setIsLoading(false);
      }
    };

    loadDataAndDicom();

    return () => {
      try {
        cornerstone.disable(element);
      } catch {
        // L'element a deja ete demonte par Cornerstone.
      }
    };
  }, [studyId]);

  // Activation de l'outil courant, isolée de l'initialisation : changer
  // d'outil ne doit pas relancer le chargement DICOM ni la restauration des
  // annotations. Déclaré après l'effet d'init, donc exécuté après lui.
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    try {
      cornerstoneTools.setToolActiveForElement(element, activeTool, {
        mouseButtonMask: 1,
      });
    } catch {
      // L'élément n'est pas encore activé par Cornerstone.
    }
  }, [activeTool]);

  const handleSaveData = async (source: "annotations" | "texte") => {
    if (!studyId) return;
    setIsSaving(true);

    let annotationsStr = "{}";

    try {
      const rawState = cornerstoneTools.globalImageIdSpecificToolStateManager.toolState;
      if (rawState) {
        annotationsStr = JSON.stringify(rawState);
      }
    } catch (err) {
      console.error("Erreur d'extraction des dessins :", err);
    }

    const doctorSignature = `${finalUser.name} (${finalUser.profession})`;

    try {
      const res = await fetch(
        `http://localhost:8002/radiology/${studyId}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            report: report, 
            annotations: annotationsStr,
            lastModifiedBy: doctorSignature
          }),
        },
      );

      if (res.ok) {
        setSavedSource(source);
        setLastModifiedBy(doctorSignature);
        setTimeout(() => setSavedSource(null), 3000);
      } else {
        console.error("Le serveur a renvoyé une erreur lors de la sauvegarde.");
      }
    } catch (err) {
      console.error("Erreur réseau :", err);
    } finally {
      setIsSaving(false);
    }
  };

  // 🌟 SUPPRESSION TOTALE CORRIGÉE (Efface visuellement l'écran en forçant chaque outil)
  const handleClearAll = async () => {
    if (!viewerRef.current || !studyId) return;

    const isConfirmed = window.confirm(
      "Êtes-vous sûr de vouloir supprimer TOUTES les annotations ? Cette action est irréversible.",
    );
    if (!isConfirmed) return;

    const element = viewerRef.current;
    setIsSaving(true);

    try {
      // 1. On force le nettoyage visuel outil par outil (API Cornerstone officielle)
      const toolsToClear = [
        "Length",
        "RectangleRoi",
        "EllipticalRoi",
        "ArrowAnnotate",
      ];
      toolsToClear.forEach((tool) => {
        cornerstoneTools.clearToolState(element, tool);
      });

      // 2. On redessine l'image (le canvas redevient vide)
      cornerstone.updateImage(element);

      // 3. On sauvegarde ce vide absolu dans la base de données
      const doctorSignature = `${finalUser.name} (${finalUser.profession})`;

      const res = await fetch(
        `http://localhost:8002/radiology/${studyId}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            report: report, 
            annotations: "{}",
            lastModifiedBy: doctorSignature
          }),
        },
      );

      if (res.ok) {
        setSavedSource("annotations");
        setLastModifiedBy(doctorSignature);
        setTimeout(() => setSavedSource(null), 3000);
      }
    } catch (e) {
      console.error("Erreur lors de la suppression totale", e);
    } finally {
      setIsSaving(false);
    }
  };

  const changeTool = (toolName: string) => {
    if (!viewerRef.current) return;
    const element = viewerRef.current;

    const allTools = [
      "Wwwc",
      "Zoom",
      "Pan",
      "Length",
      "RectangleRoi",
      "EllipticalRoi",
      "ArrowAnnotate",
      "Eraser",
    ];
    allTools.forEach((t) => {
      try {
        cornerstoneTools.setToolPassiveForElement(element, t);
      } catch {
        // Outil absent de cet element : rien a desactiver.
      }
    });

    cornerstoneTools.setToolActiveForElement(element, toolName, {
      mouseButtonMask: 1,
    });
    setActiveTool(toolName);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text("Compte-Rendu Radiologique", 20, 20);
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text(`Patient ID : ${patientId}`, 20, 30);
    doc.text(`Date de l'export : ${new Date().toLocaleDateString("fr-FR")}`, 20, 37);
    
    doc.text(`Dernière mise à jour par : ${lastModifiedBy || finalUser.name}`, 20, 44);

    doc.setDrawColor(203, 213, 225);
    doc.line(20, 49, 190, 49);
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("Observations cliniques :", 20, 62);
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    const splitText = doc.splitTextToSize(
      report || "Aucune observation saisie.",
      170,
    );
    doc.text(splitText, 20, 72);
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("Document généré par Chiron.", 20, 280);
    doc.save(`Compte_Rendu_${patientId}.pdf`);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-imaging">
      {/* ================== BARRE DE TRAVAIL ==================
          Pas de barre de navigation applicative ici : l'écran est dédié à
          l'examen. Une seule bande regroupe le retour, l'identité du dossier
          et les outils, pour rendre le maximum de hauteur à l'image. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-overlay-line bg-overlay px-3 py-2">
        <button
          onClick={() => navigate("/dashboard")}
          className="wg-overlay-btn"
          title="Revenir à la liste des dossiers"
        >
          <ArrowBackIcon fontSize="small" /> Dossiers
        </button>

        <span className="wg-overlay-sep" />

        <div className="px-2">
          <div className="text-[13px] font-semibold leading-tight text-overlay-ink">
            Examen radiologique
          </div>
          <div className="wg-id leading-tight text-overlay-muted">{patientId}</div>
        </div>

        <span className="wg-overlay-sep" />

        {/* Navigation dans l'image */}
        <Outil tool="Wwwc" label="Contraste" icon={<ContrastIcon fontSize="small" />} activeTool={activeTool} onSelect={changeTool} />
        <Outil tool="Pan" label="Déplacer" icon={<OpenWithIcon fontSize="small" />} activeTool={activeTool} onSelect={changeTool} />

        <span className="wg-overlay-sep" />

        {/* Mesures et annotations */}
        <Outil tool="Length" label="Mesurer" icon={<StraightenIcon fontSize="small" />} activeTool={activeTool} onSelect={changeTool} />
        <Outil tool="RectangleRoi" label="Rectangle" icon={<CropSquareIcon fontSize="small" />} activeTool={activeTool} onSelect={changeTool} />
        <Outil tool="EllipticalRoi" label="Ellipse" icon={<RadioButtonUncheckedIcon fontSize="small" />} activeTool={activeTool} onSelect={changeTool} />
        <Outil tool="ArrowAnnotate" label="Texte" icon={<TextFormatIcon fontSize="small" />} activeTool={activeTool} onSelect={changeTool} />

        <span className="wg-overlay-sep" />

        <Outil tool="Eraser" label="Gomme" icon={<DeleteOutlineIcon fontSize="small" />} activeTool={activeTool} onSelect={changeTool} />
        <button
          onClick={handleClearAll}
          className="wg-overlay-btn hover:text-[#ff9c9c]"
          title="Effacer toutes les annotations de cet examen"
        >
          <DeleteSweepIcon fontSize="small" />
          <span className="hidden lg:inline">Tout effacer</span>
        </button>

        {/* Identité du praticien : ce nom signe le compte rendu et l'export
            PDF, il doit rester visible pendant la saisie. */}
        <div className="ml-auto flex items-center gap-2 px-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-overlay-muted"
          >
            <PersonIcon sx={{ fontSize: 15 }} />
          </span>
          <div className="text-right">
            <div className="text-[13px] font-medium leading-tight text-overlay-ink">
              {finalUser.name}
            </div>
            <div className="text-[11px] leading-tight text-overlay-muted">
              {finalUser.profession}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ================== IMAGE DICOM ================== */}
        <div className="relative flex flex-1 items-center justify-center bg-imaging">
          {isLoading && (
            <div className="absolute z-20 text-sm text-overlay-muted">
              Chargement de l'examen…
            </div>
          )}
          <div
            ref={viewerRef}
            className="h-full w-full cursor-crosshair"
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        {/* ================== COMPTE RENDU ==================
            Zone de saisie : elle suit le thème de l'application, pas l'image. */}
        <aside className="flex w-[380px] flex-col border-l border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="wg-h2">Compte rendu</h2>
            <p className="wg-sub mt-0.5">
              Dossier <span className="wg-id">{patientId}</span>
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-5">
            {/* Traçabilité : sur une plateforme collaborative, savoir qui a
                modifié l'examen en dernier est une information clinique. */}
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-line bg-raised p-3">
              <span className="mt-0.5 text-muted">
                <CheckCircleIcon sx={{ fontSize: 16 }} />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted">Dernière modification</p>
                <p className="truncate text-[13px] text-ink">
                  {lastModifiedBy ? lastModifiedBy : "Aucun historique"}
                </p>
              </div>
            </div>

            <label className="wg-label" htmlFor="radio-report">
              Observations cliniques
            </label>
            <textarea
              id="radio-report"
              value={report}
              onChange={(e) => setReport(e.target.value)}
              placeholder="Saisissez vos observations…"
              className="wg-input min-h-0 flex-1 resize-none"
            />

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => handleSaveData("annotations")}
                disabled={isSaving}
                className={`wg-btn ${savedSource === "annotations" ? "wg-btn-primary" : "wg-btn-secondary"}`}
              >
                {savedSource === "annotations" ? (
                  <>
                    <CheckCircleIcon fontSize="small" /> Annotations enregistrées
                  </>
                ) : (
                  <>
                    <BrushIcon fontSize="small" /> Enregistrer les annotations
                  </>
                )}
              </button>

              <button
                onClick={() => handleSaveData("texte")}
                disabled={isSaving}
                className={`wg-btn ${savedSource === "texte" ? "wg-btn-primary" : "wg-btn-secondary"}`}
              >
                {savedSource === "texte" ? (
                  <>
                    <CheckCircleIcon fontSize="small" /> Compte rendu enregistré
                  </>
                ) : (
                  <>
                    <DescriptionIcon fontSize="small" /> Enregistrer le compte rendu
                  </>
                )}
              </button>

              <button onClick={handleExportPDF} className="wg-btn wg-btn-quiet">
                <PictureAsPdfIcon fontSize="small" /> Exporter en PDF
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
