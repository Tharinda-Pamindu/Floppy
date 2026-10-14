# Source project analysis: Floppy

This file records what the original version of Floppy does, so the rebuild in
this folder can keep the same behavior.

## 1. What the product is

**Floppy** is weekly planning for software teams. Tagline: *"Less strain. More brain."*

1. Every engineer commits to **one main task** they'll ship this week, plus sub-goals and go-to-market (GTM) goals.
2. A team lead reviews and approves the plan (or sends it back with a comment).
3. During the week the engineer ticks tasks off.
4. On Friday they close the week and record whether the main task **shipped**.

AI helps write and critique the plan before it's submitted.

## 2. Architecture of the original

| Folder | What it is | Stack |
| --- | --- | --- |
| `api/` | Backend API, two mounted sub-apps: `/app` (customers) and `/internal` (platform staff), each with its own OpenAPI | FastAPI, async SQLAlchemy 2, Alembic, Postgres 16, PyJWT, Argon2, Pydantic AI + Gemini, pytest + testcontainers |
| `app/` | Customer app (SPA), port 3001 | TanStack Start, React, Tailwind, shadcn/ui, Orval-generated React Query hooks, react-hook-form, zod |
| `internal/` | Staff console (SPA), port 3002 | Same stack as `app/` |
| `site/` | Landing page (static), port 3000 | TanStack Start SSG, shadcn/ui |

Conventions:
- Services only `flush()` and routers `commit()`.
- Errors come back in FastAPI's 422 shape `{detail:[{type,loc,msg}]}`.
- Lists come back as `{items,total,limit,offset}`.
- String columns plus CHECK constraints are used instead of DB enums.

## 3. Data model

| Table | Key columns and rules |
| --- | --- |
| `users` | first/last name (≤100), email (unique, ≤254), password (Argon2), `is_active` (checked on every request), `is_admin` (= **platform staff**, unrelated to the org admin role) |
| `organizations` | name (≤100), `suspended_at`, `suspended_reason` (≤500) |
| `organization_memberships` | org, user, role `owner\|admin\|member` (CHECK), UNIQUE(org, user) |
| `organization_invites` | org, email, role `admin\|member`, `token_hash` (SHA-256, unique; the token is shown once), created_by, `expires_at` (14 days), accepted_at/by, revoked_at |
| `teams` | org, name (unique per org), description (≤500); UNIQUE(org, id) as a composite FK target |
| `team_memberships` | org, team, user, `is_lead`; UNIQUE(team, user); **partial unique index: one lead per team**; composite FKs (org, team) → teams and (org, user) → org memberships, so nobody can be put in another org's team, and leaving the org removes their team rows |
| `weekly_plans` | org, user, `week_start` DATE (**CHECK ISODOW = 1**, a Monday), status `draft\|submitted\|approved\|done`, submitted_at, approved_at, approved_by, completed_at, `main_goal_shipped`, `outcome_note` (≤1000), `ai_review` JSONB, `ai_reviewed_at`, `ai_review_plan_hash`; UNIQUE(org, user, week_start) |
| `plan_tasks` | plan, kind `main\|sub_goal\|gtm`, title (≤300), why (≤1000, main only), estimate_hours (1–60), position, is_done, done_at; **partial unique index: one main task per plan** |
| `plan_reviews` | plan, reviewer, action `approved\|changes_requested`, comment (≤2000) |
| `ai_usage_events` | org, user, operation `plan_review\|plan_draft`, outcome `succeeded\|failed\|rate_limited`, error_kind, model, latency_ms, input/output tokens. Metadata only, never prompt or output text |

## 4. API endpoints

