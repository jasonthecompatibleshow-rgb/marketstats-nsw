"""Headless smoke test + screenshots (desktop + mobile). Fails if any page logs a console error.
Usage: python etl/screenshot.py [base_url]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = pathlib.Path(__file__).resolve().parents[1] / "screenshots-docs"; OUT.mkdir(exist_ok=True)
DESK, MOB = dict(viewport={"width": 1440, "height": 900}), dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
errors = []

def page(b, ctx_opts, theme="light"):
    ctx = b.new_context(**ctx_opts, color_scheme=theme)
    ctx.add_init_script(f"localStorage.setItem('hm-theme','{theme}')")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"{pg.url}: {e}"))
    pg.on("console", lambda m: m.type == "error" and errors.append(f"{pg.url}: {m.text}"))
    return pg

def shot(pg, url, name, wait="window.mapReady === true", full=False, extra=None, delay=3500):
    pg.goto(BASE + url); pg.wait_for_function(wait, timeout=90000); pg.wait_for_timeout(delay)
    if extra: extra(pg)
    pg.screenshot(path=str(OUT / name), full_page=full); print("saved", OUT / name)

def tab(t):
    def f(pg):
        pg.click(f"#tabs button[data-t={t}]"); pg.wait_for_timeout(2500)
    return f

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    d = page(b, DESK)
    shot(d, "index.html", "10-landing-desktop.png", "window.mapReady === true && window.pageReady === true", full=True)
    shot(d, "map.html?m=yield&d=U&b=t", "11-map-yield-units-desktop.png")
    shot(d, "map.html?m=gearing&d=U&b=2&p=2127", "12-map-gearing-2127-desktop.png")
    shot(d, "map.html?m=rent&d=A&b=t&p=2042&tab=trends", "13-panel-trends-2042.png", extra=None, delay=5000)
    shot(d, "map.html?m=cash&d=H&b=4&p=2155&tab=calc", "14-panel-calculator-2155.png", delay=4000)
    shot(d, "map.html?m=rent&d=U&b=2&qi=16", "15-map-time-slider-2021.png")
    shot(d, "insights.html?d=U&b=t&min=50", "16-insights-desktop.png", "window.pageReady === true", full=True, delay=1500)
    # search interaction
    d.goto(BASE + "map.html"); d.wait_for_function("window.mapReady === true", timeout=90000)
    d.fill("#q", "kellyv"); d.wait_for_timeout(300); print("search:", d.locator("#results li").all_inner_texts()[:3])
    d.keyboard.press("Enter"); d.wait_for_timeout(2500); print("panel:", d.locator(".p-head h2").inner_text())
    dk = page(b, DESK, "dark")
    shot(dk, "map.html?m=rent&d=U&b=2&p=2042&tab=trends", "17-map-dark-trends.png", delay=5000)
    m = page(b, MOB)
    shot(m, "index.html", "20-landing-mobile.png", "window.mapReady === true && window.pageReady === true")
    shot(m, "map.html?m=yield&d=U&b=t", "21-map-mobile.png")
    def open_sheet(pg):
        pg.click("#handle"); pg.wait_for_timeout(1200)
    shot(m, "map.html?m=gearing&d=U&b=t&p=2127&tab=calc", "22-map-mobile-sheet-peek.png", delay=4000)
    shot(m, "map.html?m=gearing&d=U&b=t&p=2127&tab=calc", "23-map-mobile-sheet-calculator.png", extra=open_sheet, delay=4000)
    shot(m, "insights.html", "24-insights-mobile.png", "window.pageReady === true", delay=1500)
    b.close()
print("console errors:", errors or "none")
sys.exit(1 if errors else 0)
