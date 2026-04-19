import { z } from 'zod';

export const targetSpecSchema = z.object({
  use: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
  distribute: z.array(z.string()).optional(),
});

export const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  channels: z.array(z.string()).default(['stable', 'beta', 'canary']),
  targets: z.record(targetSpecSchema),
  hooks: z
    .object({
      prebuild: z.string().optional(),
      postbuild: z.string().optional(),
      preship: z.string().optional(),
      postship: z.string().optional(),
    })
    .optional(),
  cloud: z
    .object({
      project: z.string().optional(),
      org: z.string().optional(),
      apiUrl: z.string().url().default('https://api.sh1pt.dev'),
    })
    .optional(),
});

export type TargetSpec = z.infer<typeof targetSpecSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

export function defineConfig(m: Manifest): Manifest {
  return manifestSchema.parse(m);
}
