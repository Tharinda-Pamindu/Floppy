# Deploy Floppy as one Heroku app

The repository now builds the Next.js frontend and Express API together. One Node process serves both on Heroku's PORT, with Socket.IO attached to the same HTTP server. FLOPPY_APP is no longer read; existing web/api values have no effect. Local npm run dev still runs the two development servers.

Use the classic heroku/nodejs buildpack (Cedar). Keep the existing floppy-dev app and its custom domain; a second app is unnecessary. The current package.json pins Node 24.x.

## 1. Configure the existing app before deploying

Open Settings > Reveal Config Vars. All frontend and API settings belong on this same app. Local .env files are excluded from the slug.

| Variable | Production value |
| --- | --- |
| NODE_ENV | production |
| NEXT_PUBLIC_API_URL | Not needed in production; /api is enforced by the single-app build |
| NEXT_PUBLIC_SITE_URL | https://floppy.builtbytharinda.tech |
| WEB_ORIGIN | https://floppy.builtbytharinda.tech |
| API_PUBLIC_URL | https://floppy.builtbytharinda.tech |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Production pk_live_ key |
| CLERK_PUBLISHABLE_KEY | Same production pk_live_ key |
| CLERK_SECRET_KEY | Production sk_live_ key |
| CLERK_WEBHOOK_SIGNING_SECRET | Production webhook signing secret |
| DATABASE_URL | Supabase PostgreSQL connection string |
| DATABASE_MIGRATION_URL | Direct or session-pooler connection on port 5432 |
| DATABASE_SSL | true |
| REMINDERS_ENABLED | true |
| NEXT_PUBLIC_CLERK_SIGN_IN_URL | /sign-in |
| NEXT_PUBLIC_CLERK_SIGN_UP_URL | /sign-up |

Production API requests always use /api on the current website. NEXT_PUBLIC_API_URL only selects the separate API server during local development; old Heroku values are ignored. Deploy this updated code to replace previously built browser bundles. Next.js embeds NEXT_PUBLIC_* values during build: rebuild after changing them. Set NEXT_PUBLIC_SITE_URL so the CSP explicitly permits the site's secure WebSocket origin.

Runtime database access can use Supabase's transaction pooler on port 6543. Migrations require a direct/session connection (5432); use the session pooler when the direct host is unreachable. DATABASE_MIGRATION_URL falls back to DATABASE_URL. Never commit database URLs or keys.

Do not set PORT: Heroku supplies it. Leave dev dependencies installed during the build; Heroku prunes them afterward. Optional Novu settings are NOVU_SECRET_KEY, NOVU_APPLICATION_IDENTIFIER and region-specific NOVU_API_URL; see the API/web .env.example files for the remaining optional integrations.

## 2. Deploy the updated code

Commit and push these changes to the connected main branch, or use Deploy > Deploy Branch after the updated code is on GitHub. Old deployed code still uses FLOPPY_APP; only this new deployment removes that dependency. There is no need to change FLOPPY_APP while the old code is deployed. Remove the obsolete variable after the new release succeeds.

The build must show BOTH @floppy/api build and @floppy/web build. The Procfile then runs database migrations during release and starts the combined server. A failed migration blocks the new release; inspect its release log instead of skipping migrations.

The same web dyno hosts the frontend, API, reminders, and realtime connections. Start with one always-on web dyno and monitor memory usage: frontend and backend share its memory and CPU. Multiple dynos require shared realtime/rate-limit state and a single reminder scheduler.

## 3. Routes and integrations

| Public path | Destination |
| --- | --- |
| /, /app, /staff, /sign-in, /_next/... | Next.js |
| /api/me, /api/organizations/... , /api/staff/... | Express (the /api prefix is removed) |
| /health or /api/health | HTTP health check |
| /webhooks/clerk | Clerk webhook (raw signed body preserved) |
| /api/novu | Existing Novu bridge |
| /socket.io/ | Socket.IO on the same server |

Configure Clerk's production webhook as https://floppy.builtbytharinda.tech/webhooks/clerk. Keep its DNS records and OAuth callback at the Clerk domain; they do not move to /api. Novu's bridge remains https://floppy.builtbytharinda.tech/api/novu.

API requests still use Bearer tokens through useApi. Frontend pages and API routes retain separate authentication and security headers. Server-side requests using the relative /api configuration reach the same server over loopback; realtime uses the website origin, not a Socket.IO /api namespace.

## 4. Verify

1. Open https://floppy.builtbytharinda.tech/api/health and expect {"ok":true}. This checks HTTP availability, not database/integration connectivity.
2. Open the website, sign in with Google, and load an organization.
3. Verify an authenticated chat connection, Clerk webhook delivery, and Novu bridge if enabled.
4. Check Heroku runtime/release logs if any step fails.

References: [Heroku release phase](https://devcenter.heroku.com/articles/release-phase), [Next.js custom server](https://nextjs.org/docs/app/guides/custom-server), [Heroku port binding](https://devcenter.heroku.com/articles/dyno-startup-behavior#port-binding-of-web-dynos).
