# Data sources

All sources below are free and licensed for commercial reuse with attribution (CC BY 4.0 or ODbL).
Downloaded / verified **25 Nov 2026** (AEDT). History, RBA and APRA added 25 Nov 2026. Exact URLs used for each build are written to
`data-raw/manifest.json` by `etl/download.py`.

| Dataset | Used for | Source URL | Licence | Period / version |
|---|---|---|---|---|
| NSW DCJ Rent and Sales Report – **Rent tables** (Table 2, by postcode) | Median / quartile weekly rent for **new bonds** by dwelling type (Flat/Unit, House, Townhouse, Total) × bedrooms (1, 2, 3, 4+, Total); new bonds lodged; total bonds held; quarterly & annual change | Landing page: https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html  File: https://dcj.nsw.gov.au/content/dam/dcj/dcj-website/documents/about-us/families-and-communities-statistics/housing-and-rent-sales/rent-tables-june-2026-quarter.xlsx | CC BY 4.0. Attribution: "© State of New South Wales (Department of Communities and Justice)" + link to https://dcj.nsw.gov.au/statements/copyright-and-disclaimer.html | April–June 2026 quarter (page last updated 18 Aug 2026) |
| NSW DCJ Rent and Sales Report – **Sales tables** (Table 4, by postcode) | Median / quartile sale price, number of sales, annual change, for Total / Strata / Non-strata | https://dcj.nsw.gov.au/content/dam/dcj/dcj-website/documents/about-us/families-and-communities-statistics/housing-and-rent-sales/sales-tables-march-2026-quarter.xlsx | CC BY 4.0 (as above) | January–March 2026 quarter (contract dates) |
| ABS ASGS Edition 3 – Postal Areas (POA) 2021, GDA2020 shapefile | Postcode polygons for the map | https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/POA_2021_AUST_GDA2020_SHP.zip | CC BY 4.0 (© Commonwealth of Australia, ABS) | ASGS Ed. 3, 2021 |
| ABS ASGS Edition 3 – Suburbs and Localities (SAL) 2021 | Suburb names per postcode (search + panel titles), by area overlay | https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/SAL_2021_AUST_GDA2020_SHP.zip | CC BY 4.0 | ASGS Ed. 3, 2021 |
| ABS 2021 Census General Community Profile DataPack – NSW Postal Areas (G01, G02) | Population, median age, household income, Census rent/mortgage, household size | https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_POA_for_NSW_short-header.zip | CC BY 4.0 | Census night Aug 2021 |
| NSW DCJ Rent and Sales Report – **previous issues** (Issue 121, Sep 2017 rents / Jun 2017 sales, through the quarter before latest) | Quarterly history: 36 rent quarters (Sep 2017–Jun 2026) and 36 sales quarters (Jun 2017–Mar 2026) | https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/previous-rent-and-sales-reports.html (70 xlsx files) | CC BY 4.0 (as above) | Sep 2017 is DCJ's method break; earlier rents are excluded |
| RBA Statistical Table F6 – Housing Lending Rates, series **FLRHIFVA** | Default interest rate: average rate on new investor variable-rate housing loans funded in the month, all institutions (6.4% for Sep 2026). FLRHIFP (new investor P&I, 6.3%) is also stored | https://www.rba.gov.au/statistics/tables/csv/f6-data.csv | RBA copyright, free reuse with attribution (CC BY 4.0 per rba.gov.au copyright page) | Monthly; latest observation 30 Sep 2026, re-fetched every build |
| APRA Quarterly ADI Property Exposures – June 2026 highlights | Citation for the 80% LVR typical-investor assumption (29.7% of new loans funded at LVR ≥ 80%) | https://www.apra.gov.au/quarterly-authorised-deposit-taking-institution-property-exposure-statistics-june-2026-highlights | Cited only (no data ingested) | Published 17 Sep 2026 |
| Revenue NSW – land tax thresholds and rates | Land tax helper in calculator ($1,075,000 threshold; $100 + 1.6% above) | https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/thresholds-and-rates | Cited only | 2026 land tax year |
| ABS 2021 Census GCP – NSW Suburbs and Localities (G01) | Population used to order suburb names within a postcode (main suburb first) | https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SAL_for_NSW_short-header.zip | CC BY 4.0 | Census 2021 |
| OpenFreeMap "Positron" / "Dark" basemaps (OpenMapTiles schema, OpenStreetMap data) | Background map, no API key | https://tiles.openfreemap.org/styles/positron | Free service; map data © OpenStreetMap contributors (ODbL), © OpenMapTiles | live |

## Notes / caveats

* **Bond data by bedroom count**: the DCJ rent tables *are* the bond-lodgement data (derived from NSW Fair Trading
  rental bond lodgements), already split by bedrooms, so no separate bond dataset is needed for v1.
* **Suppression**: DCJ shows `-` when 10 or fewer bonds/sales (we store nothing) and `s` when 11–30 (we keep the
  median but flag it as small-sample; the map fades these areas and the panel marks them with `*`).
* **Sales lag**: sales are reported ~3 months after the quarter and are revised upward as late notices arrive.
  The latest sales quarter (Jan–Mar 2026) is one quarter behind the latest rent quarter (Apr–Jun 2026).
* **Sales source**: DCJ derives sales from Notices of Sale lodged with NSW Land Registry / Valuer General. We use
  only DCJ's published aggregates (CC BY 4.0), not the Valuer General's property sales information (PSI) bulk
  files, which have separate commercial terms.
* **Postcode ≠ suburb**: DCJ postcodes are mapped to ABS 2021 Postal Areas. Suburb names come from an area overlay
  (a suburb is listed for a postcode when ≥10% of its area falls inside it).
* Not used (licensing): school/NAPLAN data (ACARA consent needed), Domain/REA listings, VG sale-level data.
* **History caveats**: each historical quarter uses the figures as first published (sales ~3 months after quarter end,
  later revisions not captured). Older files store % changes as fractions; we only use their medians/counts. Isolated
  spikes (>2.5× or <0.4× the median of the surrounding ±4 quarters) are removed from series (10 rent / 20 price points of
  ~173k), e.g. 2042 strata Jun 2019 published median $6.2m.
* **Gearing assumptions** (strata, council+water, insurance, maintenance, vacancy, management) are stated assumptions,
  not data; see `etl/assumptions.json`.
