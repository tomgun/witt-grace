// The subset of JSON Schema (draft 2020-12) the import preflight understands: exactly the keywords the prototype's
// `import-validation.js` walks. A schema here is a diagnostic aid for the person fixing a file, never the authority;
// parseProject, parseAiDraft and parseContributionBundle decide what is accepted.
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  $ref?: string;
  anyOf?: JsonSchema[];
  type?: string | string[];
  const?: unknown;
  enum?: readonly unknown[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  maxProperties?: number;
  required?: readonly string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  $defs?: Record<string, JsonSchema>;
}
