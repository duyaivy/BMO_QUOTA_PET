import { describe, it, expect } from "vitest";
import { parseFixture } from "../src/adapters/parse.js";
import { LineFramer } from "../src/framer.js";
describe("synthetic parsers", () => {
  it("parses dynamic windows for each provider", () => {
    expect(
      parseFixture(
        "codex",
        JSON.stringify({
          fixtureSchema: "codex-v1",
          type: "event_msg",
          payload: {
            type: "token_count",
            rate_limits: { odd: { used_percent: 20 } },
          },
        }),
      ).windows[0]?.windowId,
    ).toBe("odd");
    expect(
      parseFixture(
        "claude",
        JSON.stringify({
          fixtureSchema: "claude-v1",
          rate_limits: { seven_day: { used_percentage: 30 } },
        }),
      ).windows[0]?.used,
    ).toBe(30);
    expect(
      parseFixture(
        "antigravity",
        JSON.stringify({
          fixtureSchema: "antigravity-v1",
          quota: { x: { remaining_fraction: 0.5 } },
        }),
      ).windows[0]?.used,
    ).toBe(50);
  });
  it("treats a valid marker with a missing quota object as unavailable", () => {
    expect(
      parseFixture("claude", JSON.stringify({ fixtureSchema: "claude-v1" })),
    ).toMatchObject({ status: "unavailable", errorCode: "SOURCE_UNAVAILABLE" });
  });
  it("marks schema and malformed input distinctly", () => {
    expect(parseFixture("codex", "{}").status).toBe("unsupported");
    expect(parseFixture("claude", "[").errorCode).toBe("MALFORMED_QUOTA");
  });
  it("omits amount-only and relative-reset fields", () => {
    expect(
      parseFixture(
        "antigravity",
        JSON.stringify({
          fixtureSchema: "antigravity-v1",
          quota: { x: { remaining_amount: 20, reset_in_seconds: 5 } },
        }),
      ).windows,
    ).toMatchObject([{ used: null, reset: null }]);
    expect(
      parseFixture(
        "antigravity",
        JSON.stringify({
          fixtureSchema: "antigravity-v1",
          quota: { x: { remaining_fraction: 0.5, reset_in_seconds: 5 } },
        }),
      ).windows[0]?.reset,
    ).toBeNull();
  });
  it("handles bounded partial lines", () => {
    const f = new LineFramer(4);
    expect(f.push("ab\n12345\nxy")).toEqual({ records: ["ab"], rejected: 1 });
    expect(f.finish()).toEqual({ record: "xy", rejected: 0 });
    const split = new LineFramer(4);
    expect(split.push("12345")).toEqual({ records: [], rejected: 1 });
    expect(split.push("suffix\nnext\n")).toEqual({
      records: ["next"],
      rejected: 0,
    });
  });
});
