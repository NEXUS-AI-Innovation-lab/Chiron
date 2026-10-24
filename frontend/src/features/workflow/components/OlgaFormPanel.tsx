/**
 * Panneau du formulaire d'étape : états de chargement, repli hors ligne,
 * puis rendu du JSON Schema.
 */

import type { FormValues } from "../olga/types";
import type { UseOlgaFormResult } from "../useOlgaForm";
import JsonSchemaForm from "./JsonSchemaForm";

interface OlgaFormPanelProps extends UseOlgaFormResult {
  values: FormValues;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

export default function OlgaFormPanel({
  step,
  schema,
  status,
  warning,
  unsupported,
  reload,
  values,
  onChange,
  disabled,
}: OlgaFormPanelProps) {
  // Squelette de chargement plutôt qu'un simple « Chargement… » : il occupe la
  // place exacte du formulaire, donc l'interface ne saute pas à l'arrivée des
  // champs.
  if (status === "loading" && !schema) {
    return (
      <div className="space-y-4" aria-busy="true">
        <p className="text-[13px] text-muted">
          Chargement du formulaire « {step.label} »…
        </p>
        {[0, 1, 2].map((row) => (
          <div key={row} className="space-y-1.5">
            <div className="h-3 w-28 animate-pulse rounded bg-raised" />
            <div className="h-10 w-full animate-pulse rounded-lg bg-raised" />
          </div>
        ))}
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="wg-note wg-note-danger flex-col items-start">
        <p>{warning ?? "Formulaire indisponible."}</p>
        <button type="button" onClick={reload} className="wg-btn wg-btn-secondary wg-btn-sm mt-3">
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Repli hors ligne : la saisie reste possible, mais le praticien doit
          savoir que le formulaire affiché n'est pas celui d'OLGA en direct. */}
      {status === "snapshot" && (
        <div className="wg-note wg-note-warn mb-4 flex-col items-start">
          <p>
            {warning} Formulaire chargé depuis la copie enregistrée
            {schema["x-source"].lastUpdated
              ? ` du ${schema["x-source"].lastUpdated}`
              : ""}
            . Votre saisie est conservée.
          </p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 text-xs font-semibold underline underline-offset-2"
          >
            Réessayer la connexion
          </button>
        </div>
      )}

      <JsonSchemaForm
        schema={schema}
        values={values}
        onChange={onChange}
        unsupported={unsupported}
        disabled={disabled}
      />
    </div>
  );
}
