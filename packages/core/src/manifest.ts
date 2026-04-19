import { z } from 'zod';

export const targetSpecSchema = z.object({
  use: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
  distribute: z.array(z.string()).optional(),
});

export const creativeSchema = z.object({
  headline: z.string(),
  description: z.string(),
  cta: z.string().optional(),
  image: z.string().optional(),
  video: z.string().optional(),
  overrides: z.record(z.object({
    headline: z.string().optional(),
    description: z.string().optional(),
    cta: z.string().optional(),
    image: z.string().optional(),
    video: z.string().optional(),
  })).optional(),
});

export const promoPlatformSpecSchema = z.object({
  use: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});

export const promoSchema = z.object({
  platforms: z.record(promoPlatformSpecSchema).default({}),
  defaultBudget: z.object({
    amount: z.number().positive(),
    currency: z.string().default('USD'),
    cadence: z.enum(['daily', 'lifetime']).default('daily'),
  }).optional(),
  objective: z.enum(['install', 'web-traffic', 'awareness', 'engagement', 'signup', 'purchase']).default('install'),
  creatives: z.array(creativeSchema).default([]),
  targeting: z.object({
    geo: z.array(z.string()).optional(),
    age: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
    genders: z.array(z.enum(['male', 'female', 'all'])).optional(),
    interests: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    devices: z.array(z.enum(['ios', 'android', 'desktop', 'web'])).optional(),
  }).optional(),
});

export const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  channels: z.array(z.string()).default(['stable', 'beta', 'canary']),
  targets: z.record(targetSpecSchema),
  promo: promoSchema.optional(),
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
