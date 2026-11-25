// Prints gearing for watch-list postcodes + top movers using the SAME engine as the site (web/assets/common.js).
// Usage: node etl/report.js [postcode ...]
const fs = require('fs'), vm = require('vm'), path = require('path');
const W = path.join(__dirname, '..', 'web');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(W, 'assets/common.js'), 'utf8') + '\nthis.HM = HM;', ctx);
const HM = ctx.HM, J = (f) => JSON.parse(fs.readFileSync(path.join(W, 'data', f)));
const S = J('stats.json'), CFG = J('config.json'), META = J('meta.json'), ROWS = HM.insightRows(J('insights.json'));
const pcs = process.argv.slice(2).length ? process.argv.slice(2) : ['2042', '2127', '2155'];
console.log(`Rate ${CFG.rate.value}% (${CFG.rate.series}, ${CFG.rate.date}); ${CFG.lvr_pct}% LVR; ${CFG.repayment} ${CFG.term_years}y; rents ${META.rent_q}, sales ${META.sales_q}`);
for (const p of pcs) {
  const r = S[p]; console.log(`\n${p} ${r.names.join(', ')}`);
  for (const [d, b] of [['A', 't'], ['U', 't'], ['U', '2'], ['H', 't'], ['H', '4'], ['T', 't']]) {
    const x = HM.typical(CFG, r, d, b); if (!x) { console.log(`  ${d}${b}: n/a (no rent or price)`); continue; }
    const o = HM.evaluate(x, CFG), io = HM.evaluate({ ...x, repay: 'io' }, CFG);
    console.log(`  ${HM.D_LONG[d].padEnd(14)} ${HM.B_LABEL[b].padEnd(8)} price ${HM.priceFmt(x.price).padStart(7)} rent $${x.rent}/wk  loan ${HM.money(o.loan)}  cash ${HM.sgnMoney(o.weekly)}/wk (IO ${HM.sgnMoney(io.weekly)})  tax result ${HM.sgnMoney(o.taxableWeekly)}/wk -> ${o.gearing}; after-tax@37% ${HM.sgnMoney(o.afterTaxWeekly)}/wk; gross ${o.grossYield.toFixed(2)}% net ${o.netYield.toFixed(2)}%`);
  }
}
const nm = (p) => `${p} ${S[p].names.slice(0, 2).join('/')}`;
for (const [d, b, min] of [['A', 't', 100], ['U', 't', 50], ['H', 't', 50]]) {
  const M = HM.movers(ROWS, S, CFG, { d, b, min });
  console.log(`\n== ${HM.D_LONG[d]}, ${HM.B_LABEL[b]}, min sample ${min} (bonds, and sales for yields) ==`);
  console.log(' Rent rises 1y:', M.rise1.slice(0, 5).map((r) => `${nm(r.poa)} ${HM.sgn(r.v)} ($${r.r1}->$${r.r})`).join('; '));
  console.log(' Rent falls 1y:', M.fall1.slice(0, 5).map((r) => `${nm(r.poa)} ${HM.sgn(r.v)} ($${r.r1}->$${r.r})`).join('; '));
  console.log(' Rent rises 5y:', M.rise5.slice(0, 5).map((r) => `${nm(r.poa)} ${HM.sgn(r.v)} ($${r.r5}->$${r.r})`).join('; '));
  console.log(' Top yields   :', M.yields.slice(0, 5).map((r) => `${nm(r.poa)} ${r.y.toFixed(2)}% ($${r.r}/wk, ${HM.priceFmt(r.price)})`).join('; '));
  const pos = M.cash.filter((r) => r.gearing === 'positive').length;
  console.log(` Positively geared: ${pos}/${M.cash.length}; best cash: ${M.cash.slice(0, 3).map((r) => `${nm(r.poa)} ${HM.sgnMoney(r.v)}/wk`).join('; ')}`);
}
