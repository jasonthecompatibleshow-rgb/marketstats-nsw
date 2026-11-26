/* Map page. Geometry from PMTiles; values applied via feature-state from stats.json / tsk/*.json. */
const { D_LABEL, D_LONG, B_LABEL, PRICE_FOR, P_LABEL, RAMPS, $, money, priceFmt, pct, sgn, sgnMoney } = HM;
let STATS, META, CFG, map, hoverId = null, selected = null, titleOverride = null, playing = null, charts = [];
const isMobile = () => matchMedia('(max-width:760px)').matches;
const params = Object.fromEntries(new URLSearchParams(location.search));
const state = { m: 'rent', d: 'A', b: 't', tab: 'overview', ...params };
const userAssump = { rate: null, lvr: null, repay: null };   // quick overrides for cash/gearing map metrics
// ---------- free-account gating: logged-out visitors get the headline view (All dwellings / All beds, latest quarter) ----------
const OPEN_METRICS = ['rent', 'yield', 'price', 'cash', 'gearing', 'income'];
const member = () => !!(window.MSAuth && MSAuth.isMember());
// effective state: what is shown. `state` keeps what the URL asked for, so signing in restores it without losing your place.
const S = () => member() ? state : { ...state, d: 'A', b: 't', m: OPEN_METRICS.includes(state.m) ? state.m : 'rent' };
const LOCK_MSG = { d: 'Create a free account to filter by units, houses and townhouses.', b: 'Create a free account for bedroom-level rents and yields.', m: 'Create a free account for 1- and 5-year rent change maps.',
  time: 'Create a free account to scroll back through 9 years of quarterly history.', trends: 'Create a free account to see 9 years of rent, price and yield trends.',
  calc: 'Create a free account to run the full calculator with your own loan, costs and tax rate.' };
function gatedHost(title, text) {   // render into the tab body, or into a blurred, locked preview when logged out
  if (member()) return $('tabBody');
  $('tabBody').innerHTML = `<div class="p-sec">${MSAuth.lock('<div id="gatedHost"></div>', { title, text, reason: text })}</div>`;
  return $('gatedHost');
}
function applyGates() {
  const m = member();
  document.querySelectorAll('#metric button').forEach((b) => b.classList.toggle('lockd', !m && !OPEN_METRICS.includes(b.dataset.v)));
  document.querySelectorAll('#dwelling button').forEach((b) => b.classList.toggle('lockd', !m && b.dataset.v !== 'A'));
  document.querySelectorAll('#beds button').forEach((b) => b.classList.toggle('lockd', !m && b.dataset.v !== 't'));
  for (const id of ['metric', 'dwelling', 'beds']) { const key = { metric: 'm', dwelling: 'd', beds: 'b' }[id]; $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === S()[key])); }
  $('timeBox').classList.toggle('gated', !m);
  $('timeLock').hidden = m;
}

function metricDef(s = S()) {
  const k = s.d + s.b, p = PRICE_FOR[s.d];
  switch (s.m) {
    case 'rent': return { key: 'r_' + k, low: 'rl_' + k, tsk: 'r_' + k, fmt: (v) => money(v) + '/wk', ramp: RAMPS.rent, title: `Median weekly rent · ${D_LONG[s.d]} · ${B_LABEL[s.b]}` };
    case 'yield': return { key: 'y_' + k, low: 'yl_' + k, tsk: 'y_' + k, fmt: (v) => pct(v, 2), ramp: RAMPS.yield, title: `Gross rental yield · ${D_LONG[s.d]} · ${B_LABEL[s.b]}`,
      note: `Rent × 52 ÷ median sale price. Sales have no bedroom split; ${s.d === 'H' ? 'houses use non-strata' : s.d === 'A' ? 'all dwellings use all' : 'units & townhouses use strata'} sales. History uses same-quarter rent and price.` };
    case 'price': return { key: 'p_' + p, low: 'pl_' + p, tsk: 'p_' + p, fmt: priceFmt, ramp: RAMPS.price, title: `Median sale price · ${P_LABEL[p]}`,
      note: s.b !== 't' || s.d === 'T' ? `Sales are only split into strata / non-strata, so this shows ${P_LABEL[p].toLowerCase()} sales for every bedroom count.` : '' };
    case 'growth': return { key: 'rg_' + k, low: 'rl_' + k, fmt: (v) => sgn(v), ramp: RAMPS.growth, fixed: [-10, -5, -2, 0, 2, 5, 10], title: `Rent change, 12 months · ${D_LONG[s.d]} · ${B_LABEL[s.b]}` };
    case 'growth5': return { key: 'r5_' + k, low: 'rl_' + k, fmt: (v) => sgn(v), ramp: RAMPS.price, title: `Rent change, 5 years · ${D_LONG[s.d]} · ${B_LABEL[s.b]}`, note: `${META.qlabels[META.quarters.indexOf(META.rent_q) - 20]} → ${META.qlabels[META.quarters.indexOf(META.rent_q)]}, median new-bond rents.` };
    case 'cash': return { key: 'cash', fmt: (v) => sgnMoney(v) + '/wk', ramp: RAMPS.cash, fixed: [-600, -400, -200, -20, 20, 100, 200], computed: true,
      title: `Pre-tax weekly cash flow · typical investor · ${D_LONG[s.d]} · ${B_LABEL[s.b]}`, assump: true };
    case 'gearing': return { key: 'gearing', fmt: (v) => `${HM.gearTier(v, CFG.neutral_band_weekly)} · ${sgnMoney(v)}/wk tax result`, tick: (v) => sgnMoney(v), ramp: RAMPS.gearing, fixed: HM.GEAR_BREAKS, computed: true,
      title: `Gearing · weekly rental tax result · typical investor · ${D_LONG[s.d]} · ${B_LABEL[s.b]}`, assump: true,
      note: `<div style="margin-bottom:6px">Rent received − costs − interest, per week. <b style="color:${RAMPS.gearing[2]}">Orange</b> = negatively geared (darker = bigger shortfall), grey = neutral (±$${CFG.neutral_band_weekly}/wk), <b style="color:${RAMPS.gearing[7]}">green</b> = positively geared. Hover a postcode for its break-even rate.</div>` };
    case 'income': return { key: 'c_hhinc', fmt: (v) => money(v) + '/wk', ramp: RAMPS.income, title: 'Median household income · Census 2021', note: 'Census 2021. Dwelling and bedroom filters don\'t apply.' };
  }
}

