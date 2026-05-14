import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { findManifestPath, loadManifest, resolveTargets } from './manifest.js';

async function tempProject(config: object) {
  const dir = await mkdtemp(join(tmpdir(), 'sh1pt-cli-manifest-'));
  await writeFile(join(dir, 'sh1pt.config.json'), JSON.stringify(config), 'utf8');
  return dir;
}

describe('manifest helpers', () => {
  it('loads and validates a JSON sh1pt config', async () => {
    const dir = await tempProject({
      name: 'demo',
      version: '1.0.0',
      targets: { npm: { use: 'target-pkg-npm', config: {} } },
    });

    expect(await findManifestPath(dir)).toBe(join(dir, 'sh1pt.config.json'));
    const { manifest } = await loadManifest(dir);
    expect(manifest.channels).toEqual(['stable', 'beta', 'canary']);
    expect(manifest.targets.npm?.use).toBe('target-pkg-npm');
  });

  it('resolves only enabled targets and rejects unknown requested targets', () => {
    const manifest = {
      name: 'demo',
      version: '1.0.0',
      channels: ['stable'],
      targets: {
        npm: { use: 'target-pkg-npm', enabled: true, config: {} },
        play: { use: 'target-mobile-android', enabled: false, config: {} },
      },
    };

    expect(resolveTargets(manifest, undefined).map((target) => target.id)).toEqual(['npm']);
    expect(() => resolveTargets(manifest, ['play'])).toThrow('Unknown or disabled target');
  });
});
