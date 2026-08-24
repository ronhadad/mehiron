# Deploying to Vercel

## Vercel project settings

The repo is an npm workspace with two packages, and the Next app is one of them.

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Include files outside the root directory | **on** — the app imports `../server` |
| Framework Preset | Next.js |
| Install Command | `cd .. && npm install` — or `npm install --prefix=..`; both work |
| Build Command | *(leave default — `next build`)* |
| Output Directory | *(leave default)* |

`npm install` at the repo root is what generates the Prisma client: the root
`postinstall` runs `prisma generate --schema server/prisma/schema.prisma`. Without
it the build fails with `Can't resolve '@prisma/client'`, because the client is
generated rather than shipped.

`prisma` is declared in the root `package.json` as well as in `server`, and that
is load-bearing rather than redundant: npm puts `node_modules/.bin` on PATH only
for scripts belonging to a package that *declares* the dependency. The binary was
hoisted to the root all along, but the root did not declare it, so the root
postinstall failed with `prisma: command not found`.

## Environment variables

All three are required. With `APP_PASSWORD` or `AUTH_SECRET` missing, the app
refuses every request instead of serving an open one — a deployment lacking its
configuration must not be a public one.

| Name | Notes |
| --- | --- |
| `DATABASE_URL` | A hosted Postgres. The local Docker instance on port 5434 is not reachable from Vercel. Prisma runs inside the Next process, so it has to be in *this* app's environment; `server/.env` is read only by the Prisma CLI. |
| `APP_PASSWORD` | The single sign-in password. |
| `AUTH_SECRET` | Signs the session cookie. `openssl rand -base64 32`. Changing it signs everyone out. |

After the database exists, create the tables:

```sh
DATABASE_URL='<the hosted url>' npx prisma migrate deploy --schema server/prisma/schema.prisma
```

No API keys are required anywhere in this app. Destination
photos come from Wikimedia, coordinates and Google entity ids from Wikidata, maps
from OpenStreetMap, and prices from Google over plain HTTP.

## No vercel.json

There was one, declaring `functions: { "app/api/.../route.ts": { maxDuration } }`,
and it broke the deployment before the build even started — a five-line log that
stopped at "Cloning completed". Those patterns describe source files, but Vercel
builds functions for the App Router from the framework's own output, so the
patterns matched nothing and the configuration was rejected.

Per-route budgets belong in the route: `export const maxDuration`. Sixty seconds
for a check, thirty for the two that make a single Google request.

## Two things that will behave differently in the cloud

**Google may refuse a datacenter IP.** Everything here rests on ordinary HTTP
requests to Google returning prices, which they do from a home connection. Vercel's
addresses are shared and heavily used, and Google serves consent and `/sorry/`
interstitials to them far more readily. `fetchGooglePage` detects that and reports
it rather than inventing a price, so a blocked deployment shows honest failures
instead of wrong numbers — but it would be much less useful. Test this immediately
after the first deploy by creating a group and pressing בדיקה עכשיו.

**Function time is capped.** A check is sequential: one flights page, then one page
per hotel, with a gap between requests. Hobby allows 60 seconds, which covers a
group with a handful of hotels and not many more. The snapshots written before a
timeout stand; the rest are simply not recorded.

## Scheduling

There is no scheduler yet — checks run when someone asks for one. Vercel Cron is
the natural fit, but Hobby runs a cron job at most once a day, so anything more
frequent needs Pro.

## Access

One password, set in `APP_PASSWORD`, and a session cookie signed with
`AUTH_SECRET` — there is no user table, because there is one account.

The cookie is `HttpOnly`, `SameSite=Lax`, thirty days, and `Secure` in production
only (a Secure cookie is never stored over plain HTTP, so localhost would never
sign in). Middleware guards every path except `/login` and `/api/auth`: pages
redirect, API routes answer 401.

What this is not: there is no per-IP rate limiting, because serverless has no
shared store to count attempts in. Each sign-in attempt is delayed instead, which
makes guessing at scale expensive without helping a real visitor. The defence that
matters is a password worth having.

## Automatic checks

Each vacation stores an `intervalSeconds`. Nothing inside the app runs it — the
schedule is *pulled* from outside by hitting one endpoint:

    GET /api/cron/check     Authorization: Bearer $CRON_SECRET

The endpoint decides what is actually due, so it is safe to call more often than
any interval; a sweep with nothing due returns in about 10 ms. With
`CRON_SECRET` unset it refuses to run rather than running unauthenticated,
because an open version of this URL lets anyone spend the deployment's Google
requests. Vercel sends that header to its own cron invocations automatically once
the variable exists.

Two schedulers call it, deliberately:

- **`.github/workflows/price-check.yml`, every 15 minutes.** This is the real
  clock — it is what makes a 15-minute or hourly interval mean anything. Free on
  a public repository. Needs, under the repo's Settings → Secrets and variables →
  Actions: the secret `CRON_SECRET`, and optionally the variable `APP_URL` (it
  falls back to the production URL). GitHub's scheduler runs late by a few
  minutes and disables scheduled workflows after 60 days with no repo activity.
- **`web/vercel.json`, once a day at 05:00 UTC.** A safety net, not the
  schedule. Vercel's Hobby plan permits a cron *once per day and no more*, so a
  more frequent expression here is rejected at deploy time. On Pro this can be
  tightened and the Actions workflow dropped.

A sweep stops starting new vacations after 45 s, under the 60 s Hobby function
ceiling, and names in `deferred` whatever it did not reach — those lead the next
sweep, because due vacations are checked least-recently-first.
