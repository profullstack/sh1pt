import { describe, it, expect } from "vitest";
import { contractTestAgent } from "@profullstack/sh1pt-core/testing";

import agent from "./index.js";

describe("@sh1pt/agent-vu1nz", () => {
  it("has required agent metadata", () => {
    expect(agent.id).toBe("agent-vu1nz");
    expect(agent.label).toBe("vu1nz Actions Security Scanner");
    expect(agent.binary).toBe("vu1nz");
    expect(agent.capabilities).toContain("run-commands");
    expect(typeof agent.check).toBe("function");
    expect(typeof agent.run).toBe("function");
  });

  it("passes contract tests", () => {
    contractTestAgent(agent, {
      sampleConfig: {
        repo: "owner/repo",
      },
    });
  });
});
