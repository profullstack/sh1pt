import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from '@profullstack/sh1pt-core';

export const ITERATE_GOALS_VERSION = 1;

export type IterateGoals = Record<string, string>;

interface StoredIterateGoals {
  version: number;
  goals: IterateGoals;
}

export function iterateGoalsPath(): string {
  return path.join(configDir(), 'iterate-goals.json');
}

export function parseGoalAssignments(args: string[]): IterateGoals {
  const input = args[0] === 'set' ? args.slice(1) : args;
  const goals: IterateGoals = {};

  for (const arg of input) {
    const eq = arg.indexOf('=');
    if (eq <= 0 || eq === arg.length - 1) {
      throw new Error(`Invalid goal "${arg}". Use key=value, for example conversion=8%.`);
    }

    const key = arg.slice(0, eq).trim();
    const value = arg.slice(eq + 1).trim();
    if (!/^[a-z][a-z0-9._-]*$/i.test(key)) {
      throw new Error(`Invalid goal key "${key}". Use letters, numbers, dots, dashes, or underscores.`);
    }
    goals[key] = value;
  }

  return goals;
}

export async function readIterateGoals(file = iterateGoalsPath()): Promise<IterateGoals> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredIterateGoals>;
    return parsed.goals && typeof parsed.goals === 'object' ? sanitizeGoals(parsed.goals) : {};
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return {};
    throw err;
  }
}

export async function writeIterateGoals(goals: IterateGoals, file = iterateGoalsPath()): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const stored: StoredIterateGoals = {
    version: ITERATE_GOALS_VERSION,
    goals: sanitizeGoals(goals),
  };
  await fs.writeFile(file, `${JSON.stringify(stored, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function formatIterateGoals(goals: IterateGoals): string[] {
  return Object.entries(goals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
}

function sanitizeGoals(goals: IterateGoals): IterateGoals {
  const clean: IterateGoals = {};
  for (const [key, value] of Object.entries(goals)) {
    if (typeof key === 'string' && typeof value === 'string') clean[key] = value;
  }
  return clean;
}
