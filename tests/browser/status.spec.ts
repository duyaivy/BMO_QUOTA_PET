import { expect, test } from "@playwright/test";
import {
  fixtureWindow,
  heartbeat,
  observation,
  signedRequest,
} from "../fixtures/usage";
import type { DashboardSnapshot } from "../../src/contracts/dashboard";

test("status reflects persisted provider quota without treating upload or verification as freshness", async ({
  page,
}) => {
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { password: "local-browser-fixture-password", csrfToken },
      })
    ).ok(),
  ).toBe(true);
  const snapshot = (await (await page.request.get("/api/dashboard")).json())
    .data as DashboardSnapshot;
  const codex = snapshot.providers.find(
    (provider) => provider.providerId === "codex",
  )!;
  const sequence = Date.now();
  const old = new Date(Date.now() - 960000).toISOString();
  const windows = codex.windows.length
    ? codex.windows.map(({ window }) => fixtureWindow(window.windowId, 47, old))
    : [fixtureWindow("status-window", 47, old)];
  const event = observation({
    ownershipGeneration: codex.ownershipGeneration,
    sequence,
    collectedAt: old,
    upstreamObservedAt: old,
    windows,
  });
  const signed = signedRequest(event);
  expect(
    (
      await page.request.post("/api/internal/usage/ingest", {
        headers: Object.fromEntries(signed.headers),
        data: await signed.text(),
      })
    ).status(),
  ).toBe(200);
  const pulse = signedRequest(
    heartbeat({
      ownershipGeneration: codex.ownershipGeneration,
      sequence: sequence + 1,
    }),
  );
  expect(
    (
      await page.request.post("/api/internal/usage/ingest", {
        headers: Object.fromEntries(pulse.headers),
        data: await pulse.text(),
      })
    ).status(),
  ).toBe(200);

  await page.goto("/status");
  const brokerCard = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("heading", { name: "MQTT broker", exact: true }),
  });
  await expect(
    brokerCard.getByText("Chưa cấu hình", { exact: true }),
  ).toBeVisible();
  await expect(brokerCard.getByText(/Chưa có MQTT_HOST/)).toBeVisible();
  const card = page.getByRole("region", {
    name: "Trạng thái từng nhà cung cấp",
  });
  const codexCard = card.locator(
    '[data-slot="card"][aria-label="Trạng thái Codex"]',
  );
  await expect(
    codexCard.getByText("Dữ liệu cũ", { exact: true }),
  ).toBeVisible();
  await expect(
    codexCard.getByText("Tích hợp chưa xác minh", { exact: true }),
  ).toBeVisible();
  await expect(
    codexCard.getByText("Phiên Codex (JSONL)", { exact: true }),
  ).toBeVisible();
  await expect(
    codexCard.getByText("Dữ liệu mẫu mô phỏng", { exact: true }),
  ).toBeVisible();
  await expect(card.locator('[data-slot="card"]')).toHaveCount(3);
  await expect(
    page.getByText("Đã nhận dữ liệu", { exact: true }),
  ).toBeVisible();

  const unsupported = signedRequest(
    observation({
      ownershipGeneration: codex.ownershipGeneration,
      sequence: sequence + 2,
      dataStatus: "unsupported",
      sourceAvailability: "unsupported",
      errorCode: "SCHEMA_UNSUPPORTED",
      windows: [],
    }),
  );
  expect(
    (
      await page.request.post("/api/internal/usage/ingest", {
        headers: Object.fromEntries(unsupported.headers),
        data: await unsupported.text(),
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Làm mới dữ liệu ứng dụng", exact: true })
    .click();
  await expect(
    codexCard.getByText("Không hỗ trợ", { exact: true }),
  ).toBeVisible();
  await expect(
    codexCard.getByText("SCHEMA_UNSUPPORTED", { exact: true }),
  ).toBeVisible();
  await expect(codexCard.getByText("Dữ liệu mới", { exact: true })).toHaveCount(
    0,
  );
});
