# Cash-Flow Forecaster

Household cash-flow forecasting web app. Columns are weeks (dated to the Monday);
rows are inflows, outflows, a manual *Adjustment* row, and the cash balance at the
start/end of each week. Aggregable by week / month / quarter / year.

**Live app:** https://cash-flow-app-eight.vercel.app

## Features

- **Dashboard** — date range, summary KPIs (Final EoP, Running Savings, low-balance Alerts) and time charts.
- **Cash-flow view and full data input** — the full expandable table, with a collapsible
  *Settings* panel (grouping, horizon, items, alerts, reset) applied to the table below.
- **Weekly data input** — a fast, mobile-friendly screen to enter one week at a time.
- Recurring or one-off inflows/outflows via a clear add/edit dialog.
- Multi-user with email/password login; each user's data is **private** (Supabase Row Level Security).
- Responsive, usable from a mobile browser.

## Stack

- **Frontend:** vanilla HTML/CSS/JS, no build step.
- **Auth + DB:** [Supabase](https://supabase.com) (Postgres + RLS). One `cashflows` row per user (`model`/`prefs` as JSONB).
- **Hosting:** Vercel (static), auto-deploy on push to `main`.

## Project layout

```
index.html          markup (auth gate, views, table, modal)
css/styles.css       styles
js/config.js         Supabase URL + publishable key (public by design)
js/supabaseClient.js shared Supabase client
js/storage.js        persistence layer — async load()/save() over Supabase
js/auth.js           login / registration / logout + view gate
js/app.js            model, recurrence, totals, grouping, rendering
supabase/schema.sql  cashflows table + RLS policies
```

## Local development

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

See [DEPLOY.md](DEPLOY.md) for deployment and custom-domain instructions, and
[CLAUDE.md](CLAUDE.md) for the data model and engineering notes.
