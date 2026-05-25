import { Command } from 'commander';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import kleur from 'kleur';

type SkillManifest = {
  name: string;
  title: string;
  description: string;
  tagline?: string;
  category?: string;
  tags: string[];
  price: number;
  skillFile: string;
  sourceUrl?: string;
  marketplaces: Record<string, { enabled: boolean; status: 'pending' | 'published' | 'manual' | 'skipped'; url?: string; command?: string; note?: string }>;
};

export type BuiltinSkillManifest = {
  name: string;
  publisher: string;
  type: 'skill';
  version: string;
  title: string;
  description: string;
  trustLevel: 'official' | 'verified' | 'community' | 'experimental' | 'untrusted';
  guide: string;
  targets: string[];
};

export type BuiltinSkillEntry = {
  manifest: BuiltinSkillManifest;
  skillDir: string;
  guidePath: string;
  content: string;
};

export type SkillInstallAction = 'create' | 'append' | 'update-managed';

export type SkillInstallPlan = {
  destination: string;
  target: string;
  action: SkillInstallAction;
  content: string;
};

const MARKETPLACES = [
  { id: 'ugig', name: 'uGig', method: 'CLI/API', readiness: 'live', command: (m: SkillManifest) => `ugig skills new --title ${q(m.title)} --description ${q(m.description)} --category ${q(m.category ?? 'Automation')} --price ${m.price} --tags ${q(m.tags.join(','))}${m.sourceUrl ? ` --source-url ${q(m.sourceUrl)}` : ''}` },
  { id: 'clawhub', name: 'ClawHub', method: 'CLI', readiness: 'live', command: (m: SkillManifest) => `npm exec --package=clawhub@latest -- clawhub skill publish . --slug ${q(m.name)} --name ${q(m.title)} --version 1.0.0 --tags latest,automation` },
  { id: 'skills-sh', name: 'skills.sh / OpenClaw skills index', method: 'GitHub PR', readiness: 'manual', note: 'Submit to openclaw/skills when maintainers allow PRs, or share a compare branch. Public SKILL.md repo remains importable.' },
  { id: 'lobehub', name: 'LobeHub / Lobe Chat Agents', method: 'GitHub PR', readiness: 'manual', note: 'Submit a compatible Lobe Chat agent entry pointing at the public SKILL.md/repo; this is an agent index, not native SKILL.md hosting.' },
  { id: 'goose', name: 'Goose Skills', method: 'GitHub PR', readiness: 'manual', note: 'Add a skills/capabilities/<slug>/SKILL.md plus skill.meta.json entry to gooseworks-ai/goose-skills.' },
  { id: 'kilo', name: 'Kilo Marketplace', method: 'GitHub PR', readiness: 'manual', command: (m: SkillManifest) => `npx tsx bin/add-remote-skill.ts ${m.sourceUrl ?? m.skillFile}` },
  { id: 'skillstore', name: 'AI Skillstore', method: 'GitHub PR', readiness: 'manual', note: 'Add one skill directory per skill to aiskillstore/marketplace and run its validator before opening a PR.' },
  { id: 'freemygent', name: 'FreeMyGent', method: 'Wallet/on-chain', readiness: 'constrained', note: 'Requires wallet connect/listing transaction; no normal public API-key path found.' },
  { id: 'clawmart', name: 'ClawMart', method: 'Paid creator API', readiness: 'constrained', note: 'Requires shopclawmart.com Creator Membership and CLAWMART_API_KEY; then use the ClawMart publisher script/API.' },
  { id: 'manus', name: 'Manus Agent Skills', method: 'GitHub import', readiness: 'manual', note: 'Use a public GitHub repo containing SKILL.md files; Manus imports from GitHub.' },
  { id: 'vscode-agent-skills', name: 'VS Code Agent Skills', method: 'GitHub PR', readiness: 'manual', note: 'Submit repo/source entries to formulahendry/vscode-agent-skills for extension indexing.' },
  { id: 'moltbook', name: 'Moltbook / NormieClaw', method: 'Issue/PR', readiness: 'manual', note: 'Submit an index request or PR to Moltbook-Official/moltbook with public skill URLs.' },
  { id: 'agenthub', name: 'AgentHub / agentskillsmarket.space', method: 'Account import', readiness: 'manual', note: 'Requires account email confirmation, then import the public GitHub skill repo from the submit page.' },
] as const;

const BUILTIN_SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills');

