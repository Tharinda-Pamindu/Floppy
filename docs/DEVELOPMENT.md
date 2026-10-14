# Development

## Day to day

```bash
npm install
npm run dev               # API :4000 + web :3000 (builds packages/shared first)
npm test                  # shared + API tests (no keys, no network, no Docker)
npm run typecheck && npm run lint && npm run build
```

- `packages/shared` compiles to `dist/`. Both apps' `predev`, `pretest` and `prebuild` hooks rebuild it.
- Edit `apps/api/src/db/schema.ts`, then run `npm run db:generate` (new SQL in `apps/api/drizzle`), then `npm run db:migrate`.
- Add an endpoint:
  1. Write the zod schema in `packages/shared/src/schemas.ts`.
  2. Write the service function in `apps/api/src/services`.
  3. Add the route in `apps/api/src/routes`. Org-scoped routes go under the org router, which already applies `orgContext`.
  4. Write a test in `apps/api/test`.
  5. Write a query or mutation in the web app.
- Add a notification:
  1. Add its id to `WorkflowId` (`ports.ts`) and `WORKFLOW_NAMES` (`notifications/catalog.ts`).
  2. Write the workflow in `notifications/workflows.ts`.
  3. Trigger it from a service with `deps.notifier.trigger(...)`.

  `test/workflows.test.ts` fails if the catalog and the workflows drift apart.

## Tests

- `test/harness.ts` starts **PGlite** (Postgres in WebAssembly), applies the real migrations, and wires in fakes: `FakeIdentity` (Clerk), `RecordingNotifier` (Novu), `FakeGithub`, `ScriptedAi` and `RecordingRealtime`.
- Requests use `supertest` with an `x-test-user` header in place of a Clerk token.
- The clock is fixed: Wednesday 2026-10-14, 10:00 UTC, unless a test sets `h.clock.now`.

| Suite | Covers |
| --- | --- |
| `tenancy.test.ts` | Signed-out and deactivated access, cross-org 404s on every org route, roles, staff vs org admin, suspension, route meta-test |
| `plans.test.ts` | Week rules, task rules, the whole approval workflow, draft privacy, NO_APPROVER, team week/history, AI mapping/failures/limits |
| `collaboration.test.ts` | Teams (first team, last-team guard, lead rules), assigned tasks and plan sync, GitHub repos/issues, chat access/unread/mentions, pages and versions, import/export |
| `admin-and-notifications.test.ts` | Staff rules, super admin (staff, owners, deletions, audit), reminder timing and idempotency, Clerk webhooks → Novu, settings |
| `realtime.test.ts` | A real Socket.IO server: token required, live delivery to members, nothing leaks to outsiders |
| `workflows.test.ts` | Catalog ↔ workflows, email escaping |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| API exits with "Invalid environment configuration" | Fill the missing variables it lists in `apps/api/.env`. |
| Web shows "Can't reach the server" | Start the API, and check `NEXT_PUBLIC_API_URL`. |
| 401 on every call | The web and API must use the **same** Clerk application keys. `WEB_ORIGIN` must match the web URL exactly (it's used for `authorizedParties` and CORS). |
| The bell icon has a slash | `NOVU_SECRET_KEY` / `NOVU_APPLICATION_IDENTIFIER` are empty in the API env. |
| Notification settings say workflows will appear after sync | Sync the workflows (README §5). |
| No emails or SMS | Check Novu → Activity. The Resend/Twilio integration must be active, and a Twilio trial only texts verified numbers. |
| A new invitee doesn't see the org | Opening `/app` reconciles memberships with Clerk. Set up the Clerk webhook for instant sync. |
| `db:migrate` hangs or fails | Use the session (5432) URL in `DATABASE_MIGRATION_URL`, not the 6543 transaction pooler. |
