#!/usr/bin/env python3
"""Point canonical links, og:url, og:image, sitemap.xml and robots.txt at the production domain.
Usage: python scripts/set_site_url.py https://marketstats.com.au   (then commit and deploy)"""
import json, pathlib, subprocess, sys, urllib.parse
ROOT = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2: sys.exit(__doc__)
u = sys.argv[1].strip().rstrip("/")
p = urllib.parse.urlparse(u)
if p.scheme != "https" or not p.netloc or p.query or p.fragment: sys.exit(f"Expected an https URL like https://example.com.au, got {u!r}")
(ROOT / "etl" / "site.json").write_text(json.dumps({"site_url": u}, indent=2) + "\n")
print("site_url =", u)
subprocess.run([sys.executable, str(ROOT / "etl" / "heads.py")], check=True)
