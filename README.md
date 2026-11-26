# MarketStats (NSW)

**MarketStats** is a free, static, key-free property analytics site for every NSW postcode: rents by bedroom, prices,
gross yield, typical-investor gearing and cash flow, nine years of trends, top movers and NSW housing context from
the AIHW. It is built only from official public data licensed for commercial reuse, and it is aimed at investors
while staying useful for buyers and renters.

Pages (all share one nav and footer, plus a light/dark theme):

* `index.html` landing page: live stats, top-yield / rent-mover / cash-flow previews, audiences, method, waitlist placeholder
* `map.html` MapLibre map: rent, yield, cash flow, gearing, price, rent change (1y/5y), income; dwelling × bedroom
  filters; quarter time slider + play (rent/yield/price back to 2017); light/dark; mobile bottom sheet; panel with
  overview, uPlot trend charts and a full calculator (LVR/loan, rate, term, P&I/IO, rent, vacancy, all costs, land
  tax from land value, depreciation, after-tax estimate at a selectable marginal rate)
* `insights.html` top movers: rent rises/falls 1y and 5y, highest yields, yield rises/falls, best cash flow, with
  dwelling, bedroom and minimum-sample filters, plus NSW state-level AIHW housing context cards
* `about.html`, `disclaimer.html`, `data.html` (data sources, licences, attribution and methodology)

**Brand**: wordmark "Market**Stats**" with an indigo→teal gradient bar-chart mark (`web/favicon.svg`, inline SVG in
`HM.LOGO`), a small "NSW" scope badge, and Inter / Inter Display type. Colours are CSS variables in
`web/assets/site.css` (`:root` for light, `[data-theme="dark"]` for dark).

**Theme**: every page has a tiny inline `<head>` script (kept in sync by `etl/heads.py`) that sets `data-theme`
before first paint from `localStorage['ms-theme']`, falling back to `prefers-color-scheme`. The toggle in the nav
saves the choice. Until you pick one, the site follows OS changes. Maps swap between OpenFreeMap Positron and Dark.

