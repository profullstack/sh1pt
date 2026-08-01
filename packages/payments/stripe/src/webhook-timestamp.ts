export function parseStripeWebhookTimestamp(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}
