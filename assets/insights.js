const { $, money, priceFmt, pct, sgn, sgnMoney, D_LONG, B_LABEL } = HM;
const st = { d: 'U', b: 't', min: '50', ...Object.fromEntries(new URLSearchParams(location.search)) };
let STATS, META, CFG, ROWS;
// Logged out: default filters only, top 5 rows per ranking; rows 6+ blurred behind a free-account call to action.
const DEFAULTS = { d: 'U', b: 't', min: '50' };
const member = () => !!(window.MSAuth && MSAuth.isMember());
const E = () => member() ? st : { ...st, ...DEFAULTS };   // effective filters; `st` keeps what the URL asked for

function name(poa) { const r = STATS[poa]; return r && r.names.length ? r.names.slice(0, 2).join(', ') : 'Postcode ' + poa; }
function board(title, sub, list, fmt, opts = {}) {
  const f = E(), n = opts.n || 10, top = list.slice(0, n);
  const row = (r, i) => `<tr>
      <td class="rank">${i + 1}</td>
      <td><a class="row-link" href="map.html?m=${opts.metric || 'rent'}&d=${f.d}&b=${f.b}&p=${r.poa}&tab=trends"><span class="nm">${name(r.poa)}<small>${r.poa} · ${opts.detail ? opts.detail(r) : money(r.r) + '/wk'}</small></span></a></td>
      <td>${opts.series ? HM.spark(opts.series[r.poa]) : ''}</td>
      <td class="${opts.cls ? opts.cls(r) : ''}" style="font-weight:700">${fmt(r.v)}</td></tr>`;
  let body;
  if (!top.length) body = `<div class="empty">No postcodes meet the sample rule for this filter. Try a lower minimum or "All" bedrooms.</div>`;
  else if (member() || top.length <= 5) body = `<table class="t">${top.map(row).join('')}</table>`;
  else body = `<table class="t">${top.slice(0, 5).map(row).join('')}</table>` +
    MSAuth.lock(`<table class="t">${top.slice(5).map((r, i) => row(r, i + 5)).join('')}</table>`,
      { title: `Create a free account to see all ${list.length} postcodes`, text: 'Full rankings, every filter and the complete top 10.', reason: 'Create a free account to see full rankings for every postcode and filter.' });
  return `<article class="board card"><h2>${title}<span class="pill acc">${list.length} postcodes</span></h2><div class="bsub">${sub}</div>${body}</article>`;
}

