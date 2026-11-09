/**
 * runtime.js: the first script the browser runs.
 *
 * It does three jobs:
 *   1. Finds out who is signed in (GET /api/session) and shows the sign-in / sign-up pages if nobody is.
 *   2. Provides `window.HUB` (the signed-in person, their workspaces, an `api()` helper).
 *   3. Provides `window.claude`: a small adapter that gives the workspace app the same
 *      "database / user / AI / download" building blocks it was designed around, but backed by
 *      THIS server's REST API (see docs/ARCHITECTURE.md). The name "claude" is historical:
 *      the app started life inside Claude. No Claude service is contacted from here.
 *
 * After sign-in it loads the app's scripts, in order (see APP_SCRIPTS).
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------------------------------------------------------- API helper */
  /** Call the server. Throws an Error whose .message is safe to show and whose .code is machine-readable. */
  async function api(method, url, body) {
    const opt = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'bitwixt' } };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(url, opt); }
    catch { throw Object.assign(new Error('Can’t reach the server. Check your connection.'), { code: 'network' }); }
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Something went wrong.');
      err.status = res.status; err.code = (data && data.code) || 'error';
      if (res.status === 401 && HUB.me) { HUB.me = null; location.reload(); }
      throw err;
    }
    return data;
  }

  const HUB = (window.HUB = { api, me: null, workspaces: [], wid: null, ws: null, providers: [], aiPref: () => localStorage.getItem('hub:ai') || '' });

  /* --------------------------------------------------------------- sign in UI */
  const GUIDE = `
    <details class="secbox" open><summary>Security and data-protection guidance</summary>
    <ul class="sec">
      <li>Use a strong, unique password and keep it to yourself. Never share your login.</li>
      <li>Keep client data inside this workspace. Do not paste it into other tools, public chats or personal accounts.</li>
      <li>Collect and keep only what you need, and only for the purpose the client agreed to.</li>
      <li>Lock your devices and sign out on shared computers.</li>
      <li>Report anything suspicious, a lost device or a possible leak to the workspace admin straight away. Serious breaches may need to be reported within 72 hours.</li>
      <li>An admin can remove your access at any time, and it ends when you leave the team.</li>
    </ul>
    <p class="sub">This follows the principles of the Nigeria Data Protection Act 2023 and common standards such as the GDPR.</p></details>`;

  function authShell(inner) {
    const a = $('#auth');
    a.hidden = false;
    a.innerHTML = `<div class="auth-card">${inner}</div>`;
    return a;
  }
  const field = (id, label, type, extra = '') => `<div class="f"><label for="${id}">${label}</label><input id="${id}" type="${type}" ${extra}></div>`;
  const pwField = (id, label, autocomplete) =>
    `<div class="f"><label for="${id}">${label}</label><div class="pwrow"><input id="${id}" type="password" autocomplete="${autocomplete}" minlength="10" maxlength="128" required><button type="button" class="sm" data-show="${id}" aria-label="Show or hide password">Show</button></div></div>`;

  function wireCommon(root) {
    root.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
      const i = root.querySelector('#' + b.dataset.show);
      i.type = i.type === 'password' ? 'text' : 'password';
      b.textContent = i.type === 'password' ? 'Show' : 'Hide';
    }));
  }
  async function submit(form, fn) {
    const err = form.querySelector('.auth-err'), btn = form.querySelector('button[type=submit]');
    err.textContent = ''; btn.disabled = true;
    try { await fn(); } catch (e) { err.textContent = e.message; btn.disabled = false; }
  }


  // ---- Sign in / sign up with Google and GitHub -------------------------------------------------
  let OA = { google: false, github: false };
  const OANAME = { google: 'Google', github: 'GitHub' };
  const OAMSG = {
    not_ready: 'That sign-in is not set up on this server yet. An admin adds it in the server settings (see docs/SECURITY.md).',
    bad_state: 'That sign-in expired. Please try again.',
    cancelled: 'Sign-in was cancelled.',
    token_failed: 'Google or GitHub did not accept the sign-in. Please try again.',
    provider_failed: 'Google or GitHub did not respond. Please try again.',
    email_unverified: 'That account has no verified email address, so it cannot be used here.',
    no_account: 'There is no account for that email. Sign up first with an invite code, then you can use Google or GitHub.',
    disabled: 'This account has been turned off. Ask an admin.',
    bad_code: 'That invite code is not valid, has expired, or was already used.',
    wrong_email: 'This invite was made for a different email address.',
    email_taken: 'An account with that email already exists. Try signing in.',
    setup_not_configured: 'First-time setup is not ready: set ADMIN_SETUP_CODE in the .env file and restart the server.',
    rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  };
  const oauthRow = () => `<div class="oa-row"><button type="button" class="oa" data-oa="google">Continue with Google</button><button type="button" class="oa" data-oa="github">Continue with GitHub</button></div><p class="oa-or"><span>or use your email</span></p>`;
  const authTabs = (on) => `<div class="auth-tabs" role="tablist" aria-label="Sign in or sign up"><button type="button" class="atab${on === 'in' ? ' on' : ''}" role="tab" aria-selected="${on === 'in'}" data-tab="in">Sign in</button><button type="button" class="atab${on === 'up' ? ' on' : ''}" role="tab" aria-selected="${on === 'up'}" data-tab="up">Sign up</button></div>`;
  function wireTabs(root) {
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => (b.dataset.tab === 'in' ? showLogin() : showSignup())));
  }
  function wireOauth(root, mode, getCode) {
    root.querySelectorAll('[data-oa]').forEach((b) => b.addEventListener('click', () => {
      const p = b.dataset.oa, err = root.querySelector('.auth-err');
      if (!OA[p]) { err.textContent = `Sign-in with ${OANAME[p]} is not set up on this server yet. An admin adds it in the server settings (see docs/SECURITY.md).`; return; }
      const code = getCode ? getCode().trim() : '';
      if (mode === 'signup' && !code) { err.textContent = `Enter your invite code first, then choose ${OANAME[p]}.`; return; }
      location.href = `/api/auth/oauth/${p}/start?mode=${mode}${code ? '&code=' + encodeURIComponent(code) : ''}`;
    }));
  }

  function showAuth(session) {
    session = session || { setupRequired: false };
    if (session.setupRequired) return showSetup(session);
    showLogin();
  }

  function showLogin() {
    const root = authShell(`
      ${authTabs('in')}
      <h1>Sign in</h1>
      <p class="sub">Welcome back. Sign in to your workspace.</p>
      ${oauthRow()}
      <form id="login-form" novalidate>
        ${field('l-email', 'Email', 'email', 'autocomplete="username" required')}
        ${pwField('l-pw', 'Password', 'current-password')}
        <p class="auth-err" role="alert"></p>
        <button class="sm send big" type="submit">Sign in</button>
      </form>
      <p class="sub">This workspace is invite only. New here? Use the Sign up tab with your invite code.</p>`);
    wireCommon(root); wireTabs(root); wireOauth(root, 'signin');
    $('#login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submit(e.target, async () => start(await api('POST', '/api/auth/login', { email: $('#l-email').value, password: $('#l-pw').value })));
    });
    $('#l-email').focus();
  }

  function showSignup() {
    const root = authShell(`
      ${authTabs('up')}
      <h1>Create your account</h1>
      <p class="sub">You need an invite code from a workspace admin. Enter it first, then choose Google, GitHub or a password.</p>
      <div class="f"><label for="s-code">Invite code</label><input id="s-code" type="text" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX"></div>
      ${oauthRow()}
      <form id="su-form" novalidate>
        ${field('s-name', 'Your name', 'text', 'autocomplete="name" maxlength="40" required')}
        ${field('s-email', 'Email', 'email', 'autocomplete="username" required')}
        ${pwField('s-pw', 'Choose a password (10+ characters)', 'new-password')}
        ${GUIDE}
        <label class="chk"><input type="checkbox" id="s-ack"> I have read this guidance and agree to follow it.</label>
        <p class="auth-err" role="alert"></p>
        <button class="sm send big" type="submit">Create account</button>
      </form>
      <p class="sub">Already have an account? Use the Sign in tab.</p>`);
    wireCommon(root); wireTabs(root); wireOauth(root, 'signup', () => $('#s-code').value);
    $('#su-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submit(e.target, async () => start(await api('POST', '/api/auth/signup', {
        code: $('#s-code').value, name: $('#s-name').value, email: $('#s-email').value, password: $('#s-pw').value, ack: $('#s-ack').checked,
      })));
    });
    $('#s-code').focus();
  }

  function showSetup(session) {
    const root = authShell(`
      <h1>Set up your workspace</h1>
      <p class="sub">Welcome. This is a brand-new server, so you create the first admin account.
      ${session.setupCodeConfigured ? 'Enter the <b>ADMIN_SETUP_CODE</b> from your server’s .env file. It works once.' : '<b>First, set ADMIN_SETUP_CODE</b> (16+ characters) in the .env file and restart the server. Run <code>npm run gen:secret</code> to make one.'}</p>
      <form id="su-form" novalidate>
        ${field('s-code', 'Setup code', 'password', 'autocomplete="off" required')}
        ${field('s-name', 'Your name', 'text', 'autocomplete="name" maxlength="40" required')}
        ${field('s-email', 'Email', 'email', 'autocomplete="username" required')}
        ${pwField('s-pw', 'Choose a password (10+ characters)', 'new-password')}
        ${GUIDE}
        <label class="chk"><input type="checkbox" id="s-ack"> I have read this guidance and agree to follow it.</label>
        <p class="auth-err" role="alert"></p>
        <button class="sm send big" type="submit">Create admin account</button>
      </form>`);
    wireCommon(root);
    $('#su-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submit(e.target, async () => start(await api('POST', '/api/auth/signup', {
        code: $('#s-code').value, name: $('#s-name').value, email: $('#s-email').value, password: $('#s-pw').value, ack: $('#s-ack').checked,
      })));
    });
    $('#s-code').focus();
  }

  /** Signed in, but not in any workspace (for example after being removed from the only one). */
  function showNoWorkspace() {
    const root = authShell(`
      <h1>You are not in a workspace yet</h1>
      <p class="sub">Join one with an invite code, or create your own.</p>
      <form id="join-form" novalidate>
        ${field('j-code', 'Invite code', 'text', 'autocomplete="off" placeholder="XXXX-XXXX-XXXX"')}
        <p class="auth-err" role="alert"></p>
        <button class="sm send" type="submit">Join workspace</button>
      </form>
      <form id="new-form" novalidate>
        ${field('n-name', 'Or create a workspace', 'text', 'maxlength="50" placeholder="My workspace"')}
        <p class="auth-err" role="alert"></p>
        <button class="sm" type="submit">Create workspace</button>
      </form>
      <p class="sub"><a href="#" id="out">Sign out</a></p>`);
    $('#join-form').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, async () => { await api('POST', '/api/invites/accept', { code: $('#j-code').value }); location.reload(); }); });
    $('#new-form').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, async () => { const w = await api('POST', '/api/workspaces', { name: $('#n-name').value }); localStorage.setItem('hub:ws', w.id); location.reload(); }); });
    $('#out').onclick = async (e) => { e.preventDefault(); await api('POST', '/api/auth/logout').catch(() => {}); location.reload(); };
    void root;
  }

  /* ----------------------------------------------- the "claude" adapter (see header) */
  function installAdapter() {
    const enc = encodeURIComponent;
    const wsOf = (path) => {
      const m = /^workspaces\/([^/]+)(?:\/(.*))?$/.exec(path);
      if (!m) throw new Error('Unsupported path: ' + path);
      return { wid: m[1], sub: m[2] || '' };
    };
    const rand = () => Math.random().toString(36).slice(2, 12);
    const parentOf = (p) => p.slice(0, Math.max(0, p.lastIndexOf('/')));

    // ---- live updates: one EventSource per workspace; each listener re-reads when its path changes
    const listeners = new Set();
    let es = null, esWid = null, opened = false;
    function ensureEvents(wid) {
      if (es && esWid === wid) return;
      if (es) es.close();
      esWid = wid; opened = false;
      es = new EventSource('/api/events?ws=' + enc(wid));
      es.onopen = () => { if (opened) listeners.forEach((l) => l.refresh()); opened = true; }; // after a reconnect, catch up
      es.onmessage = (ev) => {
        let p; try { p = JSON.parse(ev.data).p; } catch { return; }
        listeners.forEach((l) => {
          if (l.wid !== wid) return;
          const hit = l.kind === 'doc' ? p === l.sub : l.kind === 'prefix' ? p.startsWith(l.sub + '/') : parentOf(p) === l.sub;
          if (hit) l.refresh();
        });
      };
    }
    function listen(meta, load, cb, onError) {
      ensureEvents(meta.wid);
      let alive = true, timer = null;
      const run = async () => { if (!alive) return; try { cb(await load()); } catch (e) { if (onError) onError(e); } };
      const l = { ...meta, refresh() { clearTimeout(timer); timer = setTimeout(run, 40); } };
      listeners.add(l);
      run();
      return () => { alive = false; listeners.delete(l); clearTimeout(timer); };
    }

    function docRef(path) {
      const { wid, sub } = wsOf(path);
      const id = path.split('/').pop();
      const url = `/api/ws/${wid}/doc?path=${enc(sub)}`;
      const snap = (r) => ({ id, exists: !!r.exists, data: () => r.data });
      return {
        id, path,
        async get() { return snap(await api('GET', url)); },
        async set(d) { await api('PUT', url, { data: d }); },
        async update(d) { await api('PATCH', url, { data: d }); },
        async delete() { await api('DELETE', url); },
        collection: (c) => colRef(path + '/' + c),
        onSnapshot(cb, onError) { return listen({ wid, kind: 'doc', sub }, () => api('GET', url).then(snap), cb, onError); },
      };
    }
    function colRef(path, q = {}) {
      const { wid, sub } = wsOf(path);
      const qs = (q.order ? '&order=' + enc(q.order) : '') + (q.limit ? '&limit=' + q.limit : '');
      const listUrl = `/api/ws/${wid}/col?path=${enc(sub)}${qs}`;
      const snap = (r) => ({ docs: r.docs.map((d) => ({ id: d.id, exists: true, data: () => d.data })), size: r.docs.length });
      return {
        doc: (id) => docRef(path + '/' + (id || rand())),
        async add(d) { const r = await api('POST', `/api/ws/${wid}/col?path=${enc(sub)}`, { data: d }); return docRef(path + '/' + r.id); },
        orderBy: (f, dir) => colRef(path, { ...q, order: f + ':' + (dir || 'asc') }),
        limit: (n) => colRef(path, { ...q, limit: n }),
        async get() { return snap(await api('GET', listUrl)); },
        onSnapshot(cb, onError) { return listen({ wid, kind: 'col', sub }, () => api('GET', listUrl).then(snap), cb, onError); },
        /** Lightweight: call cb (debounced) whenever ANYTHING under this collection changes. Nothing is downloaded. */
        onChange(cb) {
          ensureEvents(wid);
          let timer = null;
          const l = { wid, kind: 'prefix', sub, refresh() { clearTimeout(timer); timer = setTimeout(cb, 300); } };
          listeners.add(l);
          return () => { listeners.delete(l); clearTimeout(timer); };
        },
      };
    }
    const db = { doc: docRef, collection: colRef };

    const user = {
      async me() { return { id: HUB.me.id, name: HUB.me.name, avatar: HUB.me.avatar, email: HUB.me.email, isOwner: !!HUB.ws && HUB.ws.role === 'admin', isPlatformAdmin: HUB.me.isAdmin }; },
      async can() { return true; },
      async profiles(ids) {
        const r = await api('GET', `/api/workspaces/${HUB.wid}/members`);
        const out = {};
        r.members.filter((m) => !ids || ids.includes(m.id)).forEach((m) => { out[m.id] = { name: m.name }; });
        return out;
      },
    };

    // ---- AI: the server talks to Gemini / Claude / etc. The browser never sees an API key.
    async function chat(prompt, stream, maxTokens) {
      return fetch('/api/ai/chat', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'bitwixt' },
        body: JSON.stringify({ prompt, provider: HUB.aiPref() || undefined, stream, maxTokens }),
      });
    }
    const fail = async (res) => {
      let d = {}; try { d = await res.json(); } catch { /* ignore */ }
      throw Object.assign(new Error(d.error || 'The AI could not answer.'), { code: d.code || 'ai_error' });
    };
    const sample = async (prompt, opts = {}) => {
      const res = await chat(prompt, true, opts.maxTokens);
      if (!res.ok) await fail(res);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '', text = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = block.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
          if (j.error) throw Object.assign(new Error(j.error), { code: j.code || 'ai_error' });
          if (j.text) { text += j.text; if (opts.onText) opts.onText({ text }); }
        }
      }
      return { text };
    };
    /** Ask for JSON and parse it, tolerating ```json fences or a sentence before/after. */
    sample.json = async (prompt) => {
      const res = await chat(prompt, false);
      if (!res.ok) await fail(res);
      const { text } = await res.json();
      const clean = text.replace(/```(?:json)?/gi, '').trim();
      const start = clean.search(/[\[{]/);
      const end = Math.max(clean.lastIndexOf(']'), clean.lastIndexOf('}'));
      return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean);
    };

    const downloads = {
      async save({ filename, data, type }) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: type || 'text/html' }));
        a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      },
    };

    window.claude = {
      use: async (name) => {
        if (name === 'db') return db;
        if (name === 'user') return user;
        if (name === 'downloads') return downloads;
        if (name === 'sample') return HUB.providers.some((p) => p.configured) ? sample : null;
        return null;
      },
    };
  }

  /* ----------------------------------------------------------------- start up */
  const APP_SCRIPTS = [
    'logo-data', '00-config', '01-utils-data', '02-state-storage', '03-views', '04-people-workspaces', '05-send-helpers',
    '06-appearance-menu', '07-chat', '08-profile-tasks', '09-pages-actions', '10-website', '11-video', '99-start',
  ];
  const loadScript = (name) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `/js/${name}.js`; s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + name));
    document.body.appendChild(s);
  });

  async function start(session) {
    HUB.me = session.user;
    HUB.workspaces = session.workspaces || [];
    if (!HUB.workspaces.length) return showNoWorkspace();
    const saved = localStorage.getItem('hub:ws');
    HUB.ws = HUB.workspaces.find((w) => w.id === saved) || HUB.workspaces[0];
    HUB.wid = HUB.ws.id;
    try { HUB.providers = (await api('GET', '/api/ai/providers')).providers; } catch { HUB.providers = []; }
    installAdapter();
    $('#auth').hidden = true; $('#auth').innerHTML = '';
    document.body.classList.add('signed-in');
    for (const f of APP_SCRIPTS) await loadScript(f);
  }

  (async function init() {
    try {
      const s = await api('GET', '/api/session');
      if (s.user) { await start(s); return; }
      try { OA = await api('GET', '/api/auth/oauth/providers'); } catch { /* buttons stay in preview mode */ }
      showAuth(s);
      const why = new URLSearchParams(location.search).get('oauth');
      if (why) {
        const e = $('#auth .auth-err');
        if (e) e.textContent = OAMSG[why] || 'That sign-in did not work. Please try again.';
        history.replaceState(null, '', '/');
      }
    } catch (e) {
      authShell(`<h1>Can’t reach the server</h1><p class="sub">${esc(e.message)}</p><button class="sm" onclick="location.reload()">Try again</button>`);
    }
  })();
})();
