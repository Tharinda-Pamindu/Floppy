# Security

| Risk | Mitigation |
| --- | --- |
| **Password storage** | Passwords never touch our code or database. Clerk stores bcrypt hashes and checks breach lists. Admin-set passwords go straight to Clerk and sign out other sessions. |
| **Brute-force login** | Clerk attack protection (user lockout + bot protection, turned on in the dashboard). API: a global per-IP rate limit, plus per-user limits on AI (6 a minute), chat (30 a minute) and test notifications (3 a minute). |
| **Session theft / revocation** | Short-lived Clerk JWTs, with `authorizedParties` pinned to the web origin. Deactivated, banned or suspended accounts are refused on **every** request (user mirror check), and Clerk bans end all sessions. |
| **CSRF** | The API authenticates only with `Authorization: Bearer`. It never reads cookies for auth, and CORS allows only `WEB_ORIGIN` with no credentials, so a cross-site request has no ambient credentials to use. The web app has no state-changing form posts; Clerk protects its own cookie endpoints. |
| **XSS** | React escapes all output, and there is no `dangerouslySetInnerHTML`. Markdown renders with `react-markdown` + `rehype-sanitize`, with raw HTML skipped. Chat is plain text, with mentions and links tokenised safely (`rel="noopener noreferrer nofollow"`). Emails escape every value and allow only `http(s)` links. A strict CSP plus `X-Frame-Options: DENY`, `nosniff` and a strict referrer policy on the web; helmet on the API. |
| **Input validation** | Every body, query and param is parsed with the shared zod schemas (lengths, enums, Monday dates, E.164 phone numbers, IANA time zones, `owner/repo`). UUID params are checked before querying. JSON bodies are capped at 300 KB; page imports are capped at 200 KB, must be UTF-8 and can't contain NUL bytes. |
| **Tenancy (IDOR)** | `orgContext` on every org route; outsiders get 404. Every query is scoped by `organization_id`; composite FKs block cross-org team membership; plans, tasks, threads and pages re-check visibility. Covered by the cross-org tests. |
| **Privilege escalation** | Platform roles live in Clerk `publicMetadata` (backend-only writes) and come only from the CLI or a super admin. Org admins can't touch owners. Nobody approves their own plan or changes their own role. The super-admin surface answers 404 to staff. |
| **Database exposure** | Supabase RLS is on for every table with no policies, so the anon and authenticated keys read nothing. Only the API's server-side connection string reaches the data. |
| **Webhooks** | Clerk webhooks are verified with Svix signatures (`CLERK_WEBHOOK_SIGNING_SECRET`), using the raw body. The Novu bridge verifies Novu's HMAC (`strictAuthentication` in production). |
| **Realtime** | Socket.IO checks the Clerk token at connect, and room joins re-run the same access checks as REST. The socket is push-only, with a 16 KB max payload. |
| **Notifications** | Inbox access needs an HMAC `subscriberHash`. Notification failures never leak to users. |
| **Secrets** | Only environment variables (`config.ts` validates them and refuses to start without the required ones). `.env*` files are git-ignored; `.env.example` files hold placeholders only. Resend and Twilio keys live in Novu, not in this repo. Logs never include tokens, message bodies or plan text. |
| **Staff privacy** | Staff endpoints return metadata only: counts, statuses, names, emails, roles. No plan text, comments, AI output, chat messages or page content. |
| **AI** | Off by default. When on, the model sees task text with short refs (MAIN, SG1…) but never names, emails or ids. Output is zod-validated, and unknown refs are dropped. Brain-dump drafts are never saved directly. Every call is logged as metadata only. |
