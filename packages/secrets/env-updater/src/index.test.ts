import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adapter, {
  diffEnv,
  pullFrom,
  pushTo,
  readEnvFile,
  syncEnv,
  writeEnvFile,
} from './index.js';

smokeTest(adapter, { idPrefix: 'secrets' });

const tempDirs: string[] = [];

async function tempEnvFile(contents = ''): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sh1pt-env-updater-'));
  tempDirs.push(dir);
  const envFile = join(dir, '.env');
  await writeFile(envFile, contents, 'utf8');
  return envFile;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// ---------------------------------------------------------------------------
// Mock provider registry
// ---------------------------------------------------------------------------

const mockProviders = new Map<string, {
  pull: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
}>();

vi.mock('@profullstack/sh1pt-core', async () => {
  const actual = await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core');
  return {
    ...actual,
    getSecretProvider: (id: string) => {
      const mock = mockProviders.get(id);
      if (!mock) return undefined;
      return {
        id,
        label: id,
        cli: 'mock',
        connect: vi.fn(),
        pull: mock.pull,
        push: mock.push,
      };
    },
    listSecretProviders: () => [...mockProviders.keys()].map((id) => ({ id })),
  };
});

function registerMockProvider(id: string, overrides: {
  pull?: ReturnType<typeof vi.fn>;
  push?: ReturnType<typeof vi.fn>;
} = {}) {
  const mock = {
    pull: overrides.pull ?? vi.fn().mockResolvedValue([]),
    push: overrides.push ?? vi.fn().mockResolvedValue({ count: 0 }),
  };
  mockProviders.set(id, mock);
  return mock;
}

beforeEach(() => {
  mockProviders.clear();
  vi.clearAllMocks();
});

const ctx = { secret: () => undefined, log: () => {} };

// ---------------------------------------------------------------------------
// readEnvFile / writeEnvFile
// ---------------------------------------------------------------------------

describe('readEnvFile', () => {
  it('parses env entries with comments, quotes, and export prefixes', async () => {
    const file = await tempEnvFile([
      '# comment line',
      'API_KEY=abc123',
      'export DB_URL="postgres://localhost/db"',
      "SECRET='single quoted'",
      'MULTI="line\\nnext"',
      'EMPTY=',
      '',
    ].join('\n'));

    const result = await readEnvFile(file);
    expect(result).toEqual([
      { key: 'API_KEY', value: 'abc123', path: file },
      { key: 'DB_URL', value: 'postgres://localhost/db', path: file },
      { key: 'SECRET', value: 'single quoted', path: file },
      { key: 'MULTI', value: 'line\nnext', path: file },
      { key: 'EMPTY', value: '', path: file },
    ]);
  });

  it('returns empty array for non-existent files', async () => {
    const result = await readEnvFile('/tmp/sh1pt-nonexistent-env-updater-test');
    expect(result).toEqual([]);
  });
});

describe('writeEnvFile', () => {
  it('upserts values while preserving comments and unrelated lines', async () => {
    const file = await tempEnvFile([
      '# header',
      'EXISTING=old',
      'KEEP=1',
      '',
    ].join('\n'));

    const count = await writeEnvFile(file, [
      { key: 'EXISTING', value: 'new value' },
      { key: 'ADDED', value: 'fresh' },
    ]);
    expect(count).toBe(2);

    const text = await readFile(file, 'utf8');
    expect(text).toBe([
      '# header',
      'EXISTING="new value"',
      'KEEP=1',
      '',
      'ADDED=fresh',
      '',
    ].join('\n'));
  });

  it('creates new file if it does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sh1pt-env-updater-new-'));
    tempDirs.push(dir);
    const file = join(dir, '.env.new');

    await writeEnvFile(file, [{ key: 'FOO', value: 'bar' }]);
    const text = await readFile(file, 'utf8');
    expect(text).toBe('FOO=bar\n');
  });
});