function assumptions() {
  return { rate: userAssump.rate ?? CFG.rate.value, lvr: userAssump.lvr ?? CFG.lvr_pct, repay: userAssump.repay ?? CFG.repayment };
}
function breakEvenFor(r, d = S().d, b = S().b) {
  const x = HM.typical(CFG, r, d, b); if (!x) return null;
  Object.assign(x, assumptions()); return HM.breakEven(x, CFG);
}
function typicalResult(r, d = S().d, b = S().b) {
  const x = HM.typical(CFG, r, d, b); if (!x) return null;
  Object.assign(x, assumptions());
  return HM.evaluate(x, CFG);
}

let tskData = {};
async function loadTsk(name) { if (!tskData[name]) tskData[name] = await HM.load(`data/tsk/${name}.json`); return tskData[name]; }
const lastQ = () => META.quarters.length - 1;
let qi = params.qi != null ? +params.qi : null;

function currentValues(def) {
  const vals = {}, low = {};
  for (const [poa, r] of Object.entries(STATS)) {
    let v = r[def.key];
    if (def.computed) {
      const res = typicalResult(r);
      v = res == null ? null : def.key === 'cash' ? res.weekly : res.taxableWeekly;
    }
    vals[poa] = v ?? null;
    if (def.low && r[def.low]) low[poa] = 1;
  }
  return { vals, low };
}

async function recolour(panel = true) {
  const def = metricDef();
  const cur = currentValues(def);
  const breaks = def.fixed || HM.quantileBreaks(Object.values(cur.vals), def.ramp.length);
  let shown = cur;
  const timeOK = !!def.tsk;
  $('timeBox').classList.toggle('disabled', !timeOK);
  if (timeOK && member() && qi != null && qi < lastQ()) {
    const t = await loadTsk(def.tsk);
    shown = { vals: Object.fromEntries(Object.keys(STATS).map((p) => [p, t[p]?.[qi] ?? null])), low: {} };
  }
  HM.paint(map, shown.vals, breaks, def.ramp, shown.low);
  drawLegend(def, breaks, Object.values(shown.vals).filter((v) => v != null).length);
  $('tLabel').textContent = !timeOK ? 'n/a' : !member() || qi == null || qi >= lastQ() ? 'Latest' : META.qlabels[qi];
  $('note').innerHTML = (def.note || '') + (def.assump ? assumpForm() : '');
  if (def.assump) wireAssumpForm();
  syncUrl();
  if (selected && panel && !playing) renderPanel(selected, false);
}

