export function parseTwitchTimestamp(value: string | undefined): string {
  if (!value || !/^\d+$/.test(value)) return new Date().toISOString();
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp)) return new Date().toISOString();
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