### Customer surface `/app`
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | DB ping |
| POST | `/auth` | email + password → httpOnly cookie `access_token` (JWT, audience `app`, 24h) |
| POST | `/signup` | first/last name, email, password 8–128 → creates an active user and logs them in; 409 on duplicate email |
| POST | `/logout` | clears the cookie |
| GET | `/users/self` | current user |
| GET/POST | `/organizations` | list mine / create (the caller becomes owner) |
| GET/PATCH | `/organizations/{org}` | read / rename (managers) |
| DELETE | `/organizations/{org}/membership` | leave (last-owner guard) |
| GET | `/organizations/{org}/members` | everyone in the org |
| PATCH/DELETE | `/organizations/{org}/members/{membership}` | change role / remove (rules in §6) |
| GET/POST | `/organizations/{org}/invites` | managers: list pending / create → `invite_url` shown once |
| DELETE | `/organizations/{org}/invites/{invite}` | revoke |
| GET | `/invites/{token}` | public preview (org, inviter, email, role, status) |
| POST | `/invites/{token}/accept` | the signed-in email must match; 410 if accepted, revoked or expired |
| GET/POST | `/organizations/{org}/teams` | list / create (managers) |
| GET/PATCH/DELETE | `/organizations/{org}/teams/{team}` | read / update / delete (managers) |
| PUT/DELETE | `/organizations/{org}/teams/{team}/members/{user}` | add or set lead (`{is_lead}`) / remove |
| GET | `/organizations/{org}/teams/{team}/weeks/{monday}` | team week view (lead or manager) |
| GET | `/organizations/{org}/teams/{team}/weeks` | per-week history rollup |
| GET/POST | `/organizations/{org}/plans` | my plans (`?week_start`, paging) / create a draft |
| GET/PUT | `/organizations/{org}/plans/{plan}` | read / replace the draft's tasks (ids kept stable) |
| PATCH | `/organizations/{org}/plans/{plan}/tasks/{task}` | tick done/undone (approved plans only) |
| POST | `…/plans/{plan}/submit` · `withdraw` · `approve` · `request-changes` · `complete` | workflow (§5) |
| POST | `…/plans/{plan}/ai-review` | AI review, stored on the plan |
| POST | `/organizations/{org}/ai/plan-drafts` | brain dump → draft (never stored) |
| GET | `/organizations/{org}/approvals` | submitted plans the caller can approve |
| GET | `/ai/status` | whether AI is configured (the UI hides AI buttons when it isn't) |

### Staff surface `/internal` (separate cookie `internal_access_token`, requires `is_admin`)
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth`, `/logout`; GET `/users/self` | staff-only login |
| GET | `/users?q=` | search by name or email, paged |
| POST | `/users` | create a **customer** account (staff accounts come only from the CLI) |
| GET/PATCH | `/users/{id}` | detail + memberships / edit names, email, `is_active` (you can't deactivate yourself) |
| POST | `/users/{id}/change-password` | set a password (≥8) |
| GET | `/organizations?q=&status=` | member, team and plan counts, last active |
| GET | `/organizations/{id}` | metadata, members, teams |
| POST | `/organizations/{id}/suspend` (reason) · `/reinstate` | locks members out / restores access |
| GET | `/ai-usage/summary?days=` · `/ai-usage/events` | per-org aggregates / per-call list |

## 5. Business logic

### Plan workflow
| Transition | Who | Rule |
| --- | --- | --- |
| create draft | author | week must be a Monday and one of last, this or next week; one plan per user per org per week (409) |
| edit tasks | author | draft only; ≤15 tasks; ≤1 main task; `why` only on the main task; tasks sent with an id are updated in place |
| draft → submitted | author | needs a main task with a non-blank `why`, and **someone able to approve** (else 409 `NO_APPROVER`) |
| submitted → draft (withdraw) | author | |
| submitted → approved | approver | optional comment; records a `plan_reviews` row and `approved_by` |
| submitted → draft (send back) | approver | **comment required**; records `changes_requested` |
| tick task | author | approved plans only |
| approved → done | author | `main_goal_shipped` required, optional outcome note |

### Who approves
- Approvers:
  - A **lead of a team the author belongs to** may approve.
  - A lead's own plan may also be approved by another lead of a shared team, **or by an org owner or admin**.
- Nobody approves their own plan (403 `SELF_APPROVAL`).

### Visibility
- **Drafts are private** to the author. Others see only "still drafting".
- Submitted, approved and done plans are readable by the author and their possible approvers.
- Plans you can't read return **404**.

### Tenancy
- Every `/organizations/{org}/…` route goes through one dependency (`OrgContext`) that loads the caller's membership:
  - Not a member → **404** (not 403, so ids can't be probed).
  - Suspended org → **403 `ORGANIZATION_SUSPENDED`**.
- Services always filter by org id.
- A route meta-test fails if an org route skips the dependency.

### Org roles
- **Owners:**
  - Can change any role.
  - Can remove anyone.
  - Can't demote or remove the last owner (409).
- **Admins:**
  - Can only move people between admin and member.
  - Can remove only members.
  - Can't grant or touch the owner role.
- **Owners and admins** (managers):
  - Can rename the org.
  - Manage invites.
  - Manage teams, team members and the lead.
- **Making someone lead** replaces the previous lead.
- **Anyone** can leave the org.

### Team views
- Visible to managers and that team's lead (others get 403).
- **Team week:** one row per member (lead first), showing their plan if readable, otherwise "Still drafting".
- **History:** per week, counts of submitted, approved, closed and shipped, over the team's *current* members.

### Invites
- A new invite to the same email revokes any earlier pending one.
- The invite is bound to that email (403 if a different account accepts it).
- It's refused if the org is suspended.
- Already a member → 409.

### AI (Pydantic AI + Gemini `gemini-3.5-flash-lite`)

**Reviewer agent:**
- Plays a "demanding lead".
- Returns `{verdict approve|adjust, summary, findings[]}`. Each finding has `task_ref` (MAIN/SG1/GTM1/NEW), `issue` (`not_checkable`, `missing_why`, `missing_gtm`, `scope_too_big`, `carried_over`, `unclear`), `severity` (`must_fix`/`consider`), `problem`, `field` (title/why), `suggested_rewrite`, and `new_task_kind`.
- The server maps refs back to task ids and drops refs it doesn't recognize.
- A `must_fix` finding forces the verdict to `adjust`.
- The review is stored with a content hash, so it shows as **stale** after edits.
- Tool `previous_plans`: the author's last two plans (server-scoped), used to flag **carried-over** work.

**Drafter agent:**
- Takes notes (10–4000 chars).
- Returns `{main_task{title,why,estimate}, sub_goals ≤6, gtm_goals ≤4, left_out ≤8}`.
- The draft only fills the form and is never saved.

**Rules for both agents:**
- The model never sees names, emails or ids.
- Placeholders go in `[brackets]` instead of invented facts.

**Failures:**
- No key → 503 (AI buttons hidden).
- Per-user limit of 6 calls a minute → 429.
- Provider 429 → 429.
- Provider error → 503.
- Timeout (30 s) → 504.
- Invalid output → 502.

Every call writes one `ai_usage_events` row, even when it fails.

### Staff privacy
- Staff see metadata only: counts, statuses, timestamps, names, emails, roles, team names.
- They never see task text, "why", comments, AI reviews or brain dumps.
- Staff accounts are created only by `manage.py create-user --admin`.
- Users are deactivated, never hard-deleted. Deactivation ends sessions immediately.

### Time and capacity
- Weeks are keyed by Monday.
- Estimated hours above **30** show a capacity warning.

## 6. Pages and user flows

**Customer app:**

| Route | What it does |
| --- | --- |
| `/login`, `/signup` | Email and password; `?redirect` and `?email` carried through (same-app paths only) |
| `/invites/{token}` | Preview. Signed out: sign up or log in, then come back. Wrong account: sign out. Matching email: Accept and join |
| `/` | Redirects to the last-used org's week, or `/welcome` |
| `/welcome` | Lists the user's orgs (suspended ones greyed out), lets them create an org, and has a "joining a team? ask for an invite link" card |
| `/o/{org}/week` | My week. Week picker (back without limit; forward only to next week); empty state with "Write my plan" or "Draft from my notes"; plan editor (main task + why, sub-goals, GTM, hours, >30h warning); AI review banner with findings beside tasks and Apply / Add this task; Undo after a brain dump; Submit; read-only view with tick boxes, Withdraw, and a Close the week dialog (shipped yes/no and a note); review history |
| `/o/{org}/plans/{id}` | Approver view: Approve (optional comment) or Send back (required comment) |
| `/o/{org}/approvals` | Queue of plans waiting for me, with a count badge in the nav |
| `/o/{org}/teams` | Team cards (lead, or a "no lead" warning); managers can create teams |
| `/o/{org}/teams/{id}` | Team week table with progress, history rollup (12 weeks), people management (make lead, add, remove), delete team |
| `/o/{org}/history` | My past weeks: "shipped X of Y closed weeks" |
| `/o/{org}/settings` | Rename the org, manage members' roles, invites (create, copy the link once, cancel), leave the org |

**Staff console:**

| Route | What it does |
| --- | --- |
| Overview | Totals, suspended count, 7-day AI calls and failure rate, top orgs |
| Organizations | Search, status filter, paged list; detail with suspend (reason) / reinstate, members, teams, recent AI calls |
| Users | Search; create customer account; edit; change password; deactivate or reactivate; detail with memberships |
| AI usage | 7, 30 or 90 days; per-org table; calls list with outcome filter and failure reasons |

A permanent "internal" banner is shown on every console page.

**Landing page:**
- Sections: hero with tagline and pitch, why not Notion, Linear or spreadsheets, how a week works (3 steps), the AI review example, for leads, CTA, footer.
- Includes `<title>`, meta description, an Open Graph image and Twitter tags.

**Shared UI states:** loading, empty, 403 "no access", 404 "not found", suspended org, and "can't reach the server". Every page has these.

## 7. Authentication and notifications already in the original

| Feature | Present? |
| --- | --- |
| Email + password signup and login | Yes (Argon2, JWT in httpOnly cookies, audience per surface) |
| Email verification | **No** |
| Password reset (self-service) | **No** (staff can set a password) |
| Social login | **No** |
| Brute-force protection on login | **No** explicit limiter |
| Roles | Org roles (owner, admin, member), team lead flag, platform staff flag |
| Session revocation | Yes, by deactivation (checked on every request) |
| Notifications (email, SMS, in-app) | **None.** Email, notifications, billing and SSO were out of scope in the original brief. Invites are copyable links, not emails |

## 8. Seed data (`manage.py seed-demo`)

- Two orgs: Northwind Labs and Harbor Health.
- Three teams with leads.
- A member in two teams (Tom).
- An owner, an org admin, members and leads.
- One staff account.
- Five closed weeks, some shipped and some not.
- The current week has approved, submitted, sent-back and not-started plans.
- Tom has a main task that slipped twice (the carried-over case).
- Synthetic AI usage history.

## 9. What the rebuild adds (approved 2026-10-14)

- Clerk auth with email verification, password reset, and Google and GitHub login.
- Clerk Organizations.
- Novu email, SMS and in-app notifications, scheduled reminders, and a notification settings page.
- Assigned tasks with deadlines, configurable deadline reminders and assignment emails.
- Chat: task and plan threads, team channels, DMs.
- GitHub repos and issues per team.
- An org markdown wiki with versions and .md import and export.
- At least one team per org.
- A hidden super-admin page: create staff, suspend owners, approve org deletion.
- Project docs in `docs/`.

See the plan in the README and `docs/ARCHITECTURE.md`.