function assumpForm() {
  const a = assumptions();
  return `<div style="margin-bottom:6px">Typical investor: median price, ${a.lvr}% LVR, ${a.repay === 'io' ? 'interest-only' : 'P&I ' + CFG.term_years + ' yrs'}, standard costs. <a href="#" id="showAssump">Assumptions</a></div>
    <div class="calc-grid" style="gap:6px"><label class="field">Rate %<input class="input" id="qa_rate" type="number" step="0.05" value="${a.rate}"></label>
    <label class="field">LVR %<input class="input" id="qa_lvr" type="number" step="5" value="${a.lvr}"></label>
    <label class="field full">Repayments<div class="seg" id="qa_repay"><button data-v="pi" class="${a.repay === 'pi' ? 'on' : ''}">P&amp;I</button><button data-v="io" class="${a.repay === 'io' ? 'on' : ''}">Interest only</button></div></label></div>
    <div class="small faint" style="margin-top:6px">Default rate ${CFG.rate.value}% = RBA F6 new investor variable loans, ${new Date(CFG.rate.date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}. Not financial advice.</div>`;
}
function wireAssumpForm() {
  const upd = () => { userAssump.rate = parseFloat($('qa_rate').value) || CFG.rate.value; userAssump.lvr = parseFloat($('qa_lvr').value) || CFG.lvr_pct; recolourSoon(); };
  $('qa_rate').addEventListener('change', upd); $('qa_lvr').addEventListener('change', upd);
  $('qa_repay').addEventListener('click', (e) => { const v = e.target.dataset.v; if (v) { userAssump.repay = v; recolour(); } });
  $('showAssump').addEventListener('click', (e) => { e.preventDefault(); if (!selected) { const first = '2127'; select(first); } state.tab = 'calc'; renderPanel(selected); });
}
let rcT; const recolourSoon = (panel = true) => { clearTimeout(rcT); rcT = setTimeout(() => recolour(panel), 120); };

function drawLegend(def, breaks, n) {
  let body;
  if (def.cats) {
    const lab = ['Negatively geared (< −$' + CFG.neutral_band_weekly + '/wk tax result)', 'Neutral (±$' + CFG.neutral_band_weekly + '/wk)', 'Positively geared (> +$' + CFG.neutral_band_weekly + '/wk)'];
    body = `<div class="lg-cats">${def.ramp.map((c, i) => `<div><span class="sw" style="background:${c}"></span>${lab[i]}</div>`).join('')}</div>`;
  } else {
    const tf = def.tick || ((b) => def.fmt(b).replace('/wk', ''));
    const ticks = def.fixed ? def.fixed.map(tf) : [breaks[0], breaks[Math.floor(breaks.length / 2)], breaks[breaks.length - 1]].map((b) => def.fmt(b).replace('/wk', ''));
    body = `<div class="lg-bar">${def.ramp.map((c) => `<span style="background:${c}"></span>`).join('')}</div>
      <div class="lg-labels">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>`;
  }
  $('legend').innerHTML = `<div class="lg-title">${def.title}</div>${body}
    <div class="lg-extra"><span><i style="background:${HM.theme() === 'dark' ? '#334155' : '#cbd5e1'}"></i>No data / suppressed</span>${def.low ? '<span><i style="background:' + def.ramp[4] + ';opacity:.45"></i>Faded = 11–30 obs.</span>' : ''}<span>${n} postcodes</span></div>`;
}

// ---------- panel ----------
function rentMatrix(r) {
  const cols = ['A', 'U', 'H', 'T'];
  return `<table class="t"><tr><th>Beds</th>${cols.map((c) => `<th>${D_LABEL[c]}</th>`).join('')}</tr>` + ['t', '1', '2', '3', '4'].map((b) => `<tr><td>${B_LABEL[b]}</td>` + cols.map((d) => {
    const k = d + b, v = r['r_' + k], sel = d === S().d && b === S().b ? ' class="sel"' : '';
    if (v == null) return `<td${sel}><span class="faint">–</span></td>`;
    return `<td${sel} title="12-month change ${sgn(r['rg_' + k])}"><span class="${r['rl_' + k] ? 'low' : ''}">$${v}${r['rl_' + k] ? '*' : ''}</span></td>`;
  }).join('') + '</tr>').join('') + `</table><div class="caveat">Median weekly rent, new bonds, ${META.rent_period}. * 11–30 bonds; – 10 or fewer (suppressed).</div>`;
}
function salesTable(r) {
  return `<table class="t"><tr><th>Type</th><th>Median</th><th>Sales</th><th>12 mth</th></tr>` + ['A', 'S', 'N'].map((s) => `<tr><td>${P_LABEL[s]}</td><td class="${r['pl_' + s] ? 'low' : ''}">${priceFmt(r['p_' + s])}${r['pl_' + s] ? '*' : ''}</td><td>${r['pn_' + s] ?? (r['pl_' + s] ? '11–30' : '–')}</td><td class="${(r['pg_' + s] || 0) >= 0 ? 'up' : 'down'}">${sgn(r['pg_' + s])}</td></tr>`).join('') +
    `</table><div class="caveat">${META.sales_period}, by contract date; recent quarters get revised up as late sales are lodged.</div>`;
}

