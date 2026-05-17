import { exec } from "node:child_process";
import { promisify } from "node:util";

import { defineAgent, ensureCli, type AgentCLI, type AgentRunContext } from "@profullstack/sh1pt-core";

/**
 * Configuration for vu1nz Actions Security Scanner agent.
 */
export interface Config {
  /** GitHub repository to scan (e.g. "owner/repo") */
  repo: string;
  /**
   * GitHub token for API access.
   * Falls back to GITHUB_TOKEN secret from sh1pt vault.
   * The vu1nz CLI also reads the GITHUB_TOKEN env var.
   */
  token?: string;
  /** Minimum severity to fail on: none, low, medium, high, critical */
  failOn?: "none" | "low" | "medium" | "high" | "critical";
  /** Enable Claude AI code review of findings */
  claude?: boolean;
  /** Claude model for AI review (default: claude-sonnet-4-20250514) */
  claudeModel?: string;
}

const execAsync = promisify(exec);

const INSTALL_HINT =
  "pip install git+https://github.com/profullstack/vu1nz-gh-actions.git";

const agent: AgentCLI<Config> = defineAgent<Config>({
  id: "agent-vu1nz",
  label: "vu1nz Actions Security Scanner",
  binary: "vu1nz",
  capabilities: ["run-commands"],

  async check(ctx, config) {
    try {
      const { stdout } = await execAsync("vu1nz actions scan --help 2>&1");
      const version =
        stdout.match(/\d+\.\d+\.\d+/)?.[0] ||
        stdout.trim().split("\n")[0];
      return {
        installed: true,
        version,
        authenticated: true,
        installHint: INSTALL_HINT,
        authHint:
          "No authentication required for vu1nz CLI. GITHUB_TOKEN env var used automatically.",
      };
    } catch {
      return {
        installed: false,
        version: undefined,
        authenticated: false,
        installHint: INSTALL_HINT,
      };
    }
  },

  async run(ctx: AgentRunContext, config: Config): Promise<{ exitCode: number }> {
    await ensureCli("vu1nz", INSTALL_HINT, ctx.log);

    const repo = config.repo;
    if (!repo) {
      ctx.log("Error: 'repo' config is required (e.g. owner/repo)", "error");
      return { exitCode: 1 };
    }

    // Build scan command — use let because failOn/claude flags are appended
    let cmd = `vu1nz actions scan ${repo}`;

    const env: Record<string, string> = { ...(process.env as Record<string, string>) };

    // Pass token via env var (never via CLI arg to avoid process listing leaks)
    const token = config.token || ctx.secret("GITHUB_TOKEN");
    if (token) {
      env.GITHUB_TOKEN = token;
    }

    if (config.failOn) {
      cmd += ` --fail-on ${config.failOn}`;
    }

    if (config.claude) {
      cmd += " --claude";
      const claudeKey = ctx.secret("ANTHROPIC_API_KEY");
      if (claudeKey) {
        env.ANTHROPIC_API_KEY = claudeKey;
      }
    }

    if (config.claudeModel) {
      cmd += ` --claude-model ${config.claudeModel}`;
    }

    ctx.log(`Scanning ${repo} for CI/CD vulnerabilities...`, "info");

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: ctx.cwd,
        env,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (stdout) ctx.log(stdout, "info");
      if (stderr) ctx.log(stderr, "warn");

      return { exitCode: 0 };
    } catch (err: any) {
      if (err.stdout) ctx.log(err.stdout, "info");
      if (err.stderr) ctx.log(err.stderr, "error");
      ctx.log(`Scan failed: ${err.message}`, "error");
      return { exitCode: err.code || 1 };
    }
  },
});

export default agent;
