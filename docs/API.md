# API reference

- **Base URL:** `http://localhost:4000` in development.
- **Authentication:** every route except `/health`, `/webhooks/clerk` and `/api/novu` needs a Clerk session token: `Authorization: Bearer <token>`.
- **Errors:** every error comes back as:

  ```json
  { "error": { "code": "TEAM_LEAD_REQUIRED", "message": "Only a lead of the author's team can review this plan.", "field": "tasks", "fields": { "...": "..." } } }
  ```

| Status | Meaning |
| --- | --- |
| 401 `UNAUTHENTICATED` | No valid session |
| 403 `ACCOUNT_DISABLED` | Deactivated or suspended account |
| 403 `ORGANIZATION_SUSPENDED` | The organization is suspended |
| 403 `*_REQUIRED` | Wrong role (for example `ORG_ADMIN_REQUIRED`, `TEAM_LEAD_REQUIRED`, `SELF_APPROVAL`) |
| 404 | Doesn't exist, **or isn't yours to see** (outsiders never get 403) |
| 409 | State conflict (for example `INVALID_PLAN_STATUS`, `NO_APPROVER`, `LAST_OWNER`, `LAST_TEAM`, `PAGE_VERSION_CONFLICT`) |
| 422 `VALIDATION_ERROR` | Input failed the shared zod schema (`fields` lists each problem) |
| 429 | Rate limited |
| 502 / 503 / 504 | Upstream (Clerk, GitHub or AI) failed |

## Me

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/me` | Profile, platform role, settings |
| PATCH | `/me/settings` | `{timezone?, phone?, deadlineLead?}`. Also updates the Novu subscriber. |
| GET | `/me/notifications/session` | `{applicationIdentifier, subscriberId, subscriberHash}` for the Inbox |
| GET/PATCH | `/me/notifications/preferences` | Global and per-workflow channel switches (Novu) |
| POST | `/me/notifications/test` | Fires `test-notification` on every channel (3 a minute) |
| GET | `/ai/status` | `{enabled, model}` |
| GET/POST | `/organizations` | List mine (reconciled with Clerk) / create: `{name, firstTeamName?}` creates the first team |

## Organization (`/organizations/:orgId/…`, every route runs `orgContext`)

| Method | Path | Who |
| --- | --- | --- |
| GET | `/` | Members. Includes `pendingDeletion` for owners. |
| PATCH | `/` | Owner or admin: rename |
| DELETE | `/membership` | Anyone: leave (last-owner guard) |
| GET | `/members` | Members |
| PATCH/DELETE | `/members/:userId` | Owner: anyone. Admin: admins and members (role change) or members (remove). Never yourself. |
| GET/POST | `/invites` | Owner or admin. Clerk emails the invitation, which is bound to that email. |
| DELETE | `/invites/:inviteId` | Owner or admin |
| POST/DELETE | `/deletion-request` | Owner: request (`{reason}`) / cancel |

### Teams

| Method | Path | Who |
| --- | --- | --- |
| GET/POST | `/teams` | List: members. Create: owner or admin. |
| GET/PATCH/DELETE | `/teams/:teamId` | Read: members. Change: owner or admin. Delete refuses the last team (409 `LAST_TEAM`). |
| PUT/DELETE | `/teams/:teamId/members/:userId` | Owner or admin. `{isLead}` replaces the previous lead. |
| GET | `/teams/:teamId/weeks/:monday` | That team's lead, owner or admin |
| GET | `/teams/:teamId/weeks?limit=&offset=` | Same. Per-week rollup. |
| GET/POST | `/teams/:teamId/repos` | List: members. Link: lead of the team, owner or admin. The repo must exist on GitHub. |
| DELETE | `/teams/:teamId/repos/:repoId` | Same as link |
| GET | `/teams/:teamId/repos/:repoId/issues?page=` | Members. Open issues, cached for 5 minutes. |
| GET | `/teams/:teamId/conversation` | Team members and managers: the team channel |

### Plans

| Method | Path | Who / rule |
| --- | --- | --- |
| GET | `/plans?weekStart=&limit=&offset=` | My plans |
| POST | `/plans` | `{weekStart (last, this or next Monday), tasks}` |
| GET | `/plans/open-assigned-tasks` | My open assigned tasks, for the plan editor |
| GET | `/plans/:planId` | Author, or a possible approver once submitted (drafts → 404) |
| PUT | `/plans/:planId` | Author, draft only. Replaces the tasks; ids are kept stable. |
| PATCH | `/plans/:planId/tasks/:taskId` | Author, approved only. `{isDone}`. Syncs the linked assigned task. |
| POST | `/plans/:planId/submit` | Author. Needs a main task with a why and an approver (`NO_APPROVER`). |
| POST | `/plans/:planId/withdraw` | Author, submitted → draft |
| POST | `/plans/:planId/approve` | Approver, never yourself. `{comment?}` |
| POST | `/plans/:planId/request-changes` | Approver. `{comment}` is required; back to draft. |
| POST | `/plans/:planId/complete` | Author, approved → done. `{mainGoalShipped, outcomeNote?}` |
| POST | `/plans/:planId/ai-review` | Author, draft. 503 when AI is off. |
| POST | `/ai/plan-drafts` | `{notes}` (10–4000 characters) → a draft for the form. Nothing is saved. |
| GET | `/approvals` | Submitted plans I can approve, oldest first |
| GET | `/plans/:planId/conversation` | The plan's discussion thread (same visibility as the plan) |

### Assigned tasks

| Method | Path | Who / rule |
| --- | --- | --- |
| GET | `/tasks?scope=mine\|assigned_by_me\|team&teamId=&status=&q=&assigneeId=&type=&priority=&label=&from=&to=` | `team` is for leads (their teams) and managers. `q` matches titles or a key (`NORT-42` or `42`). `from` and `to` (both, at most 62 days apart) bound the deadline, for the calendar. Up to 300 tasks. |
| POST | `/tasks` | Owner or admin (anyone) or team lead (members of a team they lead). Emails the assignee. Optional `type` (`task`\|`bug`\|`story`), `storyPoints` (1–100) and `labels` (up to 5, stored lower-case). Takes the organization's next number; `key` shows it as e.g. `NORT-42`. |
| GET | `/tasks/:taskId` | Assignee, assigner, lead of the task's team, managers (others → 404). Refreshes the GitHub state. |
| PATCH | `/tasks/:taskId` | Details (including `type`, `storyPoints` and `labels`) or reassignment: assigner, lead or manager. `status` (`todo`, `in_progress`, `in_review`, `done`, `cancelled`): the assignee too (but not `cancelled`). Every change is recorded in the task's activity. |
| GET | `/tasks/:taskId/activity` | The task's history, oldest first: `{field, from, to, actor, createdAt}`. Same visibility as the task (others → 404). |
| POST | `/tasks/:taskId/pull-into-plan` | Assignee. `{weekStart, kind: sub_goal\|main}`. Creates the draft if needed. |
| GET | `/tasks/:taskId/conversation` | The task's thread |

### Chat

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/conversations` | My team channels and DMs, with unread counts |
| POST | `/conversations/dm` | `{userId}` (same organization) |
| GET | `/conversations/:id` | Details and participants |
| GET | `/conversations/:id/messages?before=&limit=` | Newest page first, oldest-first within a page |
| POST | `/conversations/:id/messages` | `{body}` (plain text, ≤4000). Mentions are written `<@userId>`. 30 a minute. |
| DELETE | `/conversations/:id/messages/:messageId` | Author only (soft delete) |
| POST | `/conversations/:id/read` | Mark read |

