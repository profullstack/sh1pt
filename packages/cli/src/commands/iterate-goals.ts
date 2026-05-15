import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configDir } from '@profullstack/sh1pt-core';

export interface IterateGoal {
  key: string;
  value: string;
}

interface GoalsFile {
  version: number;
  goals: Record<string, string>;
}

const GOALS_VERSION = 1;

export function goalsPath(): string {
  return path.join(configDir(), 'iterate-goals.json');
}

export function parseGoalAssignments(assignments: string[]): IterateGoal[] {
  return assignments.map((assignment) => {
    const index = assignment.indexOf('=');
    if (index <= 0 || index === assignment.length - 1) {
      throw new Error(`Malformed goal assignment "${assignment}". Use key=value.`);
    }
    const key = assignment.slice(0, index).trim();
    const value = assignment.slice(index + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(key)) {
      throw new Error(`Malformed goal key "${key}". Use letters, numbers, dots, dashes, or underscores.`);
    }
    if (value.length === 0) {
      throw new Error(`Malformed goal assignment "${assignment}". Value cannot be empty.`);
    }
    return { key, value };
  });
}

export async function readIterateGoals(): Promise<IterateGoal[]> {
  let raw: string;
  try {
    raw = await fs.readFile(goalsPath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const parsed = JSON.parse(raw) as Partial<GoalsFile>;
  const goals = parsed.goals && typeof parsed.goals === 'object' ? parsed.goals : {};
  return sortGoals(Object.entries(goals).map(([key, value]) => ({ key, value: String(value) })));
}

export async function saveIterateGoals(nextGoals: IterateGoal[]): Promise<IterateGoal[]> {
  const current = new Map((await readIterateGoals()).map((goal) => [goal.key, goal.value]));
  for (const goal of nextGoals) current.set(goal.key, goal.value);

  const sorted = sortGoals([...current].map(([key, value]) => ({ key, value })));
  const file: GoalsFile = {
    version: GOALS_VERSION,
    goals: Object.fromEntries(sorted.map((goal) => [goal.key, goal.value])),
  };

  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const tmp = `${goalsPath()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, goalsPath());
  return sorted;
}

function sortGoals(goals: IterateGoal[]): IterateGoal[] {
  return goals.sort((a, b) => a.key.localeCompare(b.key));
}
