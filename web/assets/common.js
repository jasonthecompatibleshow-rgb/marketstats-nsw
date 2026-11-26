/* MarketStats shared helpers: formatting, theme, data loading, colour ramps, map layer, gearing engine. */
const HM = (() => {
  const D_LABEL = { A: 'All', U: 'Unit', H: 'House', T: 'Townhouse' };
  const D_LONG = { A: 'All dwellings', U: 'Units / flats', H: 'Houses', T: 'Townhouses' };
  const B_LABEL = { t: 'All beds', 1: '1 bed', 2: '2 bed', 3: '3 bed', 4: '4+ bed' };
  const PRICE_FOR = { A: 'A', U: 'S', T: 'S', H: 'N' };
  const P_LABEL = { A: 'All dwellings', S: 'Strata', N: 'Non-strata' };
  const RAMPS = {
    rent: ['#fcfdbf', '#fecf92', '#fd9a6a', '#f1605d', '#c8407b', '#8c2981', '#4f127b'],
    price: ['#fff5eb', '#fdd0a2', '#fdae6b', '#f16913', '#d94801', '#a63603', '#6b2102'],
    yield: ['#f0f9e8', '#ccebc5', '#a8ddb5', '#7bccc4', '#43a2ca', '#0868ac', '#08306b'],
    income: ['#f3f0ff', '#dcd3ff', '#b9a6ff', '#9479f7', '#7048e8', '#5530c4', '#36208a'],
    growth: ['#2166ac', '#4393c3', '#92c5de', '#e4e7ec', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'],
    cash: ['#b91c1c', '#ea580c', '#fb923c', '#fed7aa', '#d1d5db', '#86efac', '#22c55e', '#15803d'],
    gearing: ['#7c2d12', '#c2410c', '#ea580c', '#fb923c', '#fed7aa', '#cbd5e1', '#86efac', '#16a34a'],
  };
  const $ = (id) => document.getElementById(id);
  const money = (v) => v == null || isNaN(v) ? '–' : (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-AU');
  const priceFmt = (v) => v == null ? '–' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'm' : '$' + Math.round(v / 1000) + 'k';
  const pct = (v, dp = 1) => v == null || isNaN(v) ? '–' : (+v).toFixed(dp) + '%';
  const sgn = (v, dp = 1) => v == null || isNaN(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(+v).toFixed(dp) + '%';
  const sgnMoney = (v) => v == null || isNaN(v) ? '–' : (v >= 0 ? '+$' : '−$') + Math.round(Math.abs(v)).toLocaleString('en-AU');

  // theme: the inline <head> script sets data-theme before first paint; this wires the toggle and follows the OS until the user picks.
  const THEME_KEY = 'ms-theme';
  const theme = () => document.documentElement.dataset.theme || 'light';
  function initTheme(onChange) {
    let saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const set = (t) => { if (t !== theme()) { document.documentElement.dataset.theme = t; paint(); onChange && onChange(t); } };
    const b = $('themeBtn');
    const paint = () => { if (!b) return; const d = theme() === 'dark'; b.innerHTML = d ? ICON.sun : ICON.moon; b.title = d ? 'Switch to light mode' : 'Switch to dark mode'; b.setAttribute('aria-label', b.title); };
    if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = saved || (mq.matches ? 'dark' : 'light');
    paint();
    b && b.addEventListener('click', () => { const t = theme() === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(THEME_KEY, t); } catch (e) {} saved = t; set(t); });
    mq.addEventListener && mq.addEventListener('change', (e) => { if (!saved) set(e.matches ? 'dark' : 'light'); });
    window.MSAuth && MSAuth.renderNav();
    const mb = $('menuBtn');
    mb && mb.addEventListener('click', () => { const o = $('nav').classList.toggle('open'); mb.setAttribute('aria-expanded', o); });
  }
  const ICON = {
    moon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    sun: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  };
  // brand mark: rising bars inside a rounded tile, with a trend line
  const LOGO = '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="msg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#0d9488"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#msg)"/><rect x="7" y="17" width="4" height="8" rx="1.5" fill="#fff" opacity=".7"/><rect x="14" y="13" width="4" height="12" rx="1.5" fill="#fff" opacity=".85"/><rect x="21" y="8" width="4" height="17" rx="1.5" fill="#fff"/><path d="M6.5 13.5 13 9.5l4.5 2.5 8-6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/></svg>';
  const BRAND = 'MarketStats';

  const cache = {};
  const load = (u) => cache[u] || (cache[u] = fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }));

  // ---------- gearing engine (single source of truth for map, insights, landing, calculator) ----------
  function typical(cfg, r, d, b) {
    const price = r['p_' + PRICE_FOR[d]], rent = r['r_' + d + b];
    if (!price || !rent) return null;
    const c = cfg.costs[d];
    return { price, rent, lvr: cfg.lvr_pct, rate: cfg.rate.value, term: cfg.term_years, repay: cfg.repayment,
      vacWeeks: cfg.vacancy_weeks, mgmtPct: cfg.mgmt_pct, maintPct: cfg.maintenance_pct, strata: c.strata,
      council: c.council, insurance: c.insurance, landTax: cfg.land_tax.default, deprec: 0, taxRate: 37, medicare: cfg.medicare_pct };
  }
  function landTax(cfg, landValue) {
    const lt = cfg.land_tax; return landValue > lt.threshold ? lt.base + (landValue - lt.threshold) * lt.rate_pct / 100 : 0;
  }
  function evaluate(x, cfg) {
    const loan = x.loan != null ? x.loan : x.price * x.lvr / 100;
    const i = x.rate / 100, im = i / 12, n = x.term * 12;
    let interest, principal = 0, repayment;
    if (x.repay === 'io') { interest = loan * i; repayment = interest; }
    else {
      const pmt = im ? loan * im / (1 - Math.pow(1 + im, -n)) : loan / n;
      let bal = loan; interest = 0;
      for (let m = 0; m < 12; m++) { const int = bal * im; interest += int; bal -= pmt - int; }
      repayment = pmt * 12; principal = repayment - interest;
    }
    const grossRent = x.rent * 52;
    const received = x.rent * (52 - x.vacWeeks);
    const mgmt = received * x.mgmtPct / 100, maint = grossRent * x.maintPct / 100;
    const holding = x.strata + x.council + x.insurance + x.landTax;
    const expenses = mgmt + maint + holding;
    const taxable = received - expenses - interest - (x.deprec || 0);       // rental tax result (gearing basis)
    const cash = received - expenses - repayment;                          // pre-tax cash flow
    const band = (cfg && cfg.neutral_band_weekly) || 20;
    const gearing = taxable / 52 > band ? 'positive' : taxable / 52 < -band ? 'negative' : 'neutral';
    const mr = (x.taxRate + (x.taxRate > 0 ? x.medicare : 0)) / 100;
    const tax = -taxable * mr;                                             // + = refund (negative gearing), − = tax payable
    return { loan, deposit: x.price - loan, interest, principal, repayment, grossRent, received, mgmt, maint, holding, expenses,
      taxable, cash, weekly: cash / 52, taxableWeekly: taxable / 52, gearing, tax, afterTax: cash + tax, afterTaxWeekly: (cash + tax) / 52,
      grossYield: x.price ? grossRent / x.price * 100 : 0, netYield: x.price ? (received - expenses) / x.price * 100 : 0 };
  }
  // interest rate at which the typical investor's rental tax result is zero (the gearing break-even)
  function breakEven(x, cfg) {
    const f = (r) => evaluate({ ...x, rate: r }, cfg).taxable;
    if (f(0) <= 0) return 0;
    let lo = 0, hi = 30; if (f(hi) > 0) return null;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; f(m) > 0 ? lo = m : hi = m; }
    return (lo + hi) / 2;
  }
  const GEAR_BREAKS = [-400, -300, -200, -100, -20, 20, 100];
  const gearTier = (w, band = 20) => w < -300 ? 'Deeply negative' : w < -100 ? 'Negative' : w < -band ? 'Mildly negative' : w <= band ? 'Neutral' : 'Positive';
  const gearPill = (g) => `<span class="pill ${g === 'positive' ? 'pos' : g === 'negative' ? 'neg' : 'neu'}">${g === 'positive' ? '▲ Positively geared' : g === 'negative' ? '▼ Negatively geared' : '● Neutrally geared'}</span>`;

  // ---------- map helpers ----------
  const STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
  let protocolAdded = false;
  function addPostcodes(map, opts = {}) {
    if (!protocolAdded) { maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile); protocolAdded = true; }
    // draw the choropleth above every basemap fill/line (roads, buildings) but below the labels
    const L = map.getStyle().layers; let lastGeom = -1; L.forEach((l, i) => { if (l.type !== 'symbol') lastGeom = i; });
    const firstLabel = L.slice(lastGeom + 1).find((l) => l.type === 'symbol')?.id;
    const url = new URL('data/postcodes.pmtiles', location.href.replace(/[^/]*$/, '')).href;
    map.addSource('pc', { type: 'vector', url: 'pmtiles://' + url, promoteId: { postcodes: 'poa' },
      attribution: '© State of NSW (DCJ) Rent &amp; Sales, CC BY 4.0 · © ABS, CC BY 4.0' });
    const dark = theme() === 'dark';
    map.addLayer({ id: 'pc-fill', type: 'fill', source: 'pc', 'source-layer': 'postcodes', paint: {
      'fill-color': dark ? '#334155' : '#cbd5e1',
      'fill-color-transition': { duration: 400 },
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, ['<', ['coalesce', ['feature-state', 'ci'], -1], 0], dark ? 0.25 : 0.35,
        ['boolean', ['feature-state', 'low'], false], 0.42, opts.opacity || 0.78] } }, firstLabel);
    map.addLayer({ id: 'pc-line', type: 'line', source: 'pc', 'source-layer': 'postcodes',
      paint: { 'line-color': dark ? 'rgba(10,14,25,.55)' : 'rgba(255,255,255,.9)', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.15, 12, 1.1] } }, firstLabel);
    map.addLayer({ id: 'pc-sel', type: 'line', source: 'pc', 'source-layer': 'postcodes', filter: ['==', ['get', 'poa'], ''],
      paint: { 'line-color': dark ? '#e0e7ff' : '#312e81', 'line-width': 2.6 } });
  }
  function paint(map, values, breaks, colors, lowFlags = {}) {
    const dark = theme() === 'dark';
    map.setPaintProperty('pc-fill', 'fill-color', ['case', ['<', ['coalesce', ['feature-state', 'ci'], -1], 0], dark ? '#334155' : '#cbd5e1',
      ['to-color', ['at', ['to-number', ['feature-state', 'ci']], ['literal', colors]]]]);
    for (const [poa, v] of Object.entries(values)) {
      map.setFeatureState({ source: 'pc', sourceLayer: 'postcodes', id: poa },
        { ci: v == null ? -1 : classOf(v, breaks), low: !!lowFlags[poa] });
    }
  }
  function quantileBreaks(vals, n) {
    const s = vals.filter((v) => v != null).sort((a, b) => a - b), out = [];
    if (!s.length) return [];
    for (let i = 1; i < n; i++) out.push(s[Math.min(s.length - 1, Math.floor(i * s.length / n))]);
    return out;
  }
  const classOf = (v, breaks) => { let i = 0; while (i < breaks.length && v >= breaks[i]) i++; return i; };

  const LINKS = [['map', 'map.html', 'Map'], ['insights', 'insights.html', 'Insights'], ['data', 'data.html', 'Data & method'], ['pricing', 'pricing.html', 'Pricing'], ['about', 'about.html', 'About'], ['disclaimer', 'disclaimer.html', 'Disclaimer']];
  function nav(active) {
    return `<a class="brand" href="index.html" aria-label="${BRAND} home">${LOGO}<span class="wordmark">Market<span>Stats</span></span><span class="scope" title="Coverage: New South Wales">NSW</span></a>
      <nav class="links" aria-label="Main">${LINKS.map(([k, h, t]) => `<a href="${h}" class="${active === k ? 'on' : ''}"${active === k ? ' aria-current="page"' : ''}>${t}</a>`).join('')}<span class="auth-mobile" id="authMobile"></span></nav>
      <span class="spacer"></span><span class="auth-slot" id="authSlot"></span><button class="icon-btn" id="themeBtn" title="Toggle light/dark" aria-label="Toggle light/dark">${ICON.moon}</button>
      <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu" aria-expanded="false">${ICON.menu}</button>`;
  }

  // ---------- insights ----------
  const sampleOK = (n, min) => n != null && n >= 0 && (min <= 30 ? n > 30 : n >= min);
  function insightRows(ins) { return ins.rows.map((r) => Object.fromEntries(ins.cols.map((c, i) => [c, r[i]]))); }
  function movers(rows, stats, cfg, { d, b, min }) {
    const k = d + b, R = rows.filter((r) => r.k === k && stats[r.poa]);
    const by = (arr, f, dir) => arr.map((r) => ({ ...r, v: f(r) })).filter((r) => r.v != null && isFinite(r.v)).sort((a, c) => dir * (c.v - a.v));
    const ok1 = R.filter((r) => sampleOK(r.n, min) && sampleOK(r.n1, min) && r.r1);
    const ok5 = R.filter((r) => sampleOK(r.n, min) && sampleOK(r.n5, min) && r.r5);
    const okY = R.filter((r) => sampleOK(r.n, min) && sampleOK(r.sn, min) && r.y);
    const okDY = R.filter((r) => sampleOK(r.n, min) && sampleOK(r.sn, min) && sampleOK(r.sn1, min) && r.ys != null && r.ys1 != null);
    const ch1 = (r) => 100 * (r.r / r.r1 - 1), ch5 = (r) => 100 * (r.r / r.r5 - 1);
    const cash = okY.map((r) => { const x = typical(cfg, { ['p_' + PRICE_FOR[d]]: r.price, ['r_' + k]: r.r }, d, b); const o = x && evaluate(x, cfg); return { ...r, v: o ? o.weekly : null, gearing: o && o.gearing }; }).filter((r) => r.v != null).sort((a, c) => c.v - a.v);
    return { rise1: by(ok1, ch1, 1), fall1: by(ok1, ch1, -1), rise5: by(ok5, ch5, 1), fall5: by(ok5, ch5, -1), yields: by(okY, (r) => r.y, 1),
      yrise: by(okDY, (r) => r.ys - r.ys1, 1), yfall: by(okDY, (r) => r.ys - r.ys1, -1), cash, counts: { ch1: ok1.length, ch5: ok5.length, y: okY.length, dy: okDY.length } };
  }
  function spark(series, w = 84, h = 24, color = 'currentColor') {
    const pts = (series || []).map((v, i) => [i, v]).filter((p) => p[1] != null);
    if (pts.length < 2) return '';
    const xs = series.length - 1, vs = pts.map((p) => p[1]), lo = Math.min(...vs), hi = Math.max(...vs) || 1;
    const P = pts.map(([i, v]) => `${(i / xs * w).toFixed(1)},${(h - 2 - (v - lo) / ((hi - lo) || 1) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="spark"><polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" points="${P}"/></svg>`;
  }

  function footer(META, CFG) {
    const per = META ? ` (rents ${META.rent_period}, sales ${META.sales_period})` : '';
    const rate = CFG ? ` (${new Date(CFG.rate.date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })})` : '';
    return `<div class="f-top"><div class="f-brand"><a class="brand" href="index.html">${LOGO}<span class="wordmark">Market<span>Stats</span></span><span class="scope">NSW</span></a>
        <p>Free rent, yield, gearing and trend analytics for every NSW postcode, built on official public data.</p></div>
      <div class="f-col"><b>Explore</b><a href="map.html">Map</a><a href="insights.html">Insights</a><a href="map.html?m=gearing&d=U&b=2">Gearing map</a><a href="pricing.html">Pricing</a></div>
      <div class="f-col"><b>Information</b><a href="about.html">About</a><a href="data.html">Data &amp; method</a><a href="disclaimer.html">Disclaimer</a><a href="privacy.html">Privacy policy</a><a href="about.html#contact">Contact &amp; feedback</a></div></div>
      <div class="f-legal">Data: © State of NSW (Department of Communities and Justice), <a href="https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html" target="_blank" rel="noopener">Rent and Sales Report</a>, CC BY 4.0${per}. Boundaries and Census © Australian Bureau of Statistics, CC BY 4.0. Interest rates: Reserve Bank of Australia, CC BY 4.0${rate}. Housing assistance indicators: based on Australian Institute of Health and Welfare material, CC BY 4.0. Basemap © OpenMapTiles © OpenStreetMap contributors via OpenFreeMap. <a href="data.html#sources">Full attribution</a>.</div>
      <div class="f-legal"><b>General information only.</b> Not financial, tax, investment or legal advice. MarketStats is independent and is not affiliated with or endorsed by any government agency. <a href="disclaimer.html">Read the disclaimer</a>.</div>`;
  }

  // ---------- AIHW state/national context cards ----------
  const fmtN = (v, u) => v == null ? '–' : u === '%' ? (+v).toFixed(1) + '%' : Math.round(v).toLocaleString('en-AU');
  function aihwCards(A, keys = ['cra_stress', 'waitlist', 'social_share', 'dwellings']) {
    return keys.filter((k) => A.state[k]).map((k) => {
      const s = A.state[k], n = s.nsw.length - 1, last = s.nsw[n], prev = s.nsw[n - 1], y = s.years[n];
      const dv = s.unit === '%' ? last - prev : 100 * (last / prev - 1), up = dv >= 0;
      const ch = (up ? '+' : '−') + Math.abs(dv).toFixed(Math.abs(dv) < 0.1 ? 2 : 1) + (s.unit === '%' ? ' pp' : '%');
      return `<div class="ctx card"><div class="ctx-geo"><span class="pill neu">NSW · state-level</span></div>
        <div class="k">${s.title}</div><div class="v">${fmtN(last, s.unit)}</div>
        <div class="d">${ch} vs ${y - 1} · at June ${y} · Australia ${fmtN(s.aus[n], s.unit)}</div>
        ${spark(s.nsw, 220, 34)}<div class="small faint">${s.years[0]}–${y}. ${s.def} <span class="nowrap">AIHW table ${s.table}.</span></div></div>`;
    }).join('');
  }
  const AIHW_NOTE = (A) => `State-level figures for New South Wales as a whole, not postcode figures. Source: ${A.meta.attribution} <a href="${A.meta.url}" target="_blank" rel="noopener">${A.meta.report}</a> (AIHW), CC BY 4.0. Rent Assistance figures: AIHW analysis of Department of Social Services data.`;

  return { BRAND, LOGO, ICON, aihwCards, AIHW_NOTE, breakEven, GEAR_BREAKS, gearTier, footer, sampleOK, insightRows, movers, spark, D_LABEL, D_LONG, B_LABEL, PRICE_FOR, P_LABEL, RAMPS, $, money, priceFmt, pct, sgn, sgnMoney, theme, initTheme, load,
    typical, evaluate, landTax, gearPill, STYLE, addPostcodes, paint, quantileBreaks, classOf, nav };
})();
