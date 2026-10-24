import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import OpenSeadragon from "openseadragon";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import domtoimage from "dom-to-image";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PolylineIcon from "@mui/icons-material/Polyline";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import PanToolIcon from "@mui/icons-material/PanTool";
import UndoIcon from "@mui/icons-material/Undo";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DescriptionIcon from "@mui/icons-material/Description";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import PersonIcon from "@mui/icons-material/Person";

import OlgaFormPanel from "../features/workflow/components/OlgaFormPanel";
import WorkflowStepper from "../features/workflow/components/WorkflowStepper";
import { STEP_COUNT } from "../features/workflow/steps";
import { useOlgaForm } from "../features/workflow/useOlgaForm";
import { useWorkflow } from "../features/workflow/useWorkflow";

type ToolType = "move" | "rect" | "circle" | "polygon" | "text";

interface Shape {
  type: ToolType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  radius?: number;
  points?: { x: number; y: number }[];
  text?: string;
  textOffsetX?: number;
  textOffsetY?: number;
  id?: number;
  author?: string;
}

interface InstanSegResult {
  suggestion: string;
  cell_count: number;
  contour_points?: { color: string; points: { x: number; y: number }[] }[];
  /** Région réellement analysée : peut différer de celle demandée si elle
   *  débordait de la lame et que le backend l'a ramenée à l'intérieur. */
  region?: { x: number; y: number; width: number; height: number };
  [key: string]: unknown;
}

type InstanSegContour = {
  color?: string;
  points: { x: number; y: number }[];
};

