export function parseGithubRepoId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;

  const repoId = Number(value);
  return Number.isSafeInteger(repoId) ? repoId : null;
}
