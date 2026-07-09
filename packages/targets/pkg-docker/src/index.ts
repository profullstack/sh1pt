import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// OCI image distribution to any compliant registry: Docker Hub, GHCR,
// GitLab Registry, Quay, AWS ECR, GCP Artifact Registry, Azure ACR,
// self-hosted. Multi-arch via buildx.
type Registry = 'dockerhub' | 'ghcr' | 'gitlab' | 'quay' | 'ecr' | 'gcr' | 'acr' | 'custom';

interface Config {
  image: string;                                           // e.g. 'acme/myapp'
  registries: { kind: Registry; host?: string }[];         // multi-push
  dockerfile?: string;
  platforms?: string[];                                    // e.g. ['linux/amd64','linux/arm64']
  context?: string;
  tags?: string[];                                         // extra tags beyond ctx.version + 'latest'
  target?: string;
  buildArgs?: Record<string, string>;
  labels?: Record<string, string>;
}

const HOST: Record<Registry, string> = {
  dockerhub: 'docker.io',
  ghcr: 'ghcr.io',
  gitlab: 'registry.gitlab.com',
  quay: 'quay.io',
  ecr: '<account>.dkr.ecr.<region>.amazonaws.com',
  gcr: '<region>-docker.pkg.dev',
  acr: '<registry>.azurecr.io',
  custom: '<configure host>',
};

function versionTag(version: string): string {
  return version.replace(/^v/, '');
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || 'image';
}

function normalizeHost(registry: { kind: Registry; host?: string }): string {
  const host = registry.host ?? HOST[registry.kind];
  if (host.includes('<')) {
    throw new Error(`pkg-docker requires a host for ${registry.kind} registry`);
  }
  return host.replace(/\/+$/, '');
}

function tagValue(tag: string, version: string): string {
  const normalized = versionTag(version);
  return tag
    .replaceAll('{{version}}', normalized)
    .replaceAll('{version}', normalized)
    .replaceAll('$version', normalized);
}

function imageRefs(ctx: { version: string }, config: Config): string[] {
  const tags = [versionTag(ctx.version), 'latest', ...(config.tags ?? []).map((tag) => tagValue(tag, ctx.version))];
  const uniqueTags = [...new Set(tags.filter(Boolean))];
  return config.registries.flatMap((registry) => {
    const host = normalizeHost(registry);
    return uniqueTags.map((tag) => `${host}/${config.image}:${tag}`);
  });
}

function buildxArgs(
  ctx: { outDir: string; projectDir: string; version: string },
  config: Config,
  opts: { push: boolean },
): string[] {
  const platforms = config.platforms ?? ['linux/amd64', 'linux/arm64'];
  const context = config.context ?? '.';
  const dockerfile = config.dockerfile ?? 'Dockerfile';
  const args = [
    'buildx',
    'build',
    `--platform=${platforms.join(',')}`,
    `--file=${dockerfile}`,
  ];

  for (const ref of imageRefs(ctx, config)) {
    args.push(`--tag=${ref}`);
  }
  for (const [key, value] of Object.entries(config.buildArgs ?? {})) {
    args.push(`--build-arg=${key}=${value}`);
  }
  for (const [key, value] of Object.entries(config.labels ?? {})) {
    args.push(`--label=${key}=${value}`);
  }
  if (config.target) {
    args.push(`--target=${config.target}`);
  }

  if (opts.push) {
    args.push('--push');
  } else {
    args.push(`--metadata-file=${join(ctx.outDir, 'docker-build-metadata.json')}`);
    args.push(`--output=type=oci,dest=${join(ctx.outDir, `${safeFilename(config.image)}-${versionTag(ctx.version)}.oci.tar`)}`);
  }

  args.push(context);
  return args;
}

export default defineTarget<Config>({
  id: 'pkg-docker',
  kind: 'package-manager',
  label: 'Container registries (Docker Hub / GHCR / Quay / ECR / GCR / ACR)',
  async build(ctx, config) {
    const platforms = config.platforms ?? ['linux/amd64', 'linux/arm64'];
    const refs = imageRefs(ctx, config);
    const planPath = join(ctx.outDir, 'docker-build-plan.json');
    const localArgs = buildxArgs(ctx, config, { push: false });
    const pushArgs = buildxArgs(ctx, config, { push: true });
    const plan = {
      image: config.image,
      version: versionTag(ctx.version),
      context: config.context ?? '.',
      dockerfile: config.dockerfile ?? 'Dockerfile',
      platforms,
      refs,
      commands: {
        buildLocal: ['docker', ...localArgs],
        push: ['docker', ...pushArgs],
      },
    };

    ctx.log(`prepare docker buildx plan for ${config.image}:${versionTag(ctx.version)}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
    return { artifact: planPath, meta: { image: config.image, refs, platforms } };
  },
  async ship(ctx, config) {
    const pushes = imageRefs(ctx, config);
    const args = buildxArgs(ctx, config, { push: true });
    ctx.log(`docker buildx push:\n  ${pushes.join('\n  ')}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { pushes, command: ['docker', ...args] } };

    await exec('docker', args, {
      cwd: ctx.projectDir,
      env: ctx.env,
      log: ctx.log,
      throwOnNonZero: true,
    });

    return { id: `${config.image}@${versionTag(ctx.version)}`, meta: { pushes } };
  },
  async status(id) {
    const [image, version] = id.split('@');
    return { state: 'live', version, message: `${image} image pushed` };
  },

  setup: manualSetup({
    label: "Docker registries (Hub / GHCR / Quay / ECR)",
    vendorDocUrl: "https://hub.docker.com/settings/security",
    steps: [
      "Docker Hub: hub.docker.com \u2192 Security \u2192 New Access Token",
      "Run: sh1pt secret set DOCKERHUB_ACCESS_TOKEN <token>",
      "GHCR: GITHUB_TOKEN with write:packages scope works",
    ],
  }),
});
