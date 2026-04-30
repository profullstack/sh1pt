import { Command } from 'commander';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
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

const MARKETPLACES = [
  { id: 'ugig', name: 'uGig', method: 'CLI/API', command: (m: SkillManifest) => `ugig skills new --title ${q(m.title)} --description ${q(m.description)} --category ${q(m.category ?? 'Automation')} --price ${m.price} --tags ${q(m.tags.join(','))}${m.sourceUrl ? ` --source-url ${q(m.sourceUrl)}` : ''}` },
  { id: 'clawhub', name: 'ClawHub', method: 'CLI', command: (m: SkillManifest) => `npm exec --package=clawhub@latest -- clawhub skill publish . --slug ${q(m.name)} --name ${q(m.title)} --version 1.0.0 --tags latest,automation` },
  { id: 'skills-sh', name: 'skills.sh / OpenClaw skills index', method: 'GitHub PR', note: 'Submit to openclaw/skills when maintainers allow PRs, or share a compare branch. Public SKILL.md repo remains importable.' },
  { id: 'lobehub', name: 'LobeHub / Lobe Chat Agents', method: 'GitHub PR', note: 'Submit a compatible Lobe Chat agent entry pointing at the public SKILL.md/repo; this is an agent index, not native SKILL.md hosting.' },
  { id: 'goose', name: 'Goose Skills', method: 'GitHub PR', note: 'Add a skills/capabilities/<slug>/SKILL.md plus skill.meta.json entry to gooseworks-ai/goose-skills.' },
  { id: 'kilo', name: 'Kilo Marketplace', method: 'GitHub PR', command: (m: SkillManifest) => `npx tsx bin/add-remote-skill.ts ${m.sourceUrl ?? m.skillFile}` },
  { id: 'skillstore', name: 'AI Skillstore', method: 'GitHub PR', note: 'Add one skill directory per skill to aiskillstore/marketplace and run its validator before opening a PR.' },
  { id: 'freemygent', name: 'FreeMyGent', method: 'Wallet/on-chain', note: 'Requires wallet connect/listing transaction; no normal public API-key path found.' },
  { id: 'clawmart', name: 'ClawMart', method: 'Paid creator API', note: 'Requires shopclawmart.com Creator Membership and CLAWMART_API_KEY; then use the ClawMart publisher script/API.' },
  { id: 'manus', name: 'Manus Agent Skills', method: 'GitHub import', note: 'Use a public GitHub repo containing SKILL.md files; Manus imports from GitHub.' },
  { id: 'vscode-agent-skills', name: 'VS Code Agent Skills', method: 'GitHub PR', note: 'Submit repo/source entries to formulahendry/vscode-agent-skills for extension indexing.' },
  { id: 'moltbook', name: 'Moltbook / NormieClaw', method: 'Issue/PR', note: 'Submit an index request or PR to Moltbook-Official/moltbook with public skill URLs.' },
  { id: 'agenthub', name: 'AgentHub / agentskillsmarket.space', method: 'Account import', note: 'Requires account email confirmation, then import the public GitHub skill repo from the submit page.' },
] as const;

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

export const skillsCmd = new Command('skills')
  .description('Package and promote SKILL.md agent skills across marketplaces');

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
      console.log(kleur.bold(`${mp.name} (${mp.method})`));
      if (cmd) console.log(`  ${kleur.cyan(cmd)}`);
      if (entry.note || ('note' in mp && mp.note)) console.log(`  ${kleur.dim(entry.note ?? ('note' in mp ? mp.note : ''))}`);
      if (!opts.dryRun && cmd) {
        console.log(kleur.yellow('  not auto-executed yet; run the command above after login/API setup'));
      }
    }
  });

skillsCmd
  .command('marketplaces')
  .description('List known skill marketplaces')
  .action(() => {
    for (const mp of MARKETPLACES) console.log(`${mp.id}\t${mp.name}\t${mp.method}`);
  });