async function render() {
  const f = E(), m = member();
  for (const [id, key] of [['f_d', 'd'], ['f_b', 'b'], ['f_min', 'min']]) $(id).querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.v === f[key]); b.classList.toggle('lockd', !m && b.dataset.v !== DEFAULTS[key]); });
  $('filterNote').hidden = m;
  history.replaceState(null, '', '?' + new URLSearchParams(st));
  const min = +f.min, k = f.d + f.b;
  const M = HM.movers(ROWS, STATS, CFG, { d: f.d, b: f.b, min });
  const [rs, ys] = await Promise.all([HM.load(`data/tsk/r_${k}.json`), HM.load(`data/tsk/y_${k}.json`)]);
  const qi = META.quarters.indexOf(META.rent_q), q1 = META.qlabels[qi - 4], q5 = META.qlabels[qi - 20], qn = META.qlabels[qi];
  const sq = META.quarters.indexOf(META.sales_q), sNow = META.qlabels[sq], s1 = META.qlabels[sq - 4];
  $('rule').innerHTML = `Rule: a postcode is ranked only if it had ${min <= 30 ? 'more than 30' : min + '+'} new bonds in every quarter compared (and ${min <= 30 ? 'more than 30' : min + '+'} sales for yields). DCJ suppresses ≤10 and flags 11–30 as small samples.`;
  const pos = M.cash.filter((r) => r.gearing === 'positive').length;
  const med = (a) => { const s = a.map((r) => r.v).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  $('headline').innerHTML = `
    <div class="stat card"><div class="k">Median 12-month rent change</div><div class="v">${sgn(med(M.rise1))}</div><div class="d">${D_LONG[f.d]}, ${B_LABEL[f.b]} · ${M.counts.ch1} postcodes</div></div>
    <div class="stat card"><div class="k">Median 5-year rent change</div><div class="v">${sgn(med(M.rise5))}</div><div class="d">${q5} → ${qn}</div></div>
    <div class="stat card"><div class="k">Median gross yield</div><div class="v">${pct(med(M.yields), 2)}</div><div class="d">${M.counts.y} postcodes · sales ${sNow}</div></div>
    <div class="stat card"><div class="k">Positively geared (typical)</div><div class="v">${M.cash.length ? Math.round(100 * pos / M.cash.length) + '%' : '–'}</div><div class="d">${pos} of ${M.cash.length} at ${CFG.rate.value}%, ${CFG.lvr_pct}% LVR, P&amp;I</div></div>`;
  const up = (r) => (r.v >= 0 ? 'up' : 'down');
  $('grid').innerHTML = [
    board('Biggest rent rises · 12 months', `${q1} → ${qn}, median new-bond rent`, M.rise1, (v) => sgn(v), { series: rs, cls: up, detail: (r) => `$${r.r1} → $${r.r}/wk` }),
    board('Biggest rent falls · 12 months', `${q1} → ${qn}`, M.fall1.filter((r) => r.v < 0), (v) => sgn(v), { series: rs, cls: up, detail: (r) => `$${r.r1} → $${r.r}/wk` }),
    board('Biggest rent rises · 5 years', `${q5} → ${qn}`, M.rise5, (v) => sgn(v), { series: rs, cls: up, detail: (r) => `$${r.r5} → $${r.r}/wk` }),
    board('Weakest rent growth · 5 years', `${q5} → ${qn}`, M.fall5, (v) => sgn(v), { series: rs, cls: up, detail: (r) => `$${r.r5} → $${r.r}/wk` }),
    board('Highest gross yields', `Rent ${qn} ÷ median price ${sNow}`, M.yields, (v) => pct(v, 2), { series: ys, metric: 'yield', detail: (r) => `$${r.r}/wk · ${priceFmt(r.price)}` }),
    board('Best cash flow · typical investor', `${CFG.lvr_pct}% LVR at ${CFG.rate.value}% P&I, standard costs, pre-tax`, M.cash, (v) => sgnMoney(v) + '/wk', { metric: 'cash', cls: up, detail: (r) => `${priceFmt(r.price)} · $${r.r}/wk · ${r.gearing}` }),
    board('Biggest yield rises · 12 months', `Same-quarter gross yield, ${s1} → ${sNow} (percentage points)`, M.yrise.filter((r) => r.v > 0), (v) => (v > 0 ? '+' : '') + v.toFixed(2) + ' pp', { series: ys, metric: 'yield', cls: up, detail: (r) => `${pct(r.ys1, 2)} → ${pct(r.ys, 2)}` }),
    board('Biggest yield falls · 12 months', `${s1} → ${sNow} (percentage points)`, M.yfall.filter((r) => r.v < 0), (v) => v.toFixed(2) + ' pp', { series: ys, metric: 'yield', cls: up, detail: (r) => `${pct(r.ys1, 2)} → ${pct(r.ys, 2)}` }),
  ].join('');
}

async function init() {
  $('nav').innerHTML = HM.nav('insights'); HM.initTheme();
  [STATS, META, CFG] = await Promise.all(['data/stats.json', 'data/meta.json', 'data/config.json'].map(HM.load));
  ROWS = HM.insightRows(await HM.load('data/insights.json'));
  $('sub').textContent = `Where rents and yields are moving fastest across ${META.postcodes} NSW postcodes, from ${META.n_quarters_rent} quarters of official NSW rental bond and sales data (latest rents: ${META.rent_period}).`;
  for (const [id, key] of [['f_d', 'd'], ['f_b', 'b'], ['f_min', 'min']]) $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !b.dataset.v) return;
    if (b.classList.contains('lockd')) { MSAuth.open('signup', 'Create a free account to filter rankings by dwelling type, bedrooms and sample size.'); return; }
    st[key] = b.dataset.v; render();
  });
  await MSAuth.ready;
  MSAuth.onAuthChange(() => render());
  $('foot').innerHTML = HM.footer(META, CFG);
  HM.load('data/aihw.json').then((A) => { $('aihwCtx').innerHTML = HM.aihwCards(A); $('aihwNote').innerHTML = HM.AIHW_NOTE(A); });
  await render();
  window.pageReady = true;
}
init();