function renderPanel(poa, scrollTop = true) {
  const r = STATS[poa]; if (!r) return;
  if (selected !== poa) titleOverride = titleOverride && r.names.includes(titleOverride) ? titleOverride : null;
  selected = poa;
  map.setFilter('pc-sel', ['==', ['get', 'poa'], poa]);
  const k = S().d + S().b, title = titleOverride || r.names[0] || 'Postcode ' + poa;
  const others = r.names.filter((n) => n !== title);
  const res = typicalResult(r);
  const be = res ? breakEvenFor(r) : null;
  const g = res ? `<div class="gear-row">${HM.gearPill(res.gearing)}<span class="small muted">${sgnMoney(res.taxableWeekly)}/wk tax result${be != null ? ` · break-even rate <b>${pct(be, 2)}</b>` : ''}</span></div>` : '<span class="pill neu">Gearing n/a for this mix</span>';
  $('panelBody').innerHTML = `<div class="p-head">
      <button class="icon-btn x" id="closeP" aria-label="Close">✕</button>
      <h2>${title}</h2><div class="sub">NSW ${poa}${others.length ? ' · ' + others.join(', ') : ''}</div>
      <div class="kpis">
        <div class="kpi"><div class="k">Rent · ${D_LABEL[S().d]} ${S().b === 't' ? '' : B_LABEL[S().b]}</div><div class="v">${r['r_' + k] ? '$' + r['r_' + k] : '–'}</div><div class="d ${(r['rg_' + k] || 0) >= 0 ? 'up' : 'down'}">${r['rg_' + k] != null ? sgn(r['rg_' + k]) + ' 1y' : '&nbsp;'}</div></div>
        <div class="kpi"><div class="k">Gross yield</div><div class="v">${pct(r['y_' + k], 2)}${r['yl_' + k] ? '*' : ''}</div><div class="d faint">${priceFmt(r['p_' + PRICE_FOR[S().d]])} median</div></div>
        <div class="kpi"><div class="k">Cash flow</div><div class="v ${res && res.weekly < 0 ? 'down' : 'up'}">${res ? sgnMoney(res.weekly) : '–'}</div><div class="d faint">per week, pre-tax</div></div>
      </div>${g}
      <div class="tabs" id="tabs"><button data-t="overview">Overview</button><button data-t="trends">Trends</button><button data-t="calc">Calculator</button></div>
    </div><div id="tabBody"></div>`;
  $('closeP').onclick = closePanel;
  $('tabs').querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.t === state.tab); b.classList.toggle('lockd', !member() && b.dataset.t !== 'overview'); b.onclick = () => { state.tab = b.dataset.t; renderPanel(poa); if (isMobile()) $('panel').classList.remove('peek'); }; });
  charts.forEach((c) => c.destroy()); charts = [];
  if (state.tab === 'overview') renderOverview(r);
  else if (state.tab === 'trends') renderTrends(poa);
  else renderCalc(r);
  const p = $('panel'); p.classList.remove('hidden');
  if (scrollTop) p.scrollTop = 0;
  syncUrl();
}

let AIHW = null;
async function aihwSection(poa) {
  try { AIHW = AIHW || await HM.load('data/aihw.json'); } catch (e) { return; }
  const el = $('sa2ctx'); if (!el || selected !== poa) return;
  const L = AIHW.sa2[poa];
  const st = AIHW.state.cra_stress, n = st.years.length - 1;
  const html = `<h3>Rent Assistance nearby · AIHW</h3>
    <div class="caveat" style="margin:0 0 8px"><span class="pill neu">SA2-level, not postcode</span> Income units receiving Commonwealth Rent Assistance in ABS SA2 areas overlapping this postcode, at June. SA2 and postcode boundaries differ, so these are not added up.</div>
    ${L ? `<table class="t"><tr><th>SA2 area</th><th>Overlap</th><th>2023</th><th>2025</th><th>Change</th></tr>${L.map((a) => `<tr><td>${a[1]}</td><td class="faint">${Math.round(a[2] * 100)}%</td><td>${a[3]?.toLocaleString('en-AU') ?? '–'}</td><td>${a[5]?.toLocaleString('en-AU') ?? '–'}</td><td class="${a[5] >= a[3] ? 'up' : 'down'}">${a[3] ? sgn(100 * (a[5] / a[3] - 1)) : '–'}</td></tr>`).join('')}</table>` : '<div class="empty">No SA2 Rent Assistance figures for this postcode.</div>'}
    <div class="caveat">NSW state-wide, ${st.nsw[n]}% of Rent Assistance recipients were in rental stress in June ${st.years[n]} (state-level). ${AIHW.meta.cra_attribution} CC BY 4.0. Counts rounded to the nearest 5 by AIHW.</div>`;
  el.innerHTML = member() ? html : `<h3>Rent Assistance nearby · AIHW</h3>` + MSAuth.lock(html.replace(/^<h3>.*?<\/h3>/, ''), { title: 'SA2-level Rent Assistance', text: 'Free account: AIHW Rent Assistance counts for the SA2 areas around this postcode.', reason: 'Create a free account for SA2-level AIHW housing data.' });
}
function renderOverview(r) {
  $('tabBody').innerHTML = `<div class="p-sec"><h3>Rent by bedrooms</h3>${member() ? rentMatrix(r) : MSAuth.lock(rentMatrix(r), { title: 'Bedroom-level rents', text: 'Free account: rent for units, houses and townhouses by 1, 2, 3 and 4+ bedrooms.', reason: LOCK_MSG.b })}</div>
    <div class="p-sec"><h3>Sales</h3>${salesTable(r)}</div>
    <div class="p-sec"><h3>People · Census 2021</h3><div class="kv">
      <span>Population</span><b>${r.c_pop?.toLocaleString('en-AU') ?? '–'}</b><span>Median age</span><b>${r.c_age ?? '–'}</b>
      <span>Median household income</span><b>${money(r.c_hhinc)}/wk</b><span>Median rent paid (2021)</span><b>${money(r.c_rent)}/wk</b>
      <span>Average household size</span><b>${r.c_hhsize ?? '–'}</b><span>Rental bonds held now</span><b>${r.held?.toLocaleString('en-AU') ?? '–'}</b></div></div>
    <div class="p-sec" id="sa2ctx"></div>`;
  aihwSection(selected);
}

