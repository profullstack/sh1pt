export function normalizeAtlanticTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(numeric) || numeric <= 0) return new Date().toISOString();
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
}
