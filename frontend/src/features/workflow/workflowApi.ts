/**
 * Client du moteur de workflow Chiron.
 *
 * L'avancement est une donnée serveur : le client la lit et demande des
 * transitions, il ne la décide jamais. Un refus (409) est une réponse
 * légitime à afficher, pas une erreur technique.
 */

const API_URL: string =
  import.meta.env.VITE_API_URL || "http://localhost:8002";

export interface WorkflowStepState {
  step: string;
  position: number;
  label: string;
  data: Record<string, unknown>;
  validated_at: string | null;
  validated_by: string | null;
}

export interface WorkflowState {
  extraction_id: number;
  current_step: string;
  current_position: number;
  step_count: number;
  is_complete: boolean;
  completed_at: string | null;
  steps: WorkflowStepState[];
  max_reached_position: number;
}

export type WorkflowErrorCode =
  | "step_locked"
  | "missing_fields"
  | "unknown_step"
  | "invalid_payload"
  | "network"
  | "unexpected";

export class WorkflowApiError extends Error {
  readonly code: WorkflowErrorCode;
  readonly details: unknown;

  constructor(code: WorkflowErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "WorkflowApiError";
    this.code = code;
    this.details = details;
  }
}

async function request(path: string, init?: RequestInit): Promise<WorkflowState> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (error) {
    throw new WorkflowApiError(
      "network",
      error instanceof Error ? error.message : "Serveur injoignable.",
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    // Le backend renvoie `{ detail: { code, message, details } }`.
    const detail = (payload as { detail?: unknown })?.detail;
    if (detail && typeof detail === "object" && "code" in detail) {
      const typed = detail as { code: WorkflowErrorCode; message: string; details?: unknown };
      throw new WorkflowApiError(typed.code, typed.message, typed.details);
    }
    throw new WorkflowApiError(
      "unexpected",
      typeof detail === "string" ? detail : `Erreur serveur (${response.status}).`,
    );
  }

  return payload as WorkflowState;
}

/** Avancement courant, reconstruit côté serveur au premier appel. */
export function getWorkflow(extractionId: number): Promise<WorkflowState> {
  return request(`/extractions/${extractionId}/workflow`);
}

/**
 * Enregistre une étape.
 *
 * @param validateStep `false` conserve un brouillon sans franchir l'étape.
 */
export function saveWorkflowStep(
  extractionId: number,
  step: string,
  data: Record<string, unknown>,
  validatedBy: string | null,
  validateStep: boolean,
): Promise<WorkflowState> {
  return request(`/extractions/${extractionId}/workflow/steps/${step}`, {
    method: "PUT",
    body: JSON.stringify({
      data,
      validated_by: validatedBy,
      validate_step: validateStep,
    }),
  });
}

/** Revient sur une étape déjà accessible. */
export function gotoWorkflowStep(
  extractionId: number,
  step: string,
): Promise<WorkflowState> {
  return request(`/extractions/${extractionId}/workflow/goto`, {
    method: "POST",
    body: JSON.stringify({ step }),
  });
}
