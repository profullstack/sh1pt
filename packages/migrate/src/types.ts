/**
 * Moving an application and its data from one platform to another.
 *
 * `packages/cloud/*` already answers "give me a machine": connect, quote,
 * provision, destroy. That is not this. Provisioning the destination is the
 * easy half of a migration; the half that goes wrong is the data — the dump
 * that silently omitted an extension, the storage bucket whose objects are
 * referenced by absolute URL in a thousand rows, the cron jobs that start
 * firing from two places at once because the cutover happened in the wrong
 * order.
 *
 * The shape here comes from an actual migration rather than a whiteboard:
 * crawlproof.com off Railway and Supabase cloud onto a dedicated box, which
 * moved a 4.7 GB database, 8,410 storage objects across three buckets, ten
 * pg_cron jobs and a realtime publication, and which would have quietly broken
 * the site months later over 2,928 rows holding absolute storage URLs.
 *
 * ## Why this is not N×M adapters
 *
 * The naive shape is one adapter per (source, target) pair, which is why most
 * migration tooling supports exactly one direction. The split that avoids it:
 *
 *   **Platforms** answer "what have I got, and what are the credentials?"
 *   Railway, Supabase, Turso, Fly, Neon, Vercel, a plain VPS over ssh. A
 *   platform does not know how to move a byte. It does an `inventory()` and
 *   hands back resources with connection details attached.
 *
 *   **Engines** move the bytes. Postgres, MySQL, SQLite/libSQL, Redis,
 *   S3-compatible object storage, plain files. An engine does not know or care
 *   which vendor either side is.
 *
 * So Railway→dedicated and dedicated→Railway are the same code path, and a new
 * platform costs one `inventory()` rather than one adapter per existing
 * platform. Direction is not a property of the system; it is which platform
 * you named first.
 *
 * Every resource carries the engine that can move it. A migration is possible
 * exactly when, for each resource the source lists, the target can accept that
 * engine — which is a check the planner can make before touching anything.
 */

/**
 * What kind of thing is being moved, which is the same as asking which engine
 * moves it.
 *
 * Deliberately about storage shape rather than vendor: Supabase's database and
 * Neon's are both `postgres`, and the code that moves one moves the other. A
 * vendor difference that genuinely matters (Supabase's auth schema, its
 * storage metadata tables) is a `quirk` on the resource, not a new kind.
 */
export type ResourceKind =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'redis'
  | 'object-storage'
  | 'files'
  | 'env'
  | 'cron'
  | 'dns';

/** Every engine id, for exhaustiveness checks and for the CLI's help text. */
export const RESOURCE_KINDS: readonly ResourceKind[] = [
  'postgres',
  'mysql',
  'sqlite',
  'redis',
  'object-storage',
  'files',
  'env',
  'cron',
  'dns',
] as const;

/**
 * A credential or connection string.
 *
 * Kept as a getter rather than a value so a plan can be printed, stored and
 * reviewed without a password ever being serialised into it. `describe()` is
 * what goes in the plan file; `reveal()` is called only inside an engine, at
 * the moment it runs.
 */
export interface Secretish {
  /** Safe for logs, plan files and terminal output. Never the secret. */
  describe(): string;
  /** The actual value. Call as late as possible, never log the result. */
  reveal(): string;
}

/**
 * A secret that is safe to print because it is not one — a hostname, a bucket
 * name, a database name.
 */
export function plain(value: string): Secretish {
  return { describe: () => value, reveal: () => value };
}

/**
 * Wrap a real credential. `describe()` shows enough to tell two apart without
 * showing either: scheme and host for a URL, a short prefix otherwise.
 */
export function secret(value: string): Secretish {
  return {
    reveal: () => value,
    describe: () => {
      try {
        const u = new URL(value);
        const user = u.username ? `${u.username}:***@` : '';
        return `${u.protocol}//${user}${u.host}${u.pathname}`;
      } catch {
        return value.length <= 4 ? '***' : `${value.slice(0, 4)}***`;
      }
    },
  };
}

/**
 * One movable thing on a platform.
 *
 * `id` is the platform's own identifier and `name` is what a person calls it.
 * `sizeBytes` and `itemCount` are best-effort: they drive the plan's estimate
 * and the progress output, and being wrong is not fatal. `quirks` is where a
 * vendor's non-portable detail is recorded so the planner can warn about it
 * rather than discovering it halfway through a restore.
 */
export interface Resource {
  kind: ResourceKind;
  id: string;
  name: string;
  /** How to reach it. Engine-specific; see each engine for what it needs. */
  connection: Record<string, Secretish>;
  sizeBytes?: number;
  itemCount?: number;
  /**
   * Vendor specifics that survive or do not survive a move: postgres
   * extensions, a Supabase auth schema, pg_cron jobs, a realtime publication.
   * The planner turns these into warnings and extra steps.
   */
  quirks?: string[];
  metadata?: Record<string, string | number | boolean>;
}

