import { expect, test, type APIRequestContext } from "@playwright/test";

async function login(request: APIRequestContext) {
  const csrf = await request.get("/api/auth/csrf");
  expect(csrf.ok()).toBe(true);
  const { csrfToken } = await csrf.json();
  const response = await request.post("/api/auth/login", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { password: "local-browser-fixture-password", csrfToken },
  });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await login(page.request);
});

const routes = [
  { label: "Tổng quan", path: "/", heading: "Tổng quan hạn mức của bạn" },
  {
    label: "Nhà cung cấp",
    path: "/settings/providers",
    heading: "Nguồn nhà cung cấp",
  },
  { label: "Bộ thu thập", path: "/collectors", heading: "Bộ thu thập" },
  { label: "Thiết bị", path: "/devices", heading: "Màn hình hiển thị BMO" },
  { label: "Trạng thái", path: "/status", heading: "Trạng thái dịch vụ" },
  { label: "Đăng nhập quản trị", path: "/login", heading: "Đăng nhập" },
];

for (const width of [375, 1440]) {
  test(`navigation and layout work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    for (const route of routes) {
      if (width < 1024)
        await page.getByRole("button", { name: "Mở menu điều hướng" }).click();
      const link = page
        .getByRole("navigation", { name: "Điều hướng chính" })
        .getByRole("link", { name: route.label, exact: true });
      await link.click();
      await expect(page).toHaveURL(route.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        route.heading,
      );
      if (width < 1024)
        await page.getByRole("button", { name: "Mở menu điều hướng" }).click();
      await expect(link).toHaveAttribute("aria-current", "page");
      if (width < 1024) await page.keyboard.press("Escape");
      await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test("keyboard skip link and mobile navigation reach every route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Chuyển đến nội dung" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  await page.getByRole("button", { name: "Mở menu điều hướng" }).click();
  await expect(
    page.getByRole("dialog", { name: "Menu điều hướng" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Đóng menu điều hướng" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Đăng xuất", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Đóng menu điều hướng" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Mở menu điều hướng" }),
  ).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("unverified sources remain explicit", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Tích hợp chưa xác minh", { exact: true }),
  ).toHaveCount(3);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Nhà cung cấp", exact: true })
    .click();
  await expect(page).toHaveURL("/settings/providers");
  await expect(
    page.getByText("Tích hợp chưa xác minh", { exact: true }),
  ).toHaveCount(3);
});

test("protected pages reject anonymous and tampered sessions; logout revokes cookie replay", async ({
  page,
  browser,
}) => {
  const request = page.request;
  const original = await page.context().cookies();
  const csrf = await (await request.get("/api/auth/csrf")).json();
  const logout = await request.post("/api/auth/logout", {
    headers: {
      Origin: "http://127.0.0.1:3100",
      "X-CSRF-Token": csrf.csrfToken,
    },
  });
  expect(logout.ok()).toBe(true);
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  const replay = await browser.newContext();
  await replay.addCookies(original);
  const replayPage = await replay.newPage();
  await replayPage.goto("/settings/providers");
  await expect(replayPage).toHaveURL("/login");
  await replay.close();
  const tampered = await browser.newContext();
  await tampered.addCookies(
    original.map((cookie) => ({ ...cookie, value: cookie.value + "tampered" })),
  );
  const tamperedPage = await tampered.newPage();
  await tamperedPage.goto("/devices");
  await expect(tamperedPage).toHaveURL("/login");
  await tampered.close();
});

test("cookie mutations require same-origin CSRF and accept no collector identity", async ({
  page,
}) => {
  const request = page.request;
  const csrf = await (await request.get("/api/auth/csrf")).json();
  const badOrigin = await request.post("/api/auth/logout", {
    headers: {
      Origin: "https://attacker.invalid",
      "X-CSRF-Token": csrf.csrfToken,
    },
  });
  expect(badOrigin.status()).toBe(403);
  const noToken = await request.post("/api/auth/logout", {
    headers: { Origin: "http://127.0.0.1:3100" },
  });
  expect(noToken.status()).toBe(403);
  const noOrigin = await request.post("/api/auth/login", {
    data: {
      password: "local-browser-fixture-password",
      csrfToken: csrf.csrfToken,
    },
  });
  expect(noOrigin.status()).toBe(403);
});

test("unknown routes return 404 and offer a working path home", async ({
  page,
}) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "Quay lại trang tổng quan" }).click();
  await expect(page).toHaveURL("/");
});
