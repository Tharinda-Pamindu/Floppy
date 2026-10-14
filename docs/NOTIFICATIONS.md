# Notifications (Novu)

- **Where it's defined:** every workflow is in `apps/api/src/notifications/workflows.ts`, using `@novu/framework`, and served from the API's bridge (`/api/novu`).
- **Triggers:** the API triggers workflows with `@novu/api`, and the reminder cron (`apps/api/src/jobs/reminders.ts`) does the same. A notification failure is logged and never fails the user's action.
- **Channels:**
  - **In-app:** Novu `<Inbox/>` behind the bell, with the unread count on the bell.
  - **Email:** Resend, connected in Novu → Integrations.
  - **SMS:** Twilio, connected in Novu → Integrations. It's sent only to people who saved a phone number, and off by default where marked.

## Workflow catalogue

| Workflow | Trigger | Recipients | Steps |
| --- | --- | --- | --- |
| `welcome` | First sign-in, or Clerk `user.created` | New user | in-app, email |
| `auth-verification-code` 🔒 | Clerk `email.created` / `sms.created` (opt-in) | Signing-up user | email or SMS |
| `auth-password-reset` 🔒 | Clerk `email.created` (opt-in) | User | email |
| `org-invitation` 🔒 | Clerk `email.created` (opt-in) | Invitee | email |
| `member-joined` | Membership created | Owners and admins | in-app |
| `plan-submitted` | `POST …/submit` | Possible approvers | in-app → **digest 30 min** → email |
| `approval-overdue` | `POST …/submit` | Possible approvers | **delay 24h** → in-app + email, *skipped if decided* |
| `plan-approved` | `POST …/approve` | Author | in-app, email, SMS (off by default) |
| `plan-changes-requested` | `POST …/request-changes` | Author | in-app, email, SMS (off by default) |
| `team-lead-assigned` | Made team lead | New lead | in-app, email |
| `weekly-plan-reminder` | Cron, Monday 09:00 local, no submitted plan | Member | in-app, email, SMS (off by default) |
| `week-close-reminder` | Cron, Friday 16:00 local, approved and not closed | Member | in-app, email |
| `org-suspended` 🔒 / `org-reinstated` | Staff action | All members | in-app, email |
| `task-assigned` | `POST /tasks`, reassignment | Assignee | in-app, **email (the new-assignment email)**, SMS (off by default) |
| `task-updated` | Deadline, priority or details changed | Assignee | in-app |
| `task-completed` | Task done | Assigner | in-app |
| `task-deadline-reminder` | Cron, using the assignee's lead time (1h, 1d or 3d) | Assignee | in-app, email, SMS (off by default) |
| `task-overdue` | Cron, deadline passed | Assignee + assigner | in-app, email |
| `chat-message` | New message | Other members of the conversation | in-app → **digest 15 min** → email |
| `chat-mention` | `@mention` | Mentioned people | in-app, email |
| `page-updated` | Page saved or imported | Team members (or the whole org) except the editor | **digest 1h** → in-app |
| `org-deletion-requested` | Owner requests deletion | Super admins | in-app, email |
| `org-deletion-decided` 🔒 | Super admin decides | Requesting owner | in-app, email |
| `account-suspended` 🔒 | Owner suspended or reinstated | That owner | email |
| `test-notification` | `npm run notify:test`, or the settings-page button | You | in-app, email, SMS (if a phone is saved) |

🔒 = critical. `preferences.all.readOnly = true`, so people can't turn these off.

## Subscribers and preferences

- **Subscriber id:** the Clerk user id. The subscriber is created on first sign-in or `user.created`, and updated when the name, email, phone or time zone changes.
- **Inbox security:** `GET /me/notifications/session` returns `subscriberHash = HMAC-SHA256(NOVU_SECRET_KEY, subscriberId)`. Turn on HMAC in Novu's In-App integration so the Inbox requires it.
- **Settings page** (`/app/:org/notifications`):
  - Global switches for email, SMS and in-app.
  - A per-workflow grid, read and written through Novu's subscriber preferences API.
  - Phone number, time zone and deadline lead time.

## Reminders (cron)

- `node-cron` runs every 15 minutes inside the API (`REMINDERS_ENABLED=false` turns it off, for example on a second instance).
- Before sending anything, the job inserts `reminder_sends(user, kind, ref)`. Because of the unique constraint, a reminder is sent at most once, whatever the overlap.
- Weekly reminders use the person's time zone (`zonedParts`), so 09:00 in Colombo is 03:30 UTC.

## Email content

- Templates are built with `emailLayout()` (`notifications/email.ts`).
- Every user-provided value is HTML-escaped, and only `http(s)` links are rendered.
- Deadlines are shown in the assignee's time zone.

## Connecting the providers

1. **Resend:**
   - In Resend, verify your sending domain and create an API key.
   - In Novu → Integrations → Resend, paste the key and the *From* address, then set it active and primary.
2. **Twilio:**
   - Get the Account SID and Auth Token, and buy (or use the trial) number.
   - In Novu → Integrations → Twilio, paste them and the *From* number.
   - Trial accounts only deliver to verified numbers.
3. **Sync the workflows** (README §5) and send `npm run notify:test -- --user <email>`. Novu → Activity shows each channel's delivery.
