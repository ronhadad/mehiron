# Deploying to Vercel

## Vercel project settings

The repo is an npm workspace with two packages, and the Next app is one of them.

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Include files outside the root directory | **on** — the app imports `../server` |
| Framework Preset | Next.js |
| Install Command | `cd .. && npm install` |
| Build Command | *(leave default — `next build`)* |
| Output Directory | *(leave default)* |

`npm install` at the repo root is what generates the Prisma client: the root
`postinstall` runs `prisma generate --schema server/prisma/schema.prisma`. Without
it the build fails with `Can't resolve '@prisma/client'`, because the client is
generated rather than shipped.

`--prefix=..` also installs from the root but does not reliably run workspace
lifecycle scripts; `cd .. && npm install` does.

## Environment variables

| Name | Notes |
| --- | --- |
| `DATABASE_URL` | A hosted Postgres. The local Docker instance on port 5434 is not reachable from Vercel. |

After the database exists, create the tables:

```sh
DATABASE_URL='<the hosted url>' npx prisma migrate deploy --schema server/prisma/schema.prisma
```

Nothing else is required — there are no API keys anywhere in this app. Destination
photos come from Wikimedia, coordinates and Google entity ids from Wikidata, maps
from OpenStreetMap, and prices from Google over plain HTTP.

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

The app has no authentication. Deployed as-is, anyone with the URL can create
groups, delete them, and cause Google requests to be made. Fix that before sharing
the URL.
