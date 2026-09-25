import { describe, expect, it } from 'vitest';
import { objectStorageEngine, rcloneEnv, rclonePath } from './object-storage.js';
import type { EngineContext, ExecOptions, ExecResult, Resource } from '../types.js';
import { plain, secret } from '../types.js';

interface Call {
  cmd: string;
  args: string[];
  opts?: ExecOptions;
}

function ctx(responses: Array<Partial<ExecResult>> = [], over: Partial<EngineContext> = {}) {
  const calls: Call[] = [];
  let i = 0;
  const c: EngineContext & { calls: Call[] } = {
    calls,
    dryRun: false,
    log: () => {},
    staging: { dir: '/staging', record: async () => {}, existing: async () => [] },
    exec: async (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      const r = responses[i++] ?? {};
      return { code: r.code ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
    ...over,
  };
  return c;
}

const bucket = (over: Partial<Resource> = {}): Resource => ({
  kind: 'object-storage',
  id: 'b1',
  name: 'public',
  connection: {
    bucket: plain('ads'),
    accessKeyId: secret('AKIAEXAMPLE'),
    secretAccessKey: secret('supersecret'),
    endpoint: plain('https://abc.supabase.co/storage/v1/s3'),
    region: plain('us-east-1'),
  },
  ...over,
});

describe('rcloneEnv', () => {
  it('builds a remote entirely from the environment so nothing is written to disk', () => {
    const env = rcloneEnv(bucket(), 'src');
    expect(env.RCLONE_CONFIG_SRC_TYPE).toBe('s3');
    expect(env.RCLONE_CONFIG_SRC_ACCESS_KEY_ID).toBe('AKIAEXAMPLE');
    expect(env.RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY).toBe('supersecret');
  });

  it('forces path style for a custom endpoint, which otherwise resolves to a host that does not exist', () => {
    expect(rcloneEnv(bucket(), 'src').RCLONE_CONFIG_SRC_FORCE_PATH_STYLE).toBe('true');
  });

  it('leaves path style alone for real AWS', () => {
    const r = bucket({ connection: { bucket: plain('b') } });
    expect(rcloneEnv(r, 'src').RCLONE_CONFIG_SRC_FORCE_PATH_STYLE).toBeUndefined();
  });

  it('namespaces by alias so source and target can both be configured at once', () => {
    const merged = { ...rcloneEnv(bucket(), 'src'), ...rcloneEnv(bucket(), 'dst') };
    expect(merged.RCLONE_CONFIG_SRC_TYPE).toBe('s3');
    expect(merged.RCLONE_CONFIG_DST_TYPE).toBe('s3');
  });

  it('refuses a resource with no bucket', () => {
    expect(() => rcloneEnv(bucket({ connection: {} }), 'src')).toThrow(/no connection.bucket/);
  });
});

describe('rclonePath', () => {
  it('is remote:bucket', () => {
    expect(rclonePath(bucket(), 'src')).toBe('src:ads');
  });

  it('appends a prefix when there is one', () => {
    const r = bucket({ connection: { bucket: plain('ads'), prefix: plain('/2026') } });
    expect(rclonePath(r, 'src')).toBe('src:ads/2026');
  });
});

describe('export', () => {
  it('lists the bucket and records the object count rather than downloading it', async () => {
    const c = ctx([{ stdout: JSON.stringify([{ Path: 'a.png', Size: 10 }, { Path: 'b.png', Size: 20 }]) }]);
    const [artifact] = await objectStorageEngine.export(c, bucket());

    expect(c.calls[0]!.cmd).toBe('rclone');
    expect(c.calls[0]!.args).toContain('lsjson');
    expect(artifact?.sizeBytes).toBe(30);
    expect(artifact?.metadata?.objectCount).toBe(2);
  });

  it('never puts a secret in argv', async () => {
    const c = ctx([{ stdout: '[]' }]);
    await objectStorageEngine.export(c, bucket());
    expect(c.calls[0]!.args.join(' ')).not.toContain('supersecret');
  });

  it('throws on an unparseable listing rather than silently copying nothing', async () => {
    const c = ctx([{ stdout: 'not json' }]);
    await expect(objectStorageEngine.export(c, bucket())).rejects.toThrow(/could not parse/);
  });
});

describe('import', () => {
  it('copies remote to remote with both remotes configured', async () => {
    const c = ctx();
    const to = bucket({ id: 'b2', name: 'dest', connection: { bucket: plain('dest-ads') } });
    await objectStorageEngine.import(c, to, [], bucket());

    const call = c.calls[0]!;
    expect(call.args[0]).toBe('copy');
    expect(call.args[1]).toBe('src:ads');
    expect(call.args[2]).toBe('dst:dest-ads');
    expect(call.opts?.env?.RCLONE_CONFIG_SRC_TYPE).toBe('s3');
    expect(call.opts?.env?.RCLONE_CONFIG_DST_TYPE).toBe('s3');
  });

  it('uses copy and never sync, so a mistyped target cannot delete a live bucket', async () => {
    const c = ctx();
    await objectStorageEngine.import(c, bucket({ id: 'b2' }), [], bucket());
    expect(c.calls[0]!.args).not.toContain('sync');
    expect(c.calls[0]!.args).not.toContain('--delete');
    expect(c.calls[0]!.args).not.toContain('--delete-during');
  });

  it('is resume-friendly, so a re-run does not re-send the whole bucket', async () => {
    const c = ctx();
    await objectStorageEngine.import(c, bucket({ id: 'b2' }), [], bucket());
    expect(c.calls[0]!.args).toContain('--update');
  });

  it('refuses without the source, since nothing was staged locally', async () => {
    const c = ctx();
    await expect(objectStorageEngine.import(c, bucket(), [])).rejects.toThrow(/needs the source/);
  });

  it('runs nothing on a dry run', async () => {
    const c = ctx([], { dryRun: true });
    await objectStorageEngine.import(c, bucket({ id: 'b2' }), [], bucket());
    expect(c.calls).toHaveLength(0);
  });
});

describe('delta', () => {
  it('asks only for objects written since the bulk copy started', async () => {
    const c = ctx([{ stdout: '[{"Path":"new.png"}]' }]);
    const since = new Date(Date.now() - 3600_000);
    const [artifact] = await objectStorageEngine.delta!(c, bucket(), since);

    const ageArg = c.calls[0]!.args.find((a) => a.startsWith('--max-age='));
    expect(ageArg).toBeDefined();
    expect(artifact?.metadata?.objectCount).toBe(1);
  });
});

describe('verify', () => {
  it('passes when the object counts match', async () => {
    const c = ctx([{ stdout: '{"count":8410,"bytes":9560000000}' }, { stdout: '{"count":8410,"bytes":9560000000}' }]);
    const res = await objectStorageEngine.verify!(c, bucket(), bucket({ id: 'b2' }));
    expect(res.ok).toBe(true);
  });

  it('fails when objects did not arrive', async () => {
    const c = ctx([{ stdout: '{"count":8410,"bytes":1}' }, { stdout: '{"count":8000,"bytes":1}' }]);
    const res = await objectStorageEngine.verify!(c, bucket(), bucket({ id: 'b2' }));
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toContain('410 object(s) did not arrive');
  });
});
