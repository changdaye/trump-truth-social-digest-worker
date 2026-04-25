import { describe, expect, it } from "vitest";
import { shouldSendFailureAlert, shouldSendHeartbeat } from "../src/lib/runtime";

describe("runtime decisions", () => {
  it("sends heartbeat when there has never been one", () => {
    expect(shouldSendHeartbeat({ consecutiveFailures: 0 }, 24, new Date("2026-04-24T00:00:00.000Z"))).toBe(true);
  });

  it("respects heartbeat intervals", () => {
    expect(
      shouldSendHeartbeat(
        { consecutiveFailures: 0, lastHeartbeatAt: "2026-04-24T00:00:00.000Z" },
        24,
        new Date("2026-04-24T12:00:00.000Z")
      )
    ).toBe(false);
  });

  it("sends a failure alert when threshold is reached", () => {
    expect(
      shouldSendFailureAlert({ consecutiveFailures: 1 }, 1, 180, new Date("2026-04-24T12:00:00.000Z"))
    ).toBe(true);
  });
});
