"""AIHW housing indicators (Housing assistance in Australia 2026, released 23 Jun 2026 / households reissued 30 Jun 2026).

Licence: AIHW website material is CC BY 4.0 (https://www.aihw.gov.au/copyright); attribution for derived
material: "Based on Australian Institute of Health and Welfare material." Only tables whose stated source is an
AIHW collection or AIHW analysis are used. Tables sourced from "State and territory supplied data" (e.g.
HOUSEHOLDS.26 consolidated waitlist) and anything from housingdata.gov.au derived from Cotality/CoreLogic are
deliberately NOT used.

Outputs web/data/aihw.json:
  state  - NSW and Australia series (state/national level ONLY, never shown as postcode values)
  sa2    - {postcode: [[sa2_code, sa2_name, share_of_postcode_area, cra_2023, cra_2024, cra_2025], ...]}
"""
import json, pathlib
import openpyxl, geopandas as gpd

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data-raw"
A = RAW / "aihw"
FIN, DWE, HOU = (A / f"AIHW-HOU-345-Data-tables-{n}.xlsx" for n in ("Financial-assistance", "Social-housing-dwellings", "Social-housing-households"))
REPORT = "https://www.aihw.gov.au/reports/housing-assistance/housing-assistance-in-australia-2026/data"


def rows(path, sheet):
    rs = list(openpyxl.load_workbook(path, read_only=True)[sheet].iter_rows(values_only=True))
    hdr = next(i for i, r in enumerate(rs) if r and r[0] and str(r[0]).startswith(("Year", "State/territory")))
    return [str(x).strip() if x is not None else "" for x in rs[hdr]], rs[hdr + 1:]


def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None


def state_series():
    out = {}
    # CRA.9: CRA income units by rental stress level (rent - CRA > 30% of gross income), last Friday in June
    h, rs = rows(FIN, "CRA.9")
    iN, iT = h.index("NSW"), h.index("Total")
    yrs = {}
    for r in rs:
        if not isinstance(r[0], int) or r[1] != "Number": continue
        lvl = str(r[2])
        d = yrs.setdefault(r[0], {})
        if lvl.startswith("No rental stress"): d["no"] = (num(r[iN]), num(r[iT]))
        elif lvl.startswith("Rental stress (rent >"): d["yes"] = (num(r[iN]), num(r[iT]))
        elif lvl.startswith(">50 to 70"): d["50"] = (num(r[iN]), num(r[iT]))
        elif lvl.startswith(">70%"): d["70"] = (num(r[iN]), num(r[iT]))
    Y = sorted(y for y in yrs if {"no", "yes"} <= set(yrs[y]))
    def share(y, k, j): return round(100 * yrs[y][k][j] / (yrs[y]["no"][j] + yrs[y]["yes"][j]), 1)
    out["cra_stress"] = {"title": "CRA recipients in rental stress", "unit": "%", "years": Y,
        "nsw": [share(y, "yes", 0) for y in Y], "aus": [share(y, "yes", 1) for y in Y],
        "nsw_severe": [round(100 * (yrs[y]["50"][0] + yrs[y]["70"][0]) / (yrs[y]["no"][0] + yrs[y]["yes"][0]), 1) for y in Y],
        "def": "Share of Commonwealth Rent Assistance income units paying more than 30% of gross income on rent after CRA, at the last Friday in June. 'Severe' = more than 50%.",
        "table": "CRA.9", "source": "AIHW analysis of Department of Social Services data (Australian Government Housing Data Set)"}
    out["cra_recipients"] = {"title": "Income units receiving Rent Assistance", "unit": "count", "years": Y,
        "nsw": [yrs[y]["no"][0] + yrs[y]["yes"][0] for y in Y], "aus": [yrs[y]["no"][1] + yrs[y]["yes"][1] for y in Y],
        "def": "Income units receiving CRA with known income (excludes unknown income), last Friday in June. Counts rounded to nearest 5 by AIHW.",
        "table": "CRA.9", "source": out["cra_stress"]["source"]}
    # SOCIALSHARE.1: social housing households as % of all households
    h, rs = rows(HOU, "SOCIALSHARE.1")
    iN, iT = h.index("NSW"), h.index("Total")
    soc, allh = {}, {}
    for r in rs:
        if not isinstance(r[0], int): continue
        if str(r[1]).startswith("All social housing households"): soc[r[0]] = (num(r[iN]), num(r[iT]))
        elif str(r[1]).startswith("All households"): allh[r[0]] = (num(r[iN]), num(r[iT]))
    Ys = sorted(set(soc) & set(allh))
    if Ys:
        out["social_share"] = {"title": "Social housing share of households", "unit": "%", "years": Ys,
            "nsw": [round(100 * soc[y][0] / allh[y][0], 2) for y in Ys], "aus": [round(100 * soc[y][1] / allh[y][1], 2) for y in Ys],
            "nsw_n": [soc[y][0] for y in Ys],
            "def": "Households in social housing as a share of all households at 30 June (calculated by MarketStats from the two counts in the table).",
            "table": "SOCIALSHARE.1", "source": "AIHW National Housing Assistance Data Repository; ABS household and family projections"}
    # HOUSEHOLDS.28: public housing waitlist (AIHW NHADR). HOUSEHOLDS.26 (state-supplied) is intentionally not used.
    h, rs = rows(HOU, "HOUSEHOLDS.28")
    iN, iT = h.index("NSW"), h.index("Total")
    wl = sorted([(r[0], num(r[iN]), num(r[iT])) for r in rs if isinstance(r[0], int) and r[1] == "Number" and r[2] == "Public housing" and str(r[3]).startswith("Total households")])
    out["waitlist"] = {"title": "Households on the public housing waitlist", "unit": "count", "years": [w[0] for w in wl],
        "nsw": [w[1] for w in wl], "aus": [w[2] for w in wl],
        "def": "Households on the public housing waitlist at 30 June (public housing program only).", "table": "HOUSEHOLDS.28",
        "source": "AIHW National Housing Assistance Data Repository"}
    # DWELLINGS.2: social housing dwellings, all programs
    h, rs = rows(DWE, "DWELLINGS.2")
    iN, iT = h.index("NSW"), h.index("Total")
    dw = sorted([(r[0], num(r[iN]), num(r[iT])) for r in rs if isinstance(r[0], int) and r[1] == "Number" and r[2] == "All programs"])
    out["dwellings"] = {"title": "Social housing dwellings", "unit": "count", "years": [d[0] for d in dw],
        "nsw": [d[1] for d in dw], "aus": [d[2] for d in dw],
        "def": "Social housing dwellings across all programs at 30 June.", "table": "DWELLINGS.2",
        "source": "AIHW National Housing Assistance Data Repository (NT figures in the national total also use the NT Government Department of Housing annual report)"}
    return out


