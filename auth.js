/* MarketStats accounts.
   Public API (window.MSAuth), the same for every adapter:
     ready                       Promise, resolves once the current session is known
     mode                        'demo' | 'supabase'
     getUser()                   -> Promise<User|null>      User = { id, email, name, plan: 'free' }
     current()                   -> User|null (sync, valid after `ready`)
     isMember()                  -> boolean (sync)
     signUp(email, name)         -> Promise<{ user } | { pending: true, message }>
     signIn(email)               -> Promise<{ user } | { pending: true, message }>
     signOut()                   -> Promise<void>
     onAuthChange(cb)            cb(user|null) on every sign-in / sign-out, in this tab and other tabs
     open(tab, reason)           open the sign-up ('signup') or sign-in ('signin') modal
     lock(innerHTML, opts)       HTML for a blurred, locked preview with an unlock call to action
     configured()                -> boolean: Supabase URL + anon key are set (live mode)
     insert(table, row)          -> Promise: INSERT into a Supabase table via the REST API (RLS insert-only tables)
     wireForm(form, opts)        submit a form to insert(); in demo mode shows an honest "nothing was sent" note
   Adapters: DemoAdapter (localStorage) and SupabaseAdapter (magic-link email via supabase-js v2).
   Demo mode is used when no SUPABASE_URL / SUPABASE_ANON_KEY is set in web/config.js or data/config.json → auth. */
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
  const norm = (e) => String(e || '').trim().toLowerCase();

  // ---------- Demo adapter: everything stays in this browser ----------
  function DemoAdapter() {
    const UK = 'ms-demo-users', SK = 'ms-demo-session';
    const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
    const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    const subs = [];
    const emit = () => { const u = sessionUser(); subs.forEach((f) => f(u)); };
    const sessionUser = () => { const s = read(SK, null); const users = read(UK, {}); return s && users[s.email] ? users[s.email] : null; };
    addEventListener('storage', (e) => { if (e.key === SK || e.key === UK) emit(); });
    return {
      mode: 'demo',
      async init() { return sessionUser(); },
      async getUser() { return sessionUser(); },
      async signUp(email, name) {
        email = norm(email); if (!validEmail(email)) throw new Error('Enter a valid email address.');
        const users = read(UK, {});
        if (users[email]) throw new Error('There is already a demo account for that email. Sign in instead.');
        const user = { id: 'demo-' + Date.now().toString(36), email, name: String(name || '').trim().slice(0, 60) || email.split('@')[0], plan: 'free', created: new Date().toISOString() };
        users[email] = user; write(UK, users); write(SK, { email, at: Date.now() }); emit();
        return { user };
      },
      async signIn(email) {
        email = norm(email); if (!validEmail(email)) throw new Error('Enter a valid email address.');
        const users = read(UK, {});
        if (!users[email]) throw new Error('No demo account for that email on this browser. Create one instead.');
        write(SK, { email, at: Date.now() }); emit();
        return { user: users[email] };
      },
      async demo() {
        const email = 'demo@marketstats.local', users = read(UK, {});
        if (!users[email]) { users[email] = { id: 'demo-account', email, name: 'Demo Investor', plan: 'free', created: new Date().toISOString() }; write(UK, users); }
        write(SK, { email, at: Date.now() }); emit();
        return { user: users[email] };
      },
      async signOut() { write(SK, null); emit(); },
      onAuthChange(cb) { subs.push(cb); },
    };
  }

  // ---------- Supabase adapter: passwordless magic-link email ----------
  function SupabaseAdapter(url, key) {
    let client = null; const subs = [];
    const toUser = (u) => u && { id: u.id, email: u.email, name: u.user_metadata?.name || u.email.split('@')[0], plan: u.app_metadata?.plan || 'free' };
    const loadLib = () => new Promise((res, rej) => {
      if (window.supabase?.createClient) return res();
      const s = document.createElement('script'); s.src = 'vendor/supabase-js@2.119.2/supabase.js';
      s.onload = res; s.onerror = () => rej(new Error('Could not load Supabase')); document.head.appendChild(s);
    });
    const redirect = () => location.href.split('#')[0];
    return {
      mode: 'supabase',
      async init() {
        await loadLib(); client = window.supabase.createClient(url, key);
        client.auth.onAuthStateChange((_e, session) => subs.forEach((f) => f(toUser(session?.user))));
        const { data } = await client.auth.getSession(); return toUser(data.session?.user);
      },
      async getUser() { const { data } = await client.auth.getSession(); return toUser(data.session?.user); },
      async signUp(email, name) {
        email = norm(email); if (!validEmail(email)) throw new Error('Enter a valid email address.');
        const { error } = await client.auth.signInWithOtp({ email, options: { data: { name: String(name || '').trim() }, emailRedirectTo: redirect() } });
        if (error) throw error; return { pending: true, message: `Check ${email} for a sign-in link.` };
      },
      async signIn(email) {
        email = norm(email); if (!validEmail(email)) throw new Error('Enter a valid email address.');
        const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect() } });
        if (error) throw error; return { pending: true, message: `Check ${email} for a sign-in link.` };
      },
      demo: null,
      async signOut() { await client.auth.signOut(); },
      onAuthChange(cb) { subs.push(cb); },
    };
  }

  // ---------- pick an adapter ----------
  async function config() {
    const w = window.MS_CONFIG || {};
    const c = { SUPABASE_URL: w.SUPABASE_URL, SUPABASE_ANON_KEY: w.SUPABASE_PUBLISHABLE_KEY || w.SUPABASE_ANON_KEY };   // publishable (sb_publishable_…) preferred; legacy anon JWT still works
    if (w.DEMO_MODE) return {};
    if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) return c;
    try { const j = await (await fetch('data/config.json', { cache: 'no-cache' })).json(); if (j.auth?.supabase_url && j.auth?.supabase_anon_key) return { SUPABASE_URL: j.auth.supabase_url, SUPABASE_ANON_KEY: j.auth.supabase_anon_key }; } catch (e) {}
    return {};
  }
  let adapter = null, user = null, CONF = {}; const listeners = [];
  const ready = (async () => {
    const c = CONF = await config();
    document.documentElement.classList.toggle('ms-live', !!c.SUPABASE_URL);
    adapter = c.SUPABASE_URL ? SupabaseAdapter(c.SUPABASE_URL, c.SUPABASE_ANON_KEY) : DemoAdapter();
    try { user = await adapter.init(); } catch (e) { console.warn('auth init failed, falling back to demo mode', e); CONF = {}; document.documentElement.classList.remove('ms-live'); adapter = DemoAdapter(); user = await adapter.init(); }
    adapter.onAuthChange((u) => { const was = !!user; user = u; renderNav(); if (was !== !!u || u) listeners.forEach((f) => f(u)); });
    renderNav();
    return user;
  })();

  // ---------- UI: nav slot, dropdown, modal ----------
  const initials = (u) => (u.name || u.email).split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
  function renderNav() {
    const slot = document.getElementById('authSlot'); if (!slot || !adapter) return;
    const ml = document.getElementById('authMobile');
    if (!user) {
      slot.innerHTML = `<button class="btn btn-ghost btn-sm auth-in" data-auth="signin">Sign in</button><button class="btn btn-primary btn-sm auth-up" data-auth="signup">Create free account</button>`;
      if (ml) ml.innerHTML = `<a href="#" data-auth="signup">Create free account</a><a href="#" data-auth="signin">Sign in</a>`;
    } else {
      slot.innerHTML = `<div class="acct"><button class="acct-btn" id="acctBtn" aria-haspopup="true" aria-expanded="false" title="${esc(user.email)}"><span class="av">${esc(initials(user))}</span><span class="acct-name">${esc(user.name)}</span><span class="caret">▾</span></button>
        <div class="acct-menu" id="acctMenu" role="menu" hidden>
          <div class="am-head"><span class="av lg">${esc(initials(user))}</span><div><b>${esc(user.name)}</b><div class="small faint">${esc(user.email)}</div></div></div>
          <div class="am-row"><span class="muted small">Account status</span><span class="pill pos">Free member</span></div>
          ${adapter.mode === 'demo' ? '<div class="am-demo small">Demo mode: this account is stored only in your browser.</div>' : ''}
          <a href="pricing.html" role="menuitem">Plans &amp; pricing</a>
          <button class="am-out" data-auth="signout" role="menuitem">Sign out</button></div></div>`;
      if (ml) ml.innerHTML = `<a href="#" data-auth="signout">Sign out (${esc(user.name)})</a>`;
      const b = document.getElementById('acctBtn'), m = document.getElementById('acctMenu');
      b.onclick = (e) => { e.stopPropagation(); m.hidden = !m.hidden; b.setAttribute('aria-expanded', !m.hidden); };
    }
  }
  document.addEventListener('click', (e) => {
    const m = document.getElementById('acctMenu'); if (m && !m.hidden && !e.target.closest('.acct')) m.hidden = true;
    const a = e.target.closest('[data-auth]'); if (!a) return;
    e.preventDefault();
    const act = a.dataset.auth;
    if (act === 'signout') { api.signOut(); if (m) m.hidden = true; }
    else open(act === 'signin' ? 'signin' : 'signup', a.dataset.reason || '');
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  let modal = null, tab = 'signup';
  function build() {
    modal = document.createElement('div'); modal.className = 'auth-wrap'; modal.hidden = true;
    modal.innerHTML = `<div class="auth-backdrop" data-close></div>
      <div class="auth-modal card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <button class="icon-btn auth-x" data-close aria-label="Close">✕</button>
        <div class="auth-brand">${window.HM ? HM.LOGO : ''}</div>
        <h2 id="authTitle">Create your free account</h2>
        <p class="muted auth-sub" id="authSub">Unlock 9-year trends, bedroom-level rents, the full calculator and every ranking. Free, no card.</p>
        <div class="auth-tabs seg" role="tablist"><button data-tab="signup" role="tab">Create account</button><button data-tab="signin" role="tab">Sign in</button></div>
        <form id="authForm" novalidate>
          <label class="field">Email<input class="input" type="email" id="authEmail" autocomplete="email" placeholder="you@example.com" required></label>
          <label class="field" id="nameField">Name <span class="faint">(optional)</span><input class="input" type="text" id="authName" autocomplete="name" placeholder="Jane Investor" maxlength="60"></label>
          <div class="auth-err" id="authErr" role="alert"></div>
          <button class="btn btn-primary auth-submit" type="submit" id="authSubmit">Create free account</button>
        </form>
        <div class="auth-or"><span>or</span></div>
        <button class="btn btn-ghost auth-demo" id="authDemo" type="button">Try the demo account in one click</button>
        <p class="auth-demo-note small" id="authNote"></p>
        <p class="small faint auth-legal">By continuing you agree to our <a href="disclaimer.html">disclaimer</a> and <a href="privacy.html">privacy policy</a>. General information only, not financial advice.</p>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); const t = e.target.closest('[data-tab]'); if (t) setTab(t.dataset.tab); });
    modal.querySelector('#authForm').addEventListener('submit', submit);
    modal.querySelector('#authDemo').addEventListener('click', async () => { await adapter.demo(); done(); });
  }
  function setTab(t) {
    tab = t; const up = t === 'signup';
    modal.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
    modal.querySelector('#authTitle').textContent = up ? 'Create your free account' : 'Welcome back';
    modal.querySelector('#nameField').hidden = !up;
    modal.querySelector('#authSubmit').textContent = up ? 'Create free account' : 'Sign in';
    modal.querySelector('#authErr').textContent = '';
  }
  function open(t = 'signup', reason = '') {
    if (!modal) build();
    setTab(t);
    modal.querySelector('#authSub').textContent = reason || 'Unlock 9-year trends, bedroom-level rents, the full calculator and every ranking. Free, no card.';
    const demo = adapter?.mode !== 'supabase';
    modal.querySelector('#authDemo').hidden = !demo; modal.querySelector('.auth-or').hidden = !demo;
    modal.querySelector('#authNote').innerHTML = demo ? '<span class="pill warn">Demo mode</span> Stored locally in your browser. Nothing is sent to a server.' : 'We\'ll email you a secure sign-in link. No password needed.';
    modal.hidden = false; document.documentElement.classList.add('modal-open');
    setTimeout(() => modal.querySelector('#authEmail').focus(), 30);
  }
  function close() { if (modal && !modal.hidden) { modal.hidden = true; document.documentElement.classList.remove('modal-open'); } }
  function done() { close(); toast(user ? `Signed in as ${user.name}. Full data unlocked.` : 'Signed in.'); }
  async function submit(e) {
    e.preventDefault();
    const err = modal.querySelector('#authErr'), btn = modal.querySelector('#authSubmit'); err.textContent = ''; btn.disabled = true;
    try {
      const email = modal.querySelector('#authEmail').value, name = modal.querySelector('#authName').value;
      const r = tab === 'signup' ? await adapter.signUp(email, name) : await adapter.signIn(email);
      if (r.pending) { err.className = 'auth-err ok'; err.textContent = r.message; } else done();
    } catch (x) { err.className = 'auth-err'; err.textContent = x.message || String(x); }
    btn.disabled = false;
  }
  function toast(msg) {
    let t = document.getElementById('msToast');
    if (!t) { t = document.createElement('div'); t.id = 'msToast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // locked preview: blurred content + unlock card
  function lock(inner, o = {}) {
    const reason = esc(o.reason || '');
    return `<div class="gate${o.compact ? ' compact' : ''}"><div class="gate-blur" aria-hidden="true" inert>${inner}</div>
      <div class="gate-cta"><div class="gate-card"><span class="gate-ico" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>
        <b>${esc(o.title || 'Free with an account')}</b>${o.text ? `<span class="small muted">${esc(o.text)}</span>` : ''}
        <div class="gate-btns"><button class="btn btn-primary btn-sm" data-auth="signup" data-reason="${reason}">Create free account</button><button class="btn btn-ghost btn-sm" data-auth="signin" data-reason="${reason}">Sign in</button></div></div></div></div>`;
  }

  // ---------- Supabase REST inserts (waitlist, contact) ----------
  const configured = () => !!(CONF.SUPABASE_URL && CONF.SUPABASE_ANON_KEY && adapter && adapter.mode === 'supabase');
  async function insert(table, row) {
    await ready;
    if (!configured()) throw new Error('not-configured');
    const r = await fetch(`${CONF.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}`, {
      // publishable keys are not JWTs: send them on apikey only. Legacy anon JWTs also go on Authorization.
      method: 'POST', headers: { apikey: CONF.SUPABASE_ANON_KEY, ...(CONF.SUPABASE_ANON_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${CONF.SUPABASE_ANON_KEY}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row) });
    if (r.status === 409) return { duplicate: true };           // unique (email, plan): already on the list
    if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) {} throw new Error(m || `Request failed (${r.status})`); }
    return { ok: true };
  }
  // opts: { table, row: () => object|string (string = validation error), msg: element, ok: html, demo: html }
  function wireForm(form, o) {
    const pill = (c, t) => `<span class="pill ${c}">${t}</span> `;
    const idle = () => { o.msg.innerHTML = configured() ? (o.idle || '') : pill('warn', 'Placeholder') + (o.demo || 'Demo mode: nothing is sent or stored.'); };
    ready.then(idle); idle();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const row = o.row(); if (typeof row === 'string') { o.msg.innerHTML = pill('neg', 'Check the form') + esc(row); return; }
      if (!configured()) { o.msg.innerHTML = pill('warn', 'Demo mode') + 'This preview has no backend yet, so nothing was sent or stored.'; return; }
      const btn = form.querySelector('[type=submit]'); btn && (btn.disabled = true); o.msg.innerHTML = '<span class="muted">Sending…</span>';
      try { const r = await insert(o.table, row); o.msg.innerHTML = pill('pos', r.duplicate ? 'Already on the list' : 'Thanks!') + (r.duplicate ? 'You\'re already signed up.' : o.ok); form.reset(); }
      catch (x) { o.msg.innerHTML = pill('neg', 'Not sent') + 'Something went wrong. Please try again in a minute.'; console.warn(o.table, x); }
      btn && (btn.disabled = false);
    });
  }

  const api = {
    ready, get mode() { return adapter ? adapter.mode : 'demo'; },
    getUser: async () => { await ready; return adapter.getUser(); },
    current: () => user, isMember: () => !!user,
    signUp: async (e, n) => { await ready; return adapter.signUp(e, n); },
    signIn: async (e) => { await ready; return adapter.signIn(e); },
    signOut: async () => { await ready; await adapter.signOut(); toast('Signed out.'); },
    onAuthChange: (cb) => listeners.push(cb),
    open, close, lock, renderNav, toast, configured, insert, wireForm, validEmail,
  };
  window.MSAuth = api;
})();
