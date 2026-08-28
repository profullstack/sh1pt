import { fakeShipContext } from '@profullstack/sh1pt-core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import adapter from './index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sdk-pypi target adapter', () => {
  it('does not require a token or invoke twine for dry-run shipping', async () => {
    const secret = vi.fn(() => undefined);

    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
      secret,
    }) as any, {})).resolves.toEqual({
      id: 'dry-run',
      meta: { repository: 'https://upload.pypi.org/legacy/' },
    });

    expect(secret).not.toHaveBeenCalled();
    expect(execMock).not.toHaveBeenCalled();
  });

  it('passes PyPI credentials through the child environment, not argv', async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: 'uploaded', stderr: '' });

    await adapter.ship(fakeShipContext({
      dryRun: false,
      secret: (key: string) => key === 'PYPI_TOKEN' ? 'pypi-secret-token' : undefined,
    }) as any, {});

    const [bin, args, options] = execMock.mock.calls[0] ?? [];
    expect(bin).toBe('twine');
    expect(args).not.toContain('pypi-secret-token');
    expect(args).not.toContain('--password');
    expect(options.env).toMatchObject({
      TWINE_USERNAME: '__token__',
      TWINE_PASSWORD: 'pypi-secret-token',
    });
  });
});
