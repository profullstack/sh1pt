import { autoSetup } from './setup-helpers.js';
import type { SetupContext, SetupResult } from './setup.js';

// Browser automation — drive a Chromium/Firefox/WebKit session from
// natural-language instructions or selectors. Sits next to `captcha`
// (CAPTCHA-solving fallback) but inverts the relationship: automation
// is the positive primitive that calls captcha when it gets stuck.
//
// Designed around the four primitives Stagehand pioneered (act/extract/
// observe/agent), which adapters wrapping Playwright + Selenium + Puppeteer
// can all implement. Local-first: a Browserbase-style cloud session is
// an optional connect-time hint, not a required dep.

export interface AutomationSession {
  /** Provider-native session handle — pass back into other calls. */
  id: string;
  /** URL the session is currently focused on. */
  url: string;
  /** Free-form session metadata (replay URL, debugger URL, etc.). */
  meta?: Record<string, unknown>;
}

export interface ActOptions {
  /** Bound the LLM/runtime cost of a single act call. */
  timeoutMs?: number;
  /** When set, the adapter must refuse the act if the page URL doesn't match. */
  expectedUrlPattern?: RegExp;
}

export interface ActResult {
  /** True when the adapter believes the instruction was carried out. */
  ok: boolean;
  /** Short human-readable description of what happened. */
  message: string;
  /** URL after the act, useful for chaining. */
  url: string;
}

export interface ExtractOptions {
  /** Optional Zod-style schema (passed through unchanged) for validation. */
  schema?: unknown;
  timeoutMs?: number;
}

export interface ObserveResult {
  selector: string;
  description: string;
  /** Adapter-suggested instruction that targets this element. */
  suggestedAction?: string;
}

export interface AutomationCtx {
  secret(k: string): string | undefined;
  log(m: string): void;
  dryRun: boolean;
  signal?: AbortSignal;
}

export interface BrowserAutomation<Config = unknown> {
  id: string;                       // e.g. 'automation-stagehand'
  label: string;
  /** Whether this adapter can run without a cloud-browser account. */
  supportsLocal: boolean;
  /** Whether this adapter can drive a cloud-browser session (Browserbase, etc.). */
  supportsCloud: boolean;

  /** Spin up a new browser session. */
  connect(ctx: AutomationCtx, config: Config): Promise<AutomationSession>;

  /** Carry out a natural-language instruction on the current page. */
  act(ctx: AutomationCtx, session: AutomationSession, instruction: string, opts?: ActOptions): Promise<ActResult>;

  /** Pull structured data from the current page. */
  extract<T = unknown>(ctx: AutomationCtx, session: AutomationSession, instruction: string, opts?: ExtractOptions): Promise<T>;

  /** Enumerate the actionable elements the adapter sees right now. */
  observe(ctx: AutomationCtx, session: AutomationSession, instruction?: string): Promise<ObserveResult[]>;

  /** Run a multi-step autonomous workflow. Optional — not all adapters expose this. */
  agent?(ctx: AutomationCtx, session: AutomationSession, goal: string, opts?: { maxSteps?: number }): Promise<ActResult>;

  /** Navigate to a URL within the existing session. */
  goto(ctx: AutomationCtx, session: AutomationSession, url: string): Promise<AutomationSession>;

  /** Tear the session down. Always called by callers in a finally{}. */
  close(ctx: AutomationCtx, session: AutomationSession): Promise<void>;

  setup?(ctx: SetupContext): Promise<SetupResult<Config>>;
}

export function defineAutomation<Config>(a: BrowserAutomation<Config>): BrowserAutomation<Config> {
  return autoSetup(a);
}

const registry = new Map<string, BrowserAutomation<any>>();

export function registerAutomation(a: BrowserAutomation<any>): void {
  if (registry.has(a.id)) throw new Error(`Automation adapter already registered: ${a.id}`);
  registry.set(a.id, a);
}

export function getAutomation(id: string): BrowserAutomation<any> | undefined {
  return registry.get(id);
}

export function listAutomations(): BrowserAutomation<any>[] {
  return [...registry.values()];
}