// ---------------------------------------------------------------------------
// pullFrom / pushTo
// ---------------------------------------------------------------------------

describe('pullFrom', () => {
  it('delegates to the registered provider and applies key filters', async () => {
    const mock = registerMockProvider('secrets-dotenvx', {
      pull: vi.fn().mockResolvedValue([
        { key: 'API_KEY', value: 'abc' },
        { key: 'DB_URL', value: 'postgres://localhost' },
        { key: 'DEBUG', value: 'true' },
      ]),
    });

    const result = await pullFrom(ctx, { id: 'secrets-dotenvx' }, {
      excludeKeys: ['DEBUG'],
    });

    expect(mock.pull).toHaveBeenCalledOnce();
    expect(result).toEqual([
      { key: 'API_KEY', value: 'abc' },
      { key: 'DB_URL', value: 'postgres://localhost' },
    ]);
  });

  it('applies includeKeys filter', async () => {
    registerMockProvider('secrets-doppler', {
      pull: vi.fn().mockResolvedValue([
        { key: 'API_KEY', value: 'abc' },
        { key: 'DB_URL', value: 'postgres://localhost' },
      ]),
    });

    const result = await pullFrom(ctx, { id: 'secrets-doppler' }, {
      includeKeys: ['API_*'],
    });

    expect(result).toEqual([{ key: 'API_KEY', value: 'abc' }]);
  });

  it('throws when provider is not registered', async () => {
    await expect(pullFrom(ctx, { id: 'secrets-nonexistent' })).rejects.toThrow(
      'Secret provider not registered: secrets-nonexistent',
    );
  });
});

describe('pushTo', () => {
  it('delegates to the registered provider', async () => {
    const mock = registerMockProvider('secrets-github', {
      push: vi.fn().mockResolvedValue({ count: 2 }),
    });

    const result = await pushTo(ctx, [
      { key: 'TOKEN', value: 'abc' },
      { key: 'KEY', value: 'def' },
    ], { id: 'secrets-github' });

    expect(mock.push).toHaveBeenCalledOnce();
    expect(result).toEqual({ provider: 'secrets-github', status: 'ok', count: 2 });
  });

  it('returns error status when provider throws', async () => {
    registerMockProvider('secrets-railway', {
      push: vi.fn().mockRejectedValue(new Error('auth failed')),
    });

    const result = await pushTo(ctx, [
      { key: 'TOKEN', value: 'abc' },
    ], { id: 'secrets-railway' });

    expect(result).toEqual({
      provider: 'secrets-railway',
      status: 'error',
      count: 0,
      error: 'auth failed',
    });
  });
});

// ---------------------------------------------------------------------------
// syncEnv
// ---------------------------------------------------------------------------

