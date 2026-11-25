# NSW Rent & Yield Heatmap (MVP slice)

A static, key-free MapLibre map of NSW postcodes showing **median weekly rent by dwelling type and bedrooms,
gross yield, median sale price, 12-month rent change and Census household income**, with suburb/postcode search,
a detail panel and a cash-flow calculator. Built only from free, commercially reusable data
(see [DATA_SOURCES.md](DATA_SOURCES.md)).

## Run it

```bash
cd /workspace/heatmap-app
make            # creates .venv, downloads raw data (skips files already present), builds web/data/
make check      # prints sanity stats for 2042, 2127, 2155 (or: .venv/bin/python etl/check.py 2000 2150)
make serve      # http://localhost:8765  (range-capable server, needed for PMTiles)
make screenshots  # headless Chromium smoke test -> screenshots-docs/
make refresh    # force re-download of the newest DCJ quarter and rebuild
```

Needs Python 3.11+, `tippecanoe` (apt `tippecanoe`; if missing, the build falls back to simplified GeoJSON) and `make`.

## Layout

```
etl/download.py    scrape DCJ page for latest rent/sales xlsx + fetch ABS files -> data-raw/ (+ manifest.json)
etl/build.py       parse, compute metrics (DuckDB join for yields), suburb overlay, tippecanoe -> web/data/
etl/check.py       print stats for watch-list postcodes
etl/screenshot.py  Playwright smoke test + screenshots
web/               static site (index.html, app.js, style.css); web/data/ is generated
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
