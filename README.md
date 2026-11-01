# BMO Personal

Next.js App Router application for one owner's quota companion. Phase 1A–1E is complete and verified locally: owner authentication, signed synthetic ingestion, a durable local fixture collector, persisted quota/collector views and PET-first display configuration. Codex 0.163.0 read-only session observation is verified locally; Claude/Antigravity live callbacks remain unverified. Phase 2 also supplies opt-in wrappers, bounded health reporting and a LaunchAgent template. No provider credentials, native CLI configuration, production infrastructure, MQTT, or firmware are used in Phase 1.

## Local setup

Use Node.js **24.18.0** (`.nvmrc`) and pnpm **11.24.0** (`packageManager`). Dependencies and native build approvals are pinned in the manifest, lockfile, and workspace file.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set `SESSION_SECRET` to an independent random secret of at least 32 characters (hex avoids dotenv interpolation). Generate the hash without putting a plaintext password in shell history:

```sh
python3 -c 'import getpass,sys; sys.stdout.write(getpass.getpass("Owner password: "))' | pnpm exec tsx scripts/auth-hash.ts
```

Paste the emitted `ADMIN_PASSWORD_HASH=...` line into `.env.local`. Its dollar signs are escaped for Next's dotenv expansion; preserve those escapes. Explicit process configuration is preserved by the setup/server scripts. Then run `pnpm db:migrate` and `pnpm dev`. Keep the hash and secret in the ignored `.env.local`. Provider passwords/tokens are never requested. `TURSO_DATABASE_URL=file:./.data/bmo.db` uses local libSQL; no cloud account is needed. `BMO_APP_ORIGIN` must exactly match the browser origin. `BMO_ALLOW_LOCAL_DATABASE=true` explicitly permits local database use when serving a production build with `pnpm start`. Local disk is for development; deployment durability remains Turso's responsibility.

The Phase 1 gate passed: frozen workspace install, typecheck, zero-warning lint, formatting, production build, **60 Node tests and 12 Chrome tests**, plus development-server smoke verification. The crash/restart test kills a disposable collector process after its durable commit and verifies event, checkpoint and sequence recovery. See [the roadmap](docs/IMPLEMENTATION_PHASES.md) for exact subphase evidence. That Phase 1 evidence is synthetic/local. Phase 2A additionally captured new ordinary-session Codex quota through signed local ingestion and Chrome dashboard rendering; upstream freshness remained unknown. See [native setup](collector/README.md) and the roadmap for current evidence and remaining callback gates.

## Commands

| Command                             | Purpose                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                          | Loopback development server, port 3000                  |
| `pnpm db:migrate`                   | Apply reviewed local database migrations                |
| `pnpm typecheck`                    | Next.js route types and strict TypeScript               |
| `pnpm lint`                         | ESLint, zero warnings                                   |
| `pnpm format:check` / `pnpm format` | Check/apply formatting                                  |
| `pnpm build` / `pnpm start`         | Build/serve production locally                          |
| `pnpm test:unit`                    | Node Vitest behavior and persistence checks             |
| `pnpm test:integration`             | Playwright against a disposable local production server |

Build before browser tests. Install matching Chromium with `pnpm exec playwright install chromium` or use installed Chrome:

```sh
pnpm build
PLAYWRIGHT_CHANNEL=chrome pnpm test:integration
```

The browser suite owns port 3100, creates a temporary local database and synthetic owner identity, and removes it after the server exits. It never uses local owner secrets. Do not run another server on that port. This is local integration evidence, not provider or cloud evidence.

## Layout and boundaries

- `src/app/`: public login, five protected pages and Node auth/ingestion/settings handlers.
- `src/components/`: responsive shell, reusable states and shadcn/ui primitives.
- `src/contracts/`: browser-safe contracts; never imports server secrets.
- `src/server/`: server-only config, database/auth, ingestion, quota queries and device repositories.
- `drizzle/`: four incremental, checksummed SQLite/libSQL migrations; Drizzle schema stays alongside the repositories.
- `collector/`: private SQLite queue/checkpoints, synthetic and opt-in native adapters, callback spool, HMAC uploader and foreground daemon.
- `api/README.md`: local ingestion and guarded configuration contracts.
- `tests/`: focused browser and Node integration checks.
- `public/`: static assets; `docs/`: approved architecture and roadmap.

Authentication uses a sealed HTTP-only cookie carrying an opaque handle, checked against a hashed revocable database session on each protected request. Same-origin CSRF checks apply to cookie mutations. Database/configuration errors fail closed. Login uses durable source and account limits. The same Next app's local Node entrypoint (`scripts/serve.ts`) derives the TCP peer, overwrites private source metadata, and signs it with an ephemeral process secret; arbitrary forwarded headers are ignored. There is one loopback listener. Direct `next start` omits this trusted boundary, so use the documented pnpm scripts. Before Phase 5 hosting, validate proxy topology: a proxy socket address is a coarse source, not evidence of an individual end-user address. Official local clients retain provider authentication. Missing quota is unknown, never zero.

Direct dependencies are pinned. The pinned Next lint preset's older plugins declare ESLint 9 peer ranges; installation can report peer warnings while project lint requires zero warnings. Builds use system fonts and require no external font service.

## Synthetic ingestion

See [the local API contract and enrollment](api/README.md) for Phase 1C quota-only signed ingestion. Native collector setup uses a distinct local enrollment gate and evidence identity; provider verification remains server-owned. HTTP is allowed only for explicit loopback development; other collector destinations require HTTPS.

Production builds use Next’s supported Webpack compiler. Turbopack’s internal CSS worker could not bind its port in the execution environment; the Webpack build and production HTTP/browser checks passed.

## Collector and dashboard

Follow [synthetic enrollment](api/README.md) and [the collector guide](collector/README.md). Copy `collector/collector.example.json` to ignored `collector.local.json`, supply a private BMO secret file, and enable only selected fixture sources with their assigned generations. From the repository root:

```sh
pnpm collector ./collector.local.json codex ./fixture.jsonl --upload
```

The foreground uploader retries immutable events and resumes durable file checkpoints; no service or native CLI configuration is installed. Provider settings toggle application acceptance, never provider login. Overview refresh reads persisted application data. Device saves persist local PET-first configuration and preview only; they do not publish MQTT or confirm hardware.

The two-package pnpm workspace is pinned in the lockfile. Both development and production use Webpack through the single loopback Next server. Browser tests use a disposable DB/owner/collector mapping; Node tests use separate temporary stores. Expected anonymous-access probes can appear as sanitized UNAUTHORIZED entries in Next's test-server output; access/replay assertions pass.

Phase 2 is **partial**: 2A and 2D are complete locally; 2B/2C need real Claude/Antigravity callback, quota-meter and lifecycle evidence. Final checks passed: **92 Node tests, 14 Chrome tests**, typecheck, zero-warning lint, formatting, production build and LaunchAgent syntax. Codex ordinary-session quota and health reached the final local dashboard with unknown upstream freshness. Use the disabled-by-default [native config example](collector/collector.native.example.json) and [reversible setup/automation instructions](collector/README.md). No LaunchAgent or native settings were installed automatically. Production deployment, MQTT and firmware remain later phases.
