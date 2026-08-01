export function parseMatrixTimestamp(value: number | undefined): string {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