// ---------- trends ----------
const qToTs = (q) => Date.UTC(+q.slice(0, 4), (+q.slice(-1)) * 3 - 2, 15) / 1000;
async function renderTrends(poa) {
  gatedHost('9 years of trends', LOCK_MSG.trends).innerHTML = `<div class="p-sec"><h3>Median weekly rent · ${D_LONG[S().d]}</h3><div class="chart" id="ch1"></div>
    <h3>Median sale price</h3><div class="chart" id="ch2"></div>
    <h3>Gross yield · ${D_LONG[S().d]}</h3><div class="chart" id="ch3"></div>
    <div class="caveat">Quarterly medians from ${META.n_quarters_rent} DCJ Rent &amp; Sales reports (rents ${META.qlabels[META.quarters.indexOf(META.rent_first)]}–${META.qlabels[META.quarters.indexOf(META.rent_q)]}). Small samples make individual quarters noisy; a few isolated spikes (&gt;2.5× neighbours) are removed. Yield uses same-quarter rent and price.</div></div>`;
  const ts = await HM.load(`data/ts/${poa}.json`);
  if (selected !== poa || state.tab !== 'trends') return;
  const x = META.quarters.map(qToTs);
  const w = Math.max(260, $('ch1').clientWidth || 380);
  const dark = HM.theme() === 'dark', axis = { stroke: dark ? '#9aa4b8' : '#5b6477', grid: { stroke: dark ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)' }, ticks: { show: false }, font: '11px Inter' };
  const pal = ['#4f46e5', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444'];
  const mk = (el, series, fmt) => {
    if (!series.length) { $(el).innerHTML = '<div class="faint small">Not enough data.</div>'; return; }
    charts.push(new uPlot({ width: w, height: 170, cursor: { points: { size: 6 } }, legend: { live: false },
      scales: { x: { time: true } },
      axes: [{ ...axis, values: (u, v) => v.map((t) => "'" + String(new Date(t * 1000).getUTCFullYear()).slice(2)) }, { ...axis, size: 52, values: (u, v) => v.map(fmt) }],
      series: [{ value: (u, v) => v == null ? '–' : META.qlabels[META.quarters.map(qToTs).indexOf(v)] || '' },
        ...series.map((s, i) => ({ label: s.label, stroke: s.color || pal[i], width: s.w || 1.8, spanGaps: true, points: { show: false }, value: (u, v) => v == null ? '–' : fmt(v) }))] },
      [x, ...series.map((s) => s.data)], $(el)));
  };
  const rs = ['t', '1', '2', '3', '4'].map((b, i) => ts.r[S().d + b] && { label: B_LABEL[b], data: ts.r[S().d + b], color: i === 0 ? (dark ? '#e6e9f2' : '#0f172a') : pal[i], w: i === 0 ? 2.4 : 1.5 }).filter(Boolean);
  mk('ch1', rs, (v) => '$' + Math.round(v));
  mk('ch2', ['A', 'S', 'N'].map((s, i) => ts.p[s] && { label: P_LABEL[s], data: ts.p[s], color: [dark ? '#e6e9f2' : '#0f172a', '#06b6d4', '#f59e0b'][i] }).filter(Boolean), (v) => v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'm' : '$' + Math.round(v / 1000) + 'k');
  mk('ch3', [...new Set([S().d + S().b, S().d + 't'])].map((k, i) => ts.y[k] && { label: B_LABEL[k[1]], data: ts.y[k], color: ['#22c55e', '#4f46e5'][i] }).filter(Boolean), (v) => v.toFixed(1) + '%');
}

// ---------- calculator ----------
function renderCalc(r) {
  const x = HM.typical(CFG, r, S().d, S().b) || HM.typical(CFG, r, S().d, 't') || HM.typical(CFG, r, 'A', 't') ||
    { price: 800000, rent: 700, lvr: CFG.lvr_pct, rate: CFG.rate.value, term: CFG.term_years, repay: CFG.repayment, vacWeeks: CFG.vacancy_weeks, mgmtPct: CFG.mgmt_pct, maintPct: CFG.maintenance_pct, ...CFG.costs[S().d], landTax: 0, deprec: 0, taxRate: 37, medicare: CFG.medicare_pct };
  Object.assign(x, assumptions());
  const f = (id, label, v, step = 1, extra = '') => `<label class="field ${extra}">${label}<input class="input num" id="${id}" type="number" step="${step}" value="${v}"></label>`;
  const rateDate = new Date(CFG.rate.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  gatedHost('Full investment calculator', LOCK_MSG.calc).innerHTML = `<div class="p-sec" id="calc">
    <div class="small muted">Prefilled with this postcode's medians (${D_LONG[S().d]}, ${B_LABEL[S().b]}) and the typical-investor assumptions. Change anything.</div>
    <div class="calc-grp">Purchase &amp; loan</div>
    <div class="calc-grid">
      ${f('c_price', 'Purchase price $', Math.round(x.price), 10000)}${f('c_lvr', 'LVR % (deposit ' + (100 - x.lvr) + '%)', x.lvr, 1)}
      ${f('c_loan', 'Loan amount $', Math.round(x.price * x.lvr / 100), 5000)}${f('c_rate', 'Interest rate % p.a.', x.rate, 0.05)}
      ${f('c_term', 'Loan term (years)', x.term, 1)}
      <label class="field">Repayments<div class="seg" id="c_repay"><button data-v="pi" class="${x.repay === 'pi' ? 'on' : ''}">P&amp;I</button><button data-v="io" class="${x.repay === 'io' ? 'on' : ''}">IO</button></div></label>
    </div>
    <div class="calc-grp">Income</div>
    <div class="calc-grid">${f('c_rent', 'Weekly rent $', Math.round(x.rent), 10)}${f('c_vac', 'Vacancy (weeks/yr)', x.vacWeeks, 0.5)}</div>
    <div class="calc-grp">Costs (per year)</div>
    <div class="calc-grid">
      ${f('c_mgmt', 'Management % of rent', x.mgmtPct, 0.1)}${f('c_maint', 'Maintenance % of rent', x.maintPct, 0.5)}
      ${f('c_strata', 'Strata levies $', x.strata, 100)}${f('c_council', 'Council + water $', x.council, 100)}
      ${f('c_ins', 'Insurance $', x.insurance, 100)}${f('c_landval', 'Land value $ (for land tax)', '', 10000)}
      ${f('c_landtax', 'Land tax $', x.landTax, 100)}${f('c_dep', 'Depreciation $ (tax only)', 0, 500)}
    </div>
    <div class="calc-grp">Tax estimate</div>
    <label class="field">Your marginal tax rate (+2% Medicare)<div class="seg" id="c_tax">${CFG.tax_rates.map((t) => `<button data-v="${t}" class="${t === 37 ? 'on' : ''}">${t}%</button>`).join('')}</div></label>
    <div class="res-detail" id="c_detail"></div>
    <details style="margin-top:14px"><summary>Assumptions &amp; sources</summary><div class="small muted" style="margin-top:8px;display:grid;gap:6px">
      <div><b>Rate</b> ${CFG.rate.value}% — RBA Table F6 (${CFG.rate.series}), new investor variable-rate loans funded, all institutions, ${rateDate}. <a href="${CFG.rate.url}" target="_blank" rel="noopener">RBA</a></div>
      <div><b>Deposit</b> ${100 - CFG.lvr_pct}% / ${CFG.lvr_pct}% LVR. ${CFG.lvr_note} <a href="${CFG.lvr_source}" target="_blank" rel="noopener">APRA</a></div>
      <div><b>Repayments</b> ${CFG.repayment_note}</div>
      <div><b>Costs</b> ${CFG.mgmt_note} ${CFG.maintenance_note} Vacancy ${CFG.vacancy_weeks} weeks/yr. ${CFG.costs_note}</div>
      <div><b>Land tax</b> ${CFG.land_tax.note} <a href="${CFG.land_tax.source}" target="_blank" rel="noopener">Revenue NSW</a></div>
      <div><b>Gearing</b> ${CFG.gearing_note}</div><div><b>Tax</b> ${CFG.tax_note}</div></div></details>
    <div class="disclaimer" style="margin-top:12px">General information only, not financial advice. Medians aren't valuations; your property, loan and tax position will differ. Excludes stamp duty and purchase costs.</div>
    <button class="btn btn-ghost btn-sm" id="c_reset" style="margin-top:10px">Reset to typical</button>
    <div class="res" id="c_out"></div></div>`;
  let repay = x.repay, taxRate = 37;
  const g = (id) => parseFloat($(id).value) || 0;
  const run = () => {
    const inp = { price: g('c_price'), rent: g('c_rent'), loan: g('c_loan'), lvr: g('c_lvr'), rate: g('c_rate'), term: Math.max(1, g('c_term')), repay,
      vacWeeks: g('c_vac'), mgmtPct: g('c_mgmt'), maintPct: g('c_maint'), strata: g('c_strata'), council: g('c_council'), insurance: g('c_ins'),
      landTax: g('c_landtax'), deprec: g('c_dep'), taxRate, medicare: CFG.medicare_pct };
    const o = HM.evaluate(inp, CFG);
    $('c_out').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">${HM.gearPill(o.gearing)}<span class="small faint">pre-tax</span></div>
      <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px;flex-wrap:wrap"><span class="big ${o.weekly < 0 ? 'neg' : 'pos'}" style="font-size:28px;font-weight:800">${sgnMoney(o.weekly)}</span><span class="muted">/ week · ${sgnMoney(o.cash)} / year</span><span class="small ${o.afterTaxWeekly < 0 ? 'down' : 'up'}">after-tax est. ${sgnMoney(o.afterTaxWeekly)}/wk</span></div>`;
    $('c_detail').innerHTML = `<div class="res-grid">
        <span>After-tax est. @${taxRate}%<b class="${o.afterTaxWeekly < 0 ? 'down' : 'up'}">${sgnMoney(o.afterTaxWeekly)}/wk</b></span>
        <span>${o.tax >= 0 ? 'Tax refund est.' : 'Extra tax est.'}<b>${money(Math.abs(o.tax))}/yr</b></span>
        <span>Rental tax result<b>${sgnMoney(o.taxable)}/yr</b></span>
        <span>Gross / net yield<b>${pct(o.grossYield, 2)} / ${pct(o.netYield, 2)}</b></span>
        <span>Interest (yr 1)<b>${money(o.interest)}</b></span>
        <span>Principal (yr 1)<b>${money(o.principal)}</b></span>
        <span>Rent received<b>${money(o.received)}</b></span>
        <span>Running costs<b>${money(o.expenses)}</b></span></div>`;
  };
  const calc = $('calc');
  calc.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'c_lvr' || id === 'c_price') $('c_loan').value = Math.round(g('c_price') * g('c_lvr') / 100);
    if (id === 'c_loan' && g('c_price')) $('c_lvr').value = (100 * g('c_loan') / g('c_price')).toFixed(1);
    if (id === 'c_landval') $('c_landtax').value = Math.round(HM.landTax(CFG, g('c_landval')));
    run();
  });
  $('c_repay').addEventListener('click', (e) => { if (e.target.dataset.v) { repay = e.target.dataset.v; $('c_repay').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === repay)); run(); } });
  $('c_tax').addEventListener('click', (e) => { if (e.target.dataset.v) { taxRate = +e.target.dataset.v; $('c_tax').querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v === taxRate)); run(); } });
  $('c_reset').onclick = () => renderPanel(selected, false);
  run();
}

