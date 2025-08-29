Contributing Guide

Thank you for contributing! This project prefers small, focused changes. Below are guidelines to make PRs easy to review.

Before you start

- Read `docs/DEVELOPMENT.md` and `docs/ARCHITECTURE.md` to understand core patterns.
- Keep changes localized: this app is a single-file app, so large sweeping changes are difficult to review.

Style & Quality

- Use descriptive variable names and add concise inline comments for non-obvious logic.
- Keep the UI unchanged unless your PR is explicitly a UI improvement.
- Add tests for any logic that can be extracted to small functions (optional).

PR process

- Create a branch with a clear name (e.g., `fix/responsive-grid` or `feat/persist-settings`).
- Open a PR with a short description and list of files changed. Explain why the change is useful.
- Keep the PR focused — one feature/bugfix per PR.

Local testing

- Run the app locally and test the major flows: type filters, region tabs, favorites, seen/caught toggles, import/export, and lazy-loading.

Notes

- If you change storage key names, update `docs/STORAGE_KEYS.md` and any comments in `Test Site.html`.

