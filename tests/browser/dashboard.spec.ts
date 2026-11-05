import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import {
  observation,
  fixtureWindow,
  heartbeat,
  signedRequest,
} from "../fixtures/usage";
async function login(page: Page) {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { password: "local-browser-fixture-password", csrfToken },
      })
    ).status(),
  ).toBe(200);
}
async function send(request: APIRequestContext, event: unknown) {
  const signed = signedRequest(event);
  const response = await request.post("/api/internal/usage/ingest", {
    headers: Object.fromEntries(signed.headers),
    data: await signed.text(),
  });
  expect(response.status()).toBe(200);
}
async function save(request: APIRequestContext, data: unknown) {
  const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
  return request.post("/api/devices/config", {
    headers: { Origin: "http://127.0.0.1:3100", "X-CSRF-Token": csrfToken },
    data,
  });
}
test.beforeEach(async ({ page }) => login(page));
test("persisted unknown, stale and reset values stay honest after heartbeat and refresh", async ({
  page,
}) => {
  const captured = new Date(Date.now() - 1000).toISOString(),
    old = new Date(Date.now() - 960000).toISOString();
  const windows = [
    fixtureWindow("amount", null, captured, {
      label: "Amount only",
      upstreamObservedAt: null,
      freshnessBasis: "unknown",
      sourceFreshness: "unknown",
    }),
    fixtureWindow("unknown", 45, captured, {
      label: "Unknown source age",
      upstreamObservedAt: null,
      freshnessBasis: "unknown",
      sourceFreshness: "unknown",
    }),
    fixtureWindow("stale", 70, old, { label: "Old quota" }),
    fixtureWindow("expiry", 63, captured, {
      label: "Reset boundary",
      resetAt: new Date(Date.now() + 5000).toISOString(),
    }),
  ];
  await send(
    page.request,
    observation({
      providerId: "antigravity",
      sourceType: "antigravity-statusline",
      sequence: 10,
      collectedAt: captured,
      windows,
    }),
  );
  await page.goto("/");
  const amount = page.getByRole("group", { name: "Khung hạn mức Amount only" });
  await expect(amount.getByRole("progressbar")).not.toHaveAttribute(
    "aria-valuenow",
  );
  await expect(amount.getByText("0%", { exact: true })).toHaveCount(0);
  const unknown = page.getByRole("group", {
    name: "Khung hạn mức Unknown source age",
  });
  await expect(
    unknown.getByText("Tuổi dữ liệu nguồn chưa xác định", { exact: true }),
  ).toBeVisible();
  await expect(unknown.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "45",
  );
  const stale = page.getByRole("group", { name: "Khung hạn mức Old quota" });
  await expect(stale.getByText("70%", { exact: true })).toBeVisible();
  await expect(
    stale.getByText("Dữ liệu cũ · giá trị gần nhất", { exact: true }),
  ).toBeVisible();
  const captureBefore = await stale
    .locator("time")
    .first()
    .getAttribute("datetime");
  const expiry = page.getByRole("group", {
    name: "Khung hạn mức Reset boundary",
  });
  await expect(
    expiry.getByText("Đã quá thời gian đặt lại", { exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await expect(expiry.getByText("63%", { exact: true })).toBeVisible();
  await expect(expiry.getByRole("progressbar")).not.toHaveAttribute(
    "aria-valuenow",
  );
  await send(
    page.request,
    heartbeat({
      providerId: "antigravity",
      sourceType: "antigravity-statusline",
      sequence: 9000,
      lastSourceEventAt: captured,
    }),
  );
  await page.getByRole("button", { name: "Làm mới dữ liệu ứng dụng" }).click();
  await expect(stale.locator("time").first()).toHaveAttribute(
    "datetime",
    captureBefore!,
  );
  await send(
    page.request,
    observation({
      providerId: "antigravity",
      sourceType: "antigravity-statusline",
      sequence: 11,
      dataStatus: "unsupported",
      sourceAvailability: "unsupported",
      errorCode: "SCHEMA_UNSUPPORTED",
      windows: [],
    }),
  );
  await page.getByRole("button", { name: "Làm mới dữ liệu ứng dụng" }).click();
  const provider = page.getByRole("region", { name: "Hạn mức Antigravity" });
  await expect(
    provider.getByText("Không hỗ trợ", { exact: true }).first(),
  ).toBeVisible();
  await expect(stale.getByText("70%", { exact: true })).toBeVisible();
  await send(
    page.request,
    observation({
      providerId: "antigravity",
      sourceType: "antigravity-statusline",
      sequence: 12,
      dataStatus: "unavailable",
      sourceAvailability: "inactive",
      errorCode: "SOURCE_INACTIVE",
      windows: [],
    }),
  );
  await page.getByRole("button", { name: "Làm mới dữ liệu ứng dụng" }).click();
  await expect(
    provider.getByText("Hạn mức không khả dụng", { exact: true }),
  ).toBeVisible();
  await expect(stale.locator("time").first()).toHaveAttribute(
    "datetime",
    captureBefore!,
  );
  await page.screenshot({
    path: "test-results/phase1-overview.png",
    fullPage: true,
  });
});
test("device screen order persists and the 128 by 64 preview handles null and missing values", async ({
  page,
}) => {
  await send(
    page.request,
    observation({
      providerId: "claude",
      sourceType: "claude-statusline",
      sequence: 50,
      windows: [
        fixtureWindow("device.fixture", 22, undefined, {
          label: "Device fixture",
        }),
      ],
    }),
  );
  await send(
    page.request,
    observation({
      providerId: "antigravity",
      sourceType: "antigravity-statusline",
      sequence: 20,
      windows: [
        fixtureWindow("device.amount", null, undefined, {
          label: "Device amount",
        }),
      ],
    }),
  );
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/devices");
  await page
    .getByLabel("Thêm màn hình hạn mức")
    .selectOption(JSON.stringify(["claude", "device.fixture"]));
  await page
    .getByRole("button", { name: "Thêm màn hình", exact: true })
    .click();
  await page
    .getByLabel("Thêm màn hình hạn mức")
    .selectOption(JSON.stringify(["antigravity", "device.amount"]));
  await page
    .getByRole("button", { name: "Thêm màn hình", exact: true })
    .click();
  const list = page.getByRole("list", { name: "Danh sách màn hình hiển thị" }),
    items = list.getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(
    items.first().getByRole("button", { name: "Xóa màn hình", exact: true }),
  ).toBeDisabled();
  await items
    .nth(2)
    .getByRole("button", { name: "Lên trên", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lưu cài đặt hiển thị", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu cài đặt hiển thị", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const device = (await (await page.request.get("/api/devices/config")).json())
    .data;
  expect(
    device.screens.map((screen: { kind: string; providerId?: string }) =>
      screen.kind === "pet" ? "pet" : screen.providerId,
    ),
  ).toEqual(["pet", "antigravity", "claude"]);
  await page
    .getByLabel("Màn hình xem trước", { exact: true })
    .selectOption(device.screens[1].screenId);
  const preview = page.getByRole("img", {
    name: "Xem trước cấu hình OLED 128x64",
  });
  await expect(preview).toHaveAttribute("width", "128");
  await expect(preview).toHaveAttribute("height", "64");
  await expect(preview).toContainText("—");
  await expect(preview).not.toContainText("0%");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const missing = {
    kind: "quota",
    screenId: "missing-screen",
    providerId: "codex",
    windowId: "missing-preview",
  };
  expect(
    (
      await save(page.request, {
        expectedRevision: device.revision,
        name: device.name,
        screens: [...device.screens, missing],
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page
    .getByLabel("Màn hình xem trước", { exact: true })
    .selectOption("missing-screen");
  await expect(preview).toContainText("Không khả dụng");
  await page.screenshot({
    path: "test-results/phase1-devices.png",
    fullPage: true,
  });
});
test("device revision conflict preserves edits and requires an explicit second save", async ({
  page,
}) => {
  await page.goto("/devices");
  await page.getByLabel("Tên màn hình", { exact: true }).fill("My local edits");
  const device = (await (await page.request.get("/api/devices/config")).json())
    .data;
  expect(
    (
      await save(page.request, {
        expectedRevision: device.revision,
        name: "Another tab",
        screens: device.screens,
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Lưu cài đặt hiển thị", exact: true })
    .click();
  await expect(
    page.getByText(/Cài đặt hiển thị đã thay đổi ở nơi khác/),
  ).toBeVisible();
  await expect(page.getByLabel("Tên màn hình", { exact: true })).toHaveValue(
    "My local edits",
  );
  await page
    .getByRole("button", { name: "Lưu cài đặt hiển thị", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu cài đặt hiển thị", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/devices/config")).json()).data.name,
  ).toBe("My local edits");
});
