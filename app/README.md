# Pulsezen

Privacy-friendly website analytics as a service (in the style of Plausible and Umami), built with
**Next.js 16**, **React 19** and **Tailwind CSS 4**. Customers add their websites, paste a tiny
cookieless tracking script (`pz.js`, about 1.5 KB gzipped) and get a live dashboard: visitors,
visits, pageviews, bounce rate, visit duration, pages, sources and channels (including AI
assistants), UTM campaigns, countries/regions/cities, browsers, devices, goals, custom events and
revenue. Includes email reports, traffic alerts (email, signed webhook, Slack, Discord, Microsoft
Teams, Telegram), public/embeddable shared dashboards, a Stats REST API, paid plans with limits,
four payment gateways, a blog, multi-language/RTL and a full admin panel.

The complete guide is in [`documentation/index.html`](../documentation/index.html) (open it in a browser).

## Quick start (local)

```bash
npm install
npm run dev
```

Open http://localhost:3000. You are redirected to the web installer at `/install`.
Choose **SQLite** for a zero-setup local database (Node.js 22.13+), or **MySQL** for production.
`npm run dev` also builds the tracking script `public/pz.js` first.

To test tracking locally, add your site with the domain `localhost` (or switch on
"Count visits from localhost" in the site settings) and add `data-allow-localhost` to the snippet.

Background jobs run in "lazy mode" by default (after platform page views and tracked events, at
most once a minute). To run them without that activity, start the worker in a second terminal
with the secret from Admin → System → Scheduler:

```bash
CRON_SECRET=the-secret-from-admin npm run worker
```

## Production

```bash
npm install
npm run build        # builds public/pz.js (prebuild), then the Next.js app
npm start            # or: node server.js  (cPanel / Passenger / PM2)
```

