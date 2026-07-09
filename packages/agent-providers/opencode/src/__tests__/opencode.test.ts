import { describe, expect, it, vi } from "vitest";
import { createOpencodeProvider, type CommandRunner } from "../provider";

describe("opencode provider", () => {
  it("runs opencode with prompt context and configured flags", async () => {
    const calls: Array<{ command: string; args: string[]; cwd?: string; timeoutMs: number }> = [];
    const runner: CommandRunner = vi.fn(async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd, timeoutMs: options.timeoutMs });
      return { stdout: "done\n", stderr: "", exitCode: 0 };
    });

    const provider = createOpencodeProvider({
      runner,
      env: {
        OPENCODE_BIN: "opencode",
        OPENCODE_MODEL: "anthropic/claude-sonnet-4",
        OPENCODE_AGENT: "build",
        OPENCODE_ATTACH: "http://127.0.0.1:4096",
        OPENCODE_DIR: "/tmp/project",
        OPENCODE_TIMEOUT_MS: "45000",
      },
    });

    await expect(provider.chat({
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Explain the deploy plan." },
      ],
    })).resolves.toEqual({ content: "done" });

    expect(calls).toEqual([{
      command: "opencode",
      args: [
        "run",
        "--model",
        "anthropic/claude-sonnet-4",
        "--agent",
        "build",
        "--attach",
        "http://127.0.0.1:4096",
        "--dir",
        "/tmp/project",
        "SYSTEM:\nBe concise.\n\nUSER:\nExplain the deploy plan.",
      ],
      cwd: "/tmp/project",
      timeoutMs: 45000,
    }]);
  });

  it("rejects empty chat requests before running the CLI", async () => {
    const runner: CommandRunner = vi.fn();
    const provider = createOpencodeProvider({ runner, env: {} });

    await expect(provider.chat({ messages: [] })).rejects.toThrow("requires at least one message");
    expect(runner).not.toHaveBeenCalled();
  });

  it("lists models from opencode output", async () => {
    const runner: CommandRunner = vi.fn(async () => ({
      stdout: "anthropic/claude-sonnet-4\nopenai/gpt-4.1\nopenai/gpt-4.1\n",
      stderr: "",
      exitCode: 0,
    }));
    const provider = createOpencodeProvider({
      runner,
      env: { OPENCODE_MODELS_PROVIDER: "anthropic" },
    });

    await expect(provider.listModels()).resolves.toEqual([
      "anthropic/claude-sonnet-4",
      "openai/gpt-4.1",
    ]);
    expect(runner).toHaveBeenCalledWith("opencode", ["models", "anthropic"], expect.any(Object));
  });

  it("reports CLI availability through healthcheck", async () => {
    const runner: CommandRunner = vi.fn(async () => ({
      stdout: "opencode 0.7.1\n",
      stderr: "",
      exitCode: 0,
    }));
    const provider = createOpencodeProvider({ runner, env: {} });

    await expect(provider.healthcheck()).resolves.toEqual({
      ok: true,
      message: "opencode 0.7.1",
    });
    expect(runner).toHaveBeenCalledWith("opencode", ["--version"], expect.any(Object));
  });

  it("redacts sensitive values from CLI failures", async () => {
    const runner: CommandRunner = vi.fn(async () => ({
      stdout: "",
      stderr: "auth failed for secret-pass",
      exitCode: 1,
    }));
    const provider = createOpencodeProvider({
      runner,
      env: { OPENCODE_SERVER_PASSWORD: "secret-pass" },
    });

    await expect(provider.chat({
      messages: [{ role: "user", content: "hello" }],
    })).rejects.toThrow("auth failed for [redacted]");
  });

  it("validates timeout configuration", () => {
    const provider = createOpencodeProvider();

    expect(() => provider.validateEnv({ OPENCODE_TIMEOUT_MS: "0" })).toThrow("positive integer");
    expect(() => provider.validateEnv({ OPENCODE_TIMEOUT_MS: "15000" })).not.toThrow();
  });
});
