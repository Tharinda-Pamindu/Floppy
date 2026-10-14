# Working on Floppy

npm workspaces: `apps/api` (Express 5 + Drizzle + Novu), `apps/web` (Next.js 15 + Clerk), `packages/shared` (zod schemas, types, week math).

## Commands

- `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`
- DB: edit `apps/api/src/db/schema.ts`, then `npm run db:generate`, then `npm run db:migrate`. Never hand-edit generated migrations; add custom SQL with `npx drizzle-kit generate --custom`.
- `packages/shared` must be built before the apps resolve it. The `pre*` hooks do this.

## Rules of the codebase

- **Tenancy first.** Org-scoped routes live under the org router in `apps/api/src/app.ts`, which runs `orgContext`. Services filter every query by `organizationId`. A caller who can't see something gets **404**, never 403. Add a cross-org test for every new org route.
- **Validate with the shared zod schemas** (`packages/shared/src/schemas.ts`) in routes (`parse(schema, req.body)`). Put limits in `LIMITS`, not in literals.
- **Services never import SDKs.** Go through `deps.identity` / `deps.notifier` / `deps.github` / `deps.ai` / `deps.realtime` (`ports.ts`). Tests rely on the fakes in `apps/api/test/harness.ts`.
- **Use `deps.now()`** for any time you compare against (tests fix the clock).
- **Notifications never fail a request.** Add workflow ids to `WorkflowId` and `WORKFLOW_NAMES`, define them in `notifications/workflows.ts`, and escape all values in emails with `esc()`.
- **Staff endpoints return metadata only:** no plan text, comments, chat bodies or page content.
- **Secrets only come from env** (`config.ts`). Never log tokens or message or plan text.
- **Web:** client data goes through `useApi()` (Bearer token) and TanStack Query keys in `lib/queries.ts`. Use the UI primitives in `components/ui` and the design tokens in `globals.css` (`label-card`, `bg-surface`, `text-ink`…). Every page has loading, empty and error states (`components/ui/states.tsx`).
- Escape apostrophes in JSX text (`&apos;`); ESLint fails the build otherwise.