function closePanel() { selected = null; titleOverride = null; $('panel').classList.add('hidden'); map.setFilter('pc-sel', ['==', ['get', 'poa'], '']); syncUrl(); }
function select(poa, fly = true, title = null) {
  const r = STATS[poa]; if (!r) return;
  titleOverride = title;
  if (fly) map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: isMobile() ? { top: 140, bottom: 220, left: 30, right: 30 } : { top: 90, bottom: 60, left: 380, right: 450 }, maxZoom: 12.5, duration: 900 });
  renderPanel(poa);
  if (isMobile()) $('panel').classList.add('peek');
}
function syncUrl() {
  const p = { m: state.m, d: state.d, b: state.b }; if (selected) { p.p = selected; p.tab = state.tab; } if (qi != null && qi < lastQ()) p.qi = qi;
  history.replaceState(null, '', '?' + new URLSearchParams(p));
}

function setupSearch() {
  const items = [];
  for (const r of Object.values(STATS)) {
    items.push({ label: r.names.slice(0, 2).join(', ') || 'Postcode', pc: r.poa, poa: r.poa, key: r.poa });
    r.names.forEach((n) => items.push({ label: n, pc: r.poa, poa: r.poa, key: n.toLowerCase(), name: n }));
  }
  const q = $('q'), ul = $('results'); let hits = [], idx = 0;
  const render = () => { ul.innerHTML = hits.map((h, i) => `<li class="${i === idx ? 'on' : ''}" data-i="${i}"><span>${h.label}</span><span class="pc">${h.pc}</span></li>`).join(''); };
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase(); idx = 0;
    hits = !s ? [] : items.filter((it) => it.key.startsWith(s)).concat(items.filter((it) => !it.key.startsWith(s) && it.key.includes(s))).slice(0, 10);
    render();
  });
  const pick = (h) => { select(h.poa, true, h.name || null); q.value = (h.name || h.label) + ' ' + h.pc; ul.innerHTML = ''; q.blur(); };
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, hits.length - 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); render(); e.preventDefault(); }
    if (e.key === 'Enter' && hits[idx]) pick(hits[idx]);
    if (e.key === 'Escape') ul.innerHTML = '';
  });
  ul.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) pick(hits[li.dataset.i]); });
}

