import type { Target } from './target.js';

const registry = new Map<string, Target<any>>();

export function registerTarget(target: Target<any>): void {
  if (registry.has(target.id)) {
    throw new Error(`Target already registered: ${target.id}`);
  }
  registry.set(target.id, target);
}

export function getTarget(id: string): Target<any> | undefined {
  return registry.get(id);
}

export function listTargets(): Target<any>[] {
  return [...registry.values()];
}

export function clearRegistry(): void {
  registry.clear();
}
