"""Headless smoke test + screenshots. Usage: python etl/screenshot.py [base_url]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = pathlib.Path(__file__).resolve().parents[1] / "screenshots-docs"; OUT.mkdir(exist_ok=True)
SHOTS = [("01-rent-all.png", "?m=rent&d=A&b=t"), ("02-yield-units-2bed-2127.png", "?m=yield&d=U&b=2&p=2127"),
         ("03-rent-houses-4bed-2155.png", "?m=rent&d=H&b=4&p=2155"), ("04-growth-2042.png", "?m=growth&d=A&b=t&p=2042")]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    for name, q in SHOTS:
        pg.goto(BASE + q); pg.wait_for_function("window.mapReady === true", timeout=60000)
        pg.wait_for_timeout(5000)
        pg.screenshot(path=str(OUT / name)); print("saved", OUT / name)
    # search check
    pg.fill("#q", "kellyv"); pg.wait_for_timeout(300); print("search hits:", pg.locator("#results li").all_inner_texts()[:4])
    pg.keyboard.press("Enter"); pg.wait_for_timeout(3000)
    print("panel title:", pg.locator("#panel h2").inner_text(), "| cash flow:", pg.locator("#c_out .big").inner_text())
    pg.screenshot(path=str(OUT / "05-search-kellyville.png"))
    print("errors:", errs or "none")
    b.close()
