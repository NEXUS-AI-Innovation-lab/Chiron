/**
 * Couche anti-corruption OLGA → JSON Schema.
 *
 * Fonctions pures, sans I/O : c'est le seul endroit du dépôt qui connaît
 * le format propriétaire d'OLGA. Tout le reste travaille sur JSON Schema.
 */

import type {
  ControlType,
  EnumOption,
  JsonSchemaProperty,
  OlgaRawField,
  OlgaRawForm,
  OlgaRawOption,
  WorkflowJsonSchema,
} from "./types";

/**
 * OLGA encode fréquemment le code technique dans le libellé, sous la forme
 * `"code (Libellé lisible)"` — ex. `"canalaire (Carcinome canalaire)"`,
 * `"1 (Grade I)"`, `"HE (Hématoxyline-Éosine)"`.
 *
 * Les colonnes PostgreSQL stockent le code seul (`'canalaire'`, `'1'`), donc
 * on doit séparer les deux, sans quoi le `<select>` ne retrouve jamais la
 * valeur chargée et enregistre le libellé d'affichage à la place du code.
 */
const CODE_IN_LABEL = /^(\S+)\s*\((.+)\)\s*$/;

/** Extrait `{ value, label }` d'une option OLGA, quelle que soit sa forme. */
export function parseOption(raw: unknown): EnumOption {
  if (raw === null || raw === undefined) return { value: "", label: "" };

  if (typeof raw !== "object") {
    const text = String(raw);
    const match = CODE_IN_LABEL.exec(text);
    return match
      ? { value: match[1], label: match[2] }
      : { value: text, label: text };
  }

  const opt = raw as OlgaRawOption;
  const display = opt.label ?? opt.text ?? opt.name ?? "";

  // Si OLGA distingue explicitement le code du libellé, on lui fait confiance.
  const explicit = opt.value ?? opt.id ?? opt.option_id;
  if (explicit) return { value: String(explicit), label: display || String(explicit) };

  const match = CODE_IN_LABEL.exec(display);
  return match
    ? { value: match[1], label: match[2] }
    : { value: display, label: display };
}

/** Traduit un `field_type` OLGA en widget. `null` = type inconnu. */
export function toControlType(field: OlgaRawField): ControlType | null {
  const rawType = (field.field_type ?? "").trim().toLowerCase();
  const options = field.field_options;
  const isMultiple =
    options?.multiple === true ||
    (options?.source ?? "").toLowerCase().includes("multiple");

  switch (rawType) {
    // OLGA préfixe ses champs de saisie par `input:`. L'ancien rendu testait
    // `"text"` / `"number"` et faisait disparaître ces champs sans un mot.
    case "input:text":
    case "text":
    case "input":
      return "text";
    case "input:number":
    case "number":
      return "number";
    case "textarea":
    case "input:textarea":
      return "textarea";
    case "datepicker":
    case "date":
    case "input:date":
      return "date";
    case "select":
    case "dropdown":
      return isMultiple ? "multiselect" : "select";
    default:
      return null;
  }
}

/** Construit la propriété JSON Schema correspondant à un champ OLGA. */
function toProperty(field: OlgaRawField, control: ControlType): JsonSchemaProperty {
  const title = field.field_label || field.field_key || "";
  const description = field.field_hint || undefined;

  if (control === "select" || control === "multiselect") {
    const rawOptions = Array.isArray(field.field_options?.options)
      ? field.field_options!.options!
      : [];
    const parsed = rawOptions.map(parseOption).filter((o) => o.value !== "");
    const values = parsed.map((o) => o.value);

    if (control === "multiselect") {
      return {
        type: "array",
        title,
        description,
        items: { type: "string", enum: values },
        uniqueItems: true,
        "x-control": "multiselect",
        "x-enumLabels": parsed,
      };
    }
    return {
      type: "string",
      title,
      description,
      enum: values,
      "x-control": "select",
      "x-enumLabels": parsed,
    };
  }

  if (control === "number") {
    // `slide_count` est un entier côté backend (`isinstance(..., int)`).
    return { type: "integer", title, description, "x-control": "number" };
  }

  if (control === "date") {
    return { type: "string", format: "date", title, description, "x-control": "date" };
  }

  return { type: "string", title, description, "x-control": control };
}

export interface AdapterResult {
  schema: WorkflowJsonSchema;
  /** Champs qu'OLGA expose mais qu'on ne sait pas rendre — jamais silencieux. */
  unsupported: { key: string; type: string }[];
}

/**
 * Convertit une réponse OLGA en JSON Schema.
 *
 * @param raw     Réponse brute de `GET /forms/getFromID/{id}`.
 * @param schemaId Identifiant stable de l'étape (ex. `"wigo:workflow:prelevement"`).
 */
export function olgaToJsonSchema(raw: OlgaRawForm, schemaId: string): AdapterResult {
  const fields = Array.isArray(raw?.form) ? raw.form : [];
  const properties: Record<string, JsonSchemaProperty> = {};
  const order: string[] = [];
  const required: string[] = [];
  const unsupported: { key: string; type: string }[] = [];

  for (const field of fields) {
    const key = field?.field_key;
    if (!key) continue;

    const control = toControlType(field);
    if (!control) {
      unsupported.push({ key, type: field.field_type ?? "(absent)" });
      continue;
    }

    properties[key] = toProperty(field, control);
    order.push(key);
    if (field.field_required === true) required.push(key);
  }

  return {
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: schemaId,
      title: raw?.form_label || schemaId,
      type: "object",
      properties,
      required,
      additionalProperties: false,
      "x-order": order,
      "x-source": {
        provider: "olga",
        formId: raw?.form_id,
        formVersion: raw?.form_version,
        lastUpdated: raw?.last_updated,
      },
    },
    unsupported,
  };
}

/* ------------------------------------------------------------------ */
/* Normalisation des valeurs                                           */
/* ------------------------------------------------------------------ */

/**
 * Aligne une valeur chargée (base de données, état précédent) sur le type
 * attendu par le schéma. Évite l'écart classique entre une colonne JSON
 * stockant un tableau et un contrôle simple attendant une chaîne.
 */
export function coerceToSchema(value: unknown, property: JsonSchemaProperty): unknown {
  if (property.type === "array") {
    if (Array.isArray(value)) return value.map(String);
    if (value === null || value === undefined || value === "") return [];
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : "";
  }

  if (property.type === "integer" || property.type === "number") {
    if (value === null || value === undefined || value === "") return "";
    return value;
  }

  if (value === null || value === undefined) return "";
  return value;
}

/** Valeur vide conforme au type d'une propriété. */
export function emptyValue(property: JsonSchemaProperty): unknown {
  return property.type === "array" ? [] : "";
}
