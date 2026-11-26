/* Pricing page: billing toggle and waitlist placeholder (nothing is sent or stored). */
(() => {
  const $ = (id) => document.getElementById(id);
  const setBill = (v) => {
    $('bill').querySelectorAll('button').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    document.querySelectorAll('[data-m][data-y]').forEach((el) => { el.textContent = el.dataset[v]; });
  };
  $('bill').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setBill(b.dataset.v); });
  if (new URLSearchParams(location.search).get('billing') === 'annual') setBill('y');
  document.querySelectorAll('a[data-plan]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); $('wlPlan').textContent = a.dataset.plan;
    $('waitlist').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => $('wlEmail').focus({ preventScroll: true }), 400);
  }));
  $('wl').addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = /.+@.+\..+/.test($('wlEmail').value);
    $('wlMsg').innerHTML = ok ? '<span class="pill pos">Thanks!</span> This is a placeholder. No backend yet, so nothing was sent or stored.' : '<span class="pill neg">Check the email</span> Enter a valid address.';
  });
  // Free card: once signed in, the call to action becomes "Open the map"
  const freeCta = () => { const el = document.querySelector('.free-cta'); if (!el || !window.MSAuth) return;
    el.innerHTML = MSAuth.isMember() ? '<a class="btn btn-primary" href="map.html" style="width:100%;justify-content:center">Open the map →</a><div class="small faint" style="text-align:center;margin-top:8px">You\'re a free member. Full data unlocked.</div>'
      : '<button class="btn btn-primary" data-auth="signup" style="width:100%;justify-content:center">Create free account</button><a class="small" href="map.html" style="text-align:center;display:block;margin-top:8px">or browse the map first →</a>'; };
  if (window.MSAuth) { MSAuth.ready.then(freeCta); MSAuth.onAuthChange(freeCta); }
})();
