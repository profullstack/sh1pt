import { describe, it, expect } from 'vitest';

// Smoke test — minimal conformance check for adapters that haven't yet
// earned a full contract test. Verifies the adapter module exports an
// object with id + label (and optional kind / supports) and the id
// follows the package-family naming convention. Cheap to wire on every
// adapter; graduates to a full contract test as real implementations land.
//
// Intentionally permissive: smoke tests never call connect/post/send/etc.,
// so adapters can be added without maintaining per-adapter sample config.

export interface SmokeOptions {
  idPrefix?: string;          // e.g. 'target', 'promo', 'cloud' — enforces id match
  requireKind?: boolean;      // Target / CloudProvider etc. have a `kind` or `kinds` field
  requireSupports?: boolean;  // MerchProvider / PaymentProvider / DocProvider have `supports`
}

export function smokeTest(adapter: { id?: string; label?: string; [k: string]: any }, opts: SmokeOptions = {}): void {
  const label = adapter.label ?? adapter.id ?? '<unknown>';
  describe(`smoke · ${label}`, () => {
    it('exports an object with id + label', () => {
      expect(adapter.id).toBeTruthy();
      expect(adapter.label).toBeTruthy();
    });

    if (opts.idPrefix) {
      it(`id uses "${opts.idPrefix}-*" prefix`, () => {
        expect(adapter.id).toMatch(new RegExp(`^${opts.idPrefix}-[a-z0-9][a-z0-9-]*$`));
      });
    }

    if (opts.requireKind) {
      it('declares kind / kinds', () => {
        expect(adapter.kind ?? adapter.kinds).toBeTruthy();
      });
    }

    if (opts.requireSupports) {
      it('declares non-empty supports array', () => {
        expect(Array.isArray(adapter.supports) && adapter.supports.length).toBeTruthy();
      });
    }
  });
}
