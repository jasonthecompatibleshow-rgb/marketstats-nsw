# Data sources

All sources below are free and licensed for commercial reuse with attribution (CC BY 4.0 or ODbL), except Revenue NSW, which we only link to (see below).
Downloaded / verified **25 Nov 2026** (AEDT). History, RBA and APRA added 25 Nov 2026. AIHW, ABS SA2 and the APRA / Revenue NSW / OpenFreeMap licence checks added **26 Nov 2026** (AEDT). Exact URLs used for each build are written to
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
| APRA Quarterly ADI Property Exposures – June 2026 highlights | Citation for the 80% LVR typical-investor assumption (29.7% of new loans funded at LVR ≥ 80%) | https://www.apra.gov.au/quarterly-authorised-deposit-taking-institution-property-exposure-statistics-june-2026-highlights | CC BY 4.0 (https://www.apra.gov.au/copyright; attribution "© Australian Prudential Regulation Authority"; logos and third-party material excluded). Cited only (no data ingested) | Published 17 Sep 2026 |
| Revenue NSW – land tax thresholds and rates | Land tax helper in calculator ($1,075,000 threshold; $100 + 1.6% above) | https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/thresholds-and-rates | **Not CC licensed.** https://www.revenue.nsw.gov.au/terms allows reproduction without amendment only for personal, in-house or non-commercial use. We use only the threshold and rate figures (statutory facts) as calculator inputs and link to the page. No Revenue NSW text, tables or logos are reproduced | 2026 land tax year |
| ABS 2021 Census GCP – NSW Suburbs and Localities (G01) | Population used to order suburb names within a postcode (main suburb first) | https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SAL_for_NSW_short-header.zip | CC BY 4.0 | Census 2021 |
| OpenFreeMap "Positron" / "Dark" basemaps (OpenMapTiles schema, OpenStreetMap data) | Background map, no API key | https://tiles.openfreemap.org/styles/positron | OpenFreeMap: MIT, "Is commercial usage allowed? Yes" (https://openfreemap.org/); attribution required: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (added automatically by MapLibre). Map data © OpenStreetMap contributors (ODbL) | live |
| ABS ASGS Edition 3 – Statistical Areas Level 2 (SA2) 2021, GDA2020 | Overlay of SA2s onto postcodes for AIHW CRA.2b context | https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/SA2_2021_AUST_SHP_GDA2020.zip | CC BY 4.0 | ASGS Ed. 3, 2021 |
| **AIHW – Housing assistance in Australia 2026**, data tables: Financial assistance | CRA.9 (CRA income units by rental stress, NSW & Australia, 2016–2025) → rental stress share and recipient counts; CRA.2b (CRA income units by SA2 2021, June 2023–2025) → SA2 context per postcode | https://www.aihw.gov.au/getmedia/d9baced2-f3c5-4055-a1a0-37b16db824b4/AIHW-HOU-345-Data-tables-Financial-assistance.xlsx | CC BY 4.0 (see AIHW licence below) | Released 23 Jun 2026; annual, at last Friday in June |
| AIHW – Housing assistance in Australia 2026: Social housing households | SOCIALSHARE.1 (social housing households and all households, 2008–2025) → share calculated by us; HOUSEHOLDS.28 (public housing waitlist, 2014–2025) | https://www.aihw.gov.au/getmedia/0bee19af-29d5-4aab-b910-915346e0aac7/AIHW-HOU-345-Data-tables-Social-housing-households.xlsx | CC BY 4.0 | Reissued 30 Jun 2026; at 30 June |
| AIHW – Housing assistance in Australia 2026: Social housing dwellings | DWELLINGS.2 (social housing dwellings, all programs) | https://www.aihw.gov.au/getmedia/81fea47e-962b-4b02-8a06-4712bd97aa78/AIHW-HOU-345-Data-tables-Social-housing-dwellings.xlsx | CC BY 4.0 | Released 23 Jun 2026; at 30 June |

## AIHW: licence, attribution and exclusions (verified 26 Nov 2026, AEDT)

* **Report / data page**: https://www.aihw.gov.au/reports/housing-assistance/housing-assistance-in-australia-2026/data
  (the download list on that page is loaded by JavaScript from `POST https://www.aihw.gov.au/api/search/all-downloadable-resources`;
  `etl/download.py` pins the three getmedia URLs above, which need updating when the 2027 edition is published).
* **Licence**: https://www.aihw.gov.au/copyright (page last updated 11 Aug 2023): material on the AIHW website that
  can be copied or downloaded is released under **CC BY 4.0**, except the AIHW logo, the Commonwealth Coat of Arms,
  trademarks, material identified as third-party, and material carrying a different licence or notice (a more
  restrictive notice prevails). The three workbooks carry no separate licence or copyright notice (checked).
* **Attribution we use** (AIHW's required forms, without implying endorsement):
  * Modified / derived material (all of ours, since we select, reshape and calculate): "Based on Australian Institute of Health and Welfare material."
  * CRA tables (source line "AIHW analysis of Department of Social Services data (Australian Government Housing Data Set)"):
    "Based on Australian Institute of Health and Welfare material (AIHW analysis of Department of Social Services data)."
  * SOCIALSHARE.1 (AIHW NHADR + ABS household projections, both CC BY 4.0): "Based on Australian Institute of Health and Welfare; Australian Bureau of Statistics material."
  * Shown in: the site footer, the Data & method page (`data.html#sources`), under every AIHW card, and in the map panel's SA2 section.
* **Geography labelling**: state/national series are always labelled "NSW · state-level"; CRA.2b values are labelled
  "SA2-level, not postcode" and are listed per SA2 with the share of the postcode's area each SA2 covers. They are never
  split, summed or presented as postcode values.
* **Deliberately NOT used**:
  * **HOUSEHOLDS.26** (consolidated social housing waitlists): its source line is "State and territory supplied data",
    so it may fall under AIHW's third-party exclusion. Skipped conservatively, and HOUSEHOLDS.28 (AIHW NHADR) used instead.
  * **Housing Data Dashboard** (https://www.housingdata.gov.au/, CC BY 3.0 AU on its copyright page with the same
    exclusions): its home value and rent indices come from **Cotality (CoreLogic)**, which is third-party data whose
    terms prohibit commercial use and redistribution. Not ingested.
  * The *Social housing suitability* workbook and the report PDF: not needed for v1 (the PDF link returned HTML).
  * AIHW logo and Coat of Arms: not used anywhere.

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
