/**
 * État du workflow d'une extraction.
 *
 * L'étape courante vient du serveur : rouvrir une extraction reprend là où
 * le travail s'était arrêté, au lieu de recommencer à « Prélèvement 1/4 ».
 */

import { useCallback, useEffect, useState } from "react";

import { WORKFLOW_STEPS, STEP_COUNT } from "./steps";
import {
  getWorkflow,
  gotoWorkflowStep,
  saveWorkflowStep,
  WorkflowApiError,
  type WorkflowState,
} from "./workflowApi";

export type WorkflowStatus = "idle" | "loading" | "ready" | "saving" | "error";

export interface UseWorkflowResult {
  state: WorkflowState | null;
  status: WorkflowStatus;
  /** Message à afficher (refus de transition, panne réseau…). */
  error: string | null;
  /** Index 0-based de l'étape courante, pour le chargement du formulaire OLGA. */
  currentIndex: number;
  isComplete: boolean;
  canGoBack: boolean;
  /** Valeurs de tous les pas déjà saisis, fusionnées. */
  mergedData: Record<string, unknown>;
  /** Enregistre l'étape courante ; `validate` la franchit. */
  saveCurrentStep: (
    data: Record<string, unknown>,
    validate: boolean,
  ) => Promise<boolean>;
  goBack: () => Promise<void>;
  /** Repositionne le parcours sur une étape déjà accessible. */
  goToStep: (stepId: string) => Promise<void>;
  clearError: () => void;
  reload: () => void;
}

const EMPTY_DATA: Record<string, unknown> = {};

export function useWorkflow(
  extractionId: number | null,
  currentUser: string | null,
): UseWorkflowResult {
  const [state, setState] = useState<WorkflowState | null>(null);
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!extractionId) return;

    let active = true;
    getWorkflow(extractionId)
      .then((fresh) => {
        if (!active) return;
        setState(fresh);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setStatus("error");
        setError(
          cause instanceof WorkflowApiError
            ? cause.message
            : "Impossible de charger l'avancement du dossier.",
        );
      });

    return () => {
      active = false;
    };
  }, [extractionId, attempt]);

  const currentIndex = state ? Math.max(0, state.current_position - 1) : 0;
  const isComplete = state?.is_complete ?? false;
  const canGoBack = currentIndex > 0;

  const mergedData = state
    ? state.steps.reduce<Record<string, unknown>>(
        (accumulator, step) => ({ ...accumulator, ...step.data }),
        {},
      )
    : EMPTY_DATA;

  const saveCurrentStep = useCallback(
    async (data: Record<string, unknown>, validate: boolean): Promise<boolean> => {
      if (!extractionId || !state) return false;

      setStatus("saving");
      setError(null);
      try {
        const updated = await saveWorkflowStep(
          extractionId,
          state.current_step,
          data,
          currentUser,
          validate,
        );
        setState(updated);
        setStatus("ready");
        return true;
      } catch (cause) {
        setStatus("ready");
        setError(
          cause instanceof WorkflowApiError
            ? cause.message
            : "L'enregistrement de l'étape a échoué.",
        );
        return false;
      }
    },
    [extractionId, state, currentUser],
  );

  const goToStep = useCallback(
    async (stepId: string) => {
      if (!extractionId || !state || stepId === state.current_step) return;

      setStatus("saving");
      setError(null);
      try {
        const updated = await gotoWorkflowStep(extractionId, stepId);
        setState(updated);
        setStatus("ready");
      } catch (cause) {
        setStatus("ready");
        setError(
          cause instanceof WorkflowApiError
            ? cause.message
            : "Impossible d'ouvrir cette étape.",
        );
      }
    },
    [extractionId, state],
  );

  const goBack = useCallback(async () => {
    if (currentIndex <= 0) return;
    await goToStep(WORKFLOW_STEPS[currentIndex - 1].id);
  }, [currentIndex, goToStep]);

  return {
    state,
    status: extractionId && status === "idle" ? "loading" : status,
    error,
    currentIndex: Math.min(currentIndex, STEP_COUNT - 1),
    isComplete,
    canGoBack,
    mergedData,
    saveCurrentStep,
    goBack,
    goToStep,
    clearError,
    reload,
  };
}
