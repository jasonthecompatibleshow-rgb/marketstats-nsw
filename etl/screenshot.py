"""Headless smoke test + screenshots for every page, light and dark, desktop and mobile.
Fails (exit 1) on any console error or page error, any request to a third-party JS/CSS/font CDN (everything is
self-hosted in web/vendor/), or if the theme isn't applied before first paint. Also tests the 404 page and the
live (Supabase) mode against a mocked Supabase API.
Usage: python etl/screenshot.py [base_url]"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
OUT = pathlib.Path(__file__).resolve().parents[1] / "screenshots-docs"; OUT.mkdir(exist_ok=True)
DESK = dict(viewport={"width": 1440, "height": 900})
MOB = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
MAPW, PAGEW = "window.mapReady === true", "window.pageReady === true"
errors = []
CDN = ("unpkg.com", "cdn.jsdelivr.net", "jsdelivr.net", "rsms.me", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com")
cdn_hits = []
def watch(pg, allow_404=False):
    pg.on("pageerror", lambda e: errors.append(f"{pg.url}: {e}"))
    # the 404 page itself is served with status 404, which Chromium logs as a console error for the document
    pg.on("console", lambda m: m.type == "error" and not (allow_404 and "status of 404" in m.text) and errors.append(f"{pg.url}: {m.text}"))
    pg.on("request", lambda r: any(h in r.url.split("/")[2] for h in CDN) and cdn_hits.append(r.url))

DEMO_CFG = "window.MS_CONFIG = { DEMO_MODE: true };"
def demo_cfg(ctx): ctx.route("**/config.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=DEMO_CFG))
def page(b, ctx_opts, theme="light", stored=True, demo=True):
    ctx = b.new_context(**ctx_opts, color_scheme=theme)
    if demo: demo_cfg(ctx)   # the account-gate UX tests run in demo mode; live mode is tested below against a mock + the real config
    if stored: ctx.add_init_script(f"localStorage.setItem('ms-theme','{theme}')")
    pg = ctx.new_page(); watch(pg)
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
    # ---------- 404 page: direct, and served for a missing nested path (relative assets must still resolve) ----------
    for th in ("light", "dark"):
        for vp, tag in ((DESK, "desktop"), (MOB, "mobile")):
            ctx = b.new_context(**vp, color_scheme=th); demo_cfg(ctx); ctx.add_init_script(f"localStorage.setItem('ms-theme','{th}')")
            nf = ctx.new_page(); watch(nf, allow_404=True)
            r = nf.goto(BASE + "no/such/page", wait_until="commit"); nf.wait_for_load_state("domcontentloaded")
            if r.status != 404: errors.append(f"missing path returned {r.status}, expected 404")
            if nf.evaluate("document.documentElement.dataset.theme") != th: errors.append(f"404 theme not {th}")
            nf.wait_for_function(PAGEW, timeout=30000); nf.wait_for_timeout(600)
            ok = nf.evaluate("[...document.styleSheets].some(s => s.href && s.href.includes('assets/site.css') && s.cssRules.length > 50) && !!document.querySelector('#nav .links a')")
            hrefs = nf.eval_on_selector_all(".nf-links a", "els => els.map(e => e.href)")
            print(th, tag, "404 status", r.status, "| styled+nav:", ok, "| links:", [h.replace(BASE, "") for h in hrefs])
            if not ok or any(not h.startswith(BASE) or "/no/" in h for h in hrefs): errors.append(f"404 page assets/links broken at nested path: {hrefs}")
            nf.screenshot(path=str(OUT / f"{th}-20-404-{tag}.png")); print("saved", f"{th}-20-404-{tag}.png")
            ctx.close()
    # ---------- demo mode forms: honest placeholders, nothing sent ----------
    dm = page(b, DESK)
    sent = []; dm.context.route("**/rest/v1/**", lambda r: (sent.append(r.request.url), r.abort()))
    dm.goto(BASE + "about.html#contact"); dm.wait_for_function(PAGEW)
    print("demo contact idle:", dm.locator("#cfOut").inner_text())
    dm.fill("#cfName", "Test"); dm.fill("#cfEmail", "t@example.com"); dm.fill("#cfMsg", "Hello there"); dm.click("#contactForm [type=submit]"); dm.wait_for_timeout(300)
    got = dm.locator("#cfOut").inner_text(); print("demo contact submit:", got)
    if "Demo mode" not in got or sent: errors.append(f"demo contact form: {got!r} sent={sent}")
    dm.screenshot(path=str(OUT / "light-21-contact-demo.png"), full_page=True)
    dm.context.close()
    # ---------- live mode against a mocked Supabase project ----------
    FAKE = "https://test-project.supabase.co"
    calls = []
    def supa(route):
        rq = route.request; u = rq.url; calls.append((rq.method, u.split("?")[0].replace(FAKE, ""), rq.post_data, dict(rq.headers), u))
        if "/auth/v1/otp" in u: return route.fulfill(status=200, content_type="application/json", body="{}")
        if "/rest/v1/" in u: return route.fulfill(status=201, body="")
        return route.fulfill(status=200, content_type="application/json", body="{}")
    for th in ("light", "dark"):
        lv = page(b, DESK, th)
        lv.context.route("**/config.js", lambda r: r.fulfill(status=200, content_type="application/javascript",
                         body=f"window.MS_CONFIG = {{ SUPABASE_URL: '{FAKE}', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }};"))
        lv.context.route(FAKE + "/**", supa)
        lv.goto(BASE + "index.html"); lv.wait_for_function(LANDW, timeout=90000)
        lv.wait_for_function("document.documentElement.classList.contains('ms-live')", timeout=10000)
        print(th, "live mode:", lv.evaluate("MSAuth.mode"), "| configured:", lv.evaluate("MSAuth.configured()"))
        if lv.evaluate("MSAuth.mode") != "supabase": errors.append("live config did not switch to Supabase mode")
        lv.fill("#wlEmail", f"Wait.{th}@Example.com"); lv.click("#wl [type=submit]"); lv.wait_for_function("document.getElementById('wlMsg').textContent.includes('Thanks')", timeout=5000)
        print(th, "live waitlist:", lv.locator("#wlMsg").inner_text())
        lv.click("#authSlot [data-auth=signup]"); lv.wait_for_timeout(300)
        note = lv.locator("#authNote").inner_text(); print(th, "live modal note:", note)
        if "Demo" in note or lv.locator("#authDemo").is_visible(): errors.append("Demo UI visible in live mode")
        lv.fill("#authEmail", f"jason.{th}@example.com"); lv.fill("#authName", "Jason"); lv.click("#authSubmit")
        lv.wait_for_function("document.getElementById('authErr').textContent.includes('Check')", timeout=5000)
        print(th, "live sign-up:", lv.locator("#authErr").inner_text())
        lv.screenshot(path=str(OUT / f"{th}-22-live-magic-link.png"))
        lv.keyboard.press("Escape")
        lv.goto(BASE + "pricing.html"); lv.wait_for_function(PAGEW); lv.wait_for_timeout(500)
        if lv.locator(".demo-only").first.is_visible(): errors.append("demo-only text visible on live pricing page")
        lv.click("a[data-plan=Pro]"); lv.wait_for_timeout(600); lv.fill("#wlEmail", f"pro.{th}@example.com"); lv.click("#wl [type=submit]")
        lv.wait_for_function("document.getElementById('wlMsg').textContent.includes('Thanks')", timeout=5000)
        lv.goto(BASE + "about.html#contact"); lv.wait_for_function(PAGEW)
        lv.fill("#cfName", "Jason"); lv.fill("#cfEmail", "jason@example.com"); lv.fill("#cfMsg", "Love the gearing map."); lv.click("#contactForm [type=submit]")
        lv.wait_for_function("document.getElementById('cfOut').textContent.includes('sent')", timeout=5000)
        print(th, "live contact:", lv.locator("#cfOut").inner_text())
        lv.locator("#contactForm").scroll_into_view_if_needed(); lv.screenshot(path=str(OUT / f"{th}-22-live-contact.png"))
        lv.context.close()
    def find(path): return [c for c in calls if c[1] == path]
    w, cm, otp = find("/rest/v1/waitlist"), find("/rest/v1/contact_messages"), find("/auth/v1/otp")
    print("mock calls:", [(c[0], c[1]) for c in calls])
    bodies = [json.loads(c[2]) for c in w]
    print("waitlist rows:", bodies, "| contact rows:", [json.loads(c[2]) for c in cm])
    if len(w) != 4 or {x["plan"] for x in bodies} != {"investor", "pro"}: errors.append(f"waitlist inserts wrong: {bodies}")
    if any(c[3].get("apikey") != "sb_publishable_test" or c[3].get("prefer") != "return=minimal" or "authorization" in c[3] for c in w + cm): errors.append("REST headers wrong (publishable key must go on apikey only)")
    if len(cm) != 2 or len(otp) != 2: errors.append(f"contact/otp calls: {len(cm)}/{len(otp)}")
    import urllib.parse
    rt = [urllib.parse.parse_qs(urllib.parse.urlparse(c[4]).query).get("redirect_to", [""])[0] for c in otp]
    print("magic-link redirect_to:", rt)
    if any(not r.startswith(BASE + "index.html") for r in rt): errors.append(f"emailRedirectTo not the current page: {rt}")
    # ---------- the real web/config.js (live project): Supabase mode, no demo UI, no console errors. No form is submitted. ----------
    for th in ("light", "dark"):
        rc = page(b, DESK, th, demo=False)
        for u in ("index.html", "pricing.html", "about.html"):
            rc.goto(BASE + u); rc.wait_for_function(PAGEW, timeout=90000); rc.wait_for_timeout(800)
            mode = rc.evaluate("MSAuth.mode"); txt = rc.locator("body").inner_text()
            print(th, "real config", u, "mode:", mode)
            if mode != "supabase": errors.append(f"real config not in Supabase mode on {u}")
            if "Demo mode" in txt or "Placeholder" in txt: errors.append(f"demo/placeholder text visible with real config on {u}")
        rc.goto(BASE + "map.html?m=rent&p=2127&tab=overview"); rc.wait_for_function(MAPW, timeout=90000); rc.wait_for_timeout(2500)
        rc.click("#authSlot [data-auth=signup]"); rc.wait_for_timeout(400)
        if rc.locator("#authDemo").is_visible() or "Demo" in rc.locator("#authNote").inner_text(): errors.append("demo button/note visible with real config")
        rc.screenshot(path=str(OUT / f"{th}-23-live-signup-modal.png")); print("saved", f"{th}-23-live-signup-modal.png")
        rc.context.close()
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
print("CDN requests:", cdn_hits or "none")
if cdn_hits: errors.append(f"{len(cdn_hits)} requests to third-party CDNs, e.g. {cdn_hits[0]}")
print("console errors:", errors or "none")
sys.exit(1 if errors else 0)
