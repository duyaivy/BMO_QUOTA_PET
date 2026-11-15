import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const { job } = vi.hoisted(() => ({
  job: vi.fn(async () => ({
    status: "not_due",
    requestId: "job-1",
    fetchedAt: null,
    enqueuedCount: 0,
    dataAt: null,
    lastJobAt: null,
    publishedCount: 0,
  })),
}));
vi.mock("@/server/weather/refresh", () => ({ runWeatherJob: job }));
import {
  HEAD,
  GET,
  POST,
  OPTIONS,
} from "@/app/api/internal/weather/refresh/route";
const token = Buffer.alloc(32, 3).toString("base64url");
const url = "https://bmo.test/api/internal/weather/refresh";
describe("weather trigger HTTP", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    job.mockClear();
  });
  it("runs HEAD without a body and keeps diagnostics private", async () => {
    vi.stubEnv(
      "BMO_WEATHER_TRIGGER_TOKEN_SHA256",
      createHash("sha256").update(token).digest("hex"),
    );
    const response = await HEAD(
      new Request(url, {
        method: "HEAD",
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("X-BMO-Weather-Result")).toBe("not_due");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(job).toHaveBeenCalledTimes(1);
    const get = await GET(
      new Request(url, { headers: { authorization: `Bearer ${token}` } }),
    );
    expect((await get.json()).data.status).toBe("not_due");
  });
  it("rejects unauthorized and unsupported methods without running the job", async () => {
    vi.stubEnv(
      "BMO_WEATHER_TRIGGER_TOKEN_SHA256",
      createHash("sha256").update(token).digest("hex"),
    );
    const denied = await HEAD(new Request(url, { method: "HEAD" }));
    expect(denied.status).toBe(401);
    expect(await denied.text()).toBe("");
    expect((await POST()).status).toBe(405);
    expect((await OPTIONS()).headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    expect(job).not.toHaveBeenCalled();
  });
});
