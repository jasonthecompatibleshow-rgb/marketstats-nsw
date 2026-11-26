/* About / Disclaimer / Data pages: shared chrome plus live values from the build (dates, rate, counts). */
(async () => {
  const { $ } = HM;
  const page = document.body.dataset.page;
  $('nav').innerHTML = HM.nav(page); HM.initTheme();
  let META = null, CFG = null, A = null;
  try { [META, CFG, A] = await Promise.all(['data/meta.json', 'data/config.json', 'data/aihw.json'].map(HM.load)); } catch (e) { console.warn('data not built', e); }
  $('foot').innerHTML = HM.footer(META, CFG);
  if (META && CFG) {
    const qi = META.quarters.indexOf(META.rent_q);
    const v = {
      rent_period: META.rent_period, sales_period: META.sales_period, postcodes: META.postcodes, n_quarters: META.n_quarters_rent,
      first_q: META.qlabels[META.quarters.indexOf(META.rent_first)], last_q: META.qlabels[qi],
      rate: CFG.rate.value + '%', rate_date: new Date(CFG.rate.date).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
      lvr: CFG.lvr_pct + '%', deposit: (100 - CFG.lvr_pct) + '%', term: CFG.term_years, mgmt: CFG.mgmt_pct + '%', maint: CFG.maintenance_pct + '%',
      vac: CFG.vacancy_weeks, band: '$' + CFG.neutral_band_weekly, built: new Date(META.built_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
      lt_threshold: '$' + CFG.land_tax.threshold.toLocaleString('en-AU'), aihw_report: A ? A.meta.report : 'Housing assistance in Australia',
    };
    document.querySelectorAll('[data-k]').forEach((el) => { if (v[el.dataset.k] != null) el.textContent = v[el.dataset.k]; });
  }
  if (A && $('aihwCtx')) { $('aihwCtx').innerHTML = HM.aihwCards(A); $('aihwNote').innerHTML = HM.AIHW_NOTE(A); }
  if (location.hash) { const t = document.querySelector(location.hash); t && t.scrollIntoView(); }
  window.pageReady = true;
})();
