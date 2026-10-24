/**
 * Client HTTP du service OLGA.
 *
 * OLGA est un service externe : on le traite comme tel — timeout borné,
 * annulation, erreurs typées, et jamais d'exception nue qui laisserait
 * l'interface bloquée sur un écran de chargement.
 */

import { olgaToJsonSchema, type AdapterResult } from "./olgaAdapter";
import type { OlgaRawForm } from "./types";

/** Résolue depuis l'environnement Vite, pour rester déployable hors localhost. */
export const OLGA_API_URL: string =
  import.meta.env.VITE_OLGA_API_URL || "http://localhost:9091";

const DEFAULT_TIMEOUT_MS = 10_000;

export type OlgaErrorKind = "network" | "http" | "invalid" | "aborted";

export class OlgaError extends Error {
  readonly kind: OlgaErrorKind;
  readonly status?: number;

  constructor(kind: OlgaErrorKind, message: string, status?: number) {
    super(message);
    this.name = "OlgaError";
    this.kind = kind;
    this.status = status;
  }

  /** Message destiné à l'utilisateur, sans détail d'infrastructure. */
  get userMessage(): string {
    switch (this.kind) {
      case "network":
        return "Le service de formulaires OLGA est injoignable.";
      case "http":
        return `Le service OLGA a répondu une erreur (${this.status}).`;
      case "invalid":
        return "Le formulaire renvoyé par OLGA est illisible.";
      case "aborted":
        return "Chargement interrompu.";
    }
  }
}

/**
 * Récupère un formulaire OLGA et le traduit en JSON Schema.
 *
 * @param formId  Identifiant du formulaire dans OLGA.
 * @param schemaId Identifiant stable de l'étape Chiron.
 * @param signal  Permet d'annuler une requête devenue obsolète.
 */
export async function fetchFormSchema(
  formId: string,
  schemaId: string,
  signal?: AbortSignal,
): Promise<AdapterResult> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), DEFAULT_TIMEOUT_MS);

  // Annule si l'appelant annule OU si le délai est dépassé.
  const onAbort = () => timeout.abort();
  signal?.addEventListener("abort", onAbort);

  let response: Response;
  try {
    response = await fetch(
      `${OLGA_API_URL}/forms/getFromID/${encodeURIComponent(formId)}`,
      { signal: timeout.signal, headers: { Accept: "application/json" } },
    );
  } catch (error) {
    if (signal?.aborted) throw new OlgaError("aborted", "Requête annulée.");
    throw new OlgaError(
      "network",
      error instanceof Error ? error.message : "Échec réseau.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  if (!response.ok) {
    throw new OlgaError("http", `HTTP ${response.status}`, response.status);
  }

  // OLGA sert du JSON avec un Content-Type `text/plain` : on parse le texte
  // nous-mêmes pour produire une erreur nette plutôt qu'un échec opaque.
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new OlgaError("invalid", "Réponse OLGA non JSON.");
  }

  // OLGA renvoie ses erreurs applicatives en HTTP 200 : `{ "error": "..." }`.
  if (payload && typeof payload === "object" && "error" in payload) {
    throw new OlgaError("http", String((payload as { error: unknown }).error), 200);
  }

  const raw = payload as OlgaRawForm;
  if (!raw || !Array.isArray(raw.form)) {
    throw new OlgaError("invalid", "Réponse OLGA sans tableau `form`.");
  }

  return olgaToJsonSchema(raw, schemaId);
}
