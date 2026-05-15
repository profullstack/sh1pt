import { autoSetup } from './setup-helpers.js';

export type AutoblogPublishMode = 'draft' | 'publish';
export type AutoblogStatus = 'dry-run' | 'queued' | 'published' | 'failed';

export interface AutoblogArticle {
  title: string;
  bodyMarkdown: string;
  canonicalUrl?: string;
  sourceUrl?: string;
  excerpt?: string;
  tags?: string[];
  author?: string;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AutoblogResult {
  id: string;
  provider: string;
  status: AutoblogStatus;
  url?: string;
  submittedAt: string;
  responseStatus?: number;
  error?: string;
}

export interface AutoblogCapabilities {
  webhook: boolean;
  secretSigning?: boolean;
  draft?: boolean;
  scheduled?: boolean;
  canonicalUrl?: boolean;
  tags?: boolean;
}

export interface AutoblogProvider<Config = unknown> {
  id: string;
  label: string;
  capabilities: AutoblogCapabilities;
  publish(
    ctx: { secret(k: string): string | undefined; log(m: string): void; dryRun: boolean },
    article: AutoblogArticle,
    config: Config,
  ): Promise<AutoblogResult>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineAutoblog<Config>(provider: AutoblogProvider<Config>): AutoblogProvider<Config> {
  return autoSetup(provider);
}

const autoblogRegistry = new Map<string, AutoblogProvider<any>>();

export function registerAutoblogProvider(provider: AutoblogProvider<any>): void {
  if (autoblogRegistry.has(provider.id)) throw new Error(`Autoblog provider already registered: ${provider.id}`);
  autoblogRegistry.set(provider.id, provider);
}

export function getAutoblogProvider(id: string): AutoblogProvider<any> | undefined {
  return autoblogRegistry.get(id);
}

export function listAutoblogProviders(): AutoblogProvider<any>[] {
  return [...autoblogRegistry.values()];
}
