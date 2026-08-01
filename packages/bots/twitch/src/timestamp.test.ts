import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTwitchTimestamp } from "./timestamp.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("parseTwitchTimestamp", () => {
  it("converts a decimal millisecond timestamp", () => {
    expect(parseTwitchTimestamp("1700000000000")).toBe("2023-11-14T22:13:20.000Z");
  });

  it.each([
    undefined,
    "",
    "1e3",
    "1.5",
    "-1",
    " 1700000000000 ",
    "9007199254740992",
    "8640000000000001",
  ])("falls back to the current time for an invalid timestamp: %s", (value) => {
    vi.useFakeTimers().setSystemTime(new Date("2026-08-01T18:20:00.000Z"));
    expect(parseTwitchTimestamp(value)).toBe("2026-08-01T18:20:00.000Z");
  });
});
