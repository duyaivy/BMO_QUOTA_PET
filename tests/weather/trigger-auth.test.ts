import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { verifyWeatherTrigger } from "@/server/weather/trigger-auth";
const token = Buffer.alloc(32, 7).toString("base64url");
const digest = createHash("sha256").update(token).digest("hex");
function request(
  url = "https://bmo.test/api/internal/weather/refresh",
  authorization?: string,
) {
  return new Request(url, {
    method: "HEAD",
    headers: authorization ? { authorization } : undefined,
  });
}
describe("weather monitor authentication", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("accepts one bearer or query credential only", () => {
    vi.stubEnv("BMO_WEATHER_TRIGGER_TOKEN_SHA256", digest);
    expect(verifyWeatherTrigger(request(undefined, `Bearer ${token}`))).toBe(
      "authorized",
    );
    expect(
      verifyWeatherTrigger(
        request(`https://bmo.test/api/internal/weather/refresh?token=${token}`),
      ),
    ).toBe("authorized");
    expect(
      verifyWeatherTrigger(
        request(
          `https://bmo.test/api/internal/weather/refresh?token=${token}`,
          `Bearer ${token}`,
        ),
      ),
    ).toBe("unauthorized");
    expect(
      verifyWeatherTrigger(
        request(
          `https://bmo.test/api/internal/weather/refresh?token=${token}&token=${token}`,
        ),
      ),
    ).toBe("unauthorized");
    expect(
      verifyWeatherTrigger(
        request(
          `https://bmo.test/api/internal/weather/refresh?token=${token}`,
          "Bearer wrong",
        ),
      ),
    ).toBe("unauthorized");
  });
  it("fails closed on missing or malformed digest and unknown tokens", () => {
    expect(verifyWeatherTrigger(request())).toBe("misconfigured");
    vi.stubEnv("BMO_WEATHER_TRIGGER_TOKEN_SHA256", "bad");
    expect(verifyWeatherTrigger(request(undefined, `Bearer ${token}`))).toBe(
      "misconfigured",
    );
    vi.stubEnv("BMO_WEATHER_TRIGGER_TOKEN_SHA256", digest);
    expect(verifyWeatherTrigger(request(undefined, "Bearer bad"))).toBe(
      "unauthorized",
    );
    expect(
      verifyWeatherTrigger(request(undefined, "Bearer " + "x".repeat(257))),
    ).toBe("unauthorized");
    vi.stubEnv("CRON_SECRET", token);
    expect(verifyWeatherTrigger(request())).toBe("unauthorized");
  });
});
