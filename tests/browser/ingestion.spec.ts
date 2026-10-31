import { expect, test } from "@playwright/test";
import { observation, signedRequest } from "../fixtures/usage";
test("production HTTP ingestion enforces replay and idempotency", async ({
  request,
}) => {
  const event = observation({ sequence: 400 });
  async function send(nonce?: string) {
    const signed = signedRequest(event, { nonce });
    return request.post("/api/internal/usage/ingest", {
      headers: Object.fromEntries(signed.headers),
      data: await signed.text(),
    });
  }
  const nonce = "e".repeat(32);
  const first = await send(nonce);
  expect(first.status()).toBe(200);
  const original = await first.json();
  expect(original.data.outcome).toBe("accepted");
  expect((await send(nonce)).status()).toBe(409);
  const duplicate = await send();
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).data).toMatchObject({
    outcome: "duplicate",
    receivedAt: original.data.receivedAt,
  });
  const invalid = signedRequest(observation({ sequence: 401 }));
  invalid.headers.set("X-BMO-Signature", "0".repeat(64));
  expect(
    (
      await request.post("/api/internal/usage/ingest", {
        headers: Object.fromEntries(invalid.headers),
        data: await invalid.text(),
      })
    ).status(),
  ).toBe(401);
});
