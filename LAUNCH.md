# MarketStats launch runbook

Static site (`web/`) on **Cloudflare Pages**, accounts + forms on **Supabase** (project `marketstats-nsw`, Sydney,
`https://tmmngtdjwouezdpfcskt.supabase.co`), quarterly data refresh + deploy via **GitHub Actions**.
The GitHub Pages copy (`make publish`) stays as a preview; canonical links point search engines at the production domain.

## 1. Domain + Cloudflare
1. Register the domain (e.g. `marketstats.au`; `.com.au` needs an ABN). Registering through Cloudflare Registrar puts DNS in Cloudflare automatically; otherwise add the domain to Cloudflare and change the registrar's nameservers to the two Cloudflare gives you.
2. Workers & Pages → Create → Pages → **Direct Upload**, project name `marketstats` (production branch `main`). Do a first upload of `web/` (or run the workflow, step 3).
3. Pages project → Custom domains → add the apex (and `www`, then add a Redirect Rule `www` → apex).
4. SSL/TLS: mode **Full (strict)**, enable *Always Use HTTPS*; optionally enable HSTS once everything works on HTTPS.
5. `web/_headers` sets security headers and caching; check them with `curl -I https://<domain>/` and a Range request:
   `curl -sI -H "Range: bytes=0-99" https://<domain>/data/postcodes.pmtiles` → `206`.
   Note: Cloudflare Pages serves `/about.html` as `/about` (308 redirect); canonical URLs already use the extensionless form.

## 2. GitHub Actions deploy (`.github/workflows/deploy.yml`)
1. Cloudflare → My Profile → API Tokens → Create token → template **Edit Cloudflare Workers** or a custom token with *Account → Cloudflare Pages → Edit*.
2. GitHub repo → Settings → Secrets and variables → Actions:
   - Secret `CLOUDFLARE_API_TOKEN` = the token
   - Secret `CLOUDFLARE_ACCOUNT_ID` = `f4b498664d6b2d95cba82876e0114583`
   - (optional) Variable `CF_PAGES_PROJECT` if the project isn't called `marketstats`
3. Actions → *Refresh data and deploy* → Run workflow. It also runs automatically at 00:00 UTC on 1 Feb/May/Aug/Nov
   (`make refresh` → `make check` → `wrangler pages deploy web`). Without the secrets it builds and checks, then skips the deploy.

## 3. Supabase
1. SQL editor → run `supabase/schema.sql` (tables `waitlist`, `contact_messages`: RLS on, INSERT-only, no public reads;
   the last block tightens grants to column-level INSERT). Read submissions in Table editor.
2. Authentication → URL Configuration:
   - Site URL: `https://<domain>`
   - Redirect URLs: `https://<domain>/**`, `https://jasonthecompatibleshow-rgb.github.io/marketstats-nsw/**`, `http://localhost:8765/**`
   (magic links return to the page the user signed in from).
3. Authentication → Providers → Email: enabled (magic link). **Set up custom SMTP** (Authentication → Emails → SMTP, e.g. Resend
   or Postmark with a sender on your domain + SPF/DKIM). Supabase's built-in mailer is rate-limited and only for testing,
   so real users won't reliably get links without it. Customise the magic-link email template with MarketStats branding.
4. `web/config.js` holds `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (public by design). Never put a secret/service-role key in `web/`.
   `DEMO_MODE: true` switches back to the browser-only demo accounts for local UX testing.

## 4. Point the site at the domain
```
python scripts/set_site_url.py https://<domain>
git commit -am "Set production URL" && git push
```
This rewrites canonical / og:url / og:image in every page, `sitemap.xml` and `robots.txt`. Then deploy (workflow) and
`make publish` to refresh the GitHub Pages preview. Submit `https://<domain>/sitemap.xml` in Google Search Console.

## 5. Legal + data checks before taking money
- [ ] Email NSW DCJ (RentandSales@dcj.nsw.gov.au) to confirm commercial reuse of the Rent and Sales Report under CC BY 4.0 with our attribution; keep the reply on file.
- [ ] Lawyer review of the **Disclaimer** and **Privacy Policy** (`privacy.html` is an APP-based draft; update it for Supabase accounts, the waitlist/contact forms, Cloudflare hosting and the SMTP provider), plus the Revenue NSW land-tax figures usage.
- [ ] Confirm attribution lines (DCJ, ABS, RBA, AIHW, OpenFreeMap/OpenStreetMap) render in the footer and on Data & method.
- [ ] Add a terms of use page before any paid plan or Stripe checkout goes live.

## 6. Post-launch checks
- Headless suite against production: `.venv/bin/python etl/screenshot.py https://<domain>/` (zero console errors, zero CDN requests).
- Sign up with a real address, click the magic link, confirm the account pill and unlocked data.
- Submit the waitlist and contact forms once and confirm the rows in Supabase.
- Known limits: OpenFreeMap tiles/styles are loaded from openfreemap.org (no SLA; self-host or use a paid tile host later);
  no Content-Security-Policy yet (MapLibre needs blob: workers; add and test one before adding third-party scripts).
