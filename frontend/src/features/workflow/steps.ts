/**
 * Registre des étapes du workflow d'analyse anatomopathologique.
 *
 * Les identifiants sont ceux des formulaires publiés dans OLGA (visibles
 * dans le Designer OLGA). Ce n'est plus une liste mockée : c'est le
 * registre unique de correspondance étape Chiron → formulaire OLGA.
 * Un formulaire renommé côté OLGA garde son identifiant ; seul un
 * formulaire recréé impose de mettre à jour la ligne correspondante.
 */

export const WORKFLOW_STEPS = [
  {
    id: "prelevement",
    order: 1,
    label: "Prélèvement",
    olgaFormId: "a44b3f32-1e4c-4686-9705-6ca67a381c88",
    schemaId: "wigo:workflow:prelevement",
  },
  {
    id: "preparation",
    order: 2,
    label: "Préparation",
    olgaFormId: "a42b3f12-1e4c-7636-9705-6ca87a381c93",
    schemaId: "wigo:workflow:preparation",
  },
  {
    id: "microscopie",
    order: 3,
    label: "Microscopie",
    olgaFormId: "a13b3f32-1e4c-0000-2189-6ca67a381c03",
    schemaId: "wigo:workflow:microscopie",
  },
  {
    id: "diagnostic",
    order: 4,
    label: "Diagnostic",
    olgaFormId: "a81b3f32-1e4c-8888-2222-9ca27a381c03",
    schemaId: "wigo:workflow:diagnostic",
  },
] as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];
export type WorkflowStepId = WorkflowStep["id"];

export const STEP_COUNT = WORKFLOW_STEPS.length;
