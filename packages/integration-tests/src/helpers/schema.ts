/**
 * JSON Schema (2020-12) validation for tool inputSchemas — catches zod-to-json-schema
 * conversion regressions that would otherwise only surface as a confusing client-side
 * failure well downstream of the server.
 */
// Named import, not default — ajv is a CJS package with no "exports" map, and under
// this project's Node16 module resolution a default import resolves to the whole
// CJS namespace object (not constructable) rather than the Ajv2020 class itself.
import { Ajv2020 } from 'ajv/dist/2020.js';

export function createAjv(): Ajv2020 {
  // strict:false — fixture/plugin schemas are plain, but we're validating arbitrary
  // zod-to-json-schema output here, not authoring schemas ourselves; we don't want
  // ajv's strict-mode style nits to fail this check.
  return new Ajv2020({ strict: false, allErrors: true });
}

/** Throws with a readable message if `schema` isn't a valid 2020-12 JSON Schema. */
export function assertValidJsonSchema(ajv: Ajv2020, schema: object, label: string): void {
  const valid = ajv.validateSchema(schema);
  if (!valid) {
    const errors = ajv.errors?.map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; ');
    throw new Error(`inputSchema for "${label}" is not a valid JSON Schema (2020-12): ${errors}`);
  }
}
