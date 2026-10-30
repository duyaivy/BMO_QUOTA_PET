# Repository Guidelines

## Project Status & Structure

This directory is currently an empty project scaffold. No source code, tests, assets, dependency manifests, or Git metadata are present. Update this guide as the project takes shape so that instructions reflect actual tooling.

When adding the initial implementation, organize application code under `src/`, tests under `tests/`, and static resources under `assets/`, unless the chosen framework requires another layout. Keep configuration files at the repository root and document architectural decisions in `docs/` when needed.

## Build, Test, and Development Commands

No build, test, or local development commands are configured yet. Do not assume commands such as `npm test` or `make build` are available.

When introducing a toolchain, add a dependency manifest and its lockfile, document installation and execution commands in `README.md`, and update this section with verified commands. Include separate instructions for development, production builds, tests, and linting where applicable.

## Coding Style & Naming Conventions

Follow the formatter and conventions of the language selected for the project. Configure formatting and linting alongside the first source files; avoid mixing indentation styles within a file. Use descriptive names, keep modules focused on one responsibility, and match filenames to the conventions of the chosen framework.

## Testing Guidelines

No testing framework or coverage threshold is established. Add tests for meaningful behavior and bug fixes once executable code exists. Use descriptive test names that identify the behavior and expected result. Keep test placement consistent and document the test command before requiring it in review.

## Commit & Pull Request Guidelines

No Git history is available to establish existing commit conventions. Use concise, imperative commit subjects, such as `Add initial application scaffold`, and keep commits focused.

Pull requests should describe the change, its purpose, and validation performed. Link related issues when available, include screenshots for visible interface changes, and explain any configuration or dependency changes. State explicitly when tests could not be run.

## Security & Configuration

Never commit credentials, tokens, or local secrets. When configuration is introduced, provide placeholder values in an example file and exclude local secrets, generated output, and installed dependencies through `.gitignore`.
