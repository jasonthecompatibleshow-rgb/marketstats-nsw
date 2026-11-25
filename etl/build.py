"""Build per-postcode metrics + map tiles from data-raw/ into web/data/.
Idempotent: always rebuilds outputs from the raw files.

Outputs
  web/data/stats.json        per-postcode metrics, suburb names, centroid/bbox
  web/data/meta.json         periods, sources, metric definitions
  web/data/postcodes.pmtiles vector tiles (geometry + postcode only)
  data-out/postcodes.geojson full-attribute GeoJSON (debug / fallback)
  data-out/postcode_metrics.csv flat table for checking numbers
"""
import json, re, shutil, subprocess, zipfile, pathlib, datetime
import pandas as pd, geopandas as gpd, duckdb, openpyxl

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW, OUT, WEB = ROOT / "data-raw", ROOT / "data-out", ROOT / "web" / "data"
OUT.mkdir(exist_ok=True); WEB.mkdir(parents=True, exist_ok=True)
manifest = json.loads((RAW / "manifest.json").read_text())

DWELL = {"Total": "A", "Flat/Unit": "U", "House": "H", "Townhouse": "T"}
BEDS = {"Total": "t", "1 Bedroom": "1", "2 Bedrooms": "2", "3 Bedrooms": "3", "4 or more Bedrooms": "4"}
SALE = {"Total": "A", "Strata": "S", "Non Strata": "N"}
# which sales series a rent series is compared with for gross yield
YIELD_PRICE = {"A": "A", "U": "S", "T": "S", "H": "N"}


def num(v):
    """DCJ cells are strings: '1,234', '4.83%', 's' (11-30 obs) or '-' (suppressed)."""
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    s = str(v).strip().replace(",", "").replace("$", "")
    if s in ("-", "s", ""): return None
    if s.endswith("%"): return float(s[:-1])
    try: return float(s)
    except ValueError: return None


def sheet_rows(path, sheet, header_first):
    rows = list(openpyxl.load_workbook(path, read_only=True)[sheet].iter_rows(values_only=True))
    period = next((r[0] for r in rows[:6] if r[0] and "Reporting period" in str(r[0])), "")
    h = next(i for i, r in enumerate(rows) if r[0] == header_first)
    return period.replace("Reporting period:", "").strip(), [r for r in rows[h + 1:] if r[0] is not None]


def load_rent():
    period, rows = sheet_rows(RAW / manifest["rent"]["file"], "Postcode", "Postcode")
    recs = []
    for r in rows:
        if r[1] not in DWELL or r[2] not in BEDS: continue
        recs.append(dict(poa=str(int(r[0])), d=DWELL[r[1]], b=BEDS[r[2]], rent=num(r[4]), q1=num(r[3]), q3=num(r[5]),
                         bonds=num(r[6]), low=str(r[6]).strip() == "s", held=num(r[7]), rent_ach=num(r[9])))
    return period, pd.DataFrame(recs)


def load_sales():
    period, rows = sheet_rows(RAW / manifest["sales"]["file"], "Postcode", "Postcode")
    recs = []
    for r in rows:
        if r[1] not in SALE: continue
        med = num(r[3])
        recs.append(dict(poa=str(int(r[0])), s=SALE[r[1]], price=med * 1000 if med else None, sales=num(r[6]),
                         low=str(r[6]).strip() == "s", price_ach=num(r[8])))
    return period, pd.DataFrame(recs)


def load_census():
    z = zipfile.ZipFile(RAW / "census_gcp_poa_nsw.zip")
    def csv(t):
        n = next(n for n in z.namelist() if n.endswith(f"_{t}_NSW_POA.csv"))
        return pd.read_csv(z.open(n))
    g1 = csv("G01")[["POA_CODE_2021", "Tot_P_P"]]
    g2 = csv("G02")
    c = g1.merge(g2, on="POA_CODE_2021")
    c["poa"] = c.POA_CODE_2021.str.replace("POA", "")
    return c.rename(columns={"Tot_P_P": "c_pop", "Median_age_persons": "c_age", "Median_rent_weekly": "c_rent",
                             "Median_tot_hhd_inc_weekly": "c_hhinc", "Median_mortgage_repay_monthly": "c_mortg",
                             "Average_household_size": "c_hhsize"})[["poa", "c_pop", "c_age", "c_rent", "c_hhinc", "c_mortg", "c_hhsize"]]


