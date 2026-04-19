import { defineTarget } from '@sh1pt/core';

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

export default defineTarget<Config>({
  id: 'pkg-docker',
  kind: 'package-manager',
  label: 'Container registries (Docker Hub / GHCR / Quay / ECR / GCR / ACR)',
  async build(ctx, config) {
    const platforms = (config.platforms ?? ['linux/amd64', 'linux/arm64']).join(',');
    ctx.log(`docker buildx build --platform=${platforms} --tag=${config.image}:${ctx.version}`);
    // TODO: docker buildx with --push=false, cache mount to ctx.outDir
    return { artifact: `${config.image}:${ctx.version}` };
  },
  async ship(ctx, config) {
    const pushes = config.registries.map((r) => `${r.host ?? HOST[r.kind]}/${config.image}:${ctx.version}`);
    ctx.log(`push:\n  ${pushes.join('\n  ')}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { pushes } };
    // TODO: docker login per registry, then buildx --push for all tags (version + latest + extras)
    return { id: `${config.image}:${ctx.version}`, meta: { pushes } };
  },
});
