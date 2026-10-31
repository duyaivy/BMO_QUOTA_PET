import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
test("fixture CLI uploads to the real application and resumes its persisted file checkpoint", async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), "bmo-cli-http-"));
  try {
    const secretFile = join(directory, "secret"),
      configFile = join(directory, "config.json"),
      fixtureFile = join(directory, "fixture.jsonl");
    await writeFile(secretFile, "b".repeat(64), { mode: 0o600 });
    await writeFile(
      configFile,
      JSON.stringify({
        collectorId: "fixture-collector",
        keyId: "fixture-key",
        secretFile,
        url: "http://127.0.0.1:3100/api/internal/usage/ingest",
        stateDirectory: join(directory, "state"),
        allowLocalHttp: true,
        providers: { claude: { enabled: true, generation: 2 } },
      }),
    );
    await writeFile(
      fixtureFile,
      JSON.stringify({
        fixtureSchema: "claude-v1",
        rate_limits: { "pipeline.dynamic": { used_percentage: 27 } },
      }) + "\n",
    );
    const args = [
      "--import",
      "tsx",
      "collector/src/cli.ts",
      configFile,
      "claude",
      fixtureFile,
      "--upload",
    ];
    const csrf = await (await page.request.get("/api/auth/csrf")).json();
    expect(
      (
        await page.request.post("/api/auth/login", {
          headers: { Origin: "http://127.0.0.1:3100" },
          data: {
            password: "local-browser-fixture-password",
            csrfToken: csrf.csrfToken,
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/");
    await expect(
      page.getByText("No quota observations yet", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    const first = await execute(process.execPath, args, {
      env: { ...process.env, FORCE_COLOR: undefined },
      timeout: 15000,
      maxBuffer: 8192,
    });
    expect(first.stdout).toContain("QUEUED");
    expect(first.stdout).toContain("ACKNOWLEDGED");
    expect(first.stderr).toBe("");
    await page.goto("/");
    const card = page.getByRole("region", { name: "Claude Code quota" });
    await expect(card.getByText("27%", { exact: true })).toBeVisible();
    await expect(
      card.getByText("Synthetic fixtures", { exact: true }),
    ).toBeVisible();

    const resumed = await execute(process.execPath, args, {
      env: { ...process.env, FORCE_COLOR: undefined },
      timeout: 15000,
      maxBuffer: 8192,
    });
    expect(resumed.stdout).not.toContain("QUEUED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