### Pages

| Method | Path | Who / rule |
| --- | --- | --- |
| GET/POST | `/pages` | Read: members. Create: owner or admin (any page), lead (their team's pages). |
| GET | `/pages/:pageId` | Members |
| PUT | `/pages/:pageId` | Editors. `{title, bodyMd, baseVersion, changeNote?}` appends a version. 409 if `baseVersion` is stale. |
| PATCH | `/pages/:pageId` | Editors. Move: `{teamId?, parentId?}` (one level of nesting) |
| DELETE | `/pages/:pageId` | Editors. Archives (refused while it has sub-pages). |
| GET | `/pages/:pageId/versions` | History |
| GET | `/pages/:pageId/versions/:n` | Read an old version |
| GET | `/pages/:pageId/export?version=n` | Download as `text/markdown` (`<slug>-v<n>.md`) |
| POST | `/pages/:pageId/import?baseVersion=&fileName=` | Raw body (`text/markdown`), UTF-8, ≤200 KB. Becomes a new version. |

## Staff (`/staff/…`, platform staff and super admins; everyone else gets 404)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/overview` | Totals and 7-day AI stats |
| GET | `/organizations?q=&status=&limit=&offset=` | Counts only (members, teams, plans, tasks, messages, pages), last active |
| GET | `/organizations/:id` | Metadata, members, teams. **No content.** |
| POST | `/organizations/:id/suspend` · `/reinstate` | `{reason}`. Notifies members. |
| GET/POST | `/users` | Search / create a customer account |
| GET/PATCH | `/users/:id` | Names, `isActive` (Clerk ban). Staff can't deactivate owners or staff. |
| POST | `/users/:id/password` | Set a password (signs out other sessions) |
| GET | `/ai-usage/summary?days=7\|30\|90` · `/ai-usage/events` | Per organization / per call |

### Super admin (`/staff/super/…`, super admins only; everyone else, staff included, gets 404)

| Method | Path | Notes |
| --- | --- | --- |
| GET/POST | `/staff` | List / create a staff account (generated password, shown once) |
| POST | `/staff/:id/deactivate` · `/reactivate` | |
| GET | `/owners` | Every org owner, their organizations, suspension state |
| POST | `/owners/:id/suspend` · `/reinstate` | `{reason}`. Bans the account in Clerk and emails the owner. |
| GET | `/deletion-requests?status=` | With counts for pending ones |
| POST | `/deletion-requests/:id/decision` | `{decision: approve\|reject, note?}` (a note is required to reject). Approve deletes from Clerk, then the database. |
| GET | `/audit` | The last 100 admin actions |

## Webhooks and the bridge

- `POST /webhooks/clerk`: Svix-verified. Handles `user.*`, `organization.*`, `organizationMembership.*`, and `email.created` / `sms.created` (when `CLERK_EMAILS_VIA_NOVU=true`).
- `/api/novu`: the Novu Framework bridge, verified with Novu's own HMAC.

## Socket.IO

- **Connect:** `io(API_URL, { auth: { token } })` with a Clerk session token. Invalid tokens get `connect_error: unauthorized`.
- **Client → server:**
  - `conversation:join {organizationId, conversationId}`, which acks `{ok}`. Access is checked exactly as in REST.
  - `conversation:leave {conversationId}`.
- **Server → client:**
  - `message:new` (a `Message`) and `message:deleted {id, conversationId}`, both to the conversation room.
  - `conversation:activity {conversationId, organizationId}` and `conversation:read`, both to the user's own room.
