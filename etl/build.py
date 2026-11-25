"""Build per-postcode metrics, time series, insights and map tiles from data-raw/ into web/data/.
Idempotent: always rebuilds outputs from the raw files.

Outputs (web/data/)
  stats.json          latest-quarter metrics per postcode + names/centroid/bbox (+ Census)
  ts/<poa>.json       per-postcode quarterly series (rent by dwelling x beds, bonds, prices, sales, yields)
  tsk/<key>.json      per-metric series for every postcode (map time slider)
  insights.json       compact rows for top-movers / yields tables
  config.json         gearing assumptions incl. latest RBA investor variable rate
  meta.json           periods, sources
  postcodes.pmtiles   vector tiles (geometry + postcode only)
"""
import csv, json, glob, os, shutil, subprocess, sys, zipfile, pathlib, datetime
import pandas as pd, geopandas as gpd, duckdb

sys.path.insert(0, os.path.dirname(__file__))
import dcj_parse as P

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW, OUT, WEB = ROOT / "data-raw", ROOT / "data-out", ROOT / "web" / "data"
OUT.mkdir(exist_ok=True)
if WEB.exists(): shutil.rmtree(WEB)
(WEB / "ts").mkdir(parents=True); (WEB / "tsk").mkdir()
manifest = json.loads((RAW / "manifest.json").read_text())

YIELD_PRICE = {"A": "A", "U": "S", "T": "S", "H": "N"}   # rent dwelling -> comparable sales series
DS, BS, SS = ["A", "U", "H", "T"], ["t", "1", "2", "3", "4"], ["A", "S", "N"]
KEYS = [d + b for d in DS for b in BS]
FIRST_RENT_Q = "2017Q3"   # DCJ changed method from Sep 2017; earlier rent series not comparable
QLABEL = lambda q: {"1": "Mar", "2": "Jun", "3": "Sep", "4": "Dec"}[q[-1]] + " " + q[:4]


def qshift(q, n):
    y, k = int(q[:4]), int(q[-1]) - 1 + n
    return f"{y + k // 4}Q{k % 4 + 1}"


def load_history():
    files = {}
    for f in sorted(glob.glob(str(RAW / "hist" / "*.xlsx"))) + sorted(glob.glob(str(RAW / "*.xlsx"))):
        kind, q = P.file_quarter(os.path.basename(f))
        if kind and q: files[(kind, q)] = f          # later (root = latest) wins
    rent, sales = [], []
    for (kind, q), f in sorted(files.items()):
        if kind == "rent" and q >= FIRST_RENT_Q:
            rent += [dict(r, q=q) for r in P.parse_rent(f)]
        elif kind == "sales" and q >= qshift(FIRST_RENT_Q, -1):
            sales += [dict(r, q=q) for r in P.parse_sales(f)]
    return pd.DataFrame(rent), pd.DataFrame(sales)


def load_census():
    z = zipfile.ZipFile(RAW / "census_gcp_poa_nsw.zip")
    csvf = lambda t: pd.read_csv(z.open(next(n for n in z.namelist() if n.endswith(f"_{t}_NSW_POA.csv"))))
    c = csvf("G01")[["POA_CODE_2021", "Tot_P_P"]].merge(csvf("G02"), on="POA_CODE_2021")
    c["poa"] = c.POA_CODE_2021.str.replace("POA", "")
    return c.rename(columns={"Tot_P_P": "c_pop", "Median_age_persons": "c_age", "Median_rent_weekly": "c_rent",
                             "Median_tot_hhd_inc_weekly": "c_hhinc", "Median_mortgage_repay_monthly": "c_mortg",
                             "Average_household_size": "c_hhsize"})[["poa", "c_pop", "c_age", "c_rent", "c_hhinc", "c_mortg", "c_hhsize"]]


def rba_rate(series="FLRHIFVA"):
    """Latest value of an RBA F6 series. FLRHIFVA = new investor variable-rate loans funded in the month, all institutions."""
    rows = list(csv.reader(open(RAW / "f6-data.csv", encoding="utf-8-sig")))
    ids = next(r for r in rows if r and r[0] == "Series ID")
    i = ids.index(series)
    title = rows[1][i]
    data = [(r[0], r[i]) for r in rows if r and r[0][:2].isdigit() and len(r) > i and r[i].strip()]
    d, v = data[-1]
    return dict(series=series, title=title, date=datetime.datetime.strptime(d, "%d/%m/%Y").date().isoformat(), value=float(v),
                url="https://www.rba.gov.au/statistics/tables/#interest-rates")


