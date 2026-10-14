# Changelog

## 0.1.0 — 2026-10-14

The first version of the Floppy rebuild on Next.js 15, Node, Supabase, Clerk and Novu.

### Carried over from the original

- Organizations with owner, admin and member roles, the last-owner guard, and invites (now emailed by Clerk).
- Teams with one lead, and people on several teams.
- Weekly plans: one main task with a why, sub-goals and go-to-market goals, and estimates with a 30-hour warning.
- The draft → submitted → approved → done workflow, with approve or send back (comment required), task ticking and "did it ship?".
- Approver rules (no self-approval; leads' plans approved by managers) and draft privacy.
- Team week view and history, approvals queue, my past weeks.
- Staff console: organizations (suspend/reinstate), users (search, create, edit, deactivate, set password) and AI usage, all metadata only.
- AI plan review and draft from notes, behind a provider interface and **off by default**.
- Demo seed: two orgs, five closed weeks, every plan state, and the carried-over case.

### New

- Clerk auth: email verification, password reset, Google and GitHub, lockout.
- Novu notifications: in-app Inbox with an unread bell, email (Resend), SMS (Twilio), 26 code-first workflows, digests and a delay, a notification settings page, and a test-notification command.
- Scheduled reminders in each person's time zone (Monday plan, Friday close) and deadline reminders with a chosen lead time.
- Assigned tasks with deadlines, priorities and assignment emails; pulling into the weekly plan with two-way status sync.
- Realtime chat: plan and task threads, team channels, DMs, mentions, unread counts.
- GitHub: repositories linked to teams, open issues listed, an issue turned into an assignment, issue state shown.
- Organization pages: a markdown wiki with append-only versions, viewing old versions, `.md` import and export, and conflict detection.
- At least one team per organization (the first team is created with it).
- Hidden super-admin page: staff accounts, owner suspensions, deletion requests, audit log.
- Owner-requested organization deletion, reviewed by a super admin.
- New design: "paper and ink", light, dark and system themes, a mobile bottom tab bar.
