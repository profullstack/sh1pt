// Thin GitHub REST helpers used by the gh-CLI-backed `--pr` install path.
// Token comes from `gh auth token` (see gh-auth.ts) — the user is the
// auth principal, so the PR is attributed to them, not to a service
// account. No App JWT, no installation token, no platform infra.

const GITHUB_API = 'https://api.github.com';

export interface GithubClientOptions {
  token: string;
  userAgent?: string;
}

export interface GithubApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

async function ghFetch<T>(
  options: GithubClientOptions,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<GithubApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${options.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': options.userAgent ?? 'sh1pt-actions-fleet',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }

  const text = await response.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'message' in parsed && typeof (parsed as Record<string, unknown>).message === 'string'
        ? (parsed as { message: string }).message
        : response.statusText;
    return { ok: false, status: response.status, error: message };
  }
  return { ok: true, status: response.status, data: parsed as T };
}

// ---------- Endpoints ----------

export interface RepoInfo {
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

export async function getRepo(
  options: GithubClientOptions,
  owner: string,
  repo: string,
): Promise<GithubApiResult<RepoInfo>> {
  return ghFetch<RepoInfo>(options, 'GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
}

export interface BranchRef {
  ref: string;
  object: { sha: string; type: string };
}

export async function getBranchSha(
  options: GithubClientOptions,
  owner: string,
  repo: string,
  branch: string,
): Promise<GithubApiResult<string>> {
  const result = await ghFetch<BranchRef>(
    options,
    'GET',
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  if (!result.ok || !result.data) {
    return { ok: false, status: result.status, error: result.error ?? 'no ref data' };
  }
  return { ok: true, status: result.status, data: result.data.object.sha };
}

export async function createBranch(
  options: GithubClientOptions,
  owner: string,
  repo: string,
  branch: string,
  fromSha: string,
): Promise<GithubApiResult<BranchRef>> {
  return ghFetch<BranchRef>(
    options,
    'POST',
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
    { ref: `refs/heads/${branch}`, sha: fromSha },
  );
}

export interface FileContent {
  type: 'file';
  sha: string;
  content: string; // base64
  encoding: 'base64';
  path: string;
}

/** Returns the file at the given ref. Null if the file does not exist. */
export async function getFile(
  options: GithubClientOptions,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<{ ok: true; data: { content: string; sha: string } | null } | { ok: false; error: string; status: number }> {
  const result = await ghFetch<FileContent>(
    options,
    'GET',
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`,
  );
  if (result.ok && result.data) {
    const decoded = Buffer.from(result.data.content, 'base64').toString('utf8');
    return { ok: true, data: { content: decoded, sha: result.data.sha } };
  }
  if (result.status === 404) {
    return { ok: true, data: null };
  }
  return { ok: false, status: result.status, error: result.error ?? 'getFile failed' };
}

export interface UpsertFileBody {
  message: string;
  content: string; // base64
  branch: string;
  sha?: string;
}

export interface UpsertFileResult {
  content: { sha: string; path: string };
  commit: { sha: string; html_url: string };
}

export async function upsertFile(
  options: GithubClientOptions,
  owner: string,
  repo: string,
  path: string,
  body: UpsertFileBody,
): Promise<GithubApiResult<UpsertFileResult>> {
  return ghFetch<UpsertFileResult>(
    options,
    'PUT',
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
    { ...body, content: body.content },
  );
}

export interface PullRequestBody {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

export interface PullRequestResult {
  number: number;
  html_url: string;
  state: string;
}

export async function createPullRequest(
  options: GithubClientOptions,
  owner: string,
  repo: string,
  body: PullRequestBody,
): Promise<GithubApiResult<PullRequestResult>> {
  return ghFetch<PullRequestResult>(
    options,
    'POST',
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    body,
  );
}

export function encodeBase64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}
