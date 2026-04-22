import { autoSetup } from './setup-helpers.js';

export type TargetKind =
  | 'web'
  | 'cli'
  | 'tui'
  | 'desktop'
  | 'mobile'
  | 'wearable'
  | 'tv'
  | 'console'
  | 'xr'
  | 'browser-ext'
  | 'plugin'
  | 'voice'
  | 'chat'
  | 'email'
  | 'iot'
  | 'api'
  | 'sdk'
  | 'webhook'
  | 'package-manager';

export type Channel = 'stable' | 'beta' | 'canary' | (string & {});

export interface BuildContext {
  projectDir: string;
  outDir: string;
  version: string;
  channel: Channel;
  env: Record<string, string>;
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
}

export interface ShipContext extends BuildContext {
  artifact: string;
  dryRun: boolean;
}

export interface BuildResult {
  artifact: string;
  meta?: Record<string, unknown>;
}

export interface ShipResult {
  id: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export interface TargetStatus {
  state: 'pending' | 'building' | 'shipping' | 'in-review' | 'live' | 'failed' | 'rolled-back';
  url?: string;
  version?: string;
  message?: string;
}

export interface Target<Config = unknown> {
  id: string;
  kind: TargetKind;
  label: string;
  validate?(config: unknown): Config;
  build(ctx: BuildContext, config: Config): Promise<BuildResult>;
  ship(ctx: ShipContext, config: Config): Promise<ShipResult>;
  status?(shipId: string, config: Config): Promise<TargetStatus>;
  rollback?(shipId: string, config: Config): Promise<void>;
}

export function defineTarget<Config>(t: Target<Config>): Target<Config> {
  return autoSetup(t);
}
