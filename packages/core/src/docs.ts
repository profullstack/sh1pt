import { autoSetup } from './setup-helpers.js';

// Document generation — pitch decks (.pptx / .pdf), one-pagers,
// investor memos, sales collateral. The marketing side of promote
// wants a generator that produces assets on demand.

export type DocKind =
  | 'pitch-deck'           // Google Slides / PPTX / Keynote
  | 'one-pager'            // PDF single-page summary
  | 'sales-deck'           // longer pitch for enterprise
  | 'case-study'           // customer success PDF
  | 'press-kit'            // ZIP with logo + screenshots + boilerplate
  | 'whitepaper'           // technical long-form
  | 'proposal'             // contract/SOW
  | 'invoice'              // PDF receipt
  | 'contract';            // SOW / NDA / MSA templates

export type DocFormat = 'pdf' | 'pptx' | 'docx' | 'html' | 'md' | 'pages' | 'keynote';

export interface DocSpec {
  kind: DocKind;
  title: string;
  subtitle?: string;
  author?: string;
  format: DocFormat;
  // Content. Markdown is the lowest-common denominator; generators that
  // need richer structure (Google Slides) parse the markdown into slides
  // (split on '---').
  markdown?: string;
  // Optional template reference — many providers have hosted templates
  // keyed by id (e.g. a Google Slides template doc id to copy, a Marp
  // theme name, a Canva template id).
  templateId?: string;
  variables?: Record<string, string>;   // template interpolation — {{tagline}} etc.
  // Asset paths or URLs the generator should embed.
  assets?: { logo?: string; coverImage?: string; screenshots?: string[] };
}

export interface DocResult {
  id: string;                      // provider-native doc id
  url?: string;                    // public URL (if hosted) or download link
  localPath?: string;              // where a local file was written
  format: DocFormat;
}

export interface DocProvider<Config = unknown> {
  id: string;                      // 'docs-lumin', 'docs-gslides', 'docs-marp', etc.
  label: string;
  supports: DocFormat[];
  generate(
    ctx: { secret(k: string): string | undefined; log(m: string): void; dryRun: boolean },
    spec: DocSpec,
    config: Config,
  ): Promise<DocResult>;
  // Optional: convert a hosted doc to another format (e.g. Google Slides → PDF).
  convert?(
    ctx: { secret(k: string): string | undefined; log(m: string): void; dryRun: boolean },
    sourceId: string,
    to: DocFormat,
    config: Config,
  ): Promise<DocResult>;
}

export function defineDocs<Config>(d: DocProvider<Config>): DocProvider<Config> {
  return autoSetup(d);
}

const docRegistry = new Map<string, DocProvider<any>>();

export function registerDocProvider(d: DocProvider<any>): void {
  if (docRegistry.has(d.id)) throw new Error(`Doc provider already registered: ${d.id}`);
  docRegistry.set(d.id, d);
}

export function getDocProvider(id: string): DocProvider<any> | undefined {
  return docRegistry.get(id);
}

export function listDocProviders(): DocProvider<any>[] {
  return [...docRegistry.values()];
}
