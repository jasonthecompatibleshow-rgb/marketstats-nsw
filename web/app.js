/* NSW Rent & Yield Heatmap — static MapLibre front end.
   Geometry comes from data/postcodes.pmtiles (postcode id only); all metrics live in
   data/stats.json and are applied to the map with feature-state, so switching
   metric/filters is instant and needs no tile rebuild. */
const D_LABEL = { A: 'All', U: 'Unit/flat', H: 'House', T: 'Townhouse' };
const B_LABEL = { t: 'All', 1: '1 bed', 2: '2 bed', 3: '3 bed', 4: '4+ bed' };
const PRICE_FOR = { A: 'A', U: 'S', T: 'S', H: 'N' };   // rent dwelling -> sales series
const P_LABEL = { A: 'All dwellings', S: 'Strata', N: 'Non-strata' };
const SEQ = ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#e34a33', '#b30000'];
const DIV = ['#2166ac', '#4393c3', '#92c5de', '#e0e0e0', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'];
const GROWTH_BREAKS = [-10, -5, -2, 0, 2, 5, 10];

const $ = (id) => document.getElementById(id);
const money = (v) => v == null ? '–' : '$' + Math.round(v).toLocaleString('en-AU');
const priceFmt = (v) => v == null ? '–' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'm' : '$' + Math.round(v / 1000) + 'k';
const pct = (v, dp = 1) => v == null ? '–' : (+v).toFixed(dp) + '%';
const sgn = (v) => v == null ? '–' : (v > 0 ? '+' : '') + (+v).toFixed(1) + '%';

let STATS = {}, META = {}, map, hoverId = null, selected = null;
const state = Object.assign({ m: 'rent', d: 'A', b: 't' }, Object.fromEntries(new URLSearchParams(location.search)));

function metricDef(s = state) {
  const k = s.d + s.b;
  switch (s.m) {
    case 'rent': return { key: 'r_' + k, low: 'rl_' + k, fmt: (v) => money(v) + '/wk', title: `Median weekly rent · ${D_LABEL[s.d]} · ${B_LABEL[s.b]}` };
    case 'yield': return { key: 'y_' + k, low: 'yl_' + k, fmt: (v) => pct(v, 2), title: `Gross yield · ${D_LABEL[s.d]} · ${B_LABEL[s.b]}`,
      note: `Gross yield = median new-bond rent × 52 ÷ median sale price. Sales aren't split by bedrooms, and ${s.d === 'H' ? 'houses use non-strata' : s.d === 'A' ? 'all dwellings use all sales' : 'units/townhouses use strata'} sales, so the rent and price dwelling mixes don't match exactly. Rent and sales are also from different quarters.` };
    case 'price': { const p = PRICE_FOR[s.d]; return { key: 'p_' + p, low: 'pl_' + p, fmt: priceFmt, title: `Median sale price · ${P_LABEL[p]}`,
      note: s.b !== 't' || s.d === 'T' ? `Sales data has no bedroom split and only Strata / Non-strata types, so this shows ${P_LABEL[p].toLowerCase()} sales.` : '' }; }
    case 'growth': return { key: 'rg_' + k, low: 'rl_' + k, fmt: sgn, div: true, title: `Rent change vs same quarter last year · ${D_LABEL[s.d]} · ${B_LABEL[s.b]}` };
    case 'income': return { key: 'c_hhinc', fmt: (v) => money(v) + '/wk', title: 'Median household income (Census 2021)', note: 'Census 2021 figure; dwelling and bedroom filters don\'t apply.' };
  }
}

function quantileBreaks(vals, n) {
  const s = [...vals].sort((a, b) => a - b), out = [];
  for (let i = 1; i < n; i++) out.push(s[Math.min(s.length - 1, Math.floor(i * s.length / n))]);
  return out;
}
const classOf = (v, breaks) => { let i = 0; while (i < breaks.length && v >= breaks[i]) i++; return i; };

function recolour() {
  const def = metricDef();
  const vals = Object.values(STATS).map((r) => r[def.key]).filter((v) => v != null);
  const breaks = def.div ? GROWTH_BREAKS : quantileBreaks(vals, SEQ.length);
  const colors = def.div ? DIV : SEQ;
  map.setPaintProperty('pc-fill', 'fill-color', ['case', ['<', ['coalesce', ['feature-state', 'ci'], -1], 0], '#bdbdbd',
    ['to-color', ['at', ['to-number', ['feature-state', 'ci']], ['literal', colors]]]]);
  for (const [poa, r] of Object.entries(STATS)) {
    const v = r[def.key];
    map.setFeatureState({ source: 'pc', sourceLayer: 'postcodes', id: poa },
      { ci: v == null ? -1 : classOf(v, breaks), low: !!(def.low && r[def.low]) });
  }
  drawLegend(def, breaks, colors, vals.length);
  $('note').textContent = def.note || '';
  history.replaceState(null, '', '?' + new URLSearchParams({ m: state.m, d: state.d, b: state.b, ...(selected ? { p: selected } : {}) }));
  if (selected) showPanel(selected);
}

function drawLegend(def, breaks, colors, n) {
  const lab = def.div ? ['', ...breaks.map((b) => (b > 0 ? '+' : '') + b + '%'), ''] : ['min', ...breaks.map(def.fmt), 'max'];
  $('legend').innerHTML = `<div class="lg-title">${def.title}</div>
    <div class="lg-bar">${colors.map((c) => `<span style="background:${c}"></span>`).join('')}</div>
    <div class="lg-labels">${def.div ? breaks.map((b) => `<span>${(b > 0 ? '+' : '') + b}%</span>`).join('') :
      [breaks[0], breaks[Math.floor(breaks.length / 2)], breaks[breaks.length - 1]].map((b) => `<span>${def.fmt(b)}</span>`).join('')}</div>
    <div class="lg-extra"><span><span class="sw" style="background:#bdbdbd"></span>No data / suppressed</span>
      <span><span class="sw" style="background:#fc8d59;opacity:.4"></span>Faded = small sample (11–30)</span></div>
    <div class="caveat">${def.div ? 'Fixed breaks' : 'Colours are 7 equal-count bands'} across ${n} postcodes with data.</div>`;
}

function rentMatrix(r) {
  const cols = ['A', 'U', 'H', 'T'];
  const head = '<tr><th>Beds</th>' + cols.map((c) => `<th>${D_LABEL[c]}</th>`).join('') + '</tr>';
  const rows = ['t', '1', '2', '3', '4'].map((b) => `<tr><td>${B_LABEL[b]}</td>` + cols.map((d) => {
    const k = d + b, v = r['r_' + k], sel = d === state.d && b === state.b ? ' class="sel"' : '';
    if (v == null) return `<td${sel}><span class="muted">–</span></td>`;
    return `<td${sel} title="12-month change ${sgn(r['rg_' + k])}${r['rn_' + k] ? ', ' + r['rn_' + k] + ' new bonds' : ''}"><span class="${r['rl_' + k] ? 'low' : ''}">$${v}${r['rl_' + k] ? '*' : ''}</span></td>`;
  }).join('') + '</tr>').join('');
  return `<table>${head}${rows}</table><div class="caveat">Median weekly rent for new bonds, ${META.rent_period}. * = 11–30 bonds (use with caution); – = 10 or fewer, suppressed. Hover a cell for 12-month change.</div>`;
}

function salesTable(r) {
  const rows = ['A', 'S', 'N'].map((s) => `<tr><td>${P_LABEL[s]}</td><td class="${r['pl_' + s] ? 'low' : ''}">${priceFmt(r['p_' + s])}${r['pl_' + s] ? '*' : ''}</td><td>${r['pn_' + s] ?? (r['pl_' + s] ? '11–30' : '–')}</td><td>${sgn(r['pg_' + s])}</td></tr>`).join('');
  return `<table><tr><th>Type</th><th>Median</th><th>Sales</th><th>12-mth</th></tr>${rows}</table><div class="caveat">${META.sales_period} contract dates. Recent quarters are revised up as late sales are lodged.</div>`;
}

let titleOverride = null;
function showPanel(poa) {
  const r = STATS[poa]; if (!r) return;
  if (selected !== poa) titleOverride = null;
  selected = poa;
  map.setFilter('pc-sel', ['==', ['get', 'poa'], poa]);
  const k = state.d + state.b, rent = r['r_' + k] ?? r['r_' + state.d + 't'] ?? r.r_At;
  const price = r['p_' + PRICE_FOR[state.d]] ?? r.p_A;
  const strataDef = state.d === 'H' ? 0 : 4000;
  $('panel').innerHTML = `<button class="x" onclick="closePanel()">×</button>
    <h2>${titleOverride || r.names[0] || 'Postcode ' + poa}</h2>
    <div class="sub">Postcode ${poa}${(() => { const t = titleOverride || r.names[0]; const o = r.names.filter((n) => n !== t); return o.length ? ' · also ' + o.join(', ') : ''; })()}</div>
    <div class="kv"><span>Gross yield (${D_LABEL[state.d]}, ${B_LABEL[state.b]})</span><b>${pct(r['y_' + k], 2)}${r['yl_' + k] ? '*' : ''}</b>
      <span>Bonds held (all rentals)</span><b>${r.held?.toLocaleString('en-AU') ?? '–'}</b></div>
    <h3>Rent by bedrooms</h3>${rentMatrix(r)}
    <h3>Sales</h3>${salesTable(r)}
    <h3>Census 2021</h3><div class="kv">
      <span>Population</span><b>${r.c_pop?.toLocaleString('en-AU') ?? '–'}</b>
      <span>Median age</span><b>${r.c_age ?? '–'}</b>
      <span>Median household income</span><b>${money(r.c_hhinc)}/wk</b>
      <span>Median rent (2021)</span><b>${money(r.c_rent)}/wk</b>
      <span>Avg household size</span><b>${r.c_hhsize ?? '–'}</b></div>
    <h3>Cash-flow calculator</h3>
    <div class="calc" id="calc">
      <label>Purchase price $<input id="c_price" type="number" step="10000" value="${Math.round(price || 0)}"></label>
      <label>Weekly rent $<input id="c_rent" type="number" step="10" value="${Math.round(rent || 0)}"></label>
      <label>Deposit %<input id="c_dep" type="number" step="1" value="20"></label>
      <label>Interest rate %<input id="c_rate" type="number" step="0.05" value="6.0"></label>
      <label>Loan type<select id="c_type"><option value="io">Interest only</option><option value="pi">P&amp;I, 30 yrs</option></select></label>
      <label>Strata $/yr<input id="c_strata" type="number" step="100" value="${strataDef}"></label>
      <label>Council + water $/yr<input id="c_council" type="number" step="100" value="2200"></label>
      <label>Land tax $/yr<input id="c_landtax" type="number" step="100" value="0"></label>
      <label>Insurance + repairs $/yr<input id="c_other" type="number" step="100" value="1500"></label>
      <label>Vacancy % of rent<input id="c_vac" type="number" step="0.5" value="4"></label>
      <label>Management % of rent<input id="c_mgmt" type="number" step="0.5" value="7.7"></label>
    </div>
    <div class="res" id="c_out"></div>
    <div class="caveat">Pre-tax, before depreciation and negative gearing; excludes stamp duty and buying costs. Prefilled with the selected postcode's medians; edit anything. Land tax depends on your total NSW land holdings.</div>`;
  $('panel').classList.remove('hidden');
  $('calc').addEventListener('input', calc); calc();
  history.replaceState(null, '', '?' + new URLSearchParams({ m: state.m, d: state.d, b: state.b, p: poa }));
}

function calc() {
  const g = (id) => parseFloat($(id).value) || 0;
  const price = g('c_price'), rentWk = g('c_rent'), loan = price * (1 - g('c_dep') / 100), i = g('c_rate') / 100;
  const income = rentWk * 52 * (1 - g('c_vac') / 100);
  const mgmt = income * g('c_mgmt') / 100;
  const n = 360, im = i / 12;
  const loanCost = $('c_type').value === 'io' ? loan * i : (im ? 12 * loan * im / (1 - Math.pow(1 + im, -n)) : loan / 30);
  const costs = g('c_strata') + g('c_council') + g('c_landtax') + g('c_other') + mgmt;
  const net = income - costs - loanCost, wk = net / 52;
  const gross = price ? rentWk * 52 / price * 100 : 0, netY = price ? (income - costs) / price * 100 : 0;
  $('c_out').innerHTML = `<div>Weekly cash flow <span class="big ${wk < 0 ? 'neg' : 'pos'}">${wk < 0 ? '−' : '+'}${money(Math.abs(wk))}</span></div>
    <div class="kv" style="margin-top:6px">
      <span>Rent received (after vacancy)</span><b>${money(income / 52)}/wk</b>
      <span>Loan ${money(loan)} ${$('c_type').value === 'io' ? 'interest' : 'repayments'}</span><b>−${money(loanCost / 52)}/wk</b>
      <span>Running costs incl. management</span><b>−${money(costs / 52)}/wk</b>
      <span>Gross / net yield</span><b>${pct(gross, 2)} / ${pct(netY, 2)}</b>
      <span>Annual cash flow</span><b>${net < 0 ? '−' : ''}${money(Math.abs(net))}</b></div>`;
}

function closePanel() { selected = null; $('panel').classList.add('hidden'); map.setFilter('pc-sel', ['==', ['get', 'poa'], '']); recolour(); }

function select(poa, fly = true, title = null) {
  const r = STATS[poa]; if (!r) return;
  titleOverride = null;
  if (fly) map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: { top: 60, bottom: 60, left: 360, right: 420 }, maxZoom: 12.5, duration: 800 });
  showPanel(poa);
  if (title) { titleOverride = title; showPanel(poa); }
}

