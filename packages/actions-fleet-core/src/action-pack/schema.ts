import { z } from 'zod';

const PACK_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export const packIdSchema = z.string().regex(PACK_ID_RE, 'must be lowercase kebab-case');
export const semverSchema = z.string().regex(SEMVER_RE, 'must be semver (x.y.z)');

export const packCategorySchema = z.enum([
  'ci',
  'test',
  'security',
  'release',
  'deploy',
  'package-publish',
  'agent',
  'repo-hygiene',
  'observability',
  'monorepo',
  'node',
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'bun',
  'docker',
]);

export const inputDefSchema = z
  .object({
    type: z.literal('string'),
    default: z.string().optional(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    enum: z.array(z.string()).min(1).optional(),
  })
  .strict();

export const secretRefSchema = z
  .object({
    name: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'must be UPPER_SNAKE_CASE'),
    description: z.string().optional(),
    required: z.boolean().optional(),
  })
  .strict();

export const repoVariableSchema = secretRefSchema;

export const mergeStrategySchema = z.enum(['replace-managed', 'create-only']);

export const fileSpecSchema = z
  .object({
    source: z.string().min(1),
    destination: z.string().min(1),
    mergeStrategy: mergeStrategySchema,
  })
  .strict();

export const compatibilitySchema = z
  .object({
    providers: z.array(z.enum(['github', 'gitlab', 'gitea'])).min(1),
    languages: z.array(z.string()).optional(),
    packageManagers: z.array(z.string()).optional(),
    frameworks: z.array(z.string()).optional(),
  })
  .strict();

export const pricingSchema = z
  .object({
    type: z.enum(['free', 'paid', 'included']),
  })
  .strict();

export const policiesSchema = z
  .object({
    installMode: z.enum(['pull-request', 'local', 'direct-commit']),
    managedComment: z.boolean(),
    requiresReview: z.boolean(),
  })
  .strict();

export const securitySchema = z
  .object({
    leastPrivilegePermissions: z.boolean(),
    pinThirdPartyActions: z.enum(['required', 'optional', 'off']),
    allowPullRequestTarget: z.boolean(),
    defaultTimeoutMinutes: z.number().int().positive(),
  })
  .strict();

export const testFixtureSchema = z
  .object({
    name: z.string(),
    input: z.string(),
    expectedFiles: z.array(z.string()),
  })
  .strict();

export const testsSchema = z
  .object({
    fixtures: z.array(testFixtureSchema).optional(),
  })
  .strict();

export const actionPackManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: packIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    version: semverSchema,
    publisher: z.string().min(1),
    visibility: z.enum(['public', 'private', 'unlisted']),
    license: z.string().min(1),
    categories: z.array(packCategorySchema).min(1),
    compatibility: compatibilitySchema,
    pricing: pricingSchema,
    inputs: z.record(z.string(), inputDefSchema).default({}),
    secrets: z.array(secretRefSchema).default([]),
    repoVariables: z.array(repoVariableSchema).default([]),
    files: z.array(fileSpecSchema).min(1),
    policies: policiesSchema,
    security: securitySchema,
    tests: testsSchema.optional(),
  })
  .strict();

export type ActionPackManifest = z.infer<typeof actionPackManifestSchema>;
export type ActionPackInputDef = z.infer<typeof inputDefSchema>;
export type ActionPackFileSpec = z.infer<typeof fileSpecSchema>;
export type ActionPackSecret = z.infer<typeof secretRefSchema>;
