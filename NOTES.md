# Working notes

* 2026-11-25: first slice built. DCJ latest = rent Jun-2026 qtr, sales Mar-2026 qtr. 612 NSW POAs; 432 have
  an all-dwelling rent, 414 an all-dwelling price, 398 a yield.
* DCJ xlsx layout: sheet `Postcode`, header row begins with "Postcode"; values are strings ('1,234', '4.83%',
  's', '-'). Sales prices are in $'000s.
* Next data candidates (free, CC BY): BOCSAR crime by LGA/suburb, NSW Planning flood/bushfire-prone land and
  zoning layers (ePlanning spatial services), DCJ LGA tables for LGA view, DCJ previous quarters for trend lines.
* 2026-11-25 (v2): landing / map / insights redesign; 70 historical DCJ files ingested (rents Sep 2017–Jun 2026,
  sales Jun 2017–Mar 2026); RBA F6 rate 6.4% (Sep 2026). At these assumptions 0 of 98 well-sampled postcodes (all
  dwellings, 100+ bonds/sales) are positively geared; best is Broken Hill 2880 at about −$113/wk.
* Suburb names in a postcode are ordered by Census 2021 population within the overlap (area ordering put Thredbo
  ahead of Jindabyne).