describe('syncEnv', () => {
  it('pulls from source and pushes to all targets', async () => {
    const secrets = [
      { key: 'API_KEY', value: 'abc' },
      { key: 'DB_URL', value: 'postgres://localhost' },
    ];

    registerMockProvider('secrets-dotenvx', {
      pull: vi.fn().mockResolvedValue(secrets),
    });
    const dopplerMock = registerMockProvider('secrets-doppler', {
      push: vi.fn().mockResolvedValue({ count: 2 }),
    });
    const githubMock = registerMockProvider('secrets-github', {
      push: vi.fn().mockResolvedValue({ count: 2 }),
    });

    const results = await syncEnv(
      ctx,
      { id: 'secrets-dotenvx' },
      [{ id: 'secrets-doppler' }, { id: 'secrets-github' }],
    );

    expect(results).toEqual([
      { provider: 'secrets-doppler', status: 'ok', count: 2 },
      { provider: 'secrets-github', status: 'ok', count: 2 },
    ]);
    expect(dopplerMock.push).toHaveBeenCalledWith(ctx, secrets, expect.any(Object));
    expect(githubMock.push).toHaveBeenCalledWith(ctx, secrets, expect.any(Object));
  });

  it('skips pushing back to the source provider', async () => {
    registerMockProvider('secrets-dotenvx', {
      pull: vi.fn().mockResolvedValue([{ key: 'A', value: '1' }]),
      push: vi.fn(),
    });

    const results = await syncEnv(
      ctx,
      { id: 'secrets-dotenvx' },
      [{ id: 'secrets-dotenvx' }],
    );

    expect(results).toEqual([{ provider: 'secrets-dotenvx', status: 'skipped', count: 0 }]);
    expect(mockProviders.get('secrets-dotenvx')!.push).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// diffEnv
// ---------------------------------------------------------------------------

describe('diffEnv', () => {
  it('identifies added, removed, changed, and unchanged keys', async () => {
    registerMockProvider('secrets-dotenvx', {
      pull: vi.fn().mockResolvedValue([
        { key: 'UNCHANGED', value: 'same' },
        { key: 'CHANGED', value: 'new-value' },
        { key: 'ADDED', value: 'fresh' },
      ]),
    });
    registerMockProvider('secrets-doppler', {
      pull: vi.fn().mockResolvedValue([
        { key: 'UNCHANGED', value: 'same' },
        { key: 'CHANGED', value: 'old-value' },
        { key: 'REMOVED', value: 'gone' },
      ]),
    });

    const entries = await diffEnv(
      ctx,
      { id: 'secrets-dotenvx' },
      { id: 'secrets-doppler' },
    );

    expect(entries).toEqual([
      { key: 'ADDED', sourceValue: 'fresh', targetValue: undefined, status: 'added' },
      { key: 'CHANGED', sourceValue: 'new-value', targetValue: 'old-value', status: 'changed' },
      { key: 'REMOVED', sourceValue: undefined, targetValue: 'gone', status: 'removed' },
      { key: 'UNCHANGED', sourceValue: 'same', targetValue: 'same', status: 'unchanged' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Adapter smoke conformance
// ---------------------------------------------------------------------------

describe('env-updater adapter', () => {
  it('connects when all providers are registered', async () => {
    registerMockProvider('secrets-dotenvx');
    registerMockProvider('secrets-doppler');

    await expect(adapter.connect(ctx, {
      source: { id: 'secrets-dotenvx' },
      targets: [{ id: 'secrets-doppler' }],
    })).resolves.toEqual({ accountId: 'secrets-dotenvx→1 targets' });
  });

  it('throws when source provider is not registered', async () => {
    await expect(adapter.connect(ctx, {
      source: { id: 'secrets-nonexistent' },
    })).rejects.toThrow('Source provider not registered: secrets-nonexistent');
  });

  it('throws when a target provider is not registered', async () => {
    registerMockProvider('secrets-dotenvx');

    await expect(adapter.connect(ctx, {
      source: { id: 'secrets-dotenvx' },
      targets: [{ id: 'secrets-missing' }],
    })).rejects.toThrow('Target provider not registered: secrets-missing');
  });

  it('pushes to .env file when no targets are configured', async () => {
    const file = await tempEnvFile('');

    await expect(adapter.push(ctx, [
      { key: 'FOO', value: 'bar' },
    ], { envFile: file })).resolves.toEqual({ count: 1 });

    const text = await readFile(file, 'utf8');
    expect(text).toContain('FOO=bar');
  });

  it('fans out push to configured targets', async () => {
    registerMockProvider('secrets-doppler', {
      push: vi.fn().mockResolvedValue({ count: 1 }),
    });
    registerMockProvider('secrets-github', {
      push: vi.fn().mockResolvedValue({ count: 1 }),
    });

    await expect(adapter.push(ctx, [
      { key: 'TOKEN', value: 'secret' },
    ], {
      targets: [{ id: 'secrets-doppler' }, { id: 'secrets-github' }],
    })).resolves.toEqual({ count: 2 });
  });
});
