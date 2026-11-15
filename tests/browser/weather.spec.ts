import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { password: "local-browser-fixture-password", csrfToken },
      })
    ).status(),
  ).toBe(200);
});

test("location card searches distinct places and saves only the selected provider ID", async ({
  page,
}) => {
  let savedId: number | null = null;
  const city = (id: number, admin1: string) => ({
    provider: "open-meteo",
    id,
    name: "Springfield",
    admin1,
    country: "United States",
    countryCode: "US",
    latitude: 39,
    longitude: -89,
    timezone: "America/Chicago",
  });
  await page.route("**/api/weather/locations*", async (route) =>
    route.fulfill({
      json: { data: [city(1, "Illinois"), city(2, "Missouri")] },
    }),
  );
  await page.route("**/api/settings/weather", async (route) => {
    if (route.request().method() === "POST") {
      savedId = (route.request().postDataJSON() as { locationId: number })
        .locationId;
      await route.fulfill({
        json: {
          data: {
            revision: 2,
            location: city(savedId, "Missouri"),
            status: "pending",
            dataAt: null,
            fetchedAt: null,
            lastJobAt: null,
            temperatureC: null,
            condition: null,
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        data: {
          revision: savedId ? 2 : 1,
          location: savedId ? city(savedId, "Missouri") : null,
          status: savedId ? "pending" : "unconfigured",
          dataAt: null,
          fetchedAt: null,
          lastJobAt: null,
          temperatureC: null,
          condition: null,
        },
      },
    });
  });
  await page.goto("/devices");
  const card = page.getByRole("region", { name: "Thời tiết trên BMO" });
  await expect(card.getByText("Chưa chọn địa điểm").first()).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Lưu địa điểm" }),
  ).toBeDisabled();
  await card.getByLabel("Tìm thành phố hoặc tỉnh").fill("Springfield");
  await card.getByRole("button", { name: "Tìm địa điểm" }).click();
  await card.getByRole("radio", { name: /Springfield.*Missouri/ }).check();
  await card.getByRole("button", { name: "Lưu địa điểm" }).click();
  await expect(card.getByText(/Đã lưu địa điểm/)).toBeVisible();
  expect(savedId).toBe(2);
  await expect(
    card.getByText("BMO nhận cập nhật khi bạn đánh thức thiết bị"),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/bmo-weather-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/bmo-weather-mobile.png",
    fullPage: true,
  });
});

test("conflict refreshes saved revision while retaining the draft selection", async ({
  page,
}) => {
  const location = {
    provider: "open-meteo",
    id: 9,
    name: "Huế",
    admin1: "Thừa Thiên Huế",
    country: "Vietnam",
    countryCode: "VN",
    latitude: 16.46,
    longitude: 107.59,
    timezone: "Asia/Ho_Chi_Minh",
  };
  let posts = 0;
  await page.route("**/api/weather/locations*", (route) =>
    route.fulfill({ json: { data: [location] } }),
  );
  await page.route("**/api/settings/weather", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      if (posts === 1) {
        await route.fulfill({
          status: 409,
          json: { error: { code: "REVISION_CONFLICT" } },
        });
        return;
      }
      const body = route.request().postDataJSON() as {
        expectedRevision: number;
        locationId: number;
      };
      expect(body).toEqual({ expectedRevision: 2, locationId: 9 });
      await route.fulfill({
        json: {
          data: {
            revision: 3,
            location,
            status: "pending",
            dataAt: null,
            fetchedAt: null,
            lastJobAt: null,
            temperatureC: null,
            condition: null,
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        data: {
          revision: posts ? 2 : 1,
          location: null,
          status: "unconfigured",
          dataAt: null,
          fetchedAt: null,
          lastJobAt: null,
          temperatureC: null,
          condition: null,
        },
      },
    });
  });
  await page.goto("/devices");
  const card = page.getByRole("region", { name: "Thời tiết trên BMO" });
  await card.getByLabel("Tìm thành phố hoặc tỉnh").fill("Hue");
  await card.getByLabel("Tìm thành phố hoặc tỉnh").press("Enter");
  await card.getByRole("radio", { name: /Huế/ }).check();
  await card.getByRole("button", { name: "Lưu địa điểm" }).click();
  await expect(card.getByRole("status")).toContainText("Địa điểm đã thay đổi");
  await expect(card.getByRole("radio", { name: /Huế/ })).toBeChecked();
  await card.getByRole("button", { name: "Lưu địa điểm" }).click();
  await expect(card.getByRole("status")).toContainText("Đã lưu địa điểm");
  expect(posts).toBe(2);
});

test("empty location results and provider errors preserve the saved place", async ({
  page,
}) => {
  const location = {
    provider: "open-meteo",
    id: 1,
    name: "Đà Nẵng",
    admin1: null,
    country: "Vietnam",
    countryCode: "VN",
    latitude: 16.06,
    longitude: 108.22,
    timezone: "Asia/Ho_Chi_Minh",
  };
  let searches = 0;
  await page.route("**/api/settings/weather", (route) =>
    route.fulfill({
      json: {
        data: {
          revision: 2,
          location,
          status: "fresh",
          dataAt: "2026-11-15T00:00:00.000Z",
          fetchedAt: "2026-11-15T00:01:00.000Z",
          lastJobAt: "2026-11-15T00:01:00.000Z",
          temperatureC: 28,
          condition: "clear",
        },
      },
    }),
  );
  await page.route("**/api/weather/locations*", (route) => {
    searches++;
    return route.fulfill(
      searches === 1
        ? { json: { data: [] } }
        : { status: 503, json: { error: { code: "TEMPORARY_FAILURE" } } },
    );
  });
  await page.goto("/devices");
  const card = page.getByRole("region", { name: "Thời tiết trên BMO" });
  await expect(card.getByText(/Địa điểm đã lưu: Đà Nẵng/)).toBeVisible();
  await card.getByLabel("Tìm thành phố hoặc tỉnh").fill("Unknown city");
  await card.getByRole("button", { name: "Tìm địa điểm" }).click();
  await expect(card.getByRole("status")).toContainText("Không tìm thấy");
  await card.getByRole("button", { name: "Tìm địa điểm" }).click();
  await expect(card.getByRole("status")).toContainText("Không thể tìm");
  await expect(card.getByText(/Địa điểm đã lưu: Đà Nẵng/)).toBeVisible();
});