def main():
    rent_period, rent = load_rent()
    sales_period, sales = load_sales()
    census = load_census()
    print(f"rent rows {len(rent)} ({rent_period}); sales rows {len(sales)} ({sales_period}); census POAs {len(census)}")

    # gross yield via DuckDB: rent series joined to its comparable sales series
    con = duckdb.connect()
    con.register("rent", rent); con.register("sales", sales)
    con.register("ymap", pd.DataFrame([{"d": k, "s": v} for k, v in YIELD_PRICE.items()]))
    y = con.sql("""
        SELECT r.poa, r.d, r.b, r.rent, s.price,
               round(100 * r.rent * 52 / s.price, 2) AS gross_yield,
               (r.low OR s.low) AS low
        FROM rent r JOIN ymap m USING (d) JOIN sales s ON s.poa = r.poa AND s.s = m.s
        WHERE r.rent IS NOT NULL AND s.price IS NOT NULL""").df()

    # flatten into one record per postcode
    stats = {}
    def put(poa, k, v):
        if v is None or (isinstance(v, float) and pd.isna(v)): return
        stats.setdefault(poa, {})[k] = round(float(v), 2) if isinstance(v, float) else v
    for r in rent.itertuples():
        k = f"{r.d}{r.b}"
        put(r.poa, f"r_{k}", r.rent); put(r.poa, f"rg_{k}", r.rent_ach); put(r.poa, f"rn_{k}", r.bonds)
        if r.low and r.rent is not None: put(r.poa, f"rl_{k}", 1)
        if r.d == "A" and r.b == "t": put(r.poa, "held", r.held)
    for s in sales.itertuples():
        put(s.poa, f"p_{s.s}", s.price); put(s.poa, f"pg_{s.s}", s.price_ach); put(s.poa, f"pn_{s.s}", s.sales)
        if s.low and s.price is not None: put(s.poa, f"pl_{s.s}", 1)
    for r in y.itertuples():
        put(r.poa, f"y_{r.d}{r.b}", r.gross_yield)
        if r.low: put(r.poa, f"yl_{r.d}{r.b}", 1)
    for c in census.to_dict("records"):
        if c["poa"] in stats:
            for k, v in c.items():
                if k != "poa" and pd.notna(v): put(c["poa"], k, float(v))

    # boundaries: NSW postcodes = those in DCJ data or NSW census pack
    nsw = set(stats) | set(census.poa)
    poa = gpd.read_file(RAW / "poa" / "POA_2021_AUST_GDA2020.shp", columns=["POA_CODE21", "AREASQKM21"])
    poa = poa[poa.POA_CODE21.isin(nsw) & poa.geometry.notna()].rename(columns={"POA_CODE21": "poa"})
    poa = poa.to_crs(4326)

    # suburb names per postcode from ABS SAL overlay (>=10% of the suburb's area)
    sal = gpd.read_file(RAW / "sal" / "SAL_2021_AUST_GDA2020.shp", columns=["SAL_NAME21", "STE_CODE21"])
    sal = sal[(sal.STE_CODE21 == "1") & sal.geometry.notna()].to_crs(3577)
    sal["sal_area"] = sal.area
    ov = gpd.overlay(sal, poa.to_crs(3577)[["poa", "geometry"]], how="intersection", keep_geom_type=True)
    ov["ix_area"] = ov.area
    ov["share"] = ov.ix_area / ov.sal_area
    # biggest overlap first, so the panel title is the main suburb
    ov = ov[ov.share >= 0.10].sort_values(["poa", "ix_area"], ascending=[True, False])
    ov["name"] = ov.SAL_NAME21.str.replace(r" \(NSW\)$", "", regex=True).str.replace(" - NSW)", ")", regex=False)
    names = ov.groupby("poa")["name"].apply(list).to_dict()

    cen = poa.to_crs(3577).representative_point().to_crs(4326)
    index = {}
    for (_, row), pt in zip(poa.iterrows(), cen):
        p = row.poa
        b = row.geometry.bounds
        index[p] = {"poa": p, "names": names.get(p, []), "c": [round(pt.x, 5), round(pt.y, 5)],
                    "bbox": [round(x, 5) for x in b], "area": round(row.AREASQKM21, 2), **stats.get(p, {})}
    (WEB / "stats.json").write_text(json.dumps(index, separators=(",", ":")))

    meta = {"built_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "rent_period": rent_period, "sales_period": sales_period,
            "rent_source": manifest["rent"]["url"], "sales_source": manifest["sales"]["url"],
            "census": "ABS 2021 Census GCP (POA)", "postcodes": len(index)}
    (WEB / "meta.json").write_text(json.dumps(meta, indent=1))

    # full GeoJSON + flat CSV for checking
    full = poa.merge(pd.DataFrame(index.values()).drop(columns=["c", "bbox", "area"]), on="poa", how="left")
    full["names"] = full.names.apply(lambda v: ", ".join(v) if isinstance(v, list) else "")
    full.drop(columns="geometry").to_csv(OUT / "postcode_metrics.csv", index=False)
    gj = OUT / "postcodes.geojson"
    gj.unlink(missing_ok=True)
    full.to_file(gj, driver="GeoJSON")

    # tiles: geometry + postcode only; values are applied client-side via feature-state
    tiles_src = OUT / "postcodes_geom.geojson"
    tiles_src.unlink(missing_ok=True)
    poa[["poa", "geometry"]].to_file(tiles_src, driver="GeoJSON")
    pm = WEB / "postcodes.pmtiles"
    if shutil.which("tippecanoe"):
        subprocess.run(["tippecanoe", "-o", str(pm), "--force", "-l", "postcodes", "-Z4", "-z12",
                        "--detect-shared-borders", "--coalesce-smallest-as-needed", "--simplification=6",
                        "--no-tile-size-limit", "-q", str(tiles_src)], check=True)
        meta["tiles"] = "pmtiles"
    else:  # fallback: simplified GeoJSON served directly
        s = poa[["poa", "geometry"]].copy(); s["geometry"] = s.simplify(0.0008, preserve_topology=True)
        s.to_file(WEB / "postcodes.geojson", driver="GeoJSON")
        meta["tiles"] = "geojson"
    (WEB / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"wrote {len(index)} postcodes, tiles={meta['tiles']}")


if __name__ == "__main__":
    main()
