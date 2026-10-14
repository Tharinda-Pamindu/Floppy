## What this changes

<!-- One or two sentences: what changes and why. -->

Closes #

## How it was tested

<!-- Tests added or updated, and what you checked by hand. Screenshots or a short clip for UI changes. -->

## Checklist

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass
- [ ] New organization routes are filtered by `organizationId`, answer 404 (not 403) to people who can't see them, and have a cross-organization test
- [ ] Input is validated with the shared zod schemas; limits live in `LIMITS`
- [ ] Schema changes come with a generated migration (no hand-edited migrations), and new tables have Row Level Security on
- [ ] No secrets, tokens, plan text or message text in code, logs or tests
- [ ] New UI has loading, empty and error states, works with the keyboard, and respects "reduce motion"
- [ ] Docs updated where behaviour changed (`README.md`, `docs/`)

By opening this pull request, I agree that my contribution is licensed under the [AGPL-3.0](../LICENSE), as described in [CONTRIBUTING.md](../CONTRIBUTING.md).