function setupSearch() {
  const items = [];
  for (const r of Object.values(STATS)) {
    items.push({ label: `${r.poa} — ${r.names.slice(0, 3).join(', ')}`, poa: r.poa, key: r.poa });
    r.names.forEach((n) => items.push({ label: `${n} (${r.poa})`, poa: r.poa, key: n.toLowerCase(), name: n }));
  }
  const q = $('q'), ul = $('results');
  let hits = [], idx = 0;
  const render = () => { ul.innerHTML = hits.map((h, i) => `<li class="${i === idx ? 'on' : ''}" data-i="${i}">${h.label}</li>`).join(''); };
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase(); idx = 0;
    hits = !s ? [] : items.filter((it) => it.key.startsWith(s)).concat(items.filter((it) => !it.key.startsWith(s) && it.key.includes(s))).slice(0, 12);
    render();
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, hits.length - 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); render(); e.preventDefault(); }
    if (e.key === 'Enter' && hits[idx]) { select(hits[idx].poa, true, hits[idx].name); q.value = hits[idx].label; ul.innerHTML = ''; q.blur(); }
    if (e.key === 'Escape') ul.innerHTML = '';
  });
  ul.addEventListener('click', (e) => { const h = hits[e.target.dataset.i]; if (h) { select(h.poa, true, h.name); ul.innerHTML = ''; q.value = h.label; } });
}