function setSeg(id, key) {
  const el = $(id);
  const paintSeg = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === S()[key]));
  paintSeg();
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button'), v = btn && btn.dataset.v; if (!v) return;
    if (btn.classList.contains('lockd')) { MSAuth.open('signup', LOCK_MSG[key]); return; }
    state[key] = v; paintSeg(); recolour();
  });
}

function buildMap() {
  const center = map ? map.getCenter() : [151.0, -33.84], zoom = map ? map.getZoom() : 9.4;
  if (map) map.remove();
  map = new maplibregl.Map({ container: 'map', style: HM.STYLE[HM.theme()], center, zoom, attributionControl: { compact: true } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'bottom-right');
  map.on('load', async () => {
    if (isMobile()) document.querySelectorAll('.maplibregl-ctrl-attrib').forEach((el) => el.classList.remove('maplibregl-compact-show'));
    HM.addPostcodes(map);
    await recolour();
    if (selected) map.setFilter('pc-sel', ['==', ['get', 'poa'], selected]);
    window.mapReady = true;
  });
  const tip = $('tip');
  map.on('mousemove', 'pc-fill', (e) => {
    const poa = e.features[0].properties.poa, r = STATS[poa] || { names: [] }, def = metricDef();
    if (hoverId !== poa) {
      if (hoverId) map.setFeatureState({ source: 'pc', sourceLayer: 'postcodes', id: hoverId }, { hover: false });
      hoverId = poa; map.setFeatureState({ source: 'pc', sourceLayer: 'postcodes', id: poa }, { hover: true });
    }
    let v = r[def.key];
    let extra = '';
    if (def.computed) { const res = typicalResult(r); v = res ? (def.key === 'cash' ? res.weekly : res.taxableWeekly) : null; if (res && def.key === 'gearing') { const be = breakEvenFor(r); extra = be == null ? '' : `<span class="faint">Break-even rate ${pct(be, 2)} vs ${pct(assumptions().rate, 2)}</span>`; } }
    map.getCanvas().style.cursor = 'pointer';
    tip.innerHTML = `<b>${r.names.slice(0, 2).join(', ') || 'Postcode'} · ${poa}</b>${v == null ? '<span class="faint">No data</span>' : def.fmt(v)}${def.low && r[def.low] ? ' <span class="faint">(small sample)</span>' : ''}${extra}`;
    tip.style.left = Math.min(e.point.x + 16, innerWidth - 270) + 'px'; tip.style.top = e.point.y + 16 + 'px'; tip.classList.remove('hidden');
  });
  map.on('mouseleave', 'pc-fill', () => {
    if (hoverId) map.setFeatureState({ source: 'pc', sourceLayer: 'postcodes', id: hoverId }, { hover: false });
    hoverId = null; tip.classList.add('hidden'); map.getCanvas().style.cursor = '';
  });
  map.on('click', 'pc-fill', (e) => { titleOverride = null; select(e.features[0].properties.poa, false); });
}

async function init() {
  $('nav').innerHTML = HM.nav('map');
  HM.initTheme(() => { window.mapReady = false; buildMap(); if (selected) renderPanel(selected, false); });
  [STATS, META, CFG] = await Promise.all(['data/stats.json', 'data/meta.json', 'data/config.json'].map(HM.load));
  await MSAuth.ready;
  MSAuth.onAuthChange(() => { applyGates(); if (map && map.isStyleLoaded()) recolour(false); if (selected) renderPanel(selected, false); });
  const t = $('time'); t.max = lastQ(); t.value = qi ?? lastQ();
  t.addEventListener('input', () => { qi = +t.value; recolourSoon(false); });
  $('play').addEventListener('click', () => {
    if (playing) { clearInterval(playing); playing = null; $('play').textContent = '▶'; return; }
    $('play').textContent = '❚❚'; qi = 0; t.value = 0;
    playing = setInterval(() => { qi = Math.min(lastQ(), (qi ?? 0) + 1); t.value = qi; recolour(false); if (qi >= lastQ()) { clearInterval(playing); playing = null; $('play').textContent = '▶'; } }, 650);
  });
  setSeg('metric', 'm'); setSeg('dwelling', 'd'); setSeg('beds', 'b'); applyGates();
  $('filtersToggle').addEventListener('click', () => $('filters').classList.toggle('collapsed'));
  if (isMobile()) $('filters').classList.add('collapsed');
  $('handle').addEventListener('click', () => $('panel').classList.toggle('peek'));
  setupSearch();
  buildMap();
  if (state.p && STATS[state.p]) map.once('load', () => select(state.p));
}
init();