The gearing engine lives in one place (`web/assets/common.js`, `HM.evaluate`) and is used by every page and by
`etl/report.js`. Typical-investor assumptions are in `etl/assumptions.json`; the interest rate is filled from RBA F6 at build. Built only from free, commercially reusable data
(see [DATA_SOURCES.md](DATA_SOURCES.md) and the site's `data.html`).

## Run it

```bash
cd /workspace/heatmap-app
make            # creates .venv, downloads raw data (skips files already present), builds web/data/
make check      # prints sanity stats for 2042, 2127, 2155 (or: .venv/bin/python etl/check.py 2000 2150)
make report     # gearing for 2042/2127/2155 + top movers, via the site's JS engine (node)
make serve      # http://localhost:8765  (range-capable server, needed for PMTiles)
make screenshots  # headless Chromium: every page, light + dark, desktop + mobile; fails on any console error or theme flash -> screenshots-docs/
make publish    # push built web/ to the gh-pages branch -> https://jasonthecompatibleshow-rgb.github.io/marketstats-nsw/
make refresh    # force re-download of the newest DCJ quarter, RBA and AIHW tables, and rebuild
```

Needs Python 3.11+, `tippecanoe` (apt `tippecanoe`; if missing, the build falls back to simplified GeoJSON) and `make`.

## Production hosting

- **Self-hosted libraries:** MapLibre GL 4.7.1, PMTiles 3.2.1, uPlot 1.6.31, supabase-js 2.119.2 and the Inter 4.1
  variable font live in `web/vendor/` (licences + SHA-256 in `web/vendor/LICENSES.txt`). No CDN is requested at
  runtime; only OpenFreeMap basemap tiles/styles are external. The test suite fails on any CDN request.
- **Cloudflare Pages:** `web/_headers` (security headers, immutable `/vendor/*`, 1-day Range/CORS for the PMTiles,
  5-minute revalidating HTML/JSON), `web/404.html`, `web/robots.txt`, `web/sitemap.xml`.
- **Site URL:** `etl/site.json`, set by `python scripts/set_site_url.py https://<domain>`; `etl/heads.py` writes
  canonical/og:url/og:image, the sitemap and robots.txt.
- **Deploy:** `.github/workflows/deploy.yml` (manual + quarterly): `make refresh`, `make check`, then
  `wrangler pages deploy web` when the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets exist.
- Full runbook: **LAUNCH.md**.

## Layout

```
etl/download.py    scrape DCJ page for latest rent/sales xlsx + fetch ABS files -> data-raw/ (+ manifest.json)
etl/dcj_parse.py   header-driven parser for every DCJ issue since Sep 2017
etl/aihw.py        AIHW Housing assistance tables -> NSW/national series + SA2 Rent Assistance per postcode (aihw.json)
etl/heads.py       shared <head> block (no-flash theme script, favicon, meta/OG) for every page
etl/build.py       metrics, time series (ts/, tsk/), insights.json, config.json, suburb overlay, tippecanoe -> web/data/
etl/assumptions.json  typical-investor gearing assumptions
etl/report.js      gearing + movers report using web/assets/common.js
etl/check.py       print stats for watch-list postcodes
etl/screenshot.py  Playwright smoke test + screenshots
web/               static site (index, map, insights, about, disclaimer, data .html + assets/); web/data/ is generated
serve.py           local static server with HTTP Range support
data-raw/, data-out/, web/data/   generated, git-ignored, rebuildable
```

## How the numbers are computed

* **Rent**: DCJ median weekly rent for *new bonds* lodged in the quarter, per postcode × dwelling × bedrooms.
* **Rent change**: DCJ's "annual change in median weekly rent" (same quarter last year).
* **Price**: DCJ median sale price for Total / Strata / Non-strata. Sales have no bedroom split.
* **Gross yield** = rent × 52 ÷ price, pairing *units and townhouses with strata sales*, *houses with non-strata
  sales*, and *all with all*. **Caveat:** the dwelling mixes differ (strata includes some townhouses/villas;
  non-strata houses include all sizes), bedroom-level yields divide a bedroom-specific rent by an all-bedroom price,
  and rent/sales quarters differ by one quarter. Treat yields as relative indicators, not property-level returns.
* **Cash flow** (panel): rent × 52 × (1 − vacancy) − management − interest (IO) or P&I repayment (30 yr) − strata −
  council/water − land tax − insurance/repairs, shown per week. Pre-tax; ignores stamp duty, depreciation and
  negative gearing.

Map tiles hold geometry + postcode only; values are applied client-side via MapLibre feature-state from
`stats.json` (~420 KB), so changing metric/filters needs no tile rebuild.

## Gearing model (typical investor)

Median price for the dwelling type (units/townhouses → strata, houses → non-strata), 80% LVR, RBA F6 new-investor
variable rate (FLRHIFVA), P&I 30 years, 2 weeks vacancy, 7% management incl. GST, 5% maintenance, flat strata /
council+water / insurance allowances per dwelling type, land tax $0 by default. Gearing = sign of the rental tax
result (rent received − costs − interest, ±$20/wk neutral band); cash flow also subtracts principal. Not advice.

The **Gearing** map colours postcodes by the weekly tax result in tiers (−$400, −$300, −$200, −$100, −$20, +$20,
+$100), so deep and mild negative gearing look different. The panel and tooltip show the **break-even rate**: the
interest rate at which the tax result would be $0 (`HM.breakEven`, bisection on `HM.evaluate`).

## AIHW housing context

`etl/aihw.py` reads the AIHW *Housing assistance in Australia 2026* data tables (CC BY 4.0) and writes
`web/data/aihw.json`:

* `state`: NSW and national annual series for CRA rental stress (CRA.9), CRA recipients (CRA.9), social housing
  share (SOCIALSHARE.1), public housing waitlist (HOUSEHOLDS.28) and social housing dwellings (DWELLINGS.2). These
  are shown as **NSW state-level** cards on the landing, insights and data pages.
* `sa2`: for each postcode, the ABS SA2 areas covering ≥5% of it, with CRA recipient counts for June 2023–2025
  (CRA.2b). These are shown in the map panel and labelled **SA2-level, not postcode**.

See DATA_SOURCES.md for exact URLs, licence, attribution and the items deliberately left out.

## Accounts (free sign-up gate)

`web/auth.js` exposes one interface, `window.MSAuth`, whatever the backend: `ready`, `getUser()`, `current()`,
`isMember()`, `signUp(email, name)`, `signIn(email)`, `signOut()`, `onAuthChange(cb)`, plus UI helpers
`open(tab, reason)` and `lock(html, opts)` (blurred preview + unlock card). Pages only read `MSAuth.isMember()`.

**Open without an account:** landing page, top-5 standouts, AIHW NSW state cards; the map's headline metrics (Rent,
Yield, Price, Cash flow, Gearing, Income) for All dwellings / All beds at the latest quarter, search and Overview
summary cards; top 5 rows of every Insights ranking; Pricing, About, Data & method, Disclaimer and Privacy.

**Free account unlocks:** dwelling and bedroom filters plus the bedroom rent table; rent-change maps; the 2017–2026
time slider and the Trends tab; the full Calculator; SA2-level AIHW data in the panel; Insights rows 6+ and all
filters. Locked controls show a lock and open the sign-up modal. The URL keeps what was asked for (e.g. `d=U&b=2`),
so signing in restores it immediately.

**Live mode** (default now): `web/config.js` holds the `marketstats-nsw` Supabase project URL and publishable key
(public by design; RLS protects data). `auth.js` loads the self-hosted supabase-js (`web/vendor/supabase-js@2.119.2/`)
and signs users in with passwordless magic links (`emailRedirectTo` = the current page). No demo UI is shown.
The waitlist (index, pricing) and contact (about) forms POST to `/rest/v1/waitlist` and `/rest/v1/contact_messages`
via `MSAuth.wireForm` (publishable key on the `apikey` header only). Schema: `supabase/schema.sql`.

**Demo mode:** set `DEMO_MODE: true` in `web/config.js` (or empty the Supabase values). Accounts then live in
`localStorage` (`ms-demo-users`, `ms-demo-session`), nothing leaves the browser, the modal offers a one-click demo
account (`demo@marketstats.local`), and the forms show an honest "nothing was sent" note. The headless suite runs the
gate UX tests in demo mode, the live UI against a mocked Supabase API, and a smoke test with the real config.

See **LAUNCH.md** for the Supabase redirect URLs and custom SMTP setup.

