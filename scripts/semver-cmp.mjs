// SemVer precedence over the three numeric release segments only.
// A prerelease (e.g. 0.3.4-beta.1) ranks BELOW its own release (0.3.4) but
// ABOVE the previous release (0.3.3).
//
// The previous inline implementation did `a.split('.').map(Number)`, so the
// patch segment of "0.3.4-beta.1" parsed to NaN. Since NaN !== NaN and any
// comparison with NaN is false, the max-version reduce() in version.mjs
// silently kept a stale lower base and mis-versioned all three lockstep
// packages on the next release.
export function cmp(a, b) {
  const core = (v) => v.split('-')[0].split('.').map(Number);
  const hasPre = (v) => v.includes('-');
  const pa = core(a);
  const pb = core(b);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  // Equal release segments: a release outranks a prerelease of the same release.
  if (hasPre(a) === hasPre(b)) return 0;
  return hasPre(a) ? -1 : 1;
}
