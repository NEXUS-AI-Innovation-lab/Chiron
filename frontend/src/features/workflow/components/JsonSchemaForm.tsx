/**
 * Rendu d'un formulaire à partir d'un JSON Schema.
 *
 * Générique : aucun nom de champ métier n'apparaît ici. Ajouter un champ
 * dans OLGA suffit à le voir apparaître, et un type non géré est signalé
 * à l'écran au lieu de disparaître.
 */

import type { ChangeEvent } from "react";

import { coerceToSchema } from "../olga/olgaAdapter";
import type {
  FormValues,
  JsonSchemaProperty,
  WorkflowJsonSchema,
} from "../olga/types";

interface JsonSchemaFormProps {
  schema: WorkflowJsonSchema;
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  /** Champs présents dans OLGA mais non rendus, à signaler honnêtement. */
  unsupported?: { key: string; type: string }[];
  disabled?: boolean;
}

// Tous les champs partagent la classe `wg-input` du système de design :
// hauteur, bordure, anneau de focus et état désactivé sont définis une seule
// fois, dans index.css, pour toute l'application.
const FIELD_CLASS = "wg-input";

function Label({ property, htmlFor }: { property: JsonSchemaProperty; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="wg-label">
      {property.title}
      {property.description ? (
        <span className="mt-0.5 block text-[11px] font-normal text-faint">
          {property.description}
        </span>
      ) : null}
    </label>
  );
}

function Field({
  fieldKey,
  property,
  value,
  onChange,
  disabled,
}: {
  fieldKey: string;
  property: JsonSchemaProperty;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const inputId = `olga-${fieldKey}`;
  const options = property["x-enumLabels"] ?? [];

  switch (property["x-control"]) {
    case "textarea":
      return (
        <textarea
          id={inputId}
          rows={3}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            onChange(fieldKey, e.target.value)
          }
          className={FIELD_CLASS}
        />
      );

    case "select":
      return (
        <select
          id={inputId}
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            onChange(fieldKey, e.target.value)
          }
          className={FIELD_CLASS}
        >
          <option value="">Sélectionner…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case "multiselect":
      return (
        <select
          id={inputId}
          multiple
          disabled={disabled}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            onChange(
              fieldKey,
              Array.from(e.target.selectedOptions, (option) => option.value),
            )
          }
          className={`${FIELD_CLASS} h-24 p-1`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );

    case "number":
      return (
        <input
          id={inputId}
          type="number"
          disabled={disabled}
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(fieldKey, e.target.value)
          }
          className={FIELD_CLASS}
        />
      );

    case "date":
      return (
        <input
          id={inputId}
          type="date"
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(fieldKey, e.target.value)
          }
          className={FIELD_CLASS}
        />
      );

    case "text":
    default:
      return (
        <input
          id={inputId}
          type="text"
          disabled={disabled}
          value={typeof value === "string" ? value : ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(fieldKey, e.target.value)
          }
          className={FIELD_CLASS}
        />
      );
  }
}

export default function JsonSchemaForm({
  schema,
  values,
  onChange,
  unsupported = [],
  disabled = false,
}: JsonSchemaFormProps) {
  return (
    <div>
      {schema["x-order"].map((fieldKey) => {
        const property = schema.properties[fieldKey];
        if (!property) return null;

        return (
          <div key={fieldKey} className="mb-4">
            <Label property={property} htmlFor={`olga-${fieldKey}`} />
            <Field
              fieldKey={fieldKey}
              property={property}
              value={coerceToSchema(values[fieldKey], property)}
              onChange={onChange}
              disabled={disabled}
            />
          </div>
        );
      })}

      {unsupported.length > 0 && (
        <p className="mt-2 text-[11px] text-warn-text">
          {unsupported.length} champ(s) définis dans OLGA ne sont pas encore
          gérés par Chiron :{" "}
          {unsupported.map((field) => `${field.key} (${field.type})`).join(", ")}.
        </p>
      )}
    </div>
  );
}
