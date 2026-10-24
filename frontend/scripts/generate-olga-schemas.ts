/**
 * Régénère les instantanés JSON Schema des formulaires OLGA.
 *
 *   npm run olga:schemas            # OLGA sur http://localhost:9091
 *   OLGA_API_URL=http://olga:9091 npm run olga:schemas
 *
 * Les fichiers produits dans `src/features/workflow/schemas/` sont versionnés :
 * ils servent de repli lorsque OLGA est indisponible, et rendent tout
 * changement de formulaire visible dans une revue de code.
 *
 * Le script réutilise exactement l'adaptateur de l'application — aucune
 * logique de conversion n'est dupliquée ici.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { olgaToJsonSchema } from "../src/features/workflow/olga/olgaAdapter";
import { WORKFLOW_STEPS } from "../src/features/workflow/steps";

const OLGA_API_URL = process.env.OLGA_API_URL ?? "http://localhost:9091";
// Resolu depuis le repertoire de travail : le script s'execute depuis `frontend/`.
const OUT_DIR = join(process.cwd(), "src", "features", "workflow", "schemas");

async function main(): Promise<void> {
  let failures = 0;

  for (const step of WORKFLOW_STEPS) {
    const url = `${OLGA_API_URL}/forms/getFromID/${step.olgaFormId}`;
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const raw = JSON.parse(await response.text());
      if (raw?.error) throw new Error(String(raw.error));

      const { schema, unsupported } = olgaToJsonSchema(raw, step.schemaId);
      const target = join(OUT_DIR, `${step.id}.json`);
      writeFileSync(target, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

      const count = schema["x-order"].length;
      console.log(`OK   ${step.id.padEnd(12)} ${count} champ(s) -> ${step.id}.json`);
      for (const field of unsupported) {
        console.warn(`     champ ignore : ${field.key} (field_type=${field.type})`);
      }
    } catch (error) {
      failures += 1;
      console.error(
        `ECHEC ${step.id.padEnd(12)} ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} formulaire(s) non regenere(s). Instantanes precedents conserves.`);
    process.exitCode = 1;
  }
}

void main();
