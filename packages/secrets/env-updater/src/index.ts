/**
 * 🔐 sh1pt env-updater plugin
 * Sync environment variables across:
 * - Local .env files
 * - Doppler
 * - Railway
 * - GitHub Secrets
 * 
 * One command to update all environments at once.
 */
import { defineSecretProvider, manualSetup, type SecretRef } from '@profullstack/sh1pt-core';
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

interface Config {
  envFile?: string;
  dopplerProject?: string;
  dopplerConfig?: string;
  railwayService?: string;
  githubRepo?: string;
  githubOwner?: string;
}

const DEFAULT_ENV_FILE = '.env';

// ===== HELPERS =====

async function readEnvFile(file: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(file, 'utf8');
    const secrets: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match) {
        secrets[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
    return secrets;
  } catch {
    return {};
  }
}

async function writeEnvFile(file: string, secrets: Record<string, string>): Promise<void> {
  const lines = Object.entries(secrets).map(([key, value]) => `${key}=${value}`);
  await writeFile(file, lines.join('\n') + '\n', 'utf8');
}

// ===== PLATFORM UPDATERS =====

async function updateDoppler(secrets: Record<string, string>, config: Config): Promise<void> {
  const project = config.dopplerProject;
  const dopplerConfig = config.dopplerConfig || 'prd';
  if (!project) throw new Error('dopplerProject required');
  
  try {
    execSync(`doppler secrets set --project ${project} --config ${dopplerConfig} ${Object.entries(secrets).map(([k, v]) => `"${k}=${v}"`).join(' ')}`, {
      stdio: 'pipe',
      timeout: 30000
    });
  } catch (err) {
    throw new Error(`Doppler update failed: ${err}`);
  }
}

async function updateRailway(secrets: Record<string, string>, config: Config): Promise<void> {
  const service = config.railwayService;
  if (!service) throw new Error('railwayService required');

  try {
    for (const [key, value] of Object.entries(secrets)) {
      execSync(`railway variables set ${key}=${value} --service ${service}`, {
        stdio: 'pipe',
        timeout: 15000
      });
    }
  } catch (err) {
    throw new Error(`Railway update failed: ${err}`);
  }
}

async function updateGitHubSecrets(secrets: Record<string, string>, config: Config): Promise<void> {
  const repo = config.githubRepo;
  const owner = config.githubOwner || 'profullstack';
  if (!repo) throw new Error('githubRepo required');

  try {
    for (const [key, value] of Object.entries(secrets)) {
      const tmpFile = `/tmp/gh-secret-${key}`;
      await writeFile(tmpFile, value, 'utf8');
      execSync(`gh secret set ${key} --repo ${owner}/${repo} < ${tmpFile}`, {
        stdio: 'pipe',
        timeout: 15000
      });
    }
  } catch (err) {
    throw new Error(`GitHub Secrets update failed: ${err}`);
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
    
    // 1. Always update local .env
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
    
    // 4. GitHub Secrets
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
