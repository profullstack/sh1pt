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
    return { kind: 'git', raw, value: normalizeGitUrl(input), inferredName: repoNameFromGit(input) };
  }

  // 2) Http(s) git urls: *.git, github.com/foo/bar, gitlab.com/foo/bar,
  //    bitbucket.org/foo/bar. A plain https to a known forge with org/repo
  //    is treated as git, not a live site.
  //    Also matches .git?query and .git#fragment browser-copied forms.
  if (/\.git([?#]|$)/i.test(input) || isForgeRepoUrl(input)) {
    return { kind: 'git', raw, value: normalizeGitUrl(input), inferredName: repoNameFromGit(input) };
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
  // A path qualifies as 'doc' when it has a recognised document extension
  // AND is either a regular file or doesn't exist yet (future output path).
  // Previously there were two branches: the first returned unconditionally
  // on extension match, making the second (which correctly checked isFile())
  // unreachable. This caused directories whose names end in a doc extension
  // (e.g. './config.yaml/' used by consul-template or vault) to be
  // classified as 'doc', leading to EISDIR when downstream code reads them.
  const isDocLike = !!ext && DOC_EXTS.has(ext);
  const isFileOrMissing = !exists || statSync(abs).isFile();
  if (isDocLike && isFileOrMissing) {
    return { kind: 'doc', raw, value: abs, inferredName: baseNameWithoutExt(abs), exists };
  }

  // Default: treat as a local path (may or may not exist yet).
  return { kind: 'path', raw, value: abs, inferredName: lastSegment(abs), exists };
}

function isForgeRepoUrl(u: string): boolean {
  // Match repo-root URLs only: https://github.com/<org>/<repo>[/]
  // with no additional path segments (issues/123, tree/main, etc.).
  // Subpath URLs like /issues/ or /tree/ are live-site pages, not clone targets.
  const m = u.match(
    /^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)\/([^/\s]+)\/([^/\s?#]+)\/?([?#].*)?$/i,
  );
  if (!m) return false;
  // Reject if the URL path continues beyond /<org>/<repo>
  // (e.g. /org/repo/issues/1 or /org/repo/tree/main)
  const afterHost = u.replace(/^https?:\/\/(www\.)?(github\.com|gitlab\.com|bitbucket\.org|codeberg\.org)\//i, '');
  const segments = afterHost.split('/').filter(s => s && !s.startsWith('?') && !s.startsWith('#'));
  return segments.length === 2;
}

/**
 * Normalize a git clone URL: strip browser-only query strings and fragments,
 * then clean up trailing slashes. The .git suffix is preserved when present.
 *
 * Examples:
 *   https://github.com/foo/bar?tab=readme#install → https://github.com/foo/bar
 *   https://github.com/foo/bar.git?ref=main        → https://github.com/foo/bar.git
 *   https://github.com/foo/bar.git#README          → https://github.com/foo/bar.git
*   ssh://git@github.com/org/repo?query         → ssh://git@github.com/org/repo
  *   git@github.com:org/repo?tab=readme          → git@github.com:org/repo
 */
function normalizeGitUrl(u: string): string {
  // Strip query string and fragment — they are browser artefacts on clone URLs.
  const stripped = u.replace(/[?#].*$/, '');
  return stripped.replace(/\/+$/, '');
}

function normalizeUrl(u: string): string {
  // For live-site URLs keep query strings and fragments intact; only strip
  // trailing slashes from the path segment.
  return u.replace(/\/+(?=[?#]|$)/, '');
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
