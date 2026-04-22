import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const CONFIG_VERSION = 1;

export interface Sh1ptConfig {
  version: number;
  adapters: Record<string, unknown>;
}

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && xdg.length > 0 ? path.join(xdg, 'sh1pt') : path.join(homedir(), '.config', 'sh1pt');
}

export function configPath(): string {
  return path.join(configDir(), 'config.json');
}

export async function readConfig(): Promise<Sh1ptConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Sh1ptConfig>;
    return {
      version: typeof parsed.version === 'number' ? parsed.version : CONFIG_VERSION,
      adapters: parsed.adapters && typeof parsed.adapters === 'object' ? parsed.adapters : {},
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { version: CONFIG_VERSION, adapters: {} };
    throw err;
  }
}

export async function writeConfig(cfg: Sh1ptConfig): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const tmp = `${configPath()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, configPath());
}

export async function getAdapterConfig<T = unknown>(adapterId: string): Promise<T | undefined> {
  const cfg = await readConfig();
  const entry = cfg.adapters[adapterId];
  return entry === undefined ? undefined : (entry as T);
}

export async function setAdapterConfig(adapterId: string, adapterConfig: unknown): Promise<void> {
  const cfg = await readConfig();
  cfg.adapters[adapterId] = adapterConfig;
  await writeConfig(cfg);
}

export async function deleteAdapterConfig(adapterId: string): Promise<void> {
  const cfg = await readConfig();
  if (!(adapterId in cfg.adapters)) return;
  delete cfg.adapters[adapterId];
  await writeConfig(cfg);
}
