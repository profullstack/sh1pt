import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeNextPath('/dashboard/settings?tab=plan')).toBe('/dashboard/settings?tab=plan');
  });
  it('falls back for off-site targets', () => {
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath('https://evil.example')).toBe('/dashboard');
    expect(safeNextPath('//evil.example')).toBe('/dashboard');
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard');
    expect(safeNextPath('/\t/evil.example')).toBe('/dashboard');
    expect(safeNextPath('/\n/evil.example')).toBe('/dashboard');
  });
});