def sa2_cra(poa_gdf):
    """CRA recipients by SA2 (ASGS 2021), June 2023-2025, for SA2s overlapping each postcode."""
    h, rs = rows(FIN, "CRA.2b")
    cra = {}
    for r in rs:
        if r[0] == "NSW" and isinstance(r[1], int):
            cra[str(r[1])] = [num(r[3]), num(r[4]), num(r[5])]
    sa2 = gpd.read_file(RAW / "sa2" / "SA2_2021_AUST_GDA2020.shp", columns=["SA2_CODE21", "SA2_NAME21", "STE_CODE21"])
    sa2 = sa2[(sa2.STE_CODE21 == "1") & sa2.geometry.notna()].to_crs(3577)
    p = poa_gdf[["poa", "geometry"]].to_crs(3577); p["poa_area"] = p.area
    ov = gpd.overlay(p, sa2[["SA2_CODE21", "SA2_NAME21", "geometry"]], how="intersection", keep_geom_type=True)
    ov["share"] = ov.area / ov.poa_area
    ov = ov[ov.share >= 0.05].sort_values(["poa", "share"], ascending=[True, False])
    out = {}
    for r in ov.itertuples():
        c = cra.get(r.SA2_CODE21)
        if not c: continue
        out.setdefault(r.poa, []).append([r.SA2_CODE21, r.SA2_NAME21, round(r.share, 3), *c])
    return {k: v[:6] for k, v in out.items()}


def build(poa_gdf, web_dir):
    data = {"state": state_series(), "sa2": sa2_cra(poa_gdf),
            "meta": {"report": "Housing assistance in Australia 2026", "released": "2026-06-23", "households_reissued": "2026-06-30",
                     "url": REPORT, "licence": "CC BY 4.0", "licence_url": "https://www.aihw.gov.au/copyright",
                     "attribution": "Based on Australian Institute of Health and Welfare material.",
                     "cra_attribution": "Based on Australian Institute of Health and Welfare material (AIHW analysis of Department of Social Services data)."}}
    (web_dir / "aihw.json").write_text(json.dumps(data, separators=(",", ":")))
    return data
