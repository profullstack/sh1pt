Prefer reviewable, framework-native changes over custom glue code.

- Keep changes small and focused.
- Preserve existing build, test, and lint commands.
- Prefer least-privilege GitHub Actions permissions.
- Pin GitHub Actions to immutable versions when practical.
- Never commit secrets or `.env` files.
- Update user-facing docs when behavior changes.
