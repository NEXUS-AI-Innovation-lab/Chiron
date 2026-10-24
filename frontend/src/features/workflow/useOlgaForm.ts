/**
 * Chargement du formulaire de l'étape courante.
 *
 * Règle : l'interface n'est JAMAIS bloquée. Si OLGA ne répond pas, on sert
 * l'instantané JSON Schema versionné et on le signale, plutôt que de laisser
 * un écran « Chargement… » indéfini.
 */

import { useCallback, useEffect, useState } from "react";

import { fetchFormSchema, OlgaError } from "./olga/olgaClient";
import type { WorkflowJsonSchema } from "./olga/types";
import { SCHEMA_SNAPSHOTS } from "./schemas";
import { WORKFLOW_STEPS, type WorkflowStep } from "./steps";

export type OlgaFormStatus = "loading" | "live" | "snapshot";

export interface UseOlgaFormResult {
  step: WorkflowStep;
  schema: WorkflowJsonSchema | null;
  status: OlgaFormStatus;
  /** Renseigné quand on est retombé sur l'instantané. */
  warning: string | null;
  /** Champs qu'OLGA expose mais que Chiron ne sait pas rendre. */
  unsupported: { key: string; type: string }[];
  reload: () => void;
}

/** Résultat d'un chargement, étiqueté par la requête qui l'a produit. */
interface LoadedForm {
  requestKey: string;
  schema: WorkflowJsonSchema | null;
  status: Exclude<OlgaFormStatus, "loading">;
  warning: string | null;
  unsupported: { key: string; type: string }[];
}

export function useOlgaForm(stepIndex: number, enabled: boolean): UseOlgaFormResult {
  const step = WORKFLOW_STEPS[Math.min(Math.max(stepIndex, 0), WORKFLOW_STEPS.length - 1)];

  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<LoadedForm | null>(null);

  const requestKey = `${step.id}#${attempt}`;
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let active = true;

    // Aucun setState synchrone ici : tant que `loaded` ne porte pas la clé
    // courante, l'état « loading » est dérivé au rendu (voir plus bas).
    fetchFormSchema(step.olgaFormId, step.schemaId, controller.signal)
      .then(({ schema, unsupported }) => {
        if (!active) return;
        setLoaded({ requestKey, schema, status: "live", warning: null, unsupported });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof OlgaError && error.kind === "aborted")) return;

        // Repli sur l'instantané : le pathologiste peut continuer à saisir.
        setLoaded({
          requestKey,
          schema: SCHEMA_SNAPSHOTS[step.id] ?? null,
          status: "snapshot",
          warning:
            error instanceof OlgaError
              ? error.userMessage
              : "Le service de formulaires OLGA est injoignable.",
          unsupported: [],
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [step, enabled, requestKey]);

  // État dérivé : un résultat d'une requête précédente ne s'affiche jamais
  // à la place de l'étape courante.
  const isCurrent = loaded?.requestKey === requestKey;

  return {
    step,
    schema: isCurrent ? loaded.schema : null,
    status: isCurrent ? loaded.status : "loading",
    warning: isCurrent ? loaded.warning : null,
    unsupported: isCurrent ? loaded.unsupported : [],
    reload,
  };
}
