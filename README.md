# BMO Personal

Phase 1A: a local Next.js App Router foundation with a responsive UI shell and placeholder routes. There are no quota observations, synthetic readings, working authentication, database, collector, or MQTT services. All three provider integrations remain unverified. This preview contains no private owner data and is intended for local use.

## Local setup

Use Node.js **24.18.0** (`.nvmrc`) and pnpm **11.24.0** (`packageManager`). With those installed:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:3000>. No environment variables or external accounts are required. Do not copy the historical `.env.example` for this phase; obsolete polling/credential placeholders will be replaced by the configuration-owning phase (1B). Provider credentials are never requested by this app.

Direct dependencies are pinned in `package.json`; `pnpm-lock.yaml` pins transitive resolution. The app uses Next.js 16.4.3, React 19.3.1, strict TypeScript 5.9.3, Tailwind CSS 4.3.3, and manually installed shadcn/ui primitives configured by `components.json`. System fonts keep builds independent of external font services.

ESLint 10 works with the pinned Next.js lint preset. Its older transitive plugins still declare ESLint 9 peer ranges, so pnpm can emit peer warnings; this is [documented upstream](https://nextjs.org/docs/app/api-reference/config/eslint#setup-eslint). Lint itself must pass with zero warnings. `pnpm-workspace.yaml` disables the resolver's fallback build script; its lockfile-installed native optional binding is used.

## Commands

| Command                                | Purpose                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                             | Development server, bound to loopback on port 3000                   |
| `pnpm typecheck`                       | Generate Next.js route types and run strict TypeScript checking      |
| `pnpm lint`                            | Next.js/React/TypeScript lint, zero warnings allowed                 |
| `pnpm format:check`                    | Check formatting of application, tests, configuration and setup docs |
| `pnpm format`                          | Format those same files; excludes historical project docs            |
| `pnpm build`                           | Production build without cloud configuration                         |
| `pnpm start`                           | Serve the existing production build locally                          |
| `pnpm test` or `pnpm test:integration` | Browser integration checks against a temporary production server     |

Build before running browser tests. Install the matching browser once:

```sh
pnpm exec playwright install chromium
pnpm build
pnpm test:integration
```

Alternatively, use an existing Google Chrome installation without downloading Chromium:

```sh
PLAYWRIGHT_CHANNEL=chrome pnpm test:integration
```

The suite owns port 3100 and refuses to reuse another server. It verifies navigation/current-page state across all six routes at 375px and desktop widths, keyboard navigation and skip-link focus, honest unavailable/unknown states, and 404 recovery. It does not validate any provider, cloud service, device, or authentication flow. No unit suite or migration validation exists in 1A because no business logic or persistence is implemented.

## Layout and boundaries

- `src/app/`: overview (`/`), provider settings (`/settings/providers`), collectors, devices, status, login, and framework loading/error/not-found boundaries.
- `src/components/shell/`: shared navigation and page layout.
- `src/components/states/`: reusable loading, error, empty, unavailable, and stale presentations.
- `src/components/ui/`: editable shadcn/ui primitives; `src/lib/utils.ts` merges classes.
- `src/contracts/`: browser-safe shared metadata; versioned usage contracts belong to 1C.
- `src/server/`: reserved server boundary; future implementation entry points must import `server-only` and never flow into browser or contract imports.
- `tests/browser/`: focused Playwright interaction/integration tests.
- `public/`: static assets. `docs/` contains the approved architecture and roadmap.

There are no API routes, protected operations, or secret reads in this phase. Login explicitly accepts no credentials. Missing quota is unknown, never zero. The stale-state component is ready for later real data without seeding fabricated readings. Authentication and Turso are Phase 1B; they have not been started.
