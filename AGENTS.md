# Repository Guidelines

## Project Status & Structure

Phase 1A implements a Next.js App Router UI foundation with strict TypeScript, Tailwind CSS, and shadcn/ui primitives. Source is under `src/`: routes in `src/app`, shared UI in `src/components`, browser-safe metadata in `src/contracts`, and a reserved `src/server` boundary. Static assets use framework-required `public/`; browser tests live under `tests/browser`.

The six routes are placeholders. No authentication, database, ingestion, collector, provider integration, MQTT, firmware, or deployment is implemented. Follow the selected subphase in `docs/IMPLEMENTATION_PHASES.md` and technical contracts in `docs/ARCHITECTURE_DECISIONS.md`; never start a later subphase implicitly.

## Build, Test, and Development Commands

Use Node.js 24.18.0 and pnpm 11.24.0. `README.md` documents local setup and browser prerequisites. No cloud credentials are needed for 1A.

- `pnpm install --frozen-lockfile`: install pinned dependencies.
- `pnpm dev`: loopback-only development server.
- `pnpm typecheck`: generate Next.js route types and check strict TypeScript.
- `pnpm lint`: run ESLint with zero warnings.
- `pnpm format:check` / `pnpm format`: check/apply Prettier to implementation and setup docs.
- `pnpm build` / `pnpm start`: build/serve production locally.
- `pnpm test:integration` (alias `pnpm test`): Playwright against a temporary local production server on port 3100; build first. Install Chromium with `pnpm exec playwright install chromium` or set `PLAYWRIGHT_CHANNEL=chrome` for installed Chrome.

## Coding Style & Naming Conventions

Follow the formatter and conventions of the language selected for the project. Configure formatting and linting alongside the first source files; avoid mixing indentation styles within a file. Use descriptive names, keep modules focused on one responsibility, and match filenames to the conventions of the chosen framework.

## Testing Guidelines

Focused Playwright tests cover responsive navigation, keyboard and skip-link behavior, honest placeholders, and 404 recovery. No unit framework or coverage threshold is established. Add meaningful behavior and regression tests as executable business logic is introduced; avoid redundant assertions that merely mirror static markup. Keep synthetic, local integration, and live provider evidence distinct. Do not claim a check passed unless executed.

## Commit & Pull Request Guidelines

No Git history is available to establish existing commit conventions. Use concise, imperative commit subjects, such as `Add initial application scaffold`, and keep commits focused.

Pull requests should describe the change, its purpose, and validation performed. Link related issues when available, include screenshots for visible interface changes, and explain any configuration or dependency changes. State explicitly when tests could not be run.

## Security & Configuration

Never commit credentials, tokens, or local secrets. When configuration is introduced, provide placeholder values in an example file and exclude local secrets, generated output, and installed dependencies through `.gitignore`.
