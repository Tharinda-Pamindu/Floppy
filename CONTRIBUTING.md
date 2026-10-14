# Contributing to Floppy

Thanks for helping make Floppy better. This guide covers how to report problems, propose changes and get a pull request merged.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug.** Open an issue with the *Bug report* template. Include steps to reproduce, what you expected and what happened.
- **Suggest a feature.** Open an issue with the *Feature request* template. Describe the problem first, then the solution you have in mind.
- **Report an accessibility barrier.** Use the *Accessibility issue* template. See [ACCESSIBILITY.md](ACCESSIBILITY.md).
- **Fix or build something.** Pick an open issue, or open one first for anything bigger than a small fix, so we can agree on the approach before you spend time on it.

**Security problems are never reported in public issues.** Follow [SECURITY.md](SECURITY.md) instead.

## Set up your machine

You need Node.js 22.12 or newer (24 recommended) and npm 10+. Docker is not needed.

```bash
git clone https://github.com/Tharinda-Pamindu/Floppy.git
cd Floppy
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The [README](README.md) explains each service (Supabase, Clerk, Novu) and how to fill the env files. You can run the tests without any of them: they use an in-process Postgres and in-memory fakes.

```bash
npm test             # shared + API tests (no keys, no network)
npm run dev          # API on :4000 and web on :3000 (needs the env files)
```

[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) has more on the test harness and tooling.

## Make a change

1. Fork the repository and create a branch from `main`, named after the change: `fix/calendar-drag`, `feat/task-labels`.
2. Keep each pull request to one change. Small pull requests are reviewed faster.
3. Before you push, all of these must pass:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
4. Open a pull request and fill in the template. Link the issue it closes (`Closes #123`).

### Rules of the codebase

These are enforced in review. [AGENTS.md](AGENTS.md) is the short version.

- **Tenancy first.** Organization routes go under the org router in `apps/api/src/app.ts`, and services filter every query by `organizationId`. Someone who can't see a thing gets **404, never 403**. Every new organization route needs a cross-organization test in `apps/api/test/tenancy.test.ts`.
- **Validate with the shared zod schemas** in `packages/shared/src/schemas.ts`, and put limits in `LIMITS`, not in literals.
- **Services never import SDKs.** Go through `deps.identity`, `deps.notifier`, `deps.github`, `deps.ai` and `deps.realtime`, so tests can use the fakes in `apps/api/test/harness.ts`.
- **Use `deps.now()`** for any time you compare against. Tests fix the clock.
- **Notifications never fail a request.** New workflows go in `WorkflowId`, `WORKFLOW_NAMES` and `notifications/workflows.ts`, and every value in an email is escaped with `esc()`.
- **Staff endpoints return metadata only:** never plan text, comments, chat bodies or page content.
- **Secrets only come from the environment** (`config.ts`). Never log tokens or message or plan text.
- **Web:** fetch data with `useApi()` and the TanStack Query keys in `lib/queries.ts`. Use the components in `components/ui` and the design tokens in `globals.css`. Every page has loading, empty and error states.

### Database changes

Edit `apps/api/src/db/schema.ts`, then run `npm run db:generate` and `npm run db:migrate`. Never hand-edit a generated migration. For data changes or SQL that Drizzle can't express, add a custom migration with `npx drizzle-kit generate --custom` in `apps/api`. New tables also need Row Level Security switched on (see `0001_enable_rls.sql`).

### Accessibility

New UI must work with a keyboard alone, have visible focus, label every control, meet WCAG 2.2 AA contrast and respect "reduce motion". Anything you can drag also needs a non-drag way to do the same thing. Details in [ACCESSIBILITY.md](ACCESSIBILITY.md).

### Commit messages

Write the subject in the imperative, under about 70 characters, saying what changes: `Add story points to the task board`. Explain *why* in the body when it isn't obvious.

## Review

A maintainer reviews every pull request. Expect questions: they're about the code, not about you. Once the checks pass and the review is approved, a maintainer merges it.

## Licence of your contributions

Floppy is licensed under the [GNU Affero General Public License v3.0](LICENSE). By submitting a contribution, you agree that it is licensed under the same terms and that you have the right to submit it.
