// Shared `--from <input>` resolver. All four primary verbs (build, promote,
// scale, iterate) accept --from so a user can jump into a workflow against
// an existing project: a repo, a live site, a local path, or a manifest
// document. Classifies only — fetching/probing is each verb's job.

import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve, extname } from 'node:path';

export type InputKind = 'git' | 'url' | 'path' | 'doc';

export interface ResolvedInput {
  kind: InputKind;
  /** The raw input as given. */
  raw: string;
  /** Canonical value per kind: resolved absolute path, normalized url, or normalized git url. */
  value: string;
  /** Inferred short name for the project (repo name, hostname, directory name). */
  inferredName?: string;
  /** True if the thing actually exists on disk (path/doc kinds). */
  exists?: boolean;
}

const DOC_EXTS = new Set(['.md', '.pdf', '.json', '.yml', '.yaml', '.toml']);

/**
 * Classify a --from input without performing network or fs I/O beyond a
 * stat() check for local paths. Order matters: git detection runs before
 * generic url matching because github.com/foo/bar URLs are also valid http.
 */
export function resolveInput(raw: string): ResolvedInput {
  const input = raw.trim();
  if (!input) throw new Error('--from requires a non-empty value');

  // 1) SSH git urls: git@host:path or ssh://git@host/path
  if (/^git@[^:]+:/.test(input) || /^ssh:\/\//.test(input)) {
    return { kind: 'git', raw, value: input, inferredName: repoNameFromGit(input) };
  }

  // 2) Http(s) git urls: *.git, github.com/foo/bar, gitlab.com/foo/bar,
  //    bitbucket.org/foo/bar. A plain https to a known forge with org/repo
  //    is treated as git, not a live site.
  if (/\.git$/i.test(input) || isForgeRepoUrl(input)) {
    return { kind: 'git', raw, value: normalizeUrl(input), inferredName: repoNameFromGit(input) };
  }

  // 3) Generic http(s) — a live site.
  if (/^https?:\/\//i.test(input)) {
    const value = normalizeUrl(input);
    return { kind: 'url', raw, value, inferredName: hostnameOf(value) };
  }

  // 4) Local path — directory or file. Documents get 'doc'; dirs get 'path'.
  const abs = isAbsolute(input) ? input : resolve(process.cwd(), input);
  const ext = extname(abs).toLowerCase();
  const exists = existsSync(abs);
  if (ext && DOC_EXTS.has(ext)) {
    return { kind: 'doc', raw, value: abs, inferredName: baseNameWithoutExt(abs), exists };
  }
  if (exists && statSync(abs).isFile() && ext && DOC_EXTS.has(ext)) {
    return { kind: 'doc', raw, value: abs, inferredName: baseNameWithoutExt(abs), exists: true };
  }

  // Default: treat as a local path (may or may not exist yet).
  return { kind: 'path', raw, value: abs, inferredName: lastSegment(abs), exists };
}

function isForgeRepoUrl(u: string): boolean {
  // https://github.com/<org>/<repo>[...] — two path segments after the host.
  const m = u.match(/^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)\/([^/\s]+)\/([^/\s?#]+)/i);
  return Boolean(m);
}

function normalizeUrl(u: string): string {
  // Trim trailing slashes and default fragments; keep the path intact.
  return u.replace(/\/+$/, '').replace(/\.git$/i, '.git');
}

function repoNameFromGit(u: string): string | undefined {
  // Normalize to a path, then return the last segment. Handles:
  //   git@host:org/repo(.git)
  //   ssh://[user@]host[:port]/org/repo(.git)
  //   https://host/org/repo(.git)
  let path: string;
  if (/^git@[^:]+:/.test(u)) {
    path = u.replace(/^git@[^:]+:/, '');
  } else if (/^ssh:\/\//i.test(u)) {
    path = u.replace(/^ssh:\/\/[^/]+\//i, '');
  } else if (/^https?:\/\//i.test(u)) {
    path = u.replace(/^https?:\/\/[^/]+\//i, '');
  } else {
    path = u;
  }
  path = path.replace(/[?#].*$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const segments = path.split('/').filter(Boolean);
  return segments.at(-1);
}

function hostnameOf(u: string): string | undefined {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function lastSegment(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

function baseNameWithoutExt(p: string): string {
  const last = lastSegment(p);
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(0, dot) : last;
}

/** Human-friendly label for logging: `[git] github.com/foo/bar` etc. */
export function describeInput(r: ResolvedInput): string {
  switch (r.kind) {
    case 'git':
      return `[git] ${r.inferredName ?? r.value}`;
    case 'url':
      return `[url] ${r.inferredName ?? r.value}`;
    case 'path':
      return `[path] ${r.value}${r.exists ? '' : ' (missing)'}`;
    case 'doc':
      return `[doc] ${r.value}${r.exists === false ? ' (missing)' : ''}`;
  }
}