const SKILL_TARGETS = {
  'agents-md': 'AGENTS.md',
  claude: 'CLAUDE.md',
  copilot: '.github/copilot-instructions.md',
  cursor: '.cursor/rules/{{name}}.mdc',
  codex: '.codex/{{name}}.md',
  openclaw: '.openclaw/{{name}}.md',
  goose: '.goose/{{name}}.md',
} as const;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'my-skill';
}
function q(s: string): string { return JSON.stringify(s); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
function frontmatterValue(text: string, key: string): string | undefined {
  const m = text.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm'));
  return m?.[1]?.trim();
}
async function inferFromSkill(file: string): Promise<Partial<SkillManifest>> {
  if (!(await exists(file))) return {};
  const text = await readFile(file, 'utf8');
  const name = frontmatterValue(text, 'name');
  const description = frontmatterValue(text, 'description');
  const title = name ? name.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ') : undefined;
  return { name, title, description };
}
async function loadManifest(path = 'sh1pt.skill.json'): Promise<SkillManifest> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as SkillManifest;
}
async function saveManifest(path: string, manifest: SkillManifest): Promise<void> {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function normalizeText(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

export async function loadBuiltinSkills(): Promise<Map<string, BuiltinSkillEntry>> {
  const catalog = new Map<string, BuiltinSkillEntry>();
  const entries = await readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(BUILTIN_SKILLS_DIR, entry.name);
    const manifestPath = join(skillDir, 'sh1pt.skill.json');
    if (!(await exists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BuiltinSkillManifest;
    const guidePath = join(skillDir, manifest.guide);
    const content = normalizeText(await readFile(guidePath, 'utf8'));
    catalog.set(manifest.name, { manifest, skillDir, guidePath, content });
  }
  return catalog;
}

async function getBuiltinSkill(name: string): Promise<BuiltinSkillEntry> {
  const catalog = await loadBuiltinSkills();
  const entry = catalog.get(name);
  if (!entry) {
    const available = [...catalog.keys()].sort().join(', ') || '(none)';
    throw new Error(`skill "${name}" not found. Available: ${available}`);
  }
  return entry;
}

function formatSkillRows(entries: BuiltinSkillEntry[], json?: boolean): void {
  const rows = entries
    .map(({ manifest }) => ({
      name: manifest.name,
      title: manifest.title,
      version: manifest.version,
      trustLevel: manifest.trustLevel,
      description: manifest.description,
      targets: manifest.targets,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log(kleur.dim('(no built-in skills)'));
    return;
  }

  for (const row of rows) {
    console.log(`${kleur.bold(row.name)} ${kleur.dim(`v${row.version}`)} ${kleur.cyan(`[${row.trustLevel}]`)}`);
    console.log(`  ${row.title} — ${row.description}`);
    console.log(`  ${kleur.dim('targets:')} ${row.targets.join(', ')}`);
    console.log();
  }
}

function skillMarkers(name: string): { start: string; end: string } {
  return {
    start: `<!-- sh1pt-skill:${name} start -->`,
    end: `<!-- sh1pt-skill:${name} end -->`,
  };
}

export function resolveSkillTargetPath(target: string, skillName: string): string {
  const template = SKILL_TARGETS[target as keyof typeof SKILL_TARGETS];
  if (!template) {
    const available = Object.keys(SKILL_TARGETS).sort().join(', ');
    throw new Error(`unknown skill target "${target}". Available: ${available}`);
  }
  return template.replaceAll('{{name}}', skillName);
}

function renderSkillBlock(entry: BuiltinSkillEntry): string {
  const { manifest, content } = entry;
  const { start, end } = skillMarkers(manifest.name);
  return normalizeText([
    start,
    `## sh1pt skill: ${manifest.title}`,
    '',
    `_Installed from ${manifest.publisher}/${manifest.name}@${manifest.version} · trust: ${manifest.trustLevel}_`,
    '',
    content.trim(),
    end,
    '',
  ].join('\n'));
}

export function planSkillInstall(entry: BuiltinSkillEntry, target: string, existingContent?: string): SkillInstallPlan {
  const destination = resolveSkillTargetPath(target, entry.manifest.name);
  const block = renderSkillBlock(entry);
  const existing = existingContent === undefined ? undefined : normalizeText(existingContent);
  const { start, end } = skillMarkers(entry.manifest.name);

  if (existing === undefined) {
    return { destination, target, action: 'create', content: block };
  }

  if (existing.includes(start) && existing.includes(end)) {
    const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, 'm');
    return {
      destination,
      target,
      action: 'update-managed',
      content: normalizeText(existing.replace(pattern, block)),
    };
  }

  const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return {
    destination,
    target,
    action: 'append',
    content: normalizeText(`${existing}${separator}${block}`),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function printSkillStatusLine(destination: string, action: SkillInstallAction): void {
  const colorize = action === 'create' ? kleur.green : action === 'append' ? kleur.yellow : kleur.cyan;
  console.log(`  ${colorize(action.padEnd(20))} ${destination}`);
}

export const skillsCmd = new Command('skills')
  .description('Package, install, and promote SKILL.md agent skills across marketplaces');

skillsCmd
  .command('list')
  .description('List built-in skill packages available for installation')
  .option('--json', 'output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const catalog = await loadBuiltinSkills();
    formatSkillRows([...catalog.values()], opts.json);
  });

skillsCmd
  .command('search')
  .description('Search built-in skill packages')
  .argument('<query>', 'search text')
  .option('--json', 'output as JSON')
  .action(async (query: string, opts: { json?: boolean }) => {
    const needle = query.trim().toLowerCase();
    const catalog = await loadBuiltinSkills();
    const matches = [...catalog.values()].filter(({ manifest }) =>
      [manifest.name, manifest.title, manifest.description, manifest.trustLevel, ...manifest.targets]
        .some((value) => value.toLowerCase().includes(needle)));
    formatSkillRows(matches, opts.json);
  });

skillsCmd
  .command('info')
  .description('Show details for a built-in skill package')
  .argument('<name>', 'skill name')
  .option('--json', 'output as JSON')
  .action(async (name: string, opts: { json?: boolean }) => {
    const { manifest } = await getBuiltinSkill(name);
    if (opts.json) {
      console.log(JSON.stringify(manifest, null, 2));
      return;
    }

    console.log(kleur.bold(`${manifest.title} (${manifest.name}@${manifest.version})`));
    console.log(manifest.description);
    console.log();
    console.log(`${kleur.dim('publisher:')}   ${manifest.publisher}`);
    console.log(`${kleur.dim('trust level:')} ${manifest.trustLevel}`);
    console.log(`${kleur.dim('targets:')}     ${manifest.targets.join(', ')}`);
  });

skillsCmd
  .command('retrieve')
  .description('Print the contents of a built-in skill guide')
  .argument('<name>', 'skill name')
  .option('--json', 'output as JSON')
  .action(async (name: string, opts: { json?: boolean }) => {
    const entry = await getBuiltinSkill(name);
    if (opts.json) {
      console.log(JSON.stringify({ manifest: entry.manifest, content: entry.content }, null, 2));
      return;
    }
    process.stdout.write(entry.content);
  });

skillsCmd
  .command('install')
  .description('Install a built-in skill into an agent instruction file')
  .argument('<name>', 'skill name')
  .option('-r, --repo <dir>', 'target repo directory', '.')
  .option('--target <id>', 'install target (agents-md, claude, copilot, cursor, codex, openclaw, goose)', 'agents-md')
  .option('--dry-run', 'show planned changes without writing (default unless --yes)')
  .option('-y, --yes', 'actually write files')
  .option('--json', 'output as JSON')
  .action(async (name: string, opts: { repo: string; target: string; yes?: boolean; json?: boolean }) => {
    const entry = await getBuiltinSkill(name);
    const repoDir = resolve(opts.repo);
    const destination = join(repoDir, resolveSkillTargetPath(opts.target, entry.manifest.name));
    const existingContent = await exists(destination) ? await readFile(destination, 'utf8') : undefined;
    const plan = planSkillInstall(entry, opts.target, existingContent);
    const dryRun = !opts.yes;

    if (!dryRun) {
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, plan.content, 'utf8');
    }

    const result = { repoDir, ...plan, dryRun };
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const header = dryRun
      ? kleur.yellow(`Dry-run: ${entry.manifest.name}@${entry.manifest.version} → ${repoDir}`)
      : kleur.bold(`Install: ${entry.manifest.name}@${entry.manifest.version} → ${repoDir}`);
    console.log(header);
    console.log();
    printSkillStatusLine(plan.destination, plan.action);
    console.log(kleur.dim(`  target: ${plan.target}`));
    if (dryRun) {
      console.log();
      console.log(kleur.dim('Re-run with --yes to write changes.'));
    }
  });

skillsCmd
  .command('new')
  .alias('create')
  .description('Create sh1pt.skill.json metadata for a SKILL.md')
  .option('--skill-file <path>', 'Path to SKILL.md', 'SKILL.md')
  .option('--out <path>', 'Manifest output path', 'sh1pt.skill.json')
  .option('--name <slug>', 'Skill slug')
  .option('--title <title>', 'Listing title')
  .option('--description <text>', 'Listing description')
  .option('--tagline <text>', 'Short tagline')
  .option('--category <name>', 'Listing category', 'Automation')
  .option('--tags <csv>', 'Comma-separated tags', 'skills,automation')
  .option('--price <sats>', 'Price in sats; 0 = free', '0')
  .option('--source-url <url>', 'Public raw SKILL.md or repo URL')
  .action(async (opts: { skillFile: string; out: string; name?: string; title?: string; description?: string; tagline?: string; category: string; tags: string; price: string; sourceUrl?: string }) => {
    const skillFile = resolve(opts.skillFile);
    const inferred = await inferFromSkill(skillFile);
    const name = slugify(opts.name ?? inferred.name ?? basename(dirname(skillFile)));
    const title = opts.title ?? inferred.title ?? name;
    const description = opts.description ?? inferred.description ?? `Agent skill: ${title}`;
    const manifest: SkillManifest = {
      name,
      title,
      description,
      tagline: opts.tagline,
      category: opts.category,
      tags: opts.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10),
      price: Number.parseInt(opts.price, 10) || 0,
      skillFile,
      sourceUrl: opts.sourceUrl,
      marketplaces: Object.fromEntries(MARKETPLACES.map(mp => [mp.id, { enabled: true, status: 'pending', command: 'command' in mp && mp.command ? mp.command({ name, title, description, tagline: opts.tagline, category: opts.category, tags: opts.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10), price: Number.parseInt(opts.price, 10) || 0, skillFile, sourceUrl: opts.sourceUrl, marketplaces: {} }) : undefined, note: 'note' in mp ? mp.note : undefined }])) as SkillManifest['marketplaces'],
    };
    await mkdir(dirname(resolve(opts.out)), { recursive: true });
    await saveManifest(opts.out, manifest);
    console.log(kleur.green(`✓ wrote ${opts.out}`));
    console.log(`  next: ${kleur.cyan(`sh1pt skills publish --all --dry-run --manifest ${opts.out}`)}`);
  });

skillsCmd
  .command('publish')
  .description('Publish or print marketplace publish steps for a skill')
  .option('--manifest <path>', 'Skill promotion manifest', 'sh1pt.skill.json')
  .option('--marketplace <id...>', 'Specific marketplace ids')
  .option('--all', 'Target every known marketplace')
  .option('--dry-run', 'Print actions without invoking CLIs')
  .action(async (opts: { manifest: string; marketplace?: string[]; all?: boolean; dryRun?: boolean }) => {
    const manifest = await loadManifest(opts.manifest);
    const wanted = new Set(opts.all || !opts.marketplace?.length ? MARKETPLACES.map(m => m.id) : opts.marketplace);
    for (const mp of MARKETPLACES) {
      if (!wanted.has(mp.id)) continue;
      const entry = manifest.marketplaces[mp.id] ?? { enabled: true, status: 'pending' as const };
      const cmd = entry.command ?? ('command' in mp && mp.command ? mp.command(manifest) : undefined);
      console.log();
      console.log(kleur.bold(`${mp.name} (${mp.method} · ${mp.readiness})`));
      if (cmd) console.log(`  ${kleur.cyan(cmd)}`);
      if (entry.note || ('note' in mp && mp.note)) console.log(`  ${kleur.dim(entry.note ?? ('note' in mp ? mp.note : ''))}`);
      if (mp.readiness === 'manual') console.log(kleur.yellow('  next step: open the required PR/import/browser flow after preparing the assets above'));
      if (mp.readiness === 'constrained') console.log(kleur.yellow('  next step: satisfy the paid/wallet/platform requirement before attempting publication'));
      if (!opts.dryRun && cmd) {
        console.log(kleur.yellow('  not auto-executed yet; run the command above after login/API setup'));
      }
    }
  });

skillsCmd
  .command('marketplaces')
  .description('List known skill marketplaces')
  .option('--json', 'output as JSON')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      const output = MARKETPLACES.map((mp) => ({
        id: mp.id,
        name: mp.name,
        method: mp.method,
        readiness: mp.readiness,
      }));
      console.log(JSON.stringify(output, null, 2));
      return;
    }
    for (const mp of MARKETPLACES) console.log(`${mp.id}\t${mp.name}\t${mp.method}\t${mp.readiness}`);
  });
