export function parseWeChatTimestamp(value: string | undefined): string {
  if (!value || !/^\d+$/.test(value)) return new Date().toISOString();
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds)) return new Date().toISOString();
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