def clean(v, nd=2):
    if v is None or (isinstance(v, float) and pd.isna(v)): return None
    return round(float(v), nd)


def main():
    rent, sales = load_history()
    census = load_census()
    rq, sq = sorted(rent.q.unique()), sorted(sales.q.unique())
    R_LAST, S_LAST = rq[-1], sq[-1]
    QS = sorted(set(rq) | set(sq))
    print(f"rent {len(rent)} rows {rq[0]}..{R_LAST} ({len(rq)} qtrs); sales {len(sales)} rows {sq[0]}..{S_LAST} ({len(sq)} qtrs)")

    rent["k"] = rent.d + rent.b
    # wide lookups
    rv = rent.pivot_table(index=["poa", "k"], columns="q", values="rent", aggfunc="first")
    rn = rent.assign(n=rent.bonds.where(~rent.low, -1)).pivot_table(index=["poa", "k"], columns="q", values="n", aggfunc="first")  # -1 = 11-30
    pv = sales.pivot_table(index=["poa", "s"], columns="q", values="price", aggfunc="first")
    pn = sales.assign(n=sales.sales.where(~sales.low, -1)).pivot_table(index=["poa", "s"], columns="q", values="n", aggfunc="first")
    for t in (rv, rn, pv, pn):
        for q in QS:
            if q not in t.columns: t[q] = None
    rv, rn, pv, pn = [t[QS].astype(float) for t in (rv, rn, pv, pn)]
    # Historical series only: drop isolated spikes (e.g. 2042 strata, Jun 2019: published median $6.2m, an
    # en-bloc/off-the-plan artefact). A point is dropped when it is >2.5x or <0.4x the median of the
    # surrounding +-4 quarters. Latest-quarter headline stats still use the published values.
    def despike(t):
        roll = t.T.rolling(9, center=True, min_periods=3).median().T
        bad = (t > 2.5 * roll) | (t < 0.4 * roll)
        return t.mask(bad), int(bad.values.sum())
    rv, nr = despike(rv); pv, np_ = despike(pv)
    print(f"despiked {nr} rent and {np_} price points out of {rv.notna().values.sum()} / {pv.notna().values.sum()}")
    get = lambda t, i, q: (None if i not in t.index else clean(t.at[i, q]))

    # ---- latest-quarter stats (as v1) ----
    cur = rent[rent.q == R_LAST]; scur = sales[sales.q == S_LAST]
    con = duckdb.connect()
    con.register("rent", cur); con.register("sales", scur)
    con.register("ymap", pd.DataFrame([{"d": k, "s": v} for k, v in YIELD_PRICE.items()]))
    y = con.sql("""SELECT r.poa, r.d, r.b, round(100 * r.rent * 52 / s.price, 2) AS gross_yield, (r.low OR s.low) AS low
                   FROM rent r JOIN ymap m USING (d) JOIN sales s ON s.poa = r.poa AND s.s = m.s
                   WHERE r.rent IS NOT NULL AND s.price IS NOT NULL""").df()
    stats = {}
    def put(poa, k, v):
        v = clean(v) if not isinstance(v, (int, str)) else v
        if v is not None: stats.setdefault(poa, {})[k] = v
    for r in cur.itertuples():
        put(r.poa, f"r_{r.k}", r.rent); put(r.poa, f"rg_{r.k}", r.rent_ach); put(r.poa, f"rn_{r.k}", r.bonds)
        if r.low and r.rent is not None: put(r.poa, f"rl_{r.k}", 1)
        if r.k == "At": put(r.poa, "held", r.held)
        r5 = get(rv, (r.poa, r.k), qshift(R_LAST, -20))
        if r.rent and r5: put(r.poa, f"r5_{r.k}", 100 * (r.rent / r5 - 1))
    for s in scur.itertuples():
        put(s.poa, f"p_{s.s}", s.price); put(s.poa, f"pg_{s.s}", s.price_ach); put(s.poa, f"pn_{s.s}", s.sales)
        if s.low and s.price is not None: put(s.poa, f"pl_{s.s}", 1)
    for r in y.itertuples():
        put(r.poa, f"y_{r.d}{r.b}", r.gross_yield)
        if r.low: put(r.poa, f"yl_{r.d}{r.b}", 1)
    for c in census.to_dict("records"):
        if c["poa"] in stats:
            for k, v in c.items():
                if k != "poa" and pd.notna(v): put(c["poa"], k, float(v))

    # ---- boundaries + suburb names ----
    nsw = set(stats) | set(census.poa)
    poa = gpd.read_file(RAW / "poa" / "POA_2021_AUST_GDA2020.shp", columns=["POA_CODE21", "AREASQKM21"])
    poa = poa[poa.POA_CODE21.isin(nsw) & poa.geometry.notna()].rename(columns={"POA_CODE21": "poa"}).to_crs(4326)
    sal = gpd.read_file(RAW / "sal" / "SAL_2021_AUST_GDA2020.shp", columns=["SAL_CODE21", "SAL_NAME21", "STE_CODE21"])
    sal = sal[(sal.STE_CODE21 == "1") & sal.geometry.notna()].to_crs(3577)
    zs = zipfile.ZipFile(RAW / "census_gcp_sal_nsw.zip")
    salpop = pd.read_csv(zs.open(next(n for n in zs.namelist() if n.endswith("G01_NSW_SAL.csv"))), usecols=["SAL_CODE_2021", "Tot_P_P"])
    salpop["SAL_CODE21"] = salpop.SAL_CODE_2021.str.replace("SAL", "")
    sal = sal.merge(salpop[["SAL_CODE21", "Tot_P_P"]], on="SAL_CODE21", how="left").fillna({"Tot_P_P": 0})
    sal["sal_area"] = sal.area
    ov = gpd.overlay(sal, poa.to_crs(3577)[["poa", "geometry"]], how="intersection", keep_geom_type=True)
    ov["ix_area"] = ov.area
    ov["share"] = ov.ix_area / ov.sal_area
    ov["pop_in"] = ov.Tot_P_P * ov.share      # approx. residents of the suburb inside this postcode
    # most residents first, so the panel title is the main suburb (area alone favours big rural localities)
    ov = ov[ov.share >= 0.10].sort_values(["poa", "pop_in", "ix_area"], ascending=[True, False, False])
    ov["name"] = ov.SAL_NAME21.str.replace(r" \(NSW\)$", "", regex=True).str.replace(" - NSW)", ")", regex=False)
    names = ov.groupby("poa")["name"].apply(list).to_dict()
    cen = poa.to_crs(3577).representative_point().to_crs(4326)
    index = {}
    for (_, row), pt in zip(poa.iterrows(), cen):
        p, b = row.poa, row.geometry.bounds
        index[p] = {"poa": p, "names": names.get(p, []), "c": [round(pt.x, 5), round(pt.y, 5)],
                    "bbox": [round(x, 5) for x in b], "area": round(row.AREASQKM21, 2), **stats.get(p, {})}
    (WEB / "stats.json").write_text(json.dumps(index, separators=(",", ":")))

    # ---- time series ----
    def yser(p, k):
        s = YIELD_PRICE[k[0]]
        out = []
        for q in QS:
            r, pr = get(rv, (p, k), q), get(pv, (p, s), q)
            out.append(round(100 * r * 52 / pr, 2) if r and pr else None)
        return out
    def nz(lst): return lst if any(v is not None for v in lst) else None
    tsk = {f"r_{k}": {} for k in KEYS} | {f"p_{s}": {} for s in SS} | {f"y_{k}": {} for k in KEYS}
    for p in index:
        ts = {"r": {}, "rn": {}, "p": {}, "pn": {}, "y": {}}
        for k in KEYS:
            if (p, k) in rv.index:
                a = nz([get(rv, (p, k), q) for q in QS])
                if a:
                    ts["r"][k] = a; ts["rn"][k] = [get(rn, (p, k), q) for q in QS]; tsk[f"r_{k}"][p] = a
            yy = nz(yser(p, k))
            if yy: ts["y"][k] = yy; tsk[f"y_{k}"][p] = yy
        for s in SS:
            if (p, s) in pv.index:
                a = nz([get(pv, (p, s), q) for q in QS])
                if a: ts["p"][s] = a; ts["pn"][s] = [get(pn, (p, s), q) for q in QS]; tsk[f"p_{s}"][p] = a
        (WEB / "ts" / f"{p}.json").write_text(json.dumps(ts, separators=(",", ":")))
    for k, v in tsk.items():
        (WEB / "tsk" / f"{k}.json").write_text(json.dumps(v, separators=(",", ":")))

    # ---- insights rows: one per postcode x key with a current rent ----
    q1, q5 = qshift(R_LAST, -4), qshift(R_LAST, -20)
    s1 = qshift(S_LAST, -4)
    rows = []
    for (p, k), _ in rv.iterrows():
        if p not in index: continue
        r0 = get(rv, (p, k), R_LAST)
        if r0 is None: continue
        s = YIELD_PRICE[k[0]]
        pr0, pr1 = get(pv, (p, s), S_LAST), get(pv, (p, s), s1)
        ra, rb = get(rv, (p, k), qshift(S_LAST, 0)), get(rv, (p, k), s1)     # same-quarter rents for yield change
        rows.append([p, k, r0, get(rn, (p, k), R_LAST), get(rv, (p, k), q1), get(rn, (p, k), q1),
                     get(rv, (p, k), q5), get(rn, (p, k), q5),
                     round(100 * r0 * 52 / pr0, 2) if pr0 else None, get(pn, (p, s), S_LAST),
                     round(100 * ra * 52 / pr0, 2) if ra and pr0 else None,
                     round(100 * rb * 52 / pr1, 2) if rb and pr1 else None, get(pn, (p, s), s1), pr0])
    cols = ["poa", "k", "r", "n", "r1", "n1", "r5", "n5", "y", "sn", "ys", "ys1", "sn1", "price"]
    (WEB / "insights.json").write_text(json.dumps({"cols": cols, "rows": rows}, separators=(",", ":")))

    # ---- gearing config (assumptions; rate from RBA F6) ----
    rate = rba_rate()
    rate_pi = rba_rate("FLRHIFP")
    cfg = json.loads((ROOT / "etl" / "assumptions.json").read_text())
    cfg["rate"] = rate | {"note": "RBA Table F6, average rate on new investor variable-rate housing loans funded in the month, all institutions"}
    cfg["rate_pi_new_investor"] = rate_pi
    (WEB / "config.json").write_text(json.dumps(cfg, indent=1))

    meta = {"built_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "rent_period": QLABEL(R_LAST) + " quarter", "sales_period": QLABEL(S_LAST) + " quarter",
            "rent_q": R_LAST, "sales_q": S_LAST, "quarters": QS, "qlabels": [QLABEL(q) for q in QS],
            "rent_first": rq[0], "sales_first": sq[0], "n_quarters_rent": len(rq), "n_quarters_sales": len(sq),
            "rent_source": manifest["rent"]["url"], "sales_source": manifest["sales"]["url"],
            "census": "ABS 2021 Census GCP (POA)", "postcodes": len(index)}

    full = poa.merge(pd.DataFrame(index.values()).drop(columns=["c", "bbox", "area"]), on="poa", how="left")
    full["names"] = full.names.apply(lambda v: ", ".join(v) if isinstance(v, list) else "")
    full.drop(columns="geometry").to_csv(OUT / "postcode_metrics.csv", index=False)
    tiles_src = OUT / "postcodes_geom.geojson"; tiles_src.unlink(missing_ok=True)
    poa[["poa", "geometry"]].to_file(tiles_src, driver="GeoJSON")
    if shutil.which("tippecanoe"):
        subprocess.run(["tippecanoe", "-o", str(WEB / "postcodes.pmtiles"), "--force", "-l", "postcodes", "-Z4", "-z12",
                        "--detect-shared-borders", "--coalesce-smallest-as-needed", "--simplification=6",
                        "--no-tile-size-limit", "-q", str(tiles_src)], check=True)
        meta["tiles"] = "pmtiles"
    else:
        s = poa[["poa", "geometry"]].copy(); s["geometry"] = s.simplify(0.0008, preserve_topology=True)
        s.to_file(WEB / "postcodes.geojson", driver="GeoJSON"); meta["tiles"] = "geojson"
    (WEB / "meta.json").write_text(json.dumps(meta, indent=1))
    print(f"wrote {len(index)} postcodes, {len(rows)} insight rows, rate {rate['value']}% ({rate['date']}), tiles={meta['tiles']}")


if __name__ == "__main__":
    main()
