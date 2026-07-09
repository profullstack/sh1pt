import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ApiIR, Operation } from '../core/types.js';

export interface GenerateDocsOptions {
  outDir: string;
  brandColor?: string;
}

export interface GeneratedFile {
  path: string;
  contents: string;
}

// Emits a flat folder of markdown pages plus sidebar.json. Output is
// intentionally framework-neutral — sh1pt's existing web targets
// (Cloudflare Pages / Netlify / Vercel) deploy any static dir, and any
// docs renderer that consumes a sidebar can pick this up. v0 does not
// emit a renderer; that's the job of the deploy target.
export async function generateDocsSite(ir: ApiIR, opts: GenerateDocsOptions): Promise<GeneratedFile[]> {
  const files = render(ir, opts);
  await mkdir(opts.outDir, { recursive: true });
  for (const f of files) {
    await mkdir(join(opts.outDir, dirOf(f.path)), { recursive: true });
    await writeFile(join(opts.outDir, f.path), f.contents, 'utf8');
  }
  return files;
}

function render(ir: ApiIR, _opts: GenerateDocsOptions): GeneratedFile[] {
  const groups = groupByTag(ir.operations);

  const overview = `# ${ir.title}

Version \`${ir.version}\`

${ir.description ?? ''}

${ir.servers.length ? `## Servers\n\n${ir.servers.map((s) => `- \`${s}\``).join('\n')}\n` : ''}
## Endpoints

${Object.entries(groups)
  .map(([tag, ops]) => `### ${tag}\n\n${ops.map((o) => `- [\`${o.method.toUpperCase()} ${o.path}\`](./${slug(tag)}/${slug(o.id)}.md) — ${o.summary ?? ''}`).join('\n')}`)
  .join('\n\n')}
`;

  const opPages: GeneratedFile[] = [];
  for (const [tag, ops] of Object.entries(groups)) {
    for (const op of ops) {
      opPages.push({ path: `${slug(tag)}/${slug(op.id)}.md`, contents: renderOpPage(op) });
    }
  }

  const sidebar = {
    title: ir.title,
    version: ir.version,
    groups: Object.entries(groups).map(([tag, ops]) => ({
      label: tag,
      pages: ops.map((o) => ({
        label: o.id,
        method: o.method.toUpperCase(),
        path: o.path,
        href: `${slug(tag)}/${slug(o.id)}.md`,
      })),
    })),
  };

  return [
    { path: 'index.md', contents: overview },
    { path: 'sidebar.json', contents: JSON.stringify(sidebar, null, 2) + '\n' },
    ...opPages,
  ];
}

function renderOpPage(op: Operation): string {
  const params = op.parameters.length
    ? `## Parameters\n\n| Name | In | Required | Description |\n|---|---|---|---|\n${op.parameters
        .map((p) => `| \`${p.name}\` | ${p.in} | ${p.required ? 'yes' : 'no'} | ${(p.description ?? '').replace(/\|/g, '\\|')} |`)
        .join('\n')}\n`
    : '';

  const body = op.requestBody
    ? `## Request body\n\n- Content-Type: \`${op.requestBody.contentType}\`\n- Required: ${op.requestBody.required ? 'yes' : 'no'}\n\n\`\`\`json\n${JSON.stringify(op.requestBody.schema ?? {}, null, 2)}\n\`\`\`\n`
    : '';

  const responses = op.responses.length
    ? `## Responses\n\n${op.responses
        .map((r) => `### \`${r.status}\`${r.description ? ` — ${r.description}` : ''}${r.schema ? `\n\n\`\`\`json\n${JSON.stringify(r.schema, null, 2)}\n\`\`\`` : ''}`)
        .join('\n\n')}\n`
    : '';

  return `# \`${op.method.toUpperCase()} ${op.path}\`

${op.summary ? `**${op.summary}**\n\n` : ''}${op.description ?? ''}

${params}${body}${responses}`;
}

function groupByTag(ops: Operation[]): Record<string, Operation[]> {
  const out: Record<string, Operation[]> = {};
  for (const op of ops) {
    const tag = op.tags[0] ?? 'default';
    (out[tag] ??= []).push(op);
  }
  return out;
}

function slug(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function dirOf(p: string): string { const i = p.lastIndexOf('/'); return i < 0 ? '.' : p.slice(0, i); }