export default function Viewer() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentUser = localStorage.getItem("biopsie_user") || "Inconnu";

  const searchParams = new URLSearchParams(location.search);
  const rawUrl = searchParams.get("url");
  const patientName = location.state?.patientName || "Patient";
  const folderId = location.state?.folderId || "X-00";
  const defaultDziFilename = location.state?.image_url;
  const extractionId = location.state?.extractionId;
  const initialROI = location.state?.roi;
  const isAnnotationMode = !!extractionId;

  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(isAnnotationMode);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiContours, setAiContours] = useState<InstanSegContour[]>([]);
  const [showAiPoints, setShowAiPoints] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [newExtractionId, setNewExtractionId] = useState<number | null>(null);
  const [, setRedrawToken] = useState(0);

  const [showTexts, setShowTexts] = useState(true);

  // --- ÉTAT DU WORKFLOW ---
  // L'avancement vient du serveur : rouvrir une extraction reprend là où le
  // travail s'était arrêté au lieu de repartir de l'étape 1.
  const workflow = useWorkflow(extractionId ?? null, currentUser);
  const currentStep = workflow.currentIndex;
  const isWorkflowFinished = workflow.isComplete;

  // Saisie en cours uniquement. Les valeurs déjà enregistrées viennent du
  // serveur : aucune valeur clinique n'est plus inventée par défaut.
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  /** Valeurs affichées : état serveur, recouvert par la saisie en cours. */
  const formValues: Record<string, unknown> = {
    ...workflow.mergedData,
    ...formData,
  };

  const [labelInput, setLabelInput] = useState("Extraction");
  const [selectedShapeIndex, setSelectedShapeIndex] = useState<number | null>(null);

  // Outils
  const [currentTool, setCurrentTool] = useState<ToolType>("move");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragShape, setCurrentDragShape] = useState<Shape | null>(null);
  const [movingShapeIndex, setMovingShapeIndex] = useState<number | null>(null);
  const [movingTextIndex, setMovingTextIndex] = useState<number | null>(null);

  const [polyPoints, setPolyPoints] = useState<{ x: number; y: number }[]>([]);
  const [pendingTextPos, setPendingTextPos] = useState<{ x: number; y: number } | null>(null);
  const [editingShapeIndex, setEditingShapeIndex] = useState<number | null>(null);
  const [textValue, setTextValue] = useState("");

  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- FORMULAIRE OLGA DE L'ÉTAPE COURANTE ---
  // Le hook gère le chargement, l'annulation des requêtes obsolètes et le
  // repli sur l'instantané JSON Schema si OLGA est indisponible.
  const olgaForm = useOlgaForm(currentStep, isAnnotationMode);

  /** Écrit une valeur de formulaire sans capturer un `formData` périmé. */
  const handleFieldChange = (key: string, value: unknown) => {
    setFormData((previous) => ({ ...previous, [key]: value }));
  };

  useEffect(() => {
    if (!rawUrl) return;
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";
    const finalTileSource = rawUrl.startsWith("http")
      ? rawUrl
      : `${baseUrl}/dzi_data/${rawUrl}`;

    if (viewerRef.current) viewerRef.current.destroy();

    try {
      const viewer = OpenSeadragon({
        id: "openseadragon-viewer",
        prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
        tileSources: finalTileSource,
        showNavigator: !isAnnotationMode,
        // Nos propres boutons de zoom et de deplacement remplacent ceux
        // d'OpenSeadragon : les afficher ferait doublon, et leurs images sont
        // chargees depuis un CDN externe (cassees sur un reseau ferme).
        showNavigationControl: false,
        animationTime: 0.5,
        blendTime: 0.1,
        maxZoomPixelRatio: 10,
        gestureSettingsMouse: { clickToZoom: false },
        crossOriginPolicy: "Anonymous",
        showHomeControl: false,
        visibilityRatio: 0,
        constrainDuringPan: false,
        minZoomImageRatio: 0,
      });

      viewerRef.current = viewer;

      const updateOverlay = () => setRedrawToken((n) => n + 1);
      viewer.addHandler("animation", updateOverlay);
      viewer.addHandler("update-viewport", updateOverlay);
      viewer.addHandler("resize", updateOverlay);
      viewer.setMouseNavEnabled(true);

      if (initialROI && initialROI.w > 0) {
        viewer.addHandler("open", function () {
          const roiRect = viewer.viewport.imageToViewportRectangle(
            initialROI.x,
            initialROI.y,
            initialROI.w,
            initialROI.h,
          );
          viewer.viewport.fitBounds(roiRect, true);

          if (isAnnotationMode) {
            setTimeout(() => {
              const homeZoom = viewer.viewport.getZoom();
              const minZoom = homeZoom;
              const maxZoom = Math.max(2.5, homeZoom * 8);

              // `minZoomLevel` / `maxZoomLevel` sont documentées comme options
              // du constructeur ; OpenSeadragon les lit aussi sur le viewport,
              // mais ses types ne les déclarent pas.
              const zoomBounds = viewer.viewport as OpenSeadragon.Viewport & {
                minZoomLevel: number;
                maxZoomLevel: number;
              };
              zoomBounds.minZoomLevel = minZoom;
              zoomBounds.maxZoomLevel = maxZoom;

              viewer.addHandler("animation", () => {
                const bounds = roiRect;
                const current = viewer.viewport.getBounds();
                let newX = current.x;
                let newY = current.y;
                if (current.width >= bounds.width)
                  newX = bounds.x + (bounds.width - current.width) / 2;
                else
                  newX = Math.max(
                    bounds.x,
                    Math.min(newX, bounds.x + bounds.width - current.width),
                  );

                if (current.height >= bounds.height)
                  newY = bounds.y + (bounds.height - current.height) / 2;
                else
                  newY = Math.max(
                    bounds.y,
                    Math.min(newY, bounds.y + bounds.height - current.height),
                  );

                if (newX !== current.x || newY !== current.y) {
                  viewer.viewport.fitBounds(
                    new OpenSeadragon.Rect(
                      newX,
                      newY,
                      current.width,
                      current.height,
                    ),
                    true,
                  );
                }
              });
            }, 100);
          }
        });
      }
    } catch (e) {
      console.error("Erreur OSD:", e);
    }
    return () => {
      if (viewerRef.current) viewerRef.current.destroy();
    };
  }, [rawUrl, isAnnotationMode, initialROI]);

  useEffect(() => {
    if (viewerRef.current) {
      const canPan =
        currentTool === "move" &&
        movingShapeIndex === null &&
        movingTextIndex === null;
      viewerRef.current.setMouseNavEnabled(canPan);
    }
  }, [currentTool, movingShapeIndex, movingTextIndex]);

  const getShapeBounds = (shape: Shape) => {
    let minX = shape.x,
      maxX = shape.x,
      minY = shape.y,
      maxY = shape.y;
    if (shape.type === "rect") {
      maxX = shape.x + (shape.w || 0);
      maxY = shape.y + (shape.h || 0);
    } else if (shape.type === "circle") {
      minX = shape.x - (shape.radius || 0);
      maxX = shape.x + (shape.radius || 0);
      minY = shape.y - (shape.radius || 0);
      maxY = shape.y + (shape.radius || 0);
    } else if (
      shape.type === "polygon" &&
      shape.points &&
      shape.points.length > 0
    ) {
      minX = shape.points[0].x;
      maxX = shape.points[0].x;
      minY = shape.points[0].y;
      maxY = shape.points[0].y;
      shape.points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    }
    const cx = minX + (maxX - minX) / 2;
    const cy = minY + (maxY - minY) / 2;
    return { minX, maxX, minY, maxY, cx, cy };
  };

  const handleAiAnalysis = async () => {
    let targetShapeIndex = shapes.length > 0 ? shapes.length - 1 : -1;
    if (selectedShapeIndex !== null && selectedShapeIndex < shapes.length) {
      targetShapeIndex = selectedShapeIndex;
    }

    const shape =
      targetShapeIndex >= 0
        ? shapes[targetShapeIndex]
        : { type: "rect" as ToolType, x: 5000, y: 5000, w: 1000, h: 1000 };

    const { minX, minY, maxX, maxY } = getShapeBounds(shape);
    const cropX = Math.round(minX);
    const cropY = Math.round(minY);
    const cropW = Math.round(
      shape.type === "rect" ? shape.w || 1000 : maxX - minX,
    );
    const cropH = Math.round(
      shape.type === "rect" ? shape.h || 1000 : maxY - minY,
    );

    if (cropW > 1500 || cropH > 1500) {
      setAiSuggestion(
        "❌ La zone est trop vaste. L'IA requiert un patch plus petit (max 1500x1500px).",
      );
      setShowSidebar(true);
      return;
    }

    setLoading(true);
    setAiSuggestion(`L'IA InstanSeg analyse la zone sélectionnée...`);
    setAiContours([]);
    setShowSidebar(true);

    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";

    const payload = {
      filename: defaultDziFilename || "biopsie_cmu_1.dzi",
      x: cropX,
      y: cropY,
      width: cropW,
      height: cropH,
      patient_folder: folderId,
      patient_name: patientName,
      annotation_label: labelInput,
      extraction_id: extractionId,
    };

    try {
      const response = await fetch(`${baseUrl}/analyze-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = (await response.json()) as InstanSegResult;
        setAiSuggestion(data.suggestion);

        // Les contours sont exprimes dans le repere du patch. On les replace
        // avec l'origine REELLEMENT analysee par le backend, pas celle qu'on a
        // demandee : les deux different quand la zone debordait de la lame.
        const originX = data.region?.x ?? cropX;
        const originY = data.region?.y ?? cropY;

        const contours = (data.contour_points || [])
          .filter(
            (blob) => Array.isArray(blob.points) && blob.points.length > 2,
          )
          .map((blob) => ({
            color: blob.color || "#10b981",
            points: (blob.points || []).map((p) => ({
              x: p.x + originX,
              y: p.y + originY,
            })),
          }));

        setAiContours(contours);
      } else {
        // Ne pas deviner la cause : le backend renvoie le motif reel dans
        // `detail`. Un message invente ("trop vaste pour la memoire") envoie
        // sur une fausse piste quand l'erreur est tout autre.
        let motif = `erreur ${response.status}`;
        try {
          const erreur = await response.json();
          if (erreur?.detail) motif = String(erreur.detail);
        } catch {
          /* corps non-JSON : on garde le code HTTP */
        }
        setAiSuggestion(`❌ L'analyse IA a échoué : ${motif}`);
        setAiContours([]);
      }
    } catch {
      setAiSuggestion(
        "❌ Erreur de connexion avec le serveur d'Intelligence Artificielle.",
      );
      setAiContours([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSnapshot = () => {
    const node = containerRef.current;
    if (!node) return;
    domtoimage
      .toJpeg(node, {
        quality: 0.95,
        filter: (node: Node) => {
          if (
            node instanceof HTMLElement &&
            node.classList.contains("ui-layer")
          )
            return false;
          return true;
        },
      })
      .then((dataUrl: string) => {
        const link = document.createElement("a");
        link.download = `annotation_${patientName}.jpg`;
        link.href = dataUrl;
        link.click();
      });
  };

  const handleUndo = () => {
    const myShapes = shapes
      .map((s, i) => ({ ...s, originalIndex: i }))
      .filter((s) => s.author === currentUser || !s.author);
    if (myShapes.length === 0) return;
    const lastMyShape = myShapes[myShapes.length - 1];
    const newShapes = shapes.filter((_, i) => i !== lastMyShape.originalIndex);
    setShapes(newShapes);
  };

  const handleDeleteAll = () => {
    if (confirm("Voulez-vous supprimer VOS annotations ?")) {
      setShapes((prev) => prev.filter((s) => s.author !== currentUser));
      setSelectedShapeIndex(null);
      setAiContours([]);
    }
  };

  const handleZoomBy = (factor: number) => {
    if (!viewerRef.current) return;
    const viewport = viewerRef.current.viewport;
    const center = viewport.getCenter();
    viewport.zoomBy(factor, center);
    viewport.applyConstraints();
  };

  const handleZoomIn = () => handleZoomBy(1.15);
  const handleZoomOut = () => handleZoomBy(0.85);

  const getCoords = (e: React.MouseEvent) => {
    const rect = document
      .getElementById("osd-container")!
      .getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleTextMouseDown = (e: React.MouseEvent, index: number) => {
    if (currentTool !== "move") return;
    if (shapes[index].author && shapes[index].author !== currentUser) return;
    e.stopPropagation();
    e.preventDefault();
    setMovingTextIndex(index);
    const { x, y } = getCoords(e);
    setDragStart({ x, y });
  };

  const handleShapeMouseDown = (e: React.MouseEvent, index: number) => {
    setSelectedShapeIndex(index);

    if (currentTool === "text") {
      e.stopPropagation();
      e.preventDefault();
      const { x, y } = getCoords(e);
      setPendingTextPos({ x, y });
      setTextValue("");
      return;
    }

    if (currentTool !== "move") return;
    if (shapes[index].author && shapes[index].author !== currentUser) return;

    if (shapes[index].type !== "text") {
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    setMovingShapeIndex(index);
    const { x, y } = getCoords(e);
    setDragStart({ x, y });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (movingShapeIndex !== null || movingTextIndex !== null) return;
    if (!viewerRef.current) return;
    if (editingShapeIndex !== null) return;

    if (currentTool === "move" && !pendingTextPos) {
      setSelectedShapeIndex(null);
      return;
    }

    const { x, y } = getCoords(e);

    if (currentTool === "text") {
      setPendingTextPos({ x, y });
      setTextValue("");
      return;
    }

    if (currentTool === "polygon") {
      setPolyPoints((prev) => [...prev, { x, y }]);
      return;
    }

    setDragStart({ x, y });
    setCurrentDragShape({ type: currentTool, x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const { x: currentX, y: currentY } = getCoords(e);

    if (movingTextIndex !== null && viewerRef.current) {
      const shape = shapes[movingTextIndex];
      const pStart = viewerRef.current.viewport.viewerElementToImageCoordinates(
        new OpenSeadragon.Point(dragStart.x, dragStart.y),
      );
      const pEnd = viewerRef.current.viewport.viewerElementToImageCoordinates(
        new OpenSeadragon.Point(currentX, currentY),
      );
      const deltaX = pEnd.x - pStart.x;
      const deltaY = pEnd.y - pStart.y;

      let newOffsetX = (shape.textOffsetX || 0) + deltaX;
      let newOffsetY = (shape.textOffsetY || 0) + deltaY;

      const { minX, maxX, minY, maxY, cx, cy } = getShapeBounds(shape);
      const padding = 0.05;
      const pMinX = minX - padding;
      const pMaxX = maxX + padding;
      const pMinY = minY - padding;
      const pMaxY = maxY + padding;

      let absoluteTextX = cx + newOffsetX;
      let absoluteTextY = cy + newOffsetY;

      if (
        absoluteTextX > pMinX &&
        absoluteTextX < pMaxX &&
        absoluteTextY > pMinY &&
        absoluteTextY < pMaxY
      ) {
        const distLeft = absoluteTextX - pMinX;
        const distRight = pMaxX - absoluteTextX;
        const distTop = absoluteTextY - pMinY;
        const distBottom = pMaxY - absoluteTextY;

        const minDist = Math.min(distLeft, distRight, distTop, distBottom);

        if (minDist === distLeft) absoluteTextX = pMinX;
        else if (minDist === distRight) absoluteTextX = pMaxX;
        else if (minDist === distTop) absoluteTextY = pMinY;
        else if (minDist === distBottom) absoluteTextY = pMaxY;

        newOffsetX = absoluteTextX - cx;
        newOffsetY = absoluteTextY - cy;
      }

      const newShapes = [...shapes];
      newShapes[movingTextIndex] = {
        ...shape,
        textOffsetX: newOffsetX,
        textOffsetY: newOffsetY,
      };
      setShapes(newShapes);
      setDragStart({ x: currentX, y: currentY });
      return;
    }

    if (movingShapeIndex !== null && viewerRef.current) {
      const shape = shapes[movingShapeIndex];

      if (shape.type === "text") {
        const pStart =
          viewerRef.current.viewport.viewerElementToImageCoordinates(
            new OpenSeadragon.Point(dragStart.x, dragStart.y),
          );
        const pEnd = viewerRef.current.viewport.viewerElementToImageCoordinates(
          new OpenSeadragon.Point(currentX, currentY),
        );
        const deltaX = pEnd.x - pStart.x;
        const deltaY = pEnd.y - pStart.y;

        const currentW = shape.w != null && shape.w !== 0 ? shape.w : shape.x;
        const currentH = shape.h != null && shape.h !== 0 ? shape.h : shape.y;

        const newShapes = [...shapes];
        newShapes[movingShapeIndex] = {
          ...shape,
          w: currentW + deltaX,
          h: currentH + deltaY,
        };
        setShapes(newShapes);
        setDragStart({ x: currentX, y: currentY });
      }
      return;
    }

    if (currentDragShape) {
      const w = Math.abs(currentX - dragStart.x);
      const h = Math.abs(currentY - dragStart.y);
      const x = Math.min(currentX, dragStart.x);
      const y = Math.min(currentY, dragStart.y);
      let radius = 0;
      if (currentTool === "circle")
        radius = Math.sqrt(
          Math.pow(currentX - dragStart.x, 2) +
            Math.pow(currentY - dragStart.y, 2),
        );
      setCurrentDragShape({ ...currentDragShape, x, y, w, h, radius });
    }
  };

  const handleMouseUp = () => {
    if (movingShapeIndex !== null) {
      setMovingShapeIndex(null);
      setDragStart(null);
      return;
    }
    if (movingTextIndex !== null) {
      setMovingTextIndex(null);
      setDragStart(null);
      return;
    }

    if (currentTool === "polygon") return;
    if (!currentDragShape || !viewerRef.current) {
      setDragStart(null);
      setCurrentDragShape(null);
      return;
    }
    const p1 = viewerRef.current.viewport.viewerElementToImageCoordinates(
      new OpenSeadragon.Point(currentDragShape.x, currentDragShape.y),
    );
    const eligibleW = currentDragShape.w ?? 0;
    const eligibleH = currentDragShape.h ?? 0;
    const p2 = viewerRef.current.viewport.viewerElementToImageCoordinates(
      new OpenSeadragon.Point(
        currentDragShape.x + eligibleW,
        currentDragShape.y + eligibleH,
      ),
    );

    const newShape: Shape = {
      type: currentTool,
      x: p1.x,
      y: p1.y,
      w: p2.x - p1.x,
      h: p2.y - p1.y,
      radius: viewerRef.current.viewport.deltaPointsFromPixels(
        new OpenSeadragon.Point(currentDragShape.radius || 0, 0),
      ).x,
      author: currentUser,
    };

    if (
      (newShape.w && newShape.w > 5) ||
      (newShape.radius && newShape.radius > 5)
    ) {
      setShapes((prev) => {
        const next = [...prev, newShape];
        setSelectedShapeIndex(next.length - 1);
        return next;
      });
      if (!isAnnotationMode) {
        setCurrentTool("move");
        setShowSidebar(true);
      }
    }
    setDragStart(null);
    setCurrentDragShape(null);
  };

  const handleDoubleClick = () => {
    if (
      currentTool === "polygon" &&
      polyPoints.length > 2 &&
      viewerRef.current
    ) {
      const imagePoints = polyPoints.map((p) => {
        const pt = viewerRef.current!.viewport.viewerElementToImageCoordinates(
          new OpenSeadragon.Point(p.x, p.y),
        );
        return { x: pt.x, y: pt.y };
      });
      setShapes((prev) => {
        const next = [
          ...prev,
          {
            type: "polygon" as ToolType,
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            points: imagePoints,
            author: currentUser,
          },
        ];
        setSelectedShapeIndex(next.length - 1);
        return next;
      });
      setPolyPoints([]);
    }
  };

  const confirmText = () => {
    if (editingShapeIndex !== null) {
      const newShapes = [...shapes];
      if (textValue.trim() !== "") {
        newShapes[editingShapeIndex].text = textValue;
        if (newShapes[editingShapeIndex].textOffsetX === undefined) {
          const { minY, cy } = getShapeBounds(newShapes[editingShapeIndex]);
          newShapes[editingShapeIndex].textOffsetX = 0;
          newShapes[editingShapeIndex].textOffsetY = minY - cy - 0.05;
        }
      } else {
        if (newShapes[editingShapeIndex].type === "text") {
          newShapes.splice(editingShapeIndex, 1);
        }
      }
      setShapes(newShapes);
      setEditingShapeIndex(null);
      setTextValue("");
      setCurrentTool("move");
      return;
    }

    if (pendingTextPos && textValue.trim() !== "" && viewerRef.current) {
      const ptAnchor =
        viewerRef.current.viewport.viewerElementToImageCoordinates(
          new OpenSeadragon.Point(pendingTextPos.x, pendingTextPos.y),
        );

      const ptText = viewerRef.current.viewport.viewerElementToImageCoordinates(
        new OpenSeadragon.Point(pendingTextPos.x + 60, pendingTextPos.y - 60),
      );

      setShapes((prev) => [
        ...prev,
        {
          type: "text",
          x: ptAnchor.x,
          y: ptAnchor.y,
          w: ptText.x,
          h: ptText.y,
          text: textValue,
          author: currentUser,
        },
      ]);
    }
    setPendingTextPos(null);
    setCurrentTool("move");
  };

  const startEditingText = (index: number) => {
    if (shapes[index].author && shapes[index].author !== currentUser) return;
    setEditingShapeIndex(index);
    setTextValue(shapes[index].text || "");
  };

  const renderShapesBackground = () => {
    if (!viewerRef.current) return null;
    return shapes.map((shape, idx) => {
      if (shape.type === "text") return null;

      const p1 = viewerRef.current!.viewport.imageToViewerElementCoordinates(
        new OpenSeadragon.Point(shape.x, shape.y),
      );
      const p2 = viewerRef.current!.viewport.imageToViewerElementCoordinates(
        new OpenSeadragon.Point(
          shape.x + (shape.w || 0),
          shape.y + (shape.h || 0),
        ),
      );
      const sx = p1.x,
        sy = p1.y,
        sw = p2.x - p1.x,
        sh = p2.y - p1.y;

      const isMe = shape.author === currentUser;
      const strokeColor = isMe ? "#10b981" : "#f59e0b";
      const fillColor = isMe
        ? "rgba(16, 185, 129, 0.3)"
        : "rgba(245, 158, 11, 0.3)";

      const cursorStyleShape = currentTool === "text" ? "crosshair" : "default";

      const isSelected = idx === selectedShapeIndex;
      const strokeW = isSelected ? "5" : "3";

      if (shape.type === "rect") {
        return (
          <rect
            key={`bg-${idx}`}
            x={sx}
            y={sy}
            width={sw}
            height={sh}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeDasharray={isSelected ? "8" : "0"}
            onMouseDown={(e) => handleShapeMouseDown(e, idx)}
            style={{ cursor: cursorStyleShape, pointerEvents: "auto" }}
          />
        );
      }
      if (shape.type === "circle") {
        const pr = viewerRef.current!.viewport.deltaPixelsFromPoints(
          new OpenSeadragon.Point(shape.radius || 0, 0),
        );
        return (
          <circle
            key={`bg-${idx}`}
            cx={sx}
            cy={sy}
            r={pr.x}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeDasharray={isSelected ? "8" : "0"}
            onMouseDown={(e) => handleShapeMouseDown(e, idx)}
            style={{ cursor: cursorStyleShape, pointerEvents: "auto" }}
          />
        );
      }
      if (shape.type === "polygon" && shape.points) {
        const pts = shape.points
          .map((pt) => {
            const s =
              viewerRef.current!.viewport.imageToViewerElementCoordinates(
                new OpenSeadragon.Point(pt.x, pt.y),
              );
            return `${s.x},${s.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={`bg-${idx}`}
            points={pts}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeDasharray={isSelected ? "8" : "0"}
            onMouseDown={(e) => handleShapeMouseDown(e, idx)}
            style={{ cursor: cursorStyleShape, pointerEvents: "auto" }}
          />
        );
      }
      return null;
    });
  };

  const renderAiPoints = () => {
    if (!viewerRef.current || aiContours.length === 0 || !showAiPoints)
      return null;

    return aiContours.map((contour, idx) => {
      try {
        const pts = contour.points
          .map((pt) => {
            const s =
              viewerRef.current!.viewport.imageToViewerElementCoordinates(
                new OpenSeadragon.Point(pt.x, pt.y),
              );
            return `${s.x},${s.y}`;
          })
          .join(" ");

        return (
          <polygon
            key={`ia-contour-${idx}`}
            points={pts}
            fill={
              contour.color ? `${contour.color}33` : "rgba(16, 185, 129, 0.2)"
            }
            stroke={contour.color || "#10b981"}
            strokeWidth="1"
            style={{
              pointerEvents: "none",
              filter: "drop-shadow(0 0 3px rgba(0,0,0,0.5))",
            }}
          />
        );
      } catch {
        // Contour illisible : on ignore ce blob plutôt que de casser le calque.
        return null;
      }
    });
  };

  const renderTextOverlays = () => {
    if (!viewerRef.current) return null;
    return shapes.map((shape, idx) => {
      const isMe = shape.author === currentUser;
      const strokeColor = isMe ? "#10b981" : "#f59e0b";
      const textColor = isMe ? "#facc15" : "#f87171";

      if (shape.type === "text") {
        if (editingShapeIndex === idx || !showTexts || !shape.text) return null;

        const pAnchor =
          viewerRef.current!.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(shape.x, shape.y),
          );
        const isTextMoved =
          shape.w != null &&
          shape.h != null &&
          (shape.w !== 0 || shape.h !== 0);
        const tX = isTextMoved ? shape.w! : shape.x;
        const tY = isTextMoved ? shape.h! : shape.y;
        const pText =
          viewerRef.current!.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(tX, tY),
          );

        const textWidth = shape.text.length * 10 + 24;

        return (
          <g key={`fg-${idx}`}>
            <line
              x1={pAnchor.x}
              y1={pAnchor.y}
              x2={pText.x}
              y2={pText.y}
              stroke={strokeColor}
              strokeWidth="2"
              strokeDasharray="4"
              style={{ pointerEvents: "none", opacity: 0.8 }}
            />
            <circle cx={pAnchor.x} cy={pAnchor.y} r="4" fill={strokeColor} />

            <text
              x={pText.x}
              y={pText.y - 20}
              fill={strokeColor}
              fontSize="12"
              fontWeight="bold"
              textAnchor="middle"
              style={{ pointerEvents: "none", textShadow: "1px 1px 2px black" }}
            >
              {shape.author}
            </text>

            <rect
              x={pText.x - textWidth / 2}
              y={pText.y - 13}
              width={textWidth}
              height="26"
              fill="rgba(15, 23, 42, 0.8)"
              rx="6"
              style={{ pointerEvents: "none" }}
            />

            <text
              x={pText.x}
              y={pText.y}
              fill={textColor}
              fontSize="16"
              fontWeight="bold"
              textAnchor="middle"
              alignmentBaseline="middle"
              onMouseDown={(e) => handleShapeMouseDown(e, idx)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEditingText(idx);
              }}
              style={{
                textShadow: "2px 2px 4px black",
                cursor: isMe && currentTool === "move" ? "grab" : "crosshair",
                pointerEvents: "auto",
                userSelect: "none",
              }}
            >
              {shape.text}
            </text>
          </g>
        );
      } else {
        const p1 = viewerRef.current!.viewport.imageToViewerElementCoordinates(
          new OpenSeadragon.Point(shape.x, shape.y),
        );
        let authorX = p1.x,
          authorY = p1.y;
        if (shape.type === "circle") {
          const pr = viewerRef.current!.viewport.deltaPixelsFromPoints(
            new OpenSeadragon.Point(shape.radius || 0, 0),
          );
          authorX -= pr.x;
          authorY -= pr.x;
        } else if (
          shape.type === "polygon" &&
          shape.points &&
          shape.points.length > 0
        ) {
          const sFirst =
            viewerRef.current!.viewport.imageToViewerElementCoordinates(
              new OpenSeadragon.Point(shape.points[0].x, shape.points[0].y),
            );
          authorX = sFirst.x;
          authorY = sFirst.y;
        }

        const authorNode =
          shape.author && showTexts ? (
            <text
              x={authorX}
              y={authorY - 5}
              fill={strokeColor}
              fontSize="14"
              fontWeight="bold"
              style={{ pointerEvents: "none", textShadow: "1px 1px 2px black" }}
            >
              {shape.author}
            </text>
          ) : null;

        let attachedNode = null;
        if (showTexts && shape.text && editingShapeIndex !== idx) {
          const { cx, cy, minY } = getShapeBounds(shape);

          let offsetX = shape.textOffsetX;
          let offsetY = shape.textOffsetY;

          if (offsetX === undefined || offsetY === undefined) {
            offsetX = 0;
            offsetY = minY - cy - 0.05;
          }

          const textImgX = cx + offsetX;
          const textImgY = cy + offsetY;

          const ptCenterScreen =
            viewerRef.current!.viewport.imageToViewerElementCoordinates(
              new OpenSeadragon.Point(cx, cy),
            );
          const ptTextScreen =
            viewerRef.current!.viewport.imageToViewerElementCoordinates(
              new OpenSeadragon.Point(textImgX, textImgY),
            );

          const textWidth = shape.text.length * 9 + 20;

          attachedNode = (
            <g>
              <line
                x1={ptCenterScreen.x}
                y1={ptCenterScreen.y}
                x2={ptTextScreen.x}
                y2={ptTextScreen.y}
                stroke={textColor}
                strokeWidth="2"
                strokeDasharray="6,4"
                style={{ pointerEvents: "none", opacity: 0.8 }}
              />
              <rect
                x={ptTextScreen.x - textWidth / 2}
                y={ptTextScreen.y - 15}
                width={textWidth}
                height="30"
                fill="rgba(15, 23, 42, 0.7)"
                rx="6"
                style={{ pointerEvents: "none" }}
              />
              <text
                x={ptTextScreen.x}
                y={ptTextScreen.y}
                fill={textColor}
                fontSize="16"
                fontWeight="bold"
                textAnchor="middle"
                alignmentBaseline="middle"
                onMouseDown={(e) => handleTextMouseDown(e, idx)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEditingText(idx);
                }}
                style={{
                  cursor: isMe && currentTool === "move" ? "grab" : "pointer",
                  pointerEvents: "auto",
                  userSelect: "none",
                }}
              >
                {shape.text}
              </text>
            </g>
          );
        }

        if (authorNode || attachedNode) {
          return (
            <g key={`fg-${idx}`}>
              {authorNode}
              {attachedNode}
            </g>
          );
        }
        return null;
      }
    });
  };

  useEffect(() => {
    if (extractionId) {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";
      fetch(`${baseUrl}/extractions/${extractionId}/details`)
        .then((res) => res.json())
        .then((data) => {
          if (data.drawings) {
            setShapes(data.drawings);
          }
          if (data) {
            // Les valeurs du formulaire viennent désormais du moteur de
            // workflow ; on ne garde ici que le libellé de l'extraction.
            setLabelInput(data.annotation_label || data.name || data.filename || "Extraction");
          }
        })
        .catch((err) => console.error("Erreur chargement:", err))
        .finally(() => setLoading(false));
    }
  }, [extractionId]);

  const handleGoToExtraction = () => {
    setShowSuccessModal(false);
    if (newExtractionId) {
      navigate(`/viewer?url=${encodeURIComponent(defaultDziFilename || "")}`, {
        state: {
          patientName: patientName,
          folderId: folderId,
          image_url: defaultDziFilename,
          extractionId: newExtractionId,
          roi: shapes[0],
        },
      });
    } else {
      setShowSidebar(false);
    }
  };

  const handleStayOnImage = () => {
    setShowSuccessModal(false);
    setShowSidebar(false);
  };

  // --- NAVIGATION DU WORKFLOW ---
  // « Suivant » persiste l'étape puis laisse le serveur décider de la
  // transition : si elle est refusée, l'interface ne bouge pas.
  const handleNextWorkflowStep = async () => {
    const fields = olgaForm.schema?.["x-order"] ?? [];
    const stepData = Object.fromEntries(
      fields.map((field) => [field, formValues[field] ?? ""]),
    );
    const saved = await workflow.saveCurrentStep(stepData, true);
    if (saved) setFormData({});
  };

  const handlePrevWorkflowStep = () => {
    void workflow.goBack();
  };

  const handleSaveAction = async () => {
    if (!shapes.length && !extractionId) return;
    setLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";
    const shape = shapes.length > 0 ? shapes[0] : { x: 0, y: 0, w: 0, h: 0 };

    const payload = {
      filename: defaultDziFilename || "biopsie_cmu_1.dzi",
      x: Math.round(shape.x || 0),
      y: Math.round(shape.y || 0),
      width: Math.round(shape.w || 0),
      height: Math.round(shape.h || 0),
      patient_folder: folderId,
      patient_name: patientName,
      annotation_label: labelInput,
      extraction_id: extractionId,
      owner: currentUser,
      drawings: shapes,
      prelevement_type: formValues.prelevementType || "",
      prelevement_date: formValues.prelevementDate || null,
      block_number: formValues.blockNumber || "",
      fixation: formValues.fixation || "",
      slide_count: formValues.slideCount
        ? parseInt(String(formValues.slideCount), 10)
        : null,
      staining: Array.isArray(formValues.staining)
        ? formValues.staining
        : formValues.staining
          ? [formValues.staining]
          : [],
      macro_obs: formValues.macroObs || "",
      micro_obs: formValues.microObs || "",
      histo_type: formValues.histoType || "",
      sbr_grade: formValues.sbrGrade || "",
      margins: formValues.margins || "",
      hormonal_receptors: formValues.hormonalReceptors || "",
      diagnosis: formValues.diagnosis || "",
      comments: formValues.comments || "",
      status: formValues.status || "en_analyse",
      pathologist: formValues.pathologist || "",
      validation_date: formValues.validationDate || null,
    };

    try {
      const url = isAnnotationMode
        ? `${baseUrl}/annotations/save`
        : `${baseUrl}/extract-roi`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        if (!isAnnotationMode) {
          if (data && data.extraction_id)
            setNewExtractionId(data.extraction_id);
          else if (data && data.id) setNewExtractionId(data.id);
          setShowSuccessModal(true);
        } else {
          alert("✅ Dossier mis à jour !");
          navigate("/dashboard");
        }
      } else {
        // Le backend renvoie `{ detail }` : l'afficher évite un « Erreur
        // serveur » opaque qui n'indique ni la cause ni la marche à suivre.
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : typeof data?.detail?.message === "string"
              ? data.detail.message
              : `Le serveur a répondu ${res.status}.`;
        alert(`Échec de l'enregistrement : ${detail}`);
      }
    } catch (error) {
      alert(
        `Serveur injoignable : ${error instanceof Error ? error.message : "vérifiez que le backend tourne sur le port 8002."}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen select-none overflow-hidden bg-imaging">
      {/* ================== ZONE IMAGE ==================
          Fond sombre dans les deux thèmes : convention radiologique, un fond
          clair fausse la perception des niveaux de gris sur une lame. */}
      <div
        id="osd-container"
        className="relative h-full flex-grow overflow-hidden bg-imaging"
        ref={containerRef}
      >
        <div id="openseadragon-viewer" className="absolute inset-0 z-0 bg-imaging" />

        {/* Calque SVG des annotations */}
        <div
          className={`absolute inset-0 z-10 ${currentTool === "move" && !pendingTextPos && movingShapeIndex === null && movingTextIndex === null ? "pointer-events-none" : "cursor-crosshair pointer-events-auto"}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <svg className="h-full w-full">
            {renderShapesBackground()}
            {renderAiPoints()}
            {renderTextOverlays()}

            {/* Formes en cours de dessin : vert d'accentuation, comme toute
                action en cours dans l'application. */}
            {currentDragShape && currentTool === "rect" && (
              <rect
                x={currentDragShape.x}
                y={currentDragShape.y}
                width={currentDragShape.w}
                height={currentDragShape.h}
                fill="rgba(16, 185, 129, 0.18)"
                stroke="#10b981"
                strokeWidth="2"
              />
            )}
            {currentDragShape && currentTool === "circle" && (
              <circle
                cx={currentDragShape.x}
                cy={currentDragShape.y}
                r={currentDragShape.radius}
                fill="rgba(16, 185, 129, 0.18)"
                stroke="#10b981"
                strokeWidth="2"
              />
            )}
            {currentTool === "polygon" && (
              <polyline
                points={polyPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            )}
          </svg>

          {/* Saisie d'un nouveau texte */}
          {pendingTextPos && (
            <div
              className="wg-overlay-bar pointer-events-auto absolute z-50 flex gap-2 p-2"
              style={{ left: pendingTextPos.x, top: pendingTextPos.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmText()}
                placeholder="Annotation…"
                className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none placeholder:text-white/40"
              />
              <button onClick={confirmText} className="wg-overlay-btn" data-active="true">
                Valider
              </button>
            </div>
          )}

          {/* Modification d'un texte existant */}
          {editingShapeIndex !== null &&
            viewerRef.current &&
            (() => {
              const shape = shapes[editingShapeIndex];
              let pt;

              if (shape.type === "text") {
                pt = viewerRef.current.viewport.imageToViewerElementCoordinates(
                  new OpenSeadragon.Point(shape.x, shape.y),
                );
              } else {
                const { cx, cy, minY } = getShapeBounds(shape);
                const offsetX =
                  shape.textOffsetX !== undefined ? shape.textOffsetX : 0;
                const offsetY =
                  shape.textOffsetY !== undefined
                    ? shape.textOffsetY
                    : minY - cy - 0.05;
                pt = viewerRef.current.viewport.imageToViewerElementCoordinates(
                  new OpenSeadragon.Point(cx + offsetX, cy + offsetY),
                );
              }

              return (
                <div
                  className="wg-overlay-bar pointer-events-auto absolute z-50 flex gap-2 p-2"
                  style={{ left: pt.x - 50, top: pt.y - 20 }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    type="text"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && confirmText()}
                    className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white outline-none"
                  />
                  <button onClick={confirmText} className="wg-overlay-btn" data-active="true">
                    Mettre à jour
                  </button>
                </div>
              );
            })()}
        </div>

        {/* ---------- Repère de position, en haut à gauche ----------
            Pas de barre de navigation ici : l'écran appartient à l'image.
            Mais le praticien doit toujours savoir QUEL dossier il regarde et
            comment en sortir, d'où un retour explicitement libellé. */}
        <div className="wg-overlay-bar absolute left-4 top-4 z-20 flex items-center gap-1 p-1.5">
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
              {patientName}
            </div>
            <div className="wg-id leading-tight text-overlay-muted">{folderId}</div>
          </div>
        </div>

        {/* ---------- Légende de collaboration ----------
            La couleur d'un tracé indique son auteur : c'est l'information
            centrale d'une plateforme partagée entre médecins. */}
        <div className="wg-overlay-bar pointer-events-none absolute left-4 top-[74px] z-20 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-overlay-muted">
            <PersonIcon sx={{ fontSize: 13 }} /> Auteurs des tracés
          </div>
          <div className="mb-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
            <span className="text-xs text-overlay-ink">Moi ({currentUser})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
            <span className="text-xs text-overlay-ink">Collègues</span>
          </div>
        </div>

        {/* ---------- Barre d'outils, en bas ---------- */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-3">
          {/* Navigation dans l'image et tracés */}
          <div className="wg-overlay-bar pointer-events-auto flex items-center gap-0.5 p-1.5">
            <button
              onClick={() => setCurrentTool("move")}
              data-active={currentTool === "move"}
              className="wg-overlay-btn"
              title="Déplacer l'image"
            >
              <PanToolIcon fontSize="small" />
            </button>
            <button onClick={handleZoomIn} className="wg-overlay-btn" title="Zoom avant">
              <ZoomInIcon fontSize="small" />
            </button>
            <button onClick={handleZoomOut} className="wg-overlay-btn" title="Zoom arrière">
              <ZoomOutIcon fontSize="small" />
            </button>

            <span className="wg-overlay-sep" />

            <button
              onClick={() => setCurrentTool("rect")}
              data-active={currentTool === "rect"}
              className="wg-overlay-btn"
              title="Tracer un rectangle"
            >
              <CropSquareIcon fontSize="small" />
            </button>
            {isAnnotationMode && (
              <>
                <button
                  onClick={() => setCurrentTool("circle")}
                  data-active={currentTool === "circle"}
                  className="wg-overlay-btn"
                  title="Tracer un cercle"
                >
                  <RadioButtonUncheckedIcon fontSize="small" />
                </button>
                <button
                  onClick={() => {
                    setCurrentTool("polygon");
                    setPolyPoints([]);
                  }}
                  data-active={currentTool === "polygon"}
                  className="wg-overlay-btn"
                  title="Tracer un polygone"
                >
                  <PolylineIcon fontSize="small" />
                </button>
                <button
                  onClick={() => {
                    setCurrentTool("text");
                    setPendingTextPos(null);
                  }}
                  data-active={currentTool === "text"}
                  className="wg-overlay-btn"
                  title="Ajouter un texte"
                >
                  <TextFieldsIcon fontSize="small" />
                </button>

                <span className="wg-overlay-sep" />

                <button
                  onClick={() => setShowTexts(!showTexts)}
                  className="wg-overlay-btn"
                  title={showTexts ? "Masquer les textes" : "Afficher les textes"}
                >
                  {showTexts ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                </button>
              </>
            )}
          </div>

          {/* Actions sur les tracés */}
          <div className="wg-overlay-bar pointer-events-auto flex items-center gap-0.5 p-1.5">
            <button
              onClick={handleDownloadSnapshot}
              className="wg-overlay-btn"
              title="Capturer la vue courante en image"
            >
              <CameraAltIcon fontSize="small" />
            </button>
            {shapes.length > 0 && (
              <button
                onClick={handleUndo}
                className="wg-overlay-btn"
                title="Annuler le dernier tracé"
              >
                <UndoIcon fontSize="small" />
              </button>
            )}
            {shapes.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="wg-overlay-btn hover:text-[#ff9c9c]"
                title="Effacer tous les tracés"
              >
                <DeleteForeverIcon fontSize="small" />
              </button>
            )}
          </div>

          {/* Analyse assistée et compte rendu */}
          <div className="pointer-events-auto flex gap-2">
            {isAnnotationMode && (
              <>
                <button
                  onClick={handleAiAnalysis}
                  disabled={loading}
                  className="wg-overlay-action"
                  title="Lance ou relance la segmentation InstanSeg sur la zone"
                >
                  <SmartToyIcon fontSize="small" />
                  {loading ? "Analyse…" : aiSuggestion ? "Relancer l'IA" : "Analyse IA"}
                </button>
                {aiSuggestion && (
                  <button
                    onClick={() => setShowAiPoints(!showAiPoints)}
                    data-active={showAiPoints}
                    className="wg-overlay-action"
                    title={showAiPoints ? "Masquer les points IA" : "Afficher les points IA"}
                  >
                    {showAiPoints ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setShowSidebar(!showSidebar)}
              data-active={!showSidebar}
              className="wg-overlay-action"
              title={showSidebar ? "Masquer le compte rendu" : "Afficher le compte rendu"}
            >
              <DescriptionIcon fontSize="small" />
              {showSidebar ? "Masquer" : "Compte rendu"}
            </button>
          </div>
        </div>
      </div>

      {/* ================== CONFIRMATION DE CRÉATION ================== */}
      {showSuccessModal && (
        <div className="wg-modal-backdrop" role="dialog" aria-modal="true">
          <div className="wg-modal max-w-sm">
            <div className="wg-modal-body text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                <CheckCircleIcon />
              </div>
              <h2 className="wg-modal-title">Dossier d'analyse créé</h2>
              <p className="mt-2 text-[13px] text-muted">
                La zone extraite est enregistrée. Vous pouvez ouvrir le dossier
                pour saisir le compte rendu, ou poursuivre sur la lame.
              </p>
            </div>
            <div className="wg-modal-foot">
              <button onClick={handleStayOnImage} className="wg-btn wg-btn-secondary">
                Rester sur la lame
              </button>
              <button onClick={handleGoToExtraction} className="wg-btn wg-btn-primary">
                <VisibilityIcon fontSize="small" /> Ouvrir le dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================== PANNEAU LATÉRAL : COMPTE RENDU ==================
          Le panneau suit le thème de l'application (et non l'image) : c'est
          une zone de LECTURE et de SAISIE, pas d'observation. */}
      {showSidebar && !showSuccessModal && (
        <aside className="z-20 flex w-[450px] flex-col border-l border-line bg-surface">
          <div className="border-b border-line px-5 py-4">
            <h2 className="wg-h2">
              {isAnnotationMode ? "Compte rendu anatomopathologique" : "Nouvelle extraction"}
            </h2>
            <p className="wg-sub mt-0.5">
              {patientName}, dossier <span className="wg-id">{folderId}</span>
            </p>
          </div>

          {!isAnnotationMode ? (
            /* ---------- Mode création : pas de formulaire OLGA ---------- */
            <div className="wg-scroll flex-1 overflow-y-auto p-5">
              <div className="mb-5">
                <label className="wg-label" htmlFor="extraction-label">
                  Nom de l'extraction
                </label>
                <input
                  id="extraction-label"
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="wg-input"
                />
              </div>
              <div className="wg-note wg-note-accent">
                Délimitez une zone sur la lame avec l'outil rectangle, puis
                validez ci-dessous pour créer le dossier d'analyse.
              </div>
            </div>
          ) : (
            /* ---------- Mode annotation : workflow OLGA ---------- */
            <div className="wg-scroll flex-1 overflow-y-auto p-5">
              {aiSuggestion && (
                <div className="mb-5 rounded-lg border border-line bg-raised p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <SmartToyIcon sx={{ fontSize: 16 }} /> Analyse InstanSeg
                  </h3>
                  {/* Aide au diagnostic, jamais un diagnostic : la mesure est
                      présentée telle quelle, sans interprétation. */}
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted">
                    {aiSuggestion}
                  </pre>
                </div>
              )}

              <div className="mb-5">
                <label className="wg-label" htmlFor="extraction-label-edit">
                  Nom de l'extraction
                </label>
                <input
                  id="extraction-label-edit"
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="wg-input"
                />
              </div>

              {/* Avancement du dossier, tel que le serveur le connaît */}
              {workflow.state && (
                <WorkflowStepper
                  state={workflow.state}
                  onSelect={workflow.goToStep}
                  disabled={workflow.status === "saving"}
                />
              )}

              {workflow.error && (
                <div className="wg-note wg-note-danger mb-4">
                  <p className="flex-1">{workflow.error}</p>
                  <button
                    type="button"
                    onClick={workflow.clearError}
                    className="shrink-0 font-semibold"
                    aria-label="Masquer le message"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Dossier validé : information, et non écran bloquant. Le
                  formulaire de l'étape courante reste modifiable. */}
              {isWorkflowFinished && (
                <div className="wg-note wg-note-accent mb-4">
                  <CheckCircleIcon sx={{ fontSize: 16 }} />
                  <p className="flex-1">
                    Les quatre étapes sont validées. Vous pouvez encore corriger
                    une étape en la sélectionnant ci-dessus.
                  </p>
                </div>
              )}

              <OlgaFormPanel
                {...olgaForm}
                values={formValues}
                onChange={handleFieldChange}
                disabled={loading || workflow.status === "saving"}
              />
            </div>
          )}

          {/* ---------- Actions du panneau ---------- */}
          <div className="flex gap-2 border-t border-line px-5 py-4">
            {!isAnnotationMode ? (
              <button
                onClick={handleSaveAction}
                disabled={loading}
                className="wg-btn wg-btn-primary flex-1"
              >
                {loading ? "Création…" : "Créer le dossier d'analyse"}
              </button>
            ) : (
              <>
                {workflow.canGoBack && (
                  <button
                    onClick={handlePrevWorkflowStep}
                    disabled={workflow.status === "saving"}
                    className="wg-btn wg-btn-secondary"
                  >
                    Retour
                  </button>
                )}

                <button
                  onClick={handleNextWorkflowStep}
                  disabled={workflow.status === "saving" || !olgaForm.schema}
                  className="wg-btn wg-btn-primary flex-1"
                >
                  {workflow.status === "saving"
                    ? "Enregistrement…"
                    : currentStep + 1 < STEP_COUNT
                      ? `Valider l'étape ${currentStep + 1}/${STEP_COUNT}`
                      : `Valider l'étape ${STEP_COUNT}/${STEP_COUNT}`}
                </button>

                {isWorkflowFinished && (
                  <button
                    onClick={handleSaveAction}
                    disabled={loading}
                    className="wg-btn wg-btn-secondary"
                  >
                    {loading ? "Enregistrement…" : "Mettre à jour"}
                  </button>
                )}
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
