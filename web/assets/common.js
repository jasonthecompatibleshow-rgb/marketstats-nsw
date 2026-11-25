/* Shared helpers: formatting, theme, data loading, colour ramps, map layer, gearing engine. */
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
    gearing: ['#ea580c', '#94a3b8', '#16a34a'],
  };
  const $ = (id) => document.getElementById(id);
  const money = (v) => v == null || isNaN(v) ? '–' : (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-AU');
  const priceFmt = (v) => v == null ? '–' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'm' : '$' + Math.round(v / 1000) + 'k';
  const pct = (v, dp = 1) => v == null || isNaN(v) ? '–' : (+v).toFixed(dp) + '%';
  const sgn = (v, dp = 1) => v == null || isNaN(v) ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(+v).toFixed(dp) + '%';
  const sgnMoney = (v) => v == null || isNaN(v) ? '–' : (v >= 0 ? '+$' : '−$') + Math.round(Math.abs(v)).toLocaleString('en-AU');

  // theme
  const theme = () => document.documentElement.dataset.theme || 'light';
  function initTheme(onChange) {
    const saved = localStorage.getItem('hm-theme');
    document.documentElement.dataset.theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const b = $('themeBtn');
    const paint = () => { if (b) b.textContent = theme() === 'dark' ? '☀' : '☾'; };
    paint();
    b && b.addEventListener('click', () => {
      document.documentElement.dataset.theme = theme() === 'dark' ? 'light' : 'dark';
      localStorage.setItem('hm-theme', theme()); paint(); onChange && onChange(theme());
    });
  }

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
  const gearPill = (g) => `<span class="pill ${g === 'positive' ? 'pos' : g === 'negative' ? 'neg' : 'neu'}">${g === 'positive' ? '▲ Positively geared' : g === 'negative' ? '▼ Negatively geared' : '● Neutrally geared'}</span>`;

  // ---------- map helpers ----------
  const STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
  let protocolAdded = false;
  function addPostcodes(map, opts = {}) {
    if (!protocolAdded) { maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile); protocolAdded = true; }
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
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

  function nav(active) {
    return `<a class="brand" href="index.html"><span class="logo"></span>Yieldmap<span class="pill acc" style="margin-left:4px">NSW</span></a>
      <nav class="links"><a href="map.html" class="${active === 'map' ? 'on' : ''}">Map</a><a href="insights.html" class="${active === 'insights' ? 'on' : ''}">Insights</a><a href="index.html#how" class="${active === 'how' ? 'on' : ''}">Method</a></nav>
      <span class="spacer"></span><button class="icon-btn" id="themeBtn" title="Toggle light/dark" aria-label="Toggle theme">☾</button>`;
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
    return `<div><b>Yieldmap NSW</b> · Free NSW rent, yield and gearing analytics.</div>
      <div>Data: © State of NSW (Department of Communities and Justice) <a href="https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html" target="_blank" rel="noopener">Rent and Sales Report</a>, CC BY 4.0 (rents ${META.rent_period}, sales ${META.sales_period}); boundaries and Census © ABS, CC BY 4.0; interest rate: RBA F6 (${CFG.rate.date}); basemap © OpenMapTiles © OpenStreetMap contributors via OpenFreeMap. Not endorsed by any government agency.</div>
      <div>General information only. Not financial, tax or investment advice.</div>`;
  }
  
  return { footer, sampleOK, insightRows, movers, spark, D_LABEL, D_LONG, B_LABEL, PRICE_FOR, P_LABEL, RAMPS, $, money, priceFmt, pct, sgn, sgnMoney, theme, initTheme, load,
    typical, evaluate, landTax, gearPill, STYLE, addPostcodes, paint, quantileBreaks, classOf, nav };
})();
