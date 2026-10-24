/**
 * Frise d'avancement des étapes.
 *
 * Encode trois états distincts — validée, en cours, verrouillée — pour que
 * le pathologiste voie d'un coup d'œil où en est le dossier et pourquoi une
 * étape n'est pas encore accessible.
 *
 * Les étapes déjà atteintes sont cliquables : c'est le seul moyen simple de
 * revenir corriger une saisie sans dérouler tout le parcours à l'envers.
 *
 * L'état n'est jamais porté par la seule couleur (un pastillage vert/gris
 * serait illisible pour un daltonien) : un chiffre, une coche ou un cadenas
 * l'indiquent aussi, et l'infobulle l'énonce en toutes lettres.
 */

import CheckIcon from "@mui/icons-material/Check";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

import type { WorkflowState } from "../workflowApi";

interface WorkflowStepperProps {
  state: WorkflowState;
  /** Ouvre une étape déjà accessible. */
  onSelect?: (stepId: string) => void;
  disabled?: boolean;
}

export default function WorkflowStepper({
  state,
  onSelect,
  disabled = false,
}: WorkflowStepperProps) {
  return (
    <ol className="mb-5 flex items-stretch gap-1" aria-label="Avancement du dossier">
      {state.steps.map((step) => {
        const isValidated = step.validated_at !== null;
        const isCurrent = step.step === state.current_step;
        const isReachable = step.position <= state.max_reached_position;
        const isLocked = !isReachable;
        const canOpen = Boolean(onSelect) && isReachable && !isCurrent && !disabled;

        // Le trait supérieur porte l'état : plein et vert pour l'étape en
        // cours, discret pour les autres.
        const rail = isCurrent
          ? "bg-accent"
          : isValidated
            ? "bg-accent/45"
            : "bg-line";

        return (
          <li key={step.step} className="flex-1">
            <button
              type="button"
              onClick={canOpen ? () => onSelect?.(step.step) : undefined}
              disabled={!canOpen}
              aria-current={isCurrent ? "step" : undefined}
              title={
                isLocked
                  ? "Validez les étapes précédentes pour accéder à celle-ci"
                  : isCurrent
                    ? "Étape en cours"
                    : "Ouvrir cette étape"
              }
              className={`w-full rounded-b-lg pb-1 pt-2 text-left ${
                canOpen ? "cursor-pointer hover:bg-raised" : "cursor-default"
              }`}
            >
              <span className={`mb-2 block h-[3px] rounded-full ${rail}`} />

              <span className="flex items-center gap-1.5 px-1">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                    isValidated
                      ? "bg-accent text-white"
                      : isCurrent
                        ? "bg-accent-soft text-accent-text"
                        : "bg-raised text-faint"
                  }`}
                  aria-hidden="true"
                >
                  {isValidated ? (
                    <CheckIcon sx={{ fontSize: 11 }} />
                  ) : isLocked ? (
                    <LockOutlinedIcon sx={{ fontSize: 10 }} />
                  ) : (
                    step.position
                  )}
                </span>
                <span
                  className={`truncate text-[13px] ${
                    isCurrent
                      ? "font-semibold text-ink"
                      : isLocked
                        ? "text-faint"
                        : "text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </span>

              {isValidated && step.validated_by && (
                <span className="mt-0.5 block truncate px-1 pl-6 text-[11px] text-faint">
                  {step.validated_by}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
