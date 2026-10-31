import { readFile } from "node:fs/promises";
import { FixtureCollector } from "../../collector/src";
async function main() {
  const config = JSON.parse(await readFile(process.argv[2], "utf8"));
  const collector = await FixtureCollector.open(config);
  await collector.capture(
    "codex",
    JSON.stringify({
      fixtureSchema: "codex-v1",
      type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: { "crash.bucket": { used_percent: 14 } },
      },
    }),
    undefined,
    { streamId: "crash-fixture", offset: 7 },
  );
  process.stdout.write(
    "READY:" + (await collector.pendingEvents())[0].eventId + "\n",
  );
  process.stdin.resume();
}
void main().catch(() => {
  process.stderr.write("FIXTURE_FAILURE\n");
  process.exitCode = 1;
});
