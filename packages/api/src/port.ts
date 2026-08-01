export const DEFAULT_API_PORT = 4000;

export function resolveApiPort(value: string | undefined): number {
  const text = value?.trim();
  if (!text || !/^\d+$/.test(text)) return DEFAULT_API_PORT;

  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 65535
    ? parsed
    : DEFAULT_API_PORT;
}
