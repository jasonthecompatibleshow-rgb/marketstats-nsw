"""Download raw datasets into data-raw/. Idempotent: skips files already present
(use --force to re-download). The DCJ Rent and Sales page is scraped so the
latest quarter's tables are always picked up."""
import json, re, sys, zipfile, datetime, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data-raw"
RAW.mkdir(exist_ok=True)
FORCE = "--force" in sys.argv
UA = {"User-Agent": "Mozilla/5.0 (heatmap-app ETL)"}

DCJ_PAGE = "https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html"
DCJ_PREV = "https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/previous-rent-and-sales-reports.html"
RBA_F6 = "https://www.rba.gov.au/statistics/tables/csv/f6-data.csv"   # housing lending rates (re-fetched every run)
ABS_ASGS = "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/"
STATIC = {
    "POA_2021_AUST_GDA2020_SHP.zip": ABS_ASGS + "POA_2021_AUST_GDA2020_SHP.zip",
    "SAL_2021_AUST_GDA2020_SHP.zip": ABS_ASGS + "SAL_2021_AUST_GDA2020_SHP.zip",
    "census_gcp_poa_nsw.zip": "https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_POA_for_NSW_short-header.zip",
    "census_gcp_sal_nsw.zip": "https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SAL_for_NSW_short-header.zip",
}


def fetch(url, dest):
    if dest.exists() and dest.stat().st_size > 0 and not FORCE:
        print(f"  skip (exists) {dest.name}")
        return
    print(f"  get {url}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(dest.with_suffix(dest.suffix + ".part"), "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    dest.with_suffix(dest.suffix + ".part").rename(dest)


def main():
    manifest = {}
    html = urllib.request.urlopen(urllib.request.Request(DCJ_PAGE, headers=UA), timeout=60).read().decode("utf-8", "ignore")
    links = sorted(set(re.findall(r'href="([^"]+/(rent|sales)-tables-[^"]+\.xlsx)"', html)))
    if not links:
        sys.exit("Could not find DCJ rent/sales xlsx links - page layout changed?")
    for href, kind in links:
        url = href if href.startswith("http") else "https://dcj.nsw.gov.au" + href
        name = url.rsplit("/", 1)[1]
        fetch(url, RAW / name)
        manifest[kind] = {"file": name, "url": url}
    # historical quarters (Sep 2017 onwards = current DCJ methodology) -> data-raw/hist/
    hist = RAW / "hist"; hist.mkdir(exist_ok=True)
    prev = urllib.request.urlopen(urllib.request.Request(DCJ_PREV, headers=UA), timeout=60).read().decode("utf-8", "ignore")
    hl = sorted(set(re.findall(r'href="([^"]+\.xlsx)"', prev)))
    for href in hl:
        url = href if href.startswith("http") else "https://dcj.nsw.gov.au" + href
        fetch(url, hist / url.rsplit("/", 1)[1])
    manifest["history_page"] = DCJ_PREV
    manifest["history_files"] = len(hl)
    # RBA F6 changes monthly, so always refresh it
    (RAW / "f6-data.csv").unlink(missing_ok=True)
    fetch(RBA_F6, RAW / "f6-data.csv")
    manifest["rba_f6"] = {"file": "f6-data.csv", "url": RBA_F6}
    for name, url in STATIC.items():
        fetch(url, RAW / name)
        manifest[name] = {"file": name, "url": url}
    for z, d in [("POA_2021_AUST_GDA2020_SHP.zip", "poa"), ("SAL_2021_AUST_GDA2020_SHP.zip", "sal")]:
        if not (RAW / d).exists():
            zipfile.ZipFile(RAW / z).extractall(RAW / d)
    manifest["downloaded_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    (RAW / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("manifest:", json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
