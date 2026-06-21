/**
 * 🔐 sh1pt env-updater plugin
 * Sync environment variables across:
 * - Local .env files (merge-safe)
 * - Doppler (via spawnSync, no shell injection)
 * - Railway (via spawnSync, no shell injection)
 * - GitHub Secrets (via stdin, no temp files)
 * 
 * One command to update all environments at once.
 */
import { defineSecretProvider, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

interface Config {
  envFile?: string;
  dopplerProject?: string;
  dopplerConfig?: string;
  railwayService?: string;
  githubRepo?: string;
  githubOwner?: string;
}

const DEFAULT_ENV_FILE = '.env';
const ENV_ENTRY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

// ===== HELPERS =====

/** Read an env file into a key-value map, preserving existing entries. */
async function readEnvFile(file: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(file, 'utf8');
    const secrets: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const match = ENV_ENTRY.exec(line);
      if (match) {
        secrets[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
    return secrets;
  } catch {
    return {};
  }
}

/**
 * Merge new secrets into an existing .env file.
 * Existing keys are updated in-place; new keys are appended.
 * Will not delete keys not present in the push payload.
 */
async function writeEnvFile(file: string, newSecrets: Record<string, string>): Promise<void> {
  const existing = await readEnvFile(file);
  // Merge: existing values are overridden by new ones
  for (const [key, value] of Object.entries(newSecrets)) {
    existing[key] = value;
  }
  const lines = Object.entries(existing).map(([key, value]) => `${key}=${value}`);
  await writeFile(file, lines.join('\n') + '\n', 'utf8');
}

/** Run a command with args array — no shell interpolation. */
function run(cmd: string, args: string[], input?: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(cmd, args, {
    input: input ?? undefined,
    encoding: 'utf-8',
    timeout: 30000,
    stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
  });
  return {
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    status: result.status,
  };
}

// ===== PLATFORM UPDATERS (spawnSync — no shell injection) =====

async function updateDoppler(secrets: Record<string, string>, config: Config): Promise<void> {
  const project = config.dopplerProject;
  const dopplerConfig = config.dopplerConfig || 'prd';
  if (!project) throw new Error('dopplerProject required');

  const args = ['secrets', 'set', '--project', project, '--config', dopplerConfig];
  for (const [key, value] of Object.entries(secrets)) {
    args.push(`${key}=${value}`);
  }
  
  const result = run('doppler', args);
  if (result.status !== 0) {
    throw new Error(`Doppler update failed: ${result.stderr || result.stdout}`);
  }
}

async function updateRailway(secrets: Record<string, string>, config: Config): Promise<void> {
  const service = config.railwayService;
  if (!service) throw new Error('railwayService required');

  for (const [key, value] of Object.entries(secrets)) {
    const args = ['variables', 'set', `${key}=${value}`, '--service', service];
    const result = run('railway', args);
    if (result.status !== 0) {
      throw new Error(`Railway update failed for ${key}: ${result.stderr || result.stdout}`);
    }
  }
}

async function updateGitHubSecrets(secrets: Record<string, string>, config: Config): Promise<void> {
  const repo = config.githubRepo;
  const owner = config.githubOwner || 'profullstack';
  if (!repo) throw new Error('githubRepo required');

  for (const [key, value] of Object.entries(secrets)) {
    // Pass secret value via stdin — no temp files, no shell
    const result = run('gh', ['secret', 'set', key, '--repo', `${owner}/${repo}`], value);
    if (result.status !== 0) {
      throw new Error(`GitHub Secrets update failed for ${key}: ${result.stderr || result.stdout}`);
    }
  }
}

// ===== PROVIDER =====

export default defineSecretProvider<Config>({
  id: 'secrets-env-updater',
  label: 'Env Updater',
  cli: 'env-updater',
  
  async connect(ctx, config) {
    ctx.log(`env-updater status · envFile=${config.envFile ?? DEFAULT_ENV_FILE}`);
    const targets: string[] = ['local'];
    if (config.dopplerProject) targets.push('doppler');
    if (config.railwayService) targets.push('railway');
    if (config.githubRepo) targets.push('github');
    ctx.log(`targets: ${targets.join(', ')}`);
    return { accountId: `env-updater-${targets.join('-')}` };
  },
  
  async pull(ctx, config): Promise<SecretRef[]> {
    const file = config.envFile ?? DEFAULT_ENV_FILE;
    ctx.log(`env-updater pull — reading ${file}`);
    const secrets = await readEnvFile(file);
    return Object.entries(secrets).map(([key, value]) => ({
      key,
      value,
      path: file
    }));
  },
  
  async push(ctx, secrets, config) {
    const file = config.envFile ?? DEFAULT_ENV_FILE;
    ctx.log(`env-updater push <${secrets.length} keys>`);
    
    // Build secrets map
    const secretMap: Record<string, string> = {};
    for (const secret of secrets) {
      if (secret.key && secret.value !== undefined && secret.value !== null) {
        secretMap[secret.key] = secret.value;
      }
    }
    
    const results: string[] = [];
    
    // 1. Always update local .env (merge-safe — won't delete existing keys)
    await writeEnvFile(file, secretMap);
    results.push(`local .env (${Object.keys(secretMap).length} keys)`);
    ctx.log(`  ✓ local .env updated`);
    
    // 2. Doppler
    if (config.dopplerProject) {
      try {
        await updateDoppler(secretMap, config);
        results.push('doppler');
        ctx.log(`  ✓ doppler (${config.dopplerProject}/${config.dopplerConfig ?? 'prd'})`);
      } catch (err) {
        results.push(`doppler: FAILED`);
        ctx.log(`  ✗ doppler: ${err}`);
      }
    }
    
    // 3. Railway
    if (config.railwayService) {
      try {
        await updateRailway(secretMap, config);
        results.push('railway');
        ctx.log(`  ✓ railway (${config.railwayService})`);
      } catch (err) {
        results.push(`railway: FAILED`);
        ctx.log(`  ✗ railway: ${err}`);
      }
    }
    
    // 4. GitHub Secrets (via stdin — no temp files)
    if (config.githubRepo) {
      try {
        await updateGitHubSecrets(secretMap, config);
        results.push('github');
        ctx.log(`  ✓ github (${config.githubOwner ?? 'profullstack'}/${config.githubRepo})`);
      } catch (err) {
        results.push(`github: FAILED`);
        ctx.log(`  ✗ github: ${err}`);
      }
    }
    
    return { count: secrets.length, targets: results };
  },
  
  setup: manualSetup({
    label: 'Env Updater',
    vendorDocUrl: 'https://github.com/profullstack/sh1pt',
    steps: [
      'Install CLI tools: doppler CLI, railway CLI, gh CLI',
      'Authenticate each platform: doppler login, railway login, gh auth login',
      'Configure targets in sh1pt.config.ts or pass via CLI flags',
      'Run: sh1pt secret push --provider env-updater'
    ],
  }),
});
