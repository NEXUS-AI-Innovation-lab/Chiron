/**
 * Instantanés JSON Schema des formulaires OLGA.
 *
 * Régénérés par `npm run olga:schemas`. Versionnés volontairement : ils
 * servent de repli quand OLGA est indisponible, et rendent tout changement
 * de formulaire visible en revue de code.
 */

import type { WorkflowJsonSchema } from "../olga/types";
import type { WorkflowStepId } from "../steps";

import prelevement from "./prelevement.json";
import preparation from "./preparation.json";
import microscopie from "./microscopie.json";
import diagnostic from "./diagnostic.json";

export const SCHEMA_SNAPSHOTS: Record<WorkflowStepId, WorkflowJsonSchema> = {
  prelevement: prelevement as WorkflowJsonSchema,
  preparation: preparation as WorkflowJsonSchema,
  microscopie: microscopie as WorkflowJsonSchema,
  diagnostic: diagnostic as WorkflowJsonSchema,
};
