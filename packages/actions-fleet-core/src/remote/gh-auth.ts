import { spawnSync } from 'node:child_process';

export class GhAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GhAuthError';
  }
}

/**
 * Pull the user's GitHub token from the `gh` CLI. Requires gh installed
 * and authenticated (`gh auth login`). Returns a token that callers can
 * pass to the REST API.
 *
 * We deliberately delegate auth to gh rather than asking the user to
 * paste a PAT — gh already handles the entire auth lifecycle (login,
 * refresh, multiple accounts, fine-grained vs classic tokens).
 */
export function getGhToken(): string {
  const which = spawnSync('which', ['gh'], { encoding: 'utf8' });
  if (which.status !== 0) {
    throw new GhAuthError(
      "GitHub CLI not found. Install it from https://cli.github.com and run `gh auth login`.",
    );
  }

  const result = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    const hint = stderr.includes('not logged')
      ? "Run `gh auth login` first."
      : stderr || 'gh exited with a non-zero status';
    throw new GhAuthError(`Could not read token from gh CLI: ${hint}`);
  }

  const token = (result.stdout ?? '').trim();
  if (!token) {
    throw new GhAuthError("gh returned an empty token. Run `gh auth login` to authenticate.");
  }
  return token;
}

export interface GhAuthStatus {
  ok: boolean;
  user?: string;
  scopes?: string[];
  hostname?: string;
  error?: string;
}

/** Best-effort gh auth status — `gh auth status --show-token` only works
 *  in some gh versions; fall back to a lightweight check. */
export function checkGhAuthStatus(): GhAuthStatus {
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  // gh prints to stderr even on success.
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) {
    return { ok: false, error: text.trim() || 'gh auth status failed' };
  }
  const userMatch = /Logged in to .* (?:as|account) (\S+)/i.exec(text);
  return {
    ok: true,
    user: userMatch?.[1],
  };
}