Requirements: Node.js 20.9+ (22.13+ for the SQLite option), MySQL 5.7+/MariaDB 10.3+ (recommended)
or the built-in SQLite option, HTTPS (the script is loaded by your customers' HTTPS websites),
outbound HTTPS for alerts and SMTP for emails.

### Background jobs

Every "tick" runs these jobs within a time budget: `rollups` (daily summaries of finished days),
`retention` (deletes raw events older than the plan allows, old visitor salts, old alert log),
`traffic-alerts` (every 5 min), `reports` (weekly/monthly emails) and `usage` (80 % / 100 % quota
emails). Something must start ticks:

| Method | How | Notes |
| ------ | --- | ----- |
| Lazy mode | On by default (Admin → Settings → Analytics) | Only while people open the platform's pages or tracked events arrive. Fine for testing. |
| Cron URL | `curl -fsS "https://your-site/api/cron/tick?key=SECRET"` every 1–5 minutes | cPanel, shared hosting, Vercel (external cron service). |
| Worker | `CRON_SECRET=… npm run worker` (calls the cron URL every 15 s, logs the items per job) | VPS / Docker. |

The secret is `CRON_SECRET` (env) or a random value stored in the database and shown in
Admin → System → Scheduler, which also shows the last run and the items handled per job.
The cron URL also accepts `Authorization: Bearer SECRET` (as sent by Vercel Cron).

- **PM2:** `ecosystem.config.cjs` starts the app (`pulsezen`) and the worker (`pulsezen-worker`).
- **Docker:** `docker-compose.yml` runs `app`, `worker` and MySQL 8.4.

> **Required:** set `CRON_SECRET` (12+ random characters, e.g. `openssl rand -hex 24`) before
> `pm2 start` or `docker compose up`. docker-compose refuses to start without it. The app ignores
> values shorter than 12 characters and the example value `change-me-to-a-long-random-string`
> (it then uses the secret stored in the database, so the worker gets `401`).

Without ticks, raw events are never summarised or deleted (old visitor salts are still removed
when a new day's salt is created).

## Project structure

```
src/
  analytics/               The contract, dependency-free:
    types.ts               TrackPayload, metrics, dimensions, channels, periods, filters,
                           site settings, alert channel configs, AlertPayload
    normalize.ts           Validation of domains, site settings, filters, event names, channels
    format.ts              Retention / limit formatting
  tracker/                 Source of the tracking script (bundled to public/pz.js)
    index.ts               Pageviews, SPA navigation, outbound links, downloads, 404,
                           pulsezen() events API, class-based events
    README.md              Snippet, data-* options, events API, first-party proxy setups
  app/(site)/              Public website: home, pricing, blog, pages, account, auth, checkout
  app/(dashboard)/         Customer dashboard: websites, stats, details, goals, email reports,
                           traffic alerts, site settings, install guide, alert channels, API keys
  app/share/[token]/       Public shared dashboards (+ /embed, password unlock, CSV export)
  app/admin/               Admin panel (incl. Websites and the System → Scheduler card)
  app/install/             Web installer
  app/actions/             Server actions (auth, billing, dashboard/*)
  app/api/event/           Event collection endpoint used by pz.js (POST, CORS open)
  app/api/v1/              Stats API: /sites and /stats/{aggregate|timeseries|breakdown}
                           (breakdown also dimension=event_prop: custom event properties)
  app/api/cron/tick/       Cron URL: runs one scheduler tick (secret required)
  app/api/payments/        Payment gateway callbacks
  lib/ingest.ts            Validation, bot filtering, exclusions, quota, enrichment, visit
                           resolution and buffered (batched) writes
  lib/sources.ts           Referrer → source and channel rules (search, social, AI assistants …)
  lib/salts.ts             Daily-rotating salt and the anonymous visitor hash
  lib/geoip.ts             Location from Vercel/Cloudflare headers (not for proxied events) or
                           an optional .mmdb file
  lib/useragent.ts         Browser / OS / device (ua-parser-js v1, MIT — don't upgrade to v2, AGPL)
  lib/query.ts             Stats engine: metric definitions, filters, raw + rollup days,
                           event property breakdowns (getPropertyBreakdown)
  lib/rollups.ts           Daily summaries (rollup_daily)
  lib/jobs/                Background jobs: rollups, retention, traffic-alerts, reports, usage
  lib/scheduler.ts         Ticks: lock, job order, time budget, cron secret
  lib/lazy-tick.ts         Lazy mode (tick after a response when none ran for a minute)
  lib/alerts/              Alert channels (email, webhook, slack, discord, teams, telegram)
  lib/stats-api.ts         Stats API auth (lib/api-keys.ts) and rate limit
  lib/net/ssrf.ts          Private-address rules for webhook deliveries
  lib/i18n/messages.ts     Every interface string in English (source for translations)
  lib/db/migrations.ts     Database schema, indexes and default plans (run automatically)
scripts/build-widget.mjs   Bundles src/tracker into public/pz.js with esbuild (2 KB gzip budget)
scripts/worker.mjs         Worker: calls /api/cron/tick every WORKER_INTERVAL_SEC (15 s)
languages/                 Arabic (ar.json) and Hindi (hi.json) packs, 964 texts each: import in
                           Admin → Languages → Translate (installed automatically with DEMO_SEED)
storage/                   Created at runtime: config.json, SQLite database, uploads
```

`public/pz.js` is generated and not committed. It is rebuilt by `predev`, `prebuild` and
`npm run widget:build`.

## Scripts

| Command                | Description                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | Build `pz.js`, then start the development server              |
| `npm run build`        | Build `pz.js`, then the production app                        |
| `npm start`            | Start the production server                                   |
| `npm run start:server` | Start via `server.js` (hosting panels, PM2)                   |
| `npm run worker`       | Run a scheduler tick every 15 s (needs `CRON_SECRET`)         |
| `npm run widget:build` | Rebuild only `public/pz.js` (prints raw and gzip size)        |
| `npm run lint`         | ESLint                                                        |
| `npm run typecheck`    | TypeScript check                                              |

## Extending

- **Source rule** (e.g. a new AI assistant): add an entry to `RULES` in `src/lib/sources.ts`
  (name, channel, hostname regex, optional path regex and `utm_source` aliases). Order matters:
  the first match wins. Applies to new events only.
- **Alert channel:** `CHANNEL_TYPES`/`ChannelConfigByType` in `src/analytics/types.ts`,
  `normalizeChannelConfig`/`channelProblem` in `src/analytics/normalize.ts`, a sender in
  `src/lib/alerts/` using `describeAlert()` and `deliver()`, a case in `sendAlert()`, the form in
  `src/components/dashboard/channel-forms.tsx` and `dash.channels.*` messages.
- **Dimension:** see "Customisation" in the documentation (column + migration, ingest, `COLUMN`
  in `query.ts`, `VISIT_COLUMNS` in `rollups.ts`, a tab in `components/dashboard/stats-tabs.ts`).

Run `npm run typecheck && npm run build` and restart the app and the worker after changes.

## Environment variables

Optional; the web installer writes `storage/config.json`. See `.env.example` for database
variables, `ADMIN_*`, `SITE_URL`, `STORAGE_DIR`, `TRUSTED_PROXY_HOPS`, `CRON_SECRET`, `DEMO_MODE`,
`DEMO_SEED`, `EVENT_RATE_LIMIT_PER_MIN`, `EVENT_PROXY_RATE_LIMIT_PER_MIN`, `PULSEZEN_SERVERLESS`
and `ALLOW_PRIVATE_WEBHOOKS`. The worker also reads `WORKER_URL` and `WORKER_INTERVAL_SEC`.
