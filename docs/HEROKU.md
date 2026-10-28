# Deploy Floppy to Heroku

Deploy the repository root to **two Heroku apps**: one Next.js frontend and one Express API. Each gets its own public URL and web dyno. If the API is already hosted elsewhere, deploy only the frontend and set NEXT_PUBLIC_API_URL to its existing URL.

Use **Cedar, heroku-24, and the classic heroku/nodejs buildpack**. Node is pinned to 24.x. This setup keeps your existing Supabase database and does not provision add-ons.

## 1. Create the apps

Install the Heroku CLI. From the repository root, replace these names with globally unique app names:

```sh
heroku login
heroku create YOUR-API-APP --generation cedar --stack heroku-24 --buildpack heroku/nodejs --remote heroku-api
heroku create YOUR-WEB-APP --generation cedar --stack heroku-24 --buildpack heroku/nodejs --remote heroku-web
heroku apps:info --app YOUR-API-APP
heroku apps:info --app YOUR-WEB-APP
```

Copy the actual Web URLs shown by Heroku, including any generated suffix. Use HTTPS origins without trailing slashes below. You can use custom domains once configured.

## 2. Set config vars before deploying

In each app's Heroku dashboard, open **Settings > Reveal Config Vars**. Enter credentials there; never commit them. Both apps must use the same Clerk instance.

### API app

| Variable | Value |
| --- | --- |
| FLOPPY_APP | api |
| NODE_ENV | production |
| WEB_ORIGIN | Web app HTTPS origin |
| API_PUBLIC_URL | API app HTTPS origin |
| DATABASE_URL | Supabase Postgres connection string |
| DATABASE_MIGRATION_URL | Supabase direct or session-pooler URL on port 5432 |
| DATABASE_SSL | true |
| CLERK_SECRET_KEY | Clerk secret key |
| CLERK_PUBLISHABLE_KEY | Clerk publishable key |
| CLERK_WEBHOOK_SIGNING_SECRET | Signing secret for the deployed webhook endpoint |
| REMINDERS_ENABLED | true |

Runtime can use the transaction pooler on port 6543. Migrations need a direct or session connection on port 5432. Use the session pooler if the direct host is unreachable from Heroku. Without DATABASE_MIGRATION_URL, migrations use DATABASE_URL.

For notifications, set NOVU_SECRET_KEY and NOVU_APPLICATION_IDENTIFIER, plus NOVU_API_URL for the EU region. See apps/api/.env.example for other optional settings. Leave unused optional variables unset, especially URLs.

### Web app

| Variable | Value |
| --- | --- |
| FLOPPY_APP | web (default if omitted) |
| NODE_ENV | production |
| NEXT_PUBLIC_API_URL | API app HTTPS origin |
| NEXT_PUBLIC_SITE_URL | Web app HTTPS origin |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk publishable key |
| CLERK_SECRET_KEY | Clerk secret key |
| NEXT_PUBLIC_CLERK_SIGN_IN_URL | /sign-in |
| NEXT_PUBLIC_CLERK_SIGN_UP_URL | /sign-up |

For Novu Inbox, optionally set NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER. For EU Novu, set NEXT_PUBLIC_NOVU_BACKEND_URL to https://eu.api.novu.co and NEXT_PUBLIC_NOVU_SOCKET_URL to wss://eu.socket.novu.co.

**Set all NEXT_PUBLIC_* values before building.** Next.js embeds them in browser bundles. Changes require a rebuild/deploy, not just a restart. The API URL is also embedded in the web Content Security Policy.

Heroku supplies PORT; do not set it yourself. Keep the buildpack's default installation of dev dependencies during builds. They are pruned afterward; production startup and migrations use compiled JavaScript.

## 3. Configure integrations

- Configure Clerk for your deployed web domain and production instance using its dashboard deployment checklist.
- Point the Clerk webhook to `https://YOUR-ACTUAL-API-HOST/webhooks/clerk`, select the events listed in the README, and put the signing secret on the API app.
- If using Novu, publish workflows after the API is live. Its bridge URL is `https://YOUR-ACTUAL-API-HOST/api/novu`. See notification setup in the README. The compiled sync command is `heroku run "node apps/api/dist/scripts/novu-sync.js" --app YOUR-API-APP`.

## 4. Commit and deploy

Commit the configuration changes, then push the same commit to both apps, API first:

```sh
git push heroku-api HEAD:main
heroku ps:scale web=1 --app YOUR-API-APP
git push heroku-web HEAD:main
heroku ps:scale web=1 --app YOUR-WEB-APP
heroku open --app YOUR-WEB-APP
```

Choose suitable dyno plans in the dashboard. Keep the API on **one always-on dyno** initially: reminders, realtime rooms, and rate limits live in the API process. Multiple API dynos require shared realtime/rate-limit state and a single reminder scheduler. Sleeping dynos cannot reliably send scheduled reminders.

The root Procfile runs:

- `web: npm start`: selects web or API using FLOPPY_APP; both honor Heroku's PORT.
- `release: npm run heroku:release`: runs committed SQL migrations on the API only. Failed migrations block the new release. Web releases do not access the database.

The heroku-postbuild hook builds only the selected app plus the shared package. Always deploy the repository root so npm can resolve the workspaces. Changing FLOPPY_APP requires rebuilding for that target.

## 5. Verify

```sh
heroku releases --app YOUR-API-APP
heroku logs --tail --app YOUR-API-APP
heroku logs --tail --app YOUR-WEB-APP
```

Check `https://YOUR-ACTUAL-API-HOST/health` for `{"ok":true}`, then open the frontend, sign in, and test an organization page and chat. The health endpoint checks HTTP availability, not database or integration connectivity.

- **Clerk build error:** set the web publishable key before building.
- **Browser calls localhost:** correct NEXT_PUBLIC_API_URL and rebuild the frontend.
- **CORS/session errors:** WEB_ORIGIN must match the exact web origin; both apps must use the same Clerk instance.
- **Migration failure:** inspect release logs and verify the session connection and SSL setting.
- **H10/R10:** inspect startup logs, confirm FLOPPY_APP, and remove any manually configured PORT.

References: [Heroku Node deployment](https://devcenter.heroku.com/articles/deploying-nodejs), [classic build lifecycle](https://devcenter.heroku.com/articles/nodejs-classic-buildpack-builds), [release phase](https://devcenter.heroku.com/articles/release-phase), [Next.js CLI](https://nextjs.org/docs/15/app/api-reference/cli/next).
