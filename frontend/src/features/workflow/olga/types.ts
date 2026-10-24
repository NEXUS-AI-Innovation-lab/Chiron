/**
 * Contrats de la frontière OLGA.
 *
 * OLGA est un service EXTERNE : il ne fournit que la description des
 * formulaires. Son format propriétaire n'entre jamais dans le reste de
 * l'application — il est traduit en JSON Schema par `olgaAdapter`.
 */

/* ------------------------------------------------------------------ */
/* Format brut renvoyé par OLGA (à ne consommer que dans l'adaptateur) */
/* ------------------------------------------------------------------ */

/** Une option de liste déroulante telle qu'OLGA la publie. */
export interface OlgaRawOption {
  /** Code technique, quand OLGA le distingue du libellé. */
  value?: string;
  /** Libellé affiché. Peut encoder le code : `"canalaire (Carcinome canalaire)"`. */
  label?: string;
  name?: string;
  text?: string;
  id?: string;
  option_id?: string;
}

export interface OlgaRawField {
  field_key?: string;
  field_label?: string;
  /** `input:text`, `input:number`, `textarea`, `select`, `datepicker`… */
  field_type?: string;
  field_hint?: string;
  field_required?: boolean;
  field_options?: {
    options?: unknown[];
    /** `"Text Option"` (simple) ou `"Multiple Text Option"` (multiple). */
    source?: string;
    multiple?: boolean;
  };
}

export interface OlgaRawForm {
  form_id?: string;
  form_label?: string;
  form_version?: string;
  form_category?: string;
  last_updated?: string;
  models?: string[];
  form?: OlgaRawField[];
}

/* ------------------------------------------------------------------ */
/* JSON Schema — le seul format manipulé par l'application             */
/* ------------------------------------------------------------------ */

/** Widget de saisie à utiliser. Dérivé du `field_type` OLGA. */
export type ControlType =
  | "text"
  | "number"
  | "textarea"
  | "date"
  | "select"
  | "multiselect";

export interface EnumOption {
  /** Valeur persistée en base (ex. `"canalaire"`). */
  value: string;
  /** Libellé affiché (ex. `"Carcinome canalaire"`). */
  label: string;
}

/**
 * Sous-ensemble de JSON Schema utilisé par Chiron, enrichi de quelques
 * annotations `x-` pour piloter le rendu (JSON Schema décrit la donnée,
 * pas l'interface : les `x-` portent l'intention d'affichage).
 */
export interface JsonSchemaProperty {
  type: "string" | "integer" | "number" | "array";
  title?: string;
  description?: string;
  format?: "date";
  enum?: string[];
  items?: { type: "string"; enum?: string[] };
  uniqueItems?: boolean;
  /** Widget à rendre. */
  "x-control": ControlType;
  /** Libellés d'affichage alignés sur `enum` (ou `items.enum`). */
  "x-enumLabels"?: EnumOption[];
}

export interface WorkflowJsonSchema {
  $schema: string;
  $id: string;
  title: string;
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: false;
  /** Ordre d'affichage des champs, que `properties` ne garantit pas. */
  "x-order": string[];
  /** Traçabilité de la source OLGA. */
  "x-source": {
    provider: "olga";
    formId?: string;
    formVersion?: string;
    lastUpdated?: string;
  };
}

/** Données saisies dans un formulaire d'étape. */
export type FormValues = Record<string, unknown>;
