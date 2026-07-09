import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  appId: string;             // Partner Center app identity (e.g. Acme.MyApp)
  publisherId: string;       // e.g. "CN=12345678-90ab-cdef-..."
  // 'msstore' = Microsoft Store (MSIX), 'msi' = direct MSI distribution, 'both'
  distribution: 'msstore' | 'msi' | 'both';
  signingCertThumbprint?: string;
  architectures?: ('x64' | 'arm64' | 'x86')[];
}

type WindowsArtifactKind = 'msixbundle' | 'msi';
const DISTRIBUTIONS = ['msstore', 'msi', 'both'] as const;

interface WindowsPackagePlan {
  appId: string;
  publisherId: string;
  version: string;
  distribution: Config['distribution'];
  architectures: Array<NonNullable<Config['architectures']>[number]>;
  artifacts: Array<{
    kind: WindowsArtifactKind;
    path: string;
  }>;
  commands: Array<{
    tool: string;
    args: string[];
    needsSigningCert: boolean;
  }>;
}

function safeFileStem(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'windows-app';
}

function requireDistribution(config: Config): Config['distribution'] {
  if (DISTRIBUTIONS.includes(config.distribution as Config['distribution'])) {
    return config.distribution as Config['distribution'];
  }
  throw new Error(`desktop-win distribution must be one of: ${DISTRIBUTIONS.join(', ')}`);
}

function artifactKinds(distribution: Config['distribution']): WindowsArtifactKind[] {
  if (distribution === 'both') return ['msixbundle', 'msi'];
  return [distribution === 'msi' ? 'msi' : 'msixbundle'];
}

function buildPlan(ctx: { outDir: string; version: string }, config: Config): WindowsPackagePlan {
  const distribution = requireDistribution(config);
  const architectures = config.architectures ?? ['x64', 'arm64'];
  const baseName = `${safeFileStem(config.appId)}-${safeFileStem(ctx.version)}`;
  const artifacts = artifactKinds(distribution).map((kind) => ({
    kind,
    path: join(ctx.outDir, 'windows', `${baseName}.${kind}`),
  }));
  const needsSigningCert = !config.signingCertThumbprint;
  const commands = artifacts.flatMap((artifact) => {
    if (artifact.kind === 'msixbundle') {
      return [
        {
          tool: 'makeappx',
          args: ['pack', '/d', join(ctx.outDir, 'windows', 'msix'), '/p', artifact.path],
          needsSigningCert: false,
        },
        {
          tool: 'signtool',
          args: [
            'sign',
            '/fd',
            'SHA256',
            ...(config.signingCertThumbprint ? ['/sha1', config.signingCertThumbprint] : ['<certificate-thumbprint>']),
            artifact.path,
          ],
          needsSigningCert,
        },
      ];
    }
    return [
      {
        tool: 'wix',
        args: ['build', join(ctx.outDir, 'windows', `${baseName}.wxs`), '-arch', architectures.join(','), '-out', artifact.path],
        needsSigningCert: false,
      },
      {
        tool: 'signtool',
        args: [
          'sign',
          '/fd',
          'SHA256',
          ...(config.signingCertThumbprint ? ['/sha1', config.signingCertThumbprint] : ['<certificate-thumbprint>']),
          artifact.path,
        ],
        needsSigningCert,
      },
    ];
  });

  return {
    appId: config.appId,
    publisherId: config.publisherId,
    version: ctx.version,
    distribution,
    architectures,
    artifacts,
    commands,
  };
}

function planPath(ctx: { outDir: string; version: string }, appId: string): string {
  return join(ctx.outDir, 'windows', `${safeFileStem(appId)}-${safeFileStem(ctx.version)}.package-plan.json`);
}

export default defineTarget<Config>({
  id: 'desktop-win',
  kind: 'desktop',
  label: 'Windows (Microsoft Store / MSIX / MSI)',
  async build(ctx, config) {
    const plan = buildPlan(ctx, config);
    ctx.log(`build ${config.distribution} · arches=${plan.architectures.join(',')}`);
    if (ctx.dryRun) {
      const artifact = planPath(ctx, config.appId);
      await mkdir(join(ctx.outDir, 'windows'), { recursive: true });
      await writeFile(artifact, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
      ctx.log(`windows: dry-run package plan written to ${artifact}`);
      return { artifact, meta: { artifacts: plan.artifacts, commands: plan.commands } };
    }
    // TODO:
    //  - MSIX: makeappx pack + signtool sign using signingCertThumbprint
    //  - MSI: WiX toolset → .msi → signtool sign
    // Requires Windows runner; cloud builds route to a windows worker.
    const ext = plan.distribution === 'msi' ? 'msi' : 'msixbundle';
    return { artifact: `${ctx.outDir}/app.${ext}` };
  },
  async ship(ctx, config) {
    const distribution = requireDistribution(config);
    ctx.log(`publish ${config.appId}@${ctx.version} · distribution=${config.distribution}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO:
    //  - msstore: Partner Center submission API (create submission → upload → commit)
    //  - msi: upload to configured CDN/GitHub release + update winget manifest via pkg-winget
    return {
      id: `${config.appId}@${ctx.version}`,
      url: distribution !== 'msi' ? `https://apps.microsoft.com/detail/${config.appId}` : undefined,
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "Microsoft Store (Windows)",
    vendorDocUrl: "https://partner.microsoft.com/dashboard",
    steps: [
      "Register at partner.microsoft.com ($19 individual / $99 company)",
      "Complete identity verification (1-3 days)",
      "Create an Azure AD app \u2192 generate client_secret",
      "Run: sh1pt secret set MS_STORE_TENANT_ID <uuid>",
      "Run: sh1pt secret set MS_STORE_CLIENT_ID <uuid>",
      "Run: sh1pt secret set MS_STORE_CLIENT_SECRET <secret>",
    ],
  }),
});
