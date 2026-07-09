import { InvalidArgumentError } from 'commander';

export function parsePositiveSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError('must be a positive safe integer');
  }
  return parsed;
}

export function parseQuietHours(value: string): string {
  const match = value.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    throw new InvalidArgumentError('must use start-end format, for example 22-08');
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start > 23 || end > 23) {
    throw new InvalidArgumentError('hours must be between 0 and 23');
  }
  return value;
}
