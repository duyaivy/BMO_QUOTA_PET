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
  { label: "Overview", path: "/", heading: "Your quota at a glance" },
  {
    label: "Providers",
    path: "/settings/providers",
    heading: "Provider sources",
  },
  { label: "Collectors", path: "/collectors", heading: "Collectors" },
  { label: "Devices", path: "/devices", heading: "BMO displays" },
  { label: "Status", path: "/status", heading: "Service status" },
  { label: "Owner login", path: "/login", heading: "Sign in" },
];

for (const width of [375, 1440]) {
  test(`navigation and layout work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    for (const route of routes) {
      const link = page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: route.label, exact: true });
      await link.click();
      await expect(page).toHaveURL(route.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        route.heading,
      );
      await expect(link).toHaveAttribute("aria-current", "page");
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
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  // Restart the tab order to exercise the horizontally scrolling mobile links.
  await page.goto("/");
  await page.keyboard.press("Tab");
  for (const route of routes) {
    await page.keyboard.press("Tab");
    const link = page
      .getByRole("navigation")
      .getByRole("link", { name: route.label, exact: true });
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport();
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/login");
});

test("unverified sources remain explicit", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByText("Integration unverified", { exact: true }),
  ).toHaveCount(3);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Providers", exact: true })
    .click();
  await expect(page).toHaveURL("/settings/providers");
  await expect(
    page.getByText("Integration unverified", { exact: true }),
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
  await page.getByRole("link", { name: "Return to overview" }).click();
  await expect(page).toHaveURL("/");
});
