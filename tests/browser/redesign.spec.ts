import { expect, test } from "@playwright/test";
import { startFixtureApp } from "../fixtures/browser-app";
import { fixtureWindow, observation, signedRequest } from "../fixtures/usage";

test.use({ baseURL: "http://127.0.0.1:3105" });
let stop: () => Promise<void>;
test.beforeAll(async () => {
  stop = await startFixtureApp(3105);
});
test.afterAll(async () => {
  await stop?.();
});
test.beforeEach(async ({ page }) => {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { Origin: "http://127.0.0.1:3105" },
        data: { password: "local-browser-fixture-password", csrfToken },
      })
    ).ok(),
  ).toBe(true);
});

test("provider navigation, empty states, precision, countdown and responsive dashboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1672, height: 1050 });
  await page.goto("/providers/antigravity");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Antigravity",
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Tóm tắt nhà cung cấp" })
      .getByText("Chưa có dữ liệu", { exact: true }),
  ).toHaveCount(2);
  const navigation = page.getByRole("navigation", { name: "Điều hướng chính" });
  for (const [name, id] of [
    ["Antigravity", "antigravity"],
    ["Codex", "codex"],
    ["Claude Code", "claude"],
  ]) {
    await navigation.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(`/providers/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name!);
    await expect(
      navigation.getByRole("link", { name, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Thu gọn nhà cung cấp" }).click();
  await expect(
    navigation.getByRole("link", { name: "Antigravity", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Mở rộng nhà cung cấp" }).click();
  await navigation
    .getByRole("link", { name: "Antigravity", exact: true })
    .click();
  const captured = new Date(Date.now() - 1000).toISOString();
  const reset = new Date(Date.now() + 18000000).toISOString();
  const signed = signedRequest(
    observation({
      providerId: "antigravity",
      sourceType: "antigravity-statusline",
      sequence: 1,
      windows: [
        fixtureWindow("3p-5h", 0, captured, { resetAt: reset }),
        fixtureWindow("3p-weekly", 0, captured, {
          resetAt: new Date(Date.now() + 604800000).toISOString(),
        }),
        fixtureWindow("gemini-5h", 8.7654, captured, {
          remainingPercent: 91.2346,
          resetAt: reset,
          upstreamObservedAt: null,
          sourceFreshness: "unknown",
          freshnessBasis: "unknown",
        }),
        fixtureWindow("gemini-weekly", 11, captured, {
          resetAt: new Date(Date.now() + 400000000).toISOString(),
        }),
      ],
    }),
  );
  expect(
    (
      await page.request.post("/api/internal/usage/ingest", {
        headers: Object.fromEntries(signed.headers),
        data: await signed.text(),
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "Làm mới dữ liệu ứng dụng" }).click();
  const thirdParty = page.getByRole("region", { name: "Nhóm Claude & GPT" });
  const gemini = page.getByRole("region", { name: "Nhóm Gemini", exact: true });
  await expect(thirdParty.getByRole("progressbar")).toHaveCount(2);
  await expect(gemini.getByRole("progressbar")).toHaveCount(2);
  await expect(gemini.getByText("91.23%", { exact: true })).toBeVisible();
  await expect(gemini.getByText("8.77%", { exact: true })).toBeVisible();
  await expect(
    gemini.getByText("Chưa xác minh độ mới", { exact: true }),
  ).toBeVisible();
  await expect(
    thirdParty.getByText("Dữ liệu mới", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Tóm tắt nhà cung cấp" })
      .getByText("95.62%", { exact: true }),
  ).toBeVisible();
  await expect(gemini.getByRole("progressbar").first()).toHaveAttribute(
    "aria-valuenow",
    "91.2346",
  );
  const details = gemini.getByRole("group").first();
  await details.getByText("Chi tiết dữ liệu", { exact: true }).click();
  await expect(details.locator("time").first()).toHaveAttribute(
    "datetime",
    reset,
  );
  await details.getByText("Chi tiết dữ liệu", { exact: true }).click();
  await page.screenshot({
    path: "test-results/redesign-antigravity-desktop.png",
    fullPage: true,
  });
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Mở menu điều hướng" }).click();
    await expect(
      page.getByRole("dialog", { name: "Menu điều hướng" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Mở menu điều hướng" }),
    ).toBeFocused();
    await page.screenshot({
      path: `test-results/redesign-antigravity-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("anonymous users see login and cannot open provider data or admin actions", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/providers/antigravity");
  await expect(page).toHaveURL("/login");
  await expect(
    page.getByRole("button", { name: "Đăng xuất", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Cài đặt", exact: true }),
  ).toHaveCount(0);
  for (const id of ["codex", "claude"]) {
    await page.goto(`/providers/${id}`);
    await expect(page).toHaveURL("/login");
  }
  await context.close();
});

test("each provider keeps its own values, colors, and disabled-state boundaries", async ({
  page,
}) => {
  const captured = new Date(Date.now() - 1000).toISOString();
  for (const event of [
    observation({
      providerId: "codex",
      sequence: 1,
      windows: [
        fixtureWindow("codex.primary", 51.1234, captured),
        fixtureWindow("codex.secondary", 85.4321, captured),
      ],
    }),
    observation({
      providerId: "claude",
      sourceType: "claude-statusline",
      sequence: 1,
      windows: [
        fixtureWindow("five_hour", 25.6789, captured),
        fixtureWindow("seven_day", null, captured),
      ],
    }),
  ]) {
    const signed = signedRequest(event);
    expect(
      (
        await page.request.post("/api/internal/usage/ingest", {
          headers: Object.fromEntries(signed.headers),
          data: await signed.text(),
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto("/providers/codex");
  await expect(
    page
      .getByRole("group", { name: /^Khung hạn mức / })
      .first()
      .getByText("48.88%", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "data-tone",
    "warning",
  );
  await expect(page.getByRole("progressbar").nth(1)).toHaveAttribute(
    "data-tone",
    "critical",
  );
  await expect(page.getByText("91.23%", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/redesign-codex-desktop.png",
    fullPage: true,
  });
  await page.goto("/providers/claude");
  await expect(
    page
      .getByRole("group", { name: /^Khung hạn mức / })
      .first()
      .getByText("74.32%", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar").first()).toHaveAttribute(
    "data-tone",
    "healthy",
  );
  await expect(page.getByRole("progressbar").nth(1)).not.toHaveAttribute(
    "aria-valuenow",
  );
  await expect(
    page
      .getByRole("group", { name: /^Khung hạn mức / })
      .nth(1)
      .getByText("Chưa có dữ liệu", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/redesign-claude-desktop.png",
    fullPage: true,
  });
  await page.goto("/settings/providers");
  const settings = page.getByRole("region", { name: "Cài đặt nguồn Codex" });
  await settings
    .getByRole("button", { name: "Tắt nguồn", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "Bật nguồn", exact: true }),
  ).toBeVisible();
  await page.goto("/providers/codex");
  await expect(
    page
      .getByRole("region", { name: "Tóm tắt nhà cung cấp" })
      .getByText("Chưa có dữ liệu", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByRole("progressbar").first()).not.toHaveAttribute(
    "aria-valuenow",
  );
  await expect(
    page.getByText("Gần nhất 48.88%", { exact: true }),
  ).toBeVisible();
  await page.goto("/settings/providers");
  await settings
    .getByRole("button", { name: "Bật nguồn", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "Tắt nguồn", exact: true }),
  ).toBeVisible();
});

test("all application pages remain usable without overflow at mobile, tablet and desktop widths", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const routes = [
    "/",
    "/settings/providers",
    "/collectors",
    "/devices",
    "/status",
    "/login",
    "/providers/antigravity",
    "/providers/codex",
    "/providers/claude",
  ];
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const path of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
      if (path === "/devices") {
        const quotaSelector = await page
          .getByLabel("Thêm màn hình hạn mức", { exact: true })
          .boundingBox();
        expect(quotaSelector?.height).toBeGreaterThanOrEqual(44);
        await page
          .getByText("Kết nối và bảo mật thiết bị", { exact: true })
          .click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      if ([375, 1440].includes(width) && !path.startsWith("/providers/"))
        await page.screenshot({
          path: `test-results/redesign-${path === "/" ? "overview" : path.split("/").at(-1)}-${width}.png`,
          fullPage: true,
        });
    }
  }
  expect(errors).toEqual([]);
});
