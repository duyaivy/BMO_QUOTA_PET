import { createServer } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import next from "next";
async function main() {
  const dev = process.argv.includes("--dev");
  const position = process.argv.indexOf("--port");
  const port = Number(
    position === -1 ? (process.env.PORT ?? 3000) : process.argv[position + 1],
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid port");
  Object.assign(process.env, { NODE_ENV: dev ? "development" : "production" });
  const explicit = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(BMO_|TURSO_|SESSION_SECRET$|ADMIN_PASSWORD_HASH$)/.test(key),
    ),
  );
  const secret = randomBytes(32).toString("hex");
  process.env.BMO_CLIENT_SOURCE_SECRET = secret;
  const app = next({ dev, webpack: true, hostname: "127.0.0.1", port });
  await app.prepare();
  // Preserve explicitly supplied process configuration across dotenv expansion.
  Object.assign(process.env, explicit, { BMO_CLIENT_SOURCE_SECRET: secret });
  const handle = app.getRequestHandler();
  const server = createServer((request, response) => {
    delete request.headers["x-bmo-trusted-client"];
    const address = request.socket.remoteAddress;
    if (!address) {
      response.writeHead(503).end();
      return;
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secret)
      .update(`BMO-CLIENT-V1\n${address}\n${timestamp}`)
      .digest("hex");
    request.headers["x-bmo-trusted-client"] =
      `${address};${timestamp};${signature}`;
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(503);
      response.end();
    });
  });
  server.on("upgrade", app.getUpgradeHandler());
  server.listen(port, "127.0.0.1", () =>
    console.log(`BMO listening on http://127.0.0.1:${port}`),
  );
  server.on("error", () => {
    console.error("BMO server failed");
    process.exitCode = 1;
  });
  let closing = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      server.close(() => {
        void app.close().finally(() => process.exit(0));
      });
      server.closeIdleConnections();
      setTimeout(() => process.exit(0), 5000).unref();
    });
}
void main().catch(() => {
  console.error("BMO startup failed");
  process.exitCode = 1;
});
