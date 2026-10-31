# Repository Guidelines

## Project Status & Structure

Phase 1A–1E implements local Drizzle/libSQL persistence, single-owner authentication, quota-only signed synthetic ingestion, a durable fixture collector, persisted dashboard/device configuration and a Next.js App Router UI foundation with strict TypeScript, Tailwind CSS, and shadcn/ui primitives. Source is under `src/`: routes in `src/app`, shared UI in `src/components`, browser-safe metadata in `src/contracts`, and a reserved `src/server` boundary. Static assets use framework-required `public/`; browser tests live under `tests/browser`.

Five dashboard/settings routes are protected and read persisted local data. All real provider integrations remain unverified. The collector is under collector/ and uses synthetic schemas only. MQTT, firmware, native CLI integration and deployment are not implemented. Follow the selected subphase in docs/IMPLEMENTATION_PHASES.md and technical contracts in docs/ARCHITECTURE_DECISIONS.md; never start a later subphase implicitly.

## Build, Test, and Development Commands

Use Node.js 24.18.0 and pnpm 11.24.0. `README.md` documents local setup and browser prerequisites. No cloud credentials are needed for Phase 1.

- `pnpm install --frozen-lockfile`: install pinned dependencies.
- `pnpm dev`: loopback-only development server with trusted socket source metadata.
- `pnpm db:migrate`: apply checked-in migrations to configured local libSQL/Turso.
- `pnpm test:unit`: run Node behavior and local persistence tests.
- `pnpm typecheck`: generate Next.js route types and check strict TypeScript.
- `pnpm lint`: run ESLint with zero warnings.
- `pnpm format:check` / `pnpm format`: check/apply Prettier to implementation and setup docs.
- `pnpm build` / `pnpm start`: build/serve production locally.
- `pnpm test:integration` (alias `pnpm test`): Playwright against a temporary local production server on port 3100; build first. Install Chromium with `pnpm exec playwright install chromium` or set `PLAYWRIGHT_CHANNEL=chrome` for installed Chrome.

## Coding Style & Naming Conventions

Follow the formatter and conventions of the language selected for the project. Configure formatting and linting alongside the first source files; avoid mixing indentation styles within a file. Use descriptive names, keep modules focused on one responsibility, and match filenames to the conventions of the chosen framework.

## Testing Guidelines

Focused Playwright tests cover responsive navigation, keyboard and skip-link behavior, persisted synthetic quota/freshness, screen ordering/preview, revision conflicts, and 404 recovery. Vitest covers Node business behavior and local persistence; no coverage threshold is established. Add meaningful behavior and regression tests as executable business logic is introduced; avoid redundant assertions that merely mirror static markup. Keep synthetic, local integration, and live provider evidence distinct. Do not claim a check passed unless executed.

## Commit & Pull Request Guidelines

No Git history is available to establish existing commit conventions. Use concise, imperative commit subjects, such as `Add initial application scaffold`, and keep commits focused.

Pull requests should describe the change, its purpose, and validation performed. Link related issues when available, include screenshots for visible interface changes, and explain any configuration or dependency changes. State explicitly when tests could not be run.

## Security & Configuration

Never commit credentials, tokens, or local secrets. When configuration is introduced, provide placeholder values in an example file and exclude local secrets, generated output, and installed dependencies through `.gitignore`.
