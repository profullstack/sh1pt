import {
  defineAutomation,
  setupGuide,
  type ActOptions,
  type ActResult,
  type AutomationCtx,
  type AutomationSession,
  type ExtractOptions,
  type ObserveResult,
} from '@profullstack/sh1pt-core';

// Stagehand (browserbase) — AI browser automation. Local-first (any
// Chromium) with optional Browserbase cloud for session replay and
// captcha solving. We import the SDK dynamically so this adapter
// installs cleanly even when @browserbasehq/stagehand isn't on disk —
// the actual install hint is in setup().

export interface StagehandConfig {
  /** 'local' runs against a locally-installed Chromium; 'browserbase' uses the cloud. */
  mode: 'local' | 'browserbase';
  /** LLM that powers act/extract/observe — defaults to a Claude model. */
  modelName?: string;
  /** Starting URL (optional). */
  startUrl?: string;
  /** When true, runs Chromium with a visible window in local mode. */
  headed?: boolean;
}

const DEFAULT_MODEL = 'claude-opus-4-7';

// Holds the live Stagehand instance per session id so subsequent
// act/extract/observe/close calls find the same handle.
const sessions = new Map<string, { stagehand: any; page: any }>();

async function loadStagehand(): Promise<any> {
  try {
    return await import('@browserbasehq/stagehand');
  } catch (err) {
    throw new Error(
      'stagehand: @browserbasehq/stagehand is not installed. Run `pnpm add @browserbasehq/stagehand` in your project.',
    );
  }
}

export default defineAutomation<StagehandConfig>({
  id: 'automation-stagehand',
  label: 'Stagehand (Browserbase)',
  supportsLocal: true,
  supportsCloud: true,

  async connect(ctx: AutomationCtx, config: StagehandConfig): Promise<AutomationSession> {
    const mod = await loadStagehand();
    const Stagehand = mod.Stagehand;
    const apiKey = ctx.secret('BROWSERBASE_API_KEY');
    const projectId = ctx.secret('BROWSERBASE_PROJECT_ID');
    const anthropicKey = ctx.secret('ANTHROPIC_API_KEY');

    if (config.mode === 'browserbase' && (!apiKey || !projectId)) {
      throw new Error(
        'stagehand: mode=browserbase requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID in the vault.',
      );
    }

    const stagehand = new Stagehand({
      env: config.mode === 'browserbase' ? 'BROWSERBASE' : 'LOCAL',
      apiKey: apiKey,
      projectId: projectId,
      modelName: config.modelName ?? DEFAULT_MODEL,
      modelClientOptions: anthropicKey ? { apiKey: anthropicKey } : undefined,
      headless: config.headed === true ? false : true,
    });

    await stagehand.init();
    const page = stagehand.page;
    if (config.startUrl) await page.goto(config.startUrl);

    const id = `stagehand-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessions.set(id, { stagehand, page });

    return {
      id,
      url: page.url(),
      meta: { mode: config.mode, replayUrl: stagehand.browserbaseSessionID ? `https://browserbase.com/sessions/${stagehand.browserbaseSessionID}` : undefined },
    };
  },

  async goto(_ctx: AutomationCtx, session: AutomationSession, url: string): Promise<AutomationSession> {
    const handle = mustGet(session.id);
    await handle.page.goto(url);
    return { ...session, url: handle.page.url() };
  },

  async act(ctx: AutomationCtx, session: AutomationSession, instruction: string, opts?: ActOptions): Promise<ActResult> {
    const handle = mustGet(session.id);
    if (opts?.expectedUrlPattern && !opts.expectedUrlPattern.test(handle.page.url())) {
      return { ok: false, message: `url ${handle.page.url()} did not match ${opts.expectedUrlPattern}`, url: handle.page.url() };
    }
    if (ctx.dryRun) {
      ctx.log(`[dry-run] stagehand.act: ${instruction}`);
      return { ok: true, message: 'dry-run', url: handle.page.url() };
    }
    const result = await handle.page.act(instruction);
    return {
      ok: result?.success !== false,
      message: result?.message ?? 'act completed',
      url: handle.page.url(),
    };
  },

  async extract<T = unknown>(_ctx: AutomationCtx, session: AutomationSession, instruction: string, opts?: ExtractOptions): Promise<T> {
    const handle = mustGet(session.id);
    const result = await handle.page.extract({
      instruction,
      schema: opts?.schema,
    });
    return result as T;
  },

  async observe(_ctx: AutomationCtx, session: AutomationSession, instruction?: string): Promise<ObserveResult[]> {
    const handle = mustGet(session.id);
    const raw = await handle.page.observe(instruction);
    return (raw ?? []).map((o: any) => ({
      selector: String(o.selector ?? ''),
      description: String(o.description ?? ''),
      suggestedAction: typeof o.method === 'string' ? `${o.method}${o.arguments ? '(' + JSON.stringify(o.arguments) + ')' : ''}` : undefined,
    }));
  },

  async agent(ctx: AutomationCtx, session: AutomationSession, goal: string, opts?: { maxSteps?: number }): Promise<ActResult> {
    const handle = mustGet(session.id);
    if (ctx.dryRun) {
      ctx.log(`[dry-run] stagehand.agent: ${goal}`);
      return { ok: true, message: 'dry-run', url: handle.page.url() };
    }
    const agentObj = handle.stagehand.agent({ provider: 'anthropic', model: 'claude-opus-4-7' });
    const result = await agentObj.execute({ instruction: goal, maxSteps: opts?.maxSteps ?? 10 });
    return {
      ok: result?.success !== false,
      message: result?.message ?? 'agent completed',
      url: handle.page.url(),
    };
  },

  async close(_ctx: AutomationCtx, session: AutomationSession): Promise<void> {
    const handle = sessions.get(session.id);
    if (!handle) return;
    try {
      await handle.stagehand.close();
    } finally {
      sessions.delete(session.id);
    }
  },

  setup: setupGuide<StagehandConfig>({
    label: 'Stagehand (Browserbase)',
    vendorDocUrl: 'https://docs.stagehand.dev',
    config: { mode: 'local', modelName: DEFAULT_MODEL, headed: false },
    steps: [
      'Install the SDK in your project: `pnpm add @browserbasehq/stagehand` (or npm/bun).',
      'Local mode works out of the box with any Chromium — Playwright will install one on first run.',
      'For cloud mode: sign up at https://browserbase.com, then `sh1pt secret set BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`.',
      'For the LLM that powers act/extract/observe: `sh1pt secret set ANTHROPIC_API_KEY` (or use any model Stagehand supports).',
      'Smoke test: `sh1pt automation stagehand connect --mode local --start-url https://example.com`.',
    ],
  }),
});

function mustGet(id: string): { stagehand: any; page: any } {
  const handle = sessions.get(id);
  if (!handle) throw new Error(`stagehand: unknown session id ${id} (already closed?)`);
  return handle;
}