/** What a platform reported when asked what it holds. */
export interface Inventory {
  platform: string;
  /** What the platform calls this deployment: a project, an app, an account. */
  scope: string;
  resources: Resource[];
  /** Anything the platform could not enumerate and a human should check. */
  notes?: string[];
}

export interface PlatformContext {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
  /** True when nothing may be mutated anywhere. */
  dryRun: boolean;
}

/**
 * A platform: somewhere an app lives. Implementations resolve credentials and
 * enumerate resources; they never move data.
 *
 * `role` is honest about what a platform can do rather than aspirational.
 * Railway can be read from and written to; a managed provider that offers no
 * import path is `source` only, and saying so lets the planner refuse early
 * with a clear message instead of failing at the last step.
 */
export interface Platform<Config = unknown> {
  id: string;
  label: string;
  role: 'source' | 'target' | 'both';
  /** Kinds this platform can hold. The planner intersects source and target. */
  supports: ResourceKind[];
  /** Enumerate what is there. Read-only; safe to run against production. */
  inventory(ctx: PlatformContext, config: Config): Promise<Inventory>;
  /**
   * Make a place for an incoming resource and return the connection an engine
   * should write to. Absent on `source`-only platforms.
   */
  provision?(ctx: PlatformContext, resource: Resource, config: Config): Promise<Resource>;
  /** Cheap credentials check, so a three-hour migration fails in the first second. */
  check?(ctx: PlatformContext, config: Config): Promise<void>;
}

/** Where an engine stages bytes between export and import. */
export interface Staging {
  /** Absolute path to a directory the engine may write into. */
  dir: string;
  /** Record an artifact so a resumed run can find it again. */
  record(artifact: Artifact): Promise<void>;
  /** Artifacts already produced for this resource, if the run is resuming. */
  existing(resourceId: string): Promise<Artifact[]>;
}

/** Something an export produced: a dump file, a manifest, a directory of objects. */
export interface Artifact {
  resourceId: string;
  kind: ResourceKind;
  /** Path relative to the staging dir. */
  path: string;
  sizeBytes?: number;
  /** Set once the artifact is complete; a partial artifact has no checksum. */
  sha256?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface EngineContext {
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
  dryRun: boolean;
  staging: Staging;
  /**
   * Run a command. Injected rather than imported so tests drive an engine
   * without a database, and so a dry run can record commands instead of
   * running them.
   */
  exec(cmd: string, args: string[], opts?: ExecOptions): Promise<ExecResult>;
}

export interface ExecOptions {
  /** Extra environment. Secrets belong here, never in `args`, which is logged. */
  env?: Record<string, string>;
  cwd?: string;
  /** Fail the step if the command exits non-zero. Default true. */
  check?: boolean;
  timeoutMs?: number;
  /**
   * Send stdout to this absolute path instead of buffering it.
   *
   * Some tools only dump to stdout — `sqlite3 .dump`, `turso db shell .dump` —
   * and a multi-gigabyte dump must not be held in a string. Expressed as an
   * option rather than a shell redirect because `exec` runs without a shell,
   * so `>` would be passed to the program as a literal argument.
   */
  stdoutFile?: string;
  /** Feed this file to stdin. The load half of the same problem. */
  stdinFile?: string;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * An engine moves one kind of resource between two connections.
 *
 * Split into export and import rather than a single `copy` so a migration can
 * stage everything, be inspected, and then be cut over — which is what makes
 * the delta sync and the rollback possible. A direct streaming copy is an
 * optimisation an engine may offer via `copy`, not the contract.
 */
export interface Engine {
  kind: ResourceKind;
  /** Binaries that must exist for this engine to run, e.g. ['pg_dump']. */
  requires: string[];
  /** Read the source into staging. */
  export(ctx: EngineContext, from: Resource): Promise<Artifact[]>;
  /**
   * Write staged artifacts into the target.
   *
   * `from` is the source resource, passed because not every engine stages the
   * bytes themselves. Object storage is the case that forces it: pulling ten
   * gigabytes down and pushing them back up doubles the transfer for no
   * benefit, so its export writes only a manifest and its import runs a
   * remote-to-remote copy, which means it still needs to know where the
   * objects came from.
   */
  import(ctx: EngineContext, to: Resource, artifacts: Artifact[], from?: Resource): Promise<void>;
  /**
   * Re-read only what changed since a timestamp. This is what makes a cutover
   * short: the bulk copy happens while the source is live, and only the delta
   * is moved during the window where writes are stopped. An engine that cannot
   * do this omits it, and the planner says the cutover needs full downtime.
   */
  delta?(ctx: EngineContext, from: Resource, since: Date): Promise<Artifact[]>;
  /** Compare source and target after the fact. Row counts, object counts. */
  verify?(ctx: EngineContext, from: Resource, to: Resource): Promise<VerifyResult>;
}

export interface VerifyResult {
  ok: boolean;
  /** One line per check, e.g. "public.users: 113 → 113". */
  checks: string[];
  problems: string[];
}
