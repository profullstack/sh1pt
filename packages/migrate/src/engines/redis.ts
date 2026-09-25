import type { Artifact, Engine, EngineContext, Resource, VerifyResult } from '../types.js';

/**
 * Moving a Redis.
 *
 * Usually you should not. Redis is a cache far more often than it is a
 * database, and the right migration for a cache is an empty one: point the new
 * app at a new Redis and let it fill. Copying a cache moves stale entries and
 * costs downtime for data that is worthless by definition.
 *
 * It is here because sometimes it is not a cache — a BullMQ queue with jobs
 * waiting in it, a session store where copying nothing logs every user out.
 * Those are real, so the engine exists, and the planner surfaces the question
 * rather than deciding for you.
 *
 * There is no delta. A key written during the copy is simply missed, which is
 * exactly why queues and sessions want the source stopped first. The planner
 * warns about that because `delta` is absent.
 */

const DUMP = 'dump.rdb';

function redisArgs(r: Resource): string[] {
  const url = r.connection.url?.reveal();
  if (!url) throw new Error(`redis resource '${r.name}' has no connection.url`);
  // redis-cli takes the whole URL, and unlike libpq there is no environment
  // variable for it. The password is therefore visible in `ps` for as long as
  // the command runs, which for --rdb is the length of the copy. Nothing can
  // be done about that from here beyond keeping the window short; it is noted
  // so nobody assumes otherwise.
  return ['-u', url];
}

export const redisEngine: Engine = {
  kind: 'redis',
  requires: ['redis-cli'],

  async export(ctx: EngineContext, from: Resource): Promise<Artifact[]> {
    const path = `${from.id}/${DUMP}`;
    ctx.log(`redis --rdb ${from.name}`);
    if (ctx.dryRun) return [{ resourceId: from.id, kind: 'redis', path }];

    // --rdb asks the server for a full sync and writes the RDB the replica
    // would have received, which is consistent at a point in time. Reading
    // keys with SCAN+DUMP instead is not: keys move under you as you walk.
    await ctx.exec('redis-cli', [...redisArgs(from), '--rdb', `${ctx.staging.dir}/${path}`], {
      timeoutMs: 2 * 60 * 60 * 1000,
    });

    const artifact: Artifact = { resourceId: from.id, kind: 'redis', path };
    await ctx.staging.record(artifact);
    return [artifact];
  },

  /**
   * There is no supported way to push an RDB into a running managed Redis, so
   * this refuses rather than pretending.
   *
   * A self-hosted target takes the file directly: stop the server, drop the
   * RDB in its data directory, start it. That is a host operation rather than
   * a client one, so it is surfaced as an instruction instead of being done
   * badly over the wire.
   */
  async import(ctx: EngineContext, to: Resource, artifacts: Artifact[]): Promise<void> {
    const dump = artifacts.find((a) => a.kind === 'redis');
    if (!dump) throw new Error(`no redis dump staged for '${to.name}'`);

    const dataDir = to.connection.dataDir?.reveal();
    if (!dataDir) {
      throw new Error(
        `Redis cannot be loaded over the wire. Copy ${dump.path} to the target's data directory as dump.rdb while the server is stopped, then start it. Set connection.dataDir on the target to have this done for you.`,
      );
    }

    if (ctx.dryRun) {
      ctx.log(`would place ${dump.path} at ${dataDir}/dump.rdb`);
      return;
    }

    await ctx.exec('cp', [`${ctx.staging.dir}/${dump.path}`, `${dataDir}/dump.rdb`]);
    ctx.log(`placed dump.rdb in ${dataDir}; restart the target Redis to load it`, 'warn');
  },

  async verify(ctx: EngineContext, from: Resource, to: Resource): Promise<VerifyResult> {
    if (ctx.dryRun) return { ok: true, checks: ['dry run: not compared'], problems: [] };

    const size = async (r: Resource) => {
      const res = await ctx.exec('redis-cli', [...redisArgs(r), 'dbsize'], { check: false });
      return Number.parseInt(res.stdout.trim(), 10) || 0;
    };
    const [a, b] = await Promise.all([size(from), size(to)]);
    return {
      ok: b >= a,
      checks: [`keys: ${a} → ${b}`],
      problems: b < a ? [`${a - b} key(s) missing on the target`] : [],
    };
  },
};
