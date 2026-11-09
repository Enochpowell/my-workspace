'use strict';
/**
 * Sign in or sign up with Google or GitHub (the standard "authorization code" flow).
 *
 *   GET /api/auth/oauth/providers             which buttons are ready (no secrets)
 *   GET /api/auth/oauth/:provider/start       ?mode=signin|signup &code=<invite or setup code>
 *   GET /api/auth/oauth/:provider/callback    where Google / GitHub send the person back
 *
 * Rules:
 *   - The provider must say the email is verified.
 *   - Sign in works for an existing account with that email.
 *   - A new account is only created with a valid invite code (or the setup code for the first admin),
 *     exactly like password sign-up. Anyone with a Google account cannot walk in.
 *   - Every failure goes back to the front page with ?oauth=<reason>.
 */
const crypto = require('node:crypto');
const { HttpError, parseCookies, serializeCookie } = require('../http');
const A = require('../auth');
const { normaliseCode, now } = require('../util');
const { createAccount } = require('../accounts');

const COOKIE = 'hub_oauth';
const TTL_MS = 10 * 60 * 1000;

module.exports = function register(add, { config, db, limiters }) {
  const pending = new Map(); // state -> { provider, mode, code, exp }
  const sweep = () => { const t = Date.now(); for (const [k, v] of pending) if (v.exp < t) pending.delete(k); };
  const ready = (p) => !!(config.oauth[p] && config.oauth[p].id && config.oauth[p].secret);
  const base = (ctx) => config.publicUrl || `${ctx.secure ? 'https' : 'http'}://${ctx.req.headers.host}`;
  const back = (ctx, reason) => ctx.redirect(`/?oauth=${encodeURIComponent(reason)}`);

  add('GET', '/api/auth/oauth/providers', (ctx) => ctx.json(200, { google: ready('google'), github: ready('github') }));

  add('GET', '/api/auth/oauth/:provider/start', (ctx) => {
    const p = ctx.params.provider;
    if (!config.oauth[p]) throw new HttpError(404, 'Not found.', 'not_found');
    if (!ready(p)) return back(ctx, 'not_ready');
    const lim = limiters.loginIp.hit(ctx.ip);
    if (!lim.ok) return back(ctx, 'rate_limited');
    sweep();
    const state = crypto.randomBytes(24).toString('base64url');
    const mode = ctx.query.mode === 'signup' ? 'signup' : 'signin';
    pending.set(state, { provider: p, mode, code: normaliseCode(ctx.query.code || ''), exp: Date.now() + TTL_MS });
    ctx.setCookie(serializeCookie(COOKIE, state, { maxAgeSec: TTL_MS / 1000, secure: ctx.secure }));
    const o = config.oauth[p];
    const u = new URL(o.authUrl);
    u.searchParams.set('client_id', o.id);
    u.searchParams.set('redirect_uri', `${base(ctx)}/api/auth/oauth/${p}/callback`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', o.scope);
    u.searchParams.set('state', state);
    if (p === 'google') u.searchParams.set('prompt', 'select_account');
    ctx.redirect(u.toString());
  });

  async function profileOf(p, token) {
    const o = config.oauth[p];
    const h = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'my-workspace' };
    const get = async (url) => { const r = await fetch(url, { headers: h }); if (!r.ok) throw new Error('profile ' + r.status); return r.json(); };
    if (p === 'google') {
      const j = await get(o.userUrl);
      return { email: String(j.email || '').toLowerCase(), verified: j.email_verified === true || j.email_verified === 'true', name: j.name || '' };
    }
    const [u, emails] = await Promise.all([get(o.userUrl), get(o.emailsUrl)]);
    const primary = (Array.isArray(emails) ? emails : []).find((e) => e.primary && e.verified);
    return { email: primary ? String(primary.email).toLowerCase() : '', verified: !!primary, name: u.name || u.login || '' };
  }

  add('GET', '/api/auth/oauth/:provider/callback', async (ctx) => {
    const p = ctx.params.provider;
    if (!config.oauth[p] || !ready(p)) return back(ctx, 'not_ready');
    const state = ctx.query.state || '';
    const mine = parseCookies(ctx.req.headers.cookie)[COOKIE];
    const rec = pending.get(state);
    pending.delete(state);
    ctx.setCookie(serializeCookie(COOKIE, '', { maxAgeSec: 0, secure: ctx.secure }));
    if (!rec || rec.provider !== p || rec.exp < Date.now() || !mine || mine !== state) return back(ctx, 'bad_state');
    if (ctx.query.error || !ctx.query.code) return back(ctx, 'cancelled');
    let prof;
    try {
      const o = config.oauth[p];
      const r = await fetch(o.tokenUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ client_id: o.id, client_secret: o.secret, code: ctx.query.code, redirect_uri: `${base(ctx)}/api/auth/oauth/${p}/callback`, grant_type: 'authorization_code' }),
      });
      const j = await r.json();
      if (!r.ok || !j.access_token) return back(ctx, 'token_failed');
      prof = await profileOf(p, j.access_token);
    } catch { return back(ctx, 'provider_failed'); }
    if (!prof.email || !prof.verified) return back(ctx, 'email_unverified');

    let user = db.get('SELECT * FROM users WHERE email = ?', prof.email);
    if (user && user.disabled) { A.audit({ ...ctx, user: { id: user.id } }, 'oauth_blocked', p); return back(ctx, 'disabled'); }
    if (!user) {
      if (rec.mode !== 'signup' || !rec.code) return back(ctx, 'no_account');
      try {
        const hash = await A.hashPassword(crypto.randomBytes(24).toString('base64url') + 'aA1!');
        const made = createAccount({ db, config }, { email: prof.email, name: A.cleanName(prof.name || prof.email.split('@')[0]), passwordHash: hash, code: rec.code });
        user = db.get('SELECT * FROM users WHERE id = ?', made.userId);
        ctx.user = { id: user.id };
        A.audit(ctx, 'signup', `${made.how}:${p}`);
      } catch (e) { return back(ctx, e instanceof HttpError ? e.code || 'signup_failed' : 'signup_failed'); }
    } else {
      ctx.user = { id: user.id };
      A.audit(ctx, 'login', `oauth:${p}`);
    }
    db.run('UPDATE users SET last_login = ? WHERE id = ?', now(), user.id);
    A.createSession(ctx, user.id);
    ctx.redirect('/');
  });
};