async function init() {
  [STATS, META] = await Promise.all(['data/stats.json', 'data/meta.json'].map((u) => fetch(u).then((r) => r.json())));
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [151.0, -33.85], zoom: 9.3, hash: false });
  map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
  map.on('load', () => {
    const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    const tilesUrl = new URL('data/postcodes.pmtiles', location.href).href;
    map.addSource('pc', { type: 'vector', url: 'pmtiles://' + tilesUrl, promoteId: { postcodes: 'poa' },
      attribution: '© NSW DCJ Rent &amp; Sales Report (CC BY 4.0) · ABS ASGS &amp; Census 2021 (CC BY 4.0)' });
    map.addLayer({ id: 'pc-fill', type: 'fill', source: 'pc', 'source-layer': 'postcodes', paint: {
      'fill-color': '#bdbdbd',
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.92, ['<', ['coalesce', ['feature-state', 'ci'], -1], 0], 0.25,
        ['boolean', ['feature-state', 'low'], false], 0.4, 0.75] } }, firstLabel);
    map.addLayer({ id: 'pc-line', type: 'line', source: 'pc', 'source-layer': 'postcodes',
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.2, 12, 1.2] } }, firstLabel);
    map.addLayer({ id: 'pc-sel', type: 'line', source: 'pc', 'source-layer': 'postcodes', filter: ['==', ['get', 'poa'], ''],
      paint: { 'line-color': '#1a237e', 'line-width': 3 } });
    recolour();
    if (state.p) select(state.p);
    window.mapReady = true;
  });
  const tip = $('tip');
  map.on('mousemove', 'pc-fill', (e) => {
    const f = e.features[0], poa = f.properties.poa, r = STATS[poa] || { names: [] }, def = metricDef();
    if (hoverId !== poa) {
      if (hoverId) map.setFeatureState({ source: 'pc', sourceLayer: 'postcodes', id: hoverId }, { hover: false });
      hoverId = poa; map.setFeatureState({ source: 'pc', sourceLayer: 'postcodes', id: poa }, { hover: true });
    }
    map.getCanvas().style.cursor = 'pointer';
    tip.innerHTML = `<b>${r.names.slice(0, 2).join(', ') || 'Postcode'} ${poa}</b><br>${def.fmt(r[def.key])}${def.low && r[def.low] ? ' (small sample)' : ''}`;
    tip.style.left = e.point.x + 14 + 'px'; tip.style.top = e.point.y + 14 + 'px'; tip.classList.remove('hidden');
  });
  map.on('mouseleave', 'pc-fill', () => {
    if (hoverId) map.setFeatureState({ source: 'pc', sourceLayer: 'postcodes', id: hoverId }, { hover: false });
    hoverId = null; tip.classList.add('hidden'); map.getCanvas().style.cursor = '';
  });
  map.on('click', 'pc-fill', (e) => select(e.features[0].properties.poa, false));

  for (const id of ['metric', 'dwelling', 'beds']) {
    const key = { metric: 'm', dwelling: 'd', beds: 'b' }[id];
    $(id).value = state[key];
    $(id).addEventListener('change', () => { state[key] = $(id).value; recolour(); });
  }
  setupSearch();
  $('foot').innerHTML = `Rents: ${META.rent_period} · Sales: ${META.sales_period}<br>Data: <a href="https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html" target="_blank">© State of NSW (DCJ) Rent &amp; Sales Report</a>, CC BY 4.0; boundaries &amp; Census © ABS, CC BY 4.0. Medians are aggregates, not valuations. Not financial advice.`;
}
init();
