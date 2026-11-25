# Yieldmap NSW (MVP)

A static, key-free site for NSW property analytics:

* `index.html` landing page: live stats, top-yield / rent-mover / cash-flow previews, audiences, method, waitlist placeholder
* `map.html` MapLibre map: rent, yield, cash flow, gearing, price, rent change (1y/5y), income; dwelling × bedroom
  filters; quarter time slider + play (rent/yield/price back to 2017); light/dark; mobile bottom sheet; panel with
  overview, uPlot trend charts and a full calculator (LVR/loan, rate, term, P&I/IO, rent, vacancy, all costs, land
  tax from land value, depreciation, after-tax estimate at a selectable marginal rate)
* `insights.html` top movers: rent rises/falls 1y and 5y, highest yields, yield rises/falls, best cash flow, with
  dwelling, bedroom and minimum-sample filters

The gearing engine lives in one place (`web/assets/common.js`, `HM.evaluate`) and is used by every page and by
`etl/report.js`. Typical-investor assumptions are in `etl/assumptions.json`; the interest rate is filled from RBA F6 at build. Built only from free, commercially reusable data
(see [DATA_SOURCES.md](DATA_SOURCES.md)).

## Run it

```bash
cd /workspace/heatmap-app
make            # creates .venv, downloads raw data (skips files already present), builds web/data/
make check      # prints sanity stats for 2042, 2127, 2155 (or: .venv/bin/python etl/check.py 2000 2150)
make report     # gearing for 2042/2127/2155 + top movers, via the site's JS engine (node)
make serve      # http://localhost:8765  (range-capable server, needed for PMTiles)
make screenshots  # headless Chromium, desktop + mobile, fails on any console error -> screenshots-docs/
make refresh    # force re-download of the newest DCJ quarter and rebuild
```

Needs Python 3.11+, `tippecanoe` (apt `tippecanoe`; if missing, the build falls back to simplified GeoJSON) and `make`.

## Layout

```
etl/download.py    scrape DCJ page for latest rent/sales xlsx + fetch ABS files -> data-raw/ (+ manifest.json)
etl/dcj_parse.py   header-driven parser for every DCJ issue since Sep 2017
etl/build.py       metrics, time series (ts/, tsk/), insights.json, config.json, suburb overlay, tippecanoe -> web/data/
etl/assumptions.json  typical-investor gearing assumptions
etl/report.js      gearing + movers report using web/assets/common.js
etl/check.py       print stats for watch-list postcodes
etl/screenshot.py  Playwright smoke test + screenshots
web/               static site (index.html, map.html, insights.html, assets/); web/data/ is generated
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
