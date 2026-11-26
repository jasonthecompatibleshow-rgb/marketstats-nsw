"""Headless smoke test + screenshots for every page, light and dark, desktop and mobile.
Fails (exit 1) on any console error or page error, or if the theme isn't applied before first paint.
Usage: python etl/screenshot.py [base_url]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = pathlib.Path(__file__).resolve().parents[1] / "screenshots-docs"; OUT.mkdir(exist_ok=True)
DESK = dict(viewport={"width": 1440, "height": 900})
MOB = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
MAPW, PAGEW = "window.mapReady === true", "window.pageReady === true"
errors = []

def page(b, ctx_opts, theme="light", stored=True):
    ctx = b.new_context(**ctx_opts, color_scheme=theme)
    if stored: ctx.add_init_script(f"localStorage.setItem('ms-theme','{theme}')")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"{pg.url}: {e}"))
    pg.on("console", lambda m: m.type == "error" and errors.append(f"{pg.url}: {m.text}"))
    return pg

def shot(pg, url, name, wait=MAPW, full=False, extra=None, delay=3000, theme=None):
    pg.goto(BASE + url, wait_until="commit")
    # no-flash check: theme attribute must exist as soon as the DOM is parsed, before any app script runs
    pg.wait_for_load_state("domcontentloaded")
    t = pg.evaluate("document.documentElement.dataset.theme")
    if theme and t != theme: errors.append(f"{url}: theme at DOMContentLoaded was {t!r}, expected {theme!r}")
    pg.wait_for_function(wait, timeout=90000); pg.wait_for_timeout(delay)
    if extra: extra(pg)
    pg.screenshot(path=str(OUT / name), full_page=full); print("saved", name)

def tab(t):
    def f(pg): pg.click(f"#tabs button[data-t={t}]"); pg.wait_for_timeout(2500)
    return f
def open_sheet(pg): pg.click("#handle"); pg.wait_for_timeout(1200)
def open_menu(pg): pg.click("#menuBtn"); pg.wait_for_timeout(400)

LANDW = MAPW + " && " + PAGEW
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    for th in ("light", "dark"):
        d = page(b, DESK, th)
        shot(d, "index.html", f"{th}-01-landing-desktop.png", LANDW, full=True, theme=th)
        shot(d, "map.html?m=yield&d=U&b=t", f"{th}-02-map-yield-desktop.png", theme=th)
        shot(d, "map.html?m=gearing&d=U&b=2&p=2127", f"{th}-03-map-gearing-2127-desktop.png", theme=th, delay=4000)
        shot(d, "map.html?m=rent&d=A&b=t&p=2042&tab=trends", f"{th}-04-panel-trends-2042.png", theme=th, delay=5000)
        shot(d, "map.html?m=cash&d=H&b=4&p=2155&tab=calc", f"{th}-05-panel-calculator-2155.png", theme=th, delay=4000)
        shot(d, "insights.html?d=U&b=t&min=50", f"{th}-06-insights-desktop.png", PAGEW, full=True, delay=1500, theme=th)
        for pg_ in ("about", "disclaimer", "data"):
            shot(d, f"{pg_}.html", f"{th}-07-{pg_}-desktop.png", PAGEW, full=True, delay=800, theme=th)
        shot(d, "pricing.html", f"{th}-08-pricing-desktop.png", PAGEW, full=True, delay=800, theme=th)
        m = page(b, MOB, th)
        shot(m, "index.html", f"{th}-11-landing-mobile.png", LANDW, theme=th)
        shot(m, "index.html", f"{th}-12-landing-mobile-menu.png", LANDW, extra=open_menu, theme=th)
        shot(m, "map.html?m=gearing&d=U&b=t", f"{th}-13-map-gearing-mobile.png", theme=th)
        shot(m, "map.html?m=gearing&d=U&b=t&p=2127&tab=calc", f"{th}-14-map-mobile-sheet.png", extra=open_sheet, delay=4000, theme=th)
        shot(m, "map.html?m=rent&d=U&b=2&p=2042&tab=overview", f"{th}-15-map-mobile-sa2.png", extra=lambda pg: (open_sheet(pg), pg.locator("#sa2ctx").scroll_into_view_if_needed(), pg.wait_for_timeout(500)), delay=4000, theme=th)
        shot(m, "insights.html", f"{th}-16-insights-mobile.png", PAGEW, delay=1500, theme=th)
        shot(m, "pricing.html", f"{th}-18-pricing-mobile.png", PAGEW, delay=600, theme=th)
        for pg_ in ("about", "disclaimer", "data"):
            shot(m, f"{pg_}.html", f"{th}-17-{pg_}-mobile.png", PAGEW, delay=600, theme=th)
    # first visit with no saved choice: follows prefers-color-scheme
    for th in ("dark", "light"):
        f = page(b, DESK, th, stored=False)
        shot(f, "about.html", f"first-visit-{th}.png", PAGEW, delay=300, theme=th)
    # toggle persists across pages
    t = page(b, DESK, "light", stored=False)
    t.goto(BASE + "about.html"); t.wait_for_function(PAGEW); t.click("#themeBtn")
    t.goto(BASE + "disclaimer.html"); t.wait_for_function(PAGEW)
    got = t.evaluate("[document.documentElement.dataset.theme, localStorage.getItem('ms-theme')]")
    print("toggle persisted:", got)
    if got != ["dark", "dark"]: errors.append(f"theme toggle did not persist: {got}")
    # pricing interactions: annual toggle + waitlist CTA
    pr = page(b, DESK)
    pr.goto(BASE + "pricing.html"); pr.wait_for_function(PAGEW)
    pr.click("#bill button[data-v=y]"); got = pr.locator(".tier.featured .amt").inner_text(); print("annual investor:", got)
    if got != "A$190": errors.append(f"annual toggle shows {got}")
    pr.click("a[data-plan=Pro]"); pr.wait_for_timeout(800); print("waitlist plan:", pr.locator("#wlPlan").inner_text())
    pr.screenshot(path=str(OUT / "light-08-pricing-annual-desktop.png")); print("saved light-08-pricing-annual-desktop.png")
    # ---------- free-account gate ----------
    def gates(pg): return pg.locator(".gate").count()
    for th in ("light", "dark"):
        g = page(b, DESK, th)
        shot(g, "map.html?m=rent&d=U&b=2&p=2042&tab=overview", f"{th}-09-map-gated.png", delay=3500, theme=th)
        n = gates(g); print(th, "map logged-out gates:", n, "| dwelling shown:", g.locator("#dwelling button.on").inner_text(), "| url keeps d=U:", "d=U" in g.url)
        if n < 2: errors.append(f"map logged out: expected gates, got {n}")
        shot(g, "insights.html?d=H&b=3&min=100", f"{th}-09-insights-gated.png", PAGEW, full=True, delay=1200, theme=th)
        n = gates(g); print(th, "insights logged-out gates:", n, "| filter shown:", g.locator("#f_d button.on").inner_text())
        if n < 4: errors.append(f"insights logged out: expected >=4 gates, got {n}")
        g.click("#authSlot [data-auth=signup]"); g.wait_for_timeout(400)
        g.screenshot(path=str(OUT / f"{th}-09-auth-modal.png")); print("saved", f"{th}-09-auth-modal.png")
        g.fill("#authEmail", f"jason.test.{th}@example.com"); g.fill("#authName", "Jason Test"); g.click("#authSubmit"); g.wait_for_timeout(900)
        n = gates(g); print(th, "after sign-up gates:", n, "| filter shown:", g.locator("#f_d button.on").inner_text(), "| nav:", g.locator(".acct-name").inner_text())
        if n: errors.append(f"insights after sign-up still has {n} gates")
        g.screenshot(path=str(OUT / f"{th}-10-insights-member.png"), full_page=True); print("saved", f"{th}-10-insights-member.png")
        g.goto(BASE + "map.html?m=rent&d=U&b=2&p=2042&tab=trends"); g.wait_for_function(MAPW, timeout=90000); g.wait_for_timeout(4500)
        n = gates(g); print(th, "map as member gates:", n, "| beds shown:", g.locator("#beds button.on").inner_text())
        if n: errors.append(f"map as member still has {n} gates")
        g.screenshot(path=str(OUT / f"{th}-10-map-member-trends.png")); print("saved", f"{th}-10-map-member-trends.png")
        g.click("#tabs button[data-t=calc]"); g.wait_for_timeout(1500)
        if gates(g): errors.append("calc gated for member")
        g.click("#acctBtn"); g.wait_for_timeout(300); g.screenshot(path=str(OUT / f"{th}-10-account-menu.png")); print("saved", f"{th}-10-account-menu.png")
        g.click(".am-out"); g.wait_for_timeout(1200)
        n = gates(g); print(th, "after sign-out gates:", n)
        if n < 1: errors.append("sign-out did not re-lock map")
        # sign back in by email, then refresh persists
        g.click("#authSlot [data-auth=signin]"); g.fill("#authEmail", f"jason.test.{th}@example.com"); g.click("#authSubmit"); g.wait_for_timeout(900)
        g.reload(); g.wait_for_function(MAPW, timeout=90000); g.wait_for_timeout(2500)
        n = gates(g); print(th, "after sign-in + reload gates:", n)
        if n: errors.append("session did not persist across reload")
        g.click("#acctBtn"); g.click(".am-out"); g.wait_for_timeout(600)
        g.context.close()
    # one-click demo account on mobile
    for th in ("light", "dark"):
        mm = page(b, MOB, th)
        shot(mm, "map.html?m=rent&p=2127&tab=overview", f"{th}-19-map-gated-mobile.png", extra=open_sheet, delay=3500, theme=th)
        mm.click("#authSlot [data-auth=signin]"); mm.wait_for_timeout(400)
        mm.screenshot(path=str(OUT / f"{th}-19-auth-modal-mobile.png")); print("saved", f"{th}-19-auth-modal-mobile.png")
        mm.click("#authDemo"); mm.wait_for_timeout(1500)
        n = gates(mm); print(th, "mobile demo login gates:", n)
        if n: errors.append("demo login did not unlock mobile map")
        mm.screenshot(path=str(OUT / f"{th}-19-map-member-mobile.png")); print("saved", f"{th}-19-map-member-mobile.png")
        mm.context.close()
    # social preview image (og:image) from the landing hero
    o = page(b, dict(viewport={"width": 1200, "height": 630}))
    o.goto(BASE + "index.html"); o.wait_for_function(LANDW, timeout=90000); o.wait_for_timeout(2500)
    o.screenshot(path=str(OUT.parent / "web" / "og.png")); print("saved web/og.png")
    # search interaction
    s = page(b, DESK)
    s.goto(BASE + "map.html"); s.wait_for_function(MAPW, timeout=90000)
    s.fill("#q", "kellyv"); s.wait_for_timeout(300); print("search:", s.locator("#results li").all_inner_texts()[:3])
    s.keyboard.press("Enter"); s.wait_for_timeout(2500); print("panel:", s.locator(".p-head h2").inner_text())
    b.close()
print("console errors:", errors or "none")
sys.exit(1 if errors else 0)
