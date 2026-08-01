import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  aggregateCampaignStatus,
  loadCampaignSnapshots,
  parseNonNegativeInteger,
  parsePositiveInteger,
  stopCampaigns,
} from './promote.js';

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

describe('promote campaign status', () => {
  it('aggregates metrics and state counts by platform', () => {
    const report = aggregateCampaignStatus([
      { id: 'a', platform: 'reddit', state: 'active', spend: 12.5, impressions: 100, clicks: 8, installs: 2, conversions: 1 },
      { id: 'b', platform: 'reddit', state: 'paused', spend: 2.5, impressions: 20, clicks: 2, installs: 0, conversions: 0 },
      { id: 'c', platform: 'meta', state: 'pending', spend: 0, impressions: 0, clicks: 0, installs: 0, conversions: 0 },
    ]);

    expect(report.platforms).toEqual([
      {
        platform: 'meta', campaigns: 1, spend: 0, impressions: 0, clicks: 0, installs: 0, conversions: 0,
        states: { pending: 1, active: 0, paused: 0, ended: 0, failed: 0, rejected: 0 },
      },
      {
        platform: 'reddit', campaigns: 2, spend: 15, impressions: 120, clicks: 10, installs: 2, conversions: 1,
        states: { pending: 0, active: 1, paused: 1, ended: 0, failed: 0, rejected: 0 },
      },
    ]);
    expect(report.totals).toEqual({ campaigns: 3, spend: 15, impressions: 120, clicks: 10, installs: 2, conversions: 1 });
  });

  it('filters the aggregate without mutating the snapshot', () => {
    const campaigns = [
      { id: 'a', platform: 'reddit', state: 'active' as const, spend: 1, impressions: 2, clicks: 3, installs: 4, conversions: 5 },
      { id: 'b', platform: 'meta', state: 'ended' as const, spend: 6, impressions: 7, clicks: 8, installs: 9, conversions: 10 },
    ];
    expect(aggregateCampaignStatus(campaigns, 'meta').totals).toEqual({ campaigns: 1, spend: 6, impressions: 7, clicks: 8, installs: 9, conversions: 10 });
    expect(campaigns).toHaveLength(2);
  });

  it('returns an empty list for a missing snapshot', () => {
    expect(loadCampaignSnapshots('missing-campaigns.json')).toEqual([]);
  });

  it('returns an empty list for malformed JSON', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sh1pt-promote-status-'));
    const filePath = join(directory, 'campaigns.json');
    writeFileSync(filePath, '{ not valid json');
    try {
      expect(loadCampaignSnapshots(filePath)).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
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
