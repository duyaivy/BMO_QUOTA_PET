import { expect, test } from "@playwright/test";

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
      await expect(
        page.getByText("Local preview · Authentication is not implemented", {
          exact: true,
        }),
      ).toBeVisible();
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

test("unconfigured placeholders accept no credentials and fabricate no usage", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Integration unverified", { exact: true }),
  ).toHaveCount(3);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.getByRole("link", { name: "Review provider setup" }).click();
  await expect(page).toHaveURL("/settings/providers");
  await expect(page.getByText("Unverified", { exact: true })).toHaveCount(3);
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Authentication is unavailable" }),
  ).toBeVisible();
  await expect(page.locator("input, form")).toHaveCount(0);
  await page.goto("/status");
  await expect(
    page.getByRole("heading", { name: "Service checks are unavailable" }),
  ).toBeVisible();
});

test("unknown routes return 404 and offer a working path home", async ({
  page,
}) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "Return to overview" }).click();
  await expect(page).toHaveURL("/");
});
