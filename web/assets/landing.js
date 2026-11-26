const { $, money, priceFmt, pct, sgn, sgnMoney, RAMPS } = HM;
let STATS, META, CFG, mini;
const nm = (poa) => { const r = STATS[poa]; return r && r.names.length ? r.names.slice(0, 2).join(', ') : 'Postcode ' + poa; };

function preview(title, sub, list, fmt, link, detail) {
  return `<article class="prev card"><h3>${title}</h3><div class="bsub">${sub}</div><table class="t">${list.slice(0, 5).map((r, i) =>
    `<tr><td class="faint" style="width:18px">${i + 1}</td><td><a href="${link(r)}" style="color:inherit"><span class="nm">${nm(r.poa)}<small>${r.poa} · ${detail(r)}</small></span></a></td><td style="font-weight:700" class="${r.v >= 0 ? 'up' : 'down'}">${fmt(r.v)}</td></tr>`).join('')}</table></article>`;
}

function miniMap() {
  if (mini) mini.remove();
  mini = new maplibregl.Map({ container: 'miniMap', style: HM.STYLE[HM.theme()], center: [151.02, -33.83], zoom: 9.2, interactive: false, attributionControl: { compact: true } });
  mini.on('load', () => {
    document.querySelectorAll('#miniMap .maplibregl-ctrl-attrib').forEach((el) => el.classList.remove('maplibregl-compact-show'));
    HM.addPostcodes(mini, { opacity: 0.8 });
    const vals = Object.fromEntries(Object.entries(STATS).map(([p, r]) => [p, r.y_Ut ?? null]));
    const br = HM.quantileBreaks(Object.values(vals), RAMPS.yield.length);
    HM.paint(mini, vals, br, RAMPS.yield);
    $('miniBar').innerHTML = RAMPS.yield.map((c) => `<span style="background:${c}"></span>`).join('');
    $('miniLab').innerHTML = [br[0], br[3], br[5]].map((b) => `<span>${pct(b, 1)}</span>`).join('');
    window.mapReady = true;
  });
}

async function init() {
  $('nav').innerHTML = HM.nav('');
  HM.initTheme(() => { window.mapReady = false; miniMap(); });
  [STATS, META, CFG] = await Promise.all(['data/stats.json', 'data/meta.json', 'data/config.json'].map(HM.load));
  HM.load('data/aihw.json').then((A) => { $('aihwCtx').innerHTML = HM.aihwCards(A); $('aihwNote').innerHTML = HM.AIHW_NOTE(A); });
  const rows = HM.insightRows(await HM.load('data/insights.json'));
  const U = HM.movers(rows, STATS, CFG, { d: 'U', b: 't', min: 50 });
  const A = HM.movers(rows, STATS, CFG, { d: 'A', b: 't', min: 100 });
  const rateDate = new Date(CFG.rate.date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
  $('heroStats').innerHTML = `<div class="hs"><div class="v">${META.postcodes}</div><div class="k">NSW postcodes mapped</div></div>
    <div class="hs"><div class="v">${META.n_quarters_rent}</div><div class="k">quarters of rent history</div></div>
    <div class="hs"><div class="v">${CFG.rate.value}%</div><div class="k">RBA investor rate, ${rateDate}</div></div>`;
  const qi = META.quarters.indexOf(META.rent_q);
  $('standSub').textContent = `Rents for the ${META.rent_period}, sales for the ${META.sales_period}. Only postcodes with solid samples are ranked.`;
  $('previews').innerHTML = [
    preview('Highest unit yields', 'Units, 50+ new bonds & sales', U.yields, (v) => pct(v, 2), (r) => `map.html?m=yield&d=U&b=t&p=${r.poa}`, (r) => `$${r.r}/wk · ${priceFmt(r.price)}`),
    preview('Fastest rent rises · 12 months', `All dwellings, 100+ bonds · ${META.qlabels[qi - 4]} → ${META.qlabels[qi]}`, A.rise1, (v) => sgn(v), (r) => `map.html?m=growth&d=A&b=t&p=${r.poa}&tab=trends`, (r) => `$${r.r1} → $${r.r}/wk`),
    preview('Best cash flow · typical unit investor', `${CFG.lvr_pct}% LVR, ${CFG.rate.value}% P&I, pre-tax`, U.cash, (v) => sgnMoney(v) + '/wk', (r) => `map.html?m=cash&d=U&b=t&p=${r.poa}&tab=calc`, (r) => `${priceFmt(r.price)} · ${r.gearing}`),
  ].join('');
  const pos = U.cash.filter((r) => r.gearing === 'positive').length;
  $('method').innerHTML = `
    <div class="card"><h3>Data</h3><ul>
      <li><b>Rents</b>: median weekly rent of new rental bonds lodged with NSW Fair Trading, by postcode, dwelling type and bedrooms, from the DCJ Rent and Sales Report (${META.n_quarters_rent} quarters, ${META.qlabels[META.quarters.indexOf(META.rent_first)]}–${META.qlabels[qi]}).</li>
      <li><b>Prices</b>: median sale prices by postcode (all / strata / non-strata) from the same report, by contract date.</li>
      <li><b>Boundaries &amp; people</b>: ABS 2021 postal areas, suburbs and Census.</li>
      <li>DCJ suppresses areas with 10 or fewer bonds or sales, and flags 11–30 as small samples. We fade or exclude these.</li></ul></div>
    <div class="card"><h3>Typical-investor gearing</h3><ul>
      <li>Median price for the dwelling type, <b>${100 - CFG.lvr_pct}% deposit (${CFG.lvr_pct}% LVR)</b>. APRA: 29.7% of new loans in the June 2026 quarter were at 80%+ LVR.</li>
      <li><b>${CFG.rate.value}% variable, P&amp;I over ${CFG.term_years} years</b>: RBA F6 average rate on new investor variable loans, ${rateDate}.</li>
      <li>Management ${CFG.mgmt_pct}% incl. GST, ${CFG.vacancy_weeks} weeks vacancy, ${CFG.maintenance_pct}% maintenance, plus strata, council, water and insurance allowances. Land tax is $0 by default (land under the $1.075m threshold).</li>
      <li>Under these assumptions, <b>${pos} of ${U.cash.length}</b> well-sampled unit postcodes are positively geared.</li></ul></div>
    <div class="card"><h3>Yield caveat</h3><p>Sales aren't split by bedrooms, so yields compare bedroom rents with all-bedroom prices: units and townhouses with strata sales, houses with non-strata. Treat yields as a way to compare areas, not as a valuation.</p></div>
    <div class="card"><h3>Not advice</h3><p>General information only, not financial, tax or investment advice. Your property, loan, costs and tax position will differ. Check with a licensed adviser. <a href="disclaimer.html">Read the disclaimer</a>.</p></div>`;
  $('foot').innerHTML = HM.footer(META, CFG);
  $('wl').addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = /.+@.+\..+/.test($('wlEmail').value);
    $('wlMsg').innerHTML = ok ? '<span class="pill pos">Thanks!</span> This is a placeholder. No backend yet, so nothing was sent or stored.' : '<span class="pill neg">Check the email</span> Enter a valid address.';
  });
  miniMap();
  window.pageReady = true;
}
init();
