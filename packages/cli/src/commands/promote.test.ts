import { describe, expect, it } from 'vitest';
import { parseNonNegativeInteger, parsePositiveInteger, stopCampaigns } from './promote.js';

describe('promote numeric option parsers', () => {
  it('accepts decimal positive integers', () => {
    expect(parsePositiveInteger('25')).toBe(25);
  });

  it.each(['0', '-1', '1.5', '1e2', '0x10', 'Infinity', 'NaN', 'abc', '9007199254740993'])(
    'rejects invalid positive integer %s',
    (value) => {
      expect(() => parsePositiveInteger(value)).toThrow('positive integer');
    },
  );

  it('accepts decimal non-negative integers', () => {
    expect(parseNonNegativeInteger('0')).toBe(0);
    expect(parseNonNegativeInteger('2000')).toBe(2000);
  });

  it.each(['-1', '1.5', '1e2', '0x10', 'Infinity', 'NaN', 'abc', '9007199254740993'])(
    'rejects invalid non-negative integer %s',
    (value) => {
      expect(() => parseNonNegativeInteger(value)).toThrow('zero or a positive integer');
    },
  );
});

describe('promote stop selection', () => {
  it('ends only the campaign selected by id', () => {
    const campaigns = [
      { id: 'meta-1', platform: 'meta', state: 'active' },
      { id: 'reddit-1', platform: 'reddit', state: 'active' },
    ];

    expect(stopCampaigns(campaigns, { id: 'meta-1' }).campaigns).toEqual([
      { id: 'meta-1', platform: 'meta', state: 'ended' },
      campaigns[1],
    ]);
  });

  it('ends all selected platforms while preserving unrelated campaigns', () => {
    const campaigns = [
      { id: 'meta-1', platform: 'Meta', state: 'active', spend: 3 },
      { id: 'meta-2', platform: 'meta', state: 'paused' },
      { id: 'reddit-1', platform: 'reddit', state: 'active' },
    ];

    expect(stopCampaigns(campaigns, { platforms: ['META'] }).campaigns).toEqual([
      { id: 'meta-1', platform: 'Meta', state: 'ended', spend: 3 },
      { id: 'meta-2', platform: 'meta', state: 'ended' },
      campaigns[2],
    ]);
  });

  it('leaves an already-ended campaign unchanged', () => {
    const campaign = { id: 'meta-1', platform: 'meta', state: 'ended', note: 'kept' };
    expect(stopCampaigns([campaign], { id: 'meta-1' })).toEqual({ campaigns: [campaign], changed: 0 });
  });
});
