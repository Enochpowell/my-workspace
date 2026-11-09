/* A tiny pretend server that lives inside the page, so the preview works with no real server.
 * It answers the same /api/... addresses the real server does. Nothing leaves the browser.
 * Sign in with any email and password. Data is kept in this browser (localStorage) only. */
(function () {
  'use strict';
  const LS = 'bw-preview-v2';
  let S = null;
  try { S = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { S = null; }
  if (!S) S = { user: null, ws: { id: 'preview1', name: 'Preview workspace' }, docs: {} };
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch { /* storage may be blocked */ } };
  const rid = () => Math.random().toString(36).slice(2, 12);
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const userOut = () => ({ id: S.user.id, email: S.user.email, name: S.user.name, avatar: S.user.avatar || null, isAdmin: true });
  const wsOut = () => [{ id: S.ws.id, name: S.ws.name, role: 'admin' }];
  const login = (email, name) => { S.user = { id: 'u_preview', email: String(email || 'you@example.com'), name: name || String(email || 'You').split('@')[0] }; save(); };

  /* ---------- a very small "demo AI" so every AI button shows how it looks ---------- */
  const TOPICS = ['Happy Monday: what we are working on this week', 'A quick tip your customers can use today', 'Behind the scenes at the studio', 'Customer story: before and after', 'Question of the day for your audience', 'Offer of the week', 'Myth versus fact in your industry', 'Meet the team', 'Three mistakes to avoid', 'Weekend reminder and thank you'];
  const MEDIA = ['Graphic', 'Video', 'Carousel', 'Photo', 'Text only', 'Audio'];
  function demoText(prompt) {
    const p = String(prompt || '');
    const range = p.match(/from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/);
    if (range && /Plan \d+ days/.test(p)) {
      const places = ((p.match(/Places to post: ([^\n]*)\./) || [])[1] || 'LinkedIn').split(', ').map((x) => x.trim());
      const rows = []; let d = new Date(range[1] + 'T12:00:00'); const end = new Date(range[2] + 'T12:00:00'); let k = 0;
      while (d <= end) {
        const topic = TOPICS[(d.getDate() + k) % TOPICS.length], posts = {};
        places.forEach((pl) => { posts[pl] = `[Demo] ${topic}. In the real app the AI you choose writes this ${pl} post using what the client told you.`; });
        rows.push({ date: d.toISOString().slice(0, 10), topic, posts, hashtags: '#demo #workspace #preview', media: MEDIA[k % MEDIA.length], mediaNote: 'Demo suggestion for what the visual shows' });
        d.setDate(d.getDate() + 1); k++;
      }
      return JSON.stringify(rows);
    }
    if (p.includes('"canAudit"')) {
      const none = /Page content pasted:\n\(none\)/.test(p);
      return JSON.stringify(none
        ? { canAudit: false, summary: 'No page content was pasted, so this is a checklist.', scores: null, strengths: [], issues: [], quickWins: [], recommendations: [], checklist: ['Read the bio and first line', 'Check the last 10 posts', 'Look for a clear offer and a way to contact'], questions: ['Who is the ideal customer?', 'What should a visitor do next?'] }
        : { canAudit: true, summary: '[Demo] The page is clear about who it is for, but the offer and next step are weak.', scores: { visibility: 6, positioning: 5, marketing: 4 }, strengths: ['Clear bio'], issues: ['No visible price or offer', 'No call to action'], quickWins: ['Pin one post that explains the offer'], recommendations: ['Rewrite the bio to state who it helps and how'], checklist: [], questions: [] });
    }
    if (p.includes('"worked"')) return JSON.stringify({ summary: '[Demo] The post did fine on reach but asked for no action.', worked: ['Strong opening line'], didnt: ['No call to action'], improve: ['End with one clear question'], nextIdeas: ['Behind the scenes of the same topic'] });
    if (p.includes('"greeting"')) return JSON.stringify({ greeting: 'Hello, this is the assistant from the team. Thanks for reaching out. Do you have a minute?', goal: 'Understand what the person needs and offer a free client session.', rules: 'Do not quote prices unless given.\nDo not promise results.\nOffer to hand over to a person at any time.' });
    if (p.includes('Return ONLY the complete')) {
      const nm = ((p.match(/Site name: ([^\n]*)/) || [])[1] || 'Your business').slice(0, 60);
      const chg = ((p.match(/Change it like this: ([^\n]*)/) || [])[1] || '').slice(0, 120);
      const esc = (x) => x.replace(/[<>&]/g, '');
      return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(nm)}</title><style>*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,sans-serif;background:#0b0b0c;color:#eee}header,section,footer{padding:4rem 1.5rem;max-width:62rem;margin:0 auto}h1{font-size:clamp(2.4rem,7vw,4.6rem);line-height:1.05;margin:0 0 1rem;background:linear-gradient(180deg,#fff,#8a8a90 70%,#d6d6da);-webkit-background-clip:text;background-clip:text;color:transparent}a.btn{display:inline-block;padding:.9rem 1.6rem;border-radius:999px;background:linear-gradient(180deg,#f4f4f6,#9b9ba2);color:#111;text-decoration:none;font-weight:700}.card{border:1px solid #ffffff22;border-radius:18px;padding:1.4rem;background:#ffffff0a;backdrop-filter:blur(6px)}.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}</style></head><body><header><h1>${esc(nm)}</h1><p>[Demo page] In the real app the AI you choose writes a page for your business, in the style you pick.</p><a class="btn" href="#contact">Get in touch</a></header><section><div class="grid"><div class="card"><h3>Service one</h3><p>[fill in]</p></div><div class="card"><h3>Service two</h3><p>[fill in]</p></div><div class="card"><h3>Service three</h3><p>[fill in]</p></div></div></section>${chg ? `<section><div class="card"><b>Last change asked for:</b> ${esc(chg)}</div></section>` : ''}<footer id="contact"><p>Contact: [fill in]</p></footer></body></html>`;
    }
    const q = (p.split('\n').find((l) => l.trim()) || p).slice(0, 90);
    return `This is a demo answer, so you can see how results look.\n\nIn the real app, the AI you choose in Settings writes this, using your workspace data.\n\nYou asked: ${q}`;
  }
  function demoPicture() {
    const c = document.createElement('canvas'); c.width = 768; c.height = 768; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 768, 768); g.addColorStop(0, '#111'); g.addColorStop(1, '#888'); x.fillStyle = g; x.fillRect(0, 0, 768, 768);
    x.fillStyle = '#fff'; x.font = '800 54px sans-serif'; x.textAlign = 'center'; x.fillText('Demo picture', 384, 380); x.font = '28px sans-serif'; x.fillText('The real app makes it here', 384, 430);
    return c.toDataURL('image/png').split(',')[1];
  }

  /* ---------- the pretend server ---------- */
  const providers = window.__PREVIEW_PROVIDERS__ || [];
  async function route(m, u, body) {
    const p = u.pathname, q = u.searchParams;
    if (p === '/api/session') return json(200, S.user ? { user: userOut(), workspaces: wsOut(), setupRequired: false } : { user: null, setupRequired: false, setupCodeConfigured: true });
    if (p === '/api/auth/login' && m === 'POST') { if (!body || !body.email) return json(400, { error: 'Enter your email.', code: 'bad_request' }); login(body.email); return json(200, { user: userOut(), workspaces: wsOut() }); }
    if (p === '/api/auth/signup' && m === 'POST') { login(body && body.email, body && body.name); return json(200, { user: userOut(), workspaces: wsOut() }); }
    if (p === '/api/auth/logout') { S.user = null; save(); return json(200, { ok: true }); }
    if (p === '/api/auth/oauth/providers') return json(200, { google: true, github: true });
    if (p === '/api/ai/providers') return json(200, { providers });
    if (p === '/api/ai/chat' && m === 'POST') {
      const text = demoText(body && body.prompt);
      if (body && body.stream) {
        const enc = new TextEncoder(); const parts = text.match(/[\s\S]{1,60}/g) || [''];
        return new Response(new ReadableStream({ start(c) { parts.forEach((t) => c.enqueue(enc.encode('data: ' + JSON.stringify({ text: t }) + '\n\n'))); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return json(200, { text, provider: 'demo' });
    }
    if (p === '/api/ai/video' || p.startsWith('/api/ai/video/')) return json(400, { error: 'This is a preview, so no video is made. In the real app, a Gemini key with billing switched on makes video here.', code: 'preview' });
    if (p === '/api/ai/image-info') return json(200, { video: { configured: true, model: 'demo', suggestions: ['demo'] }, services: [{ id: 'gemini', label: 'Demo picture service', configured: true, model: 'demo-image', suggestions: ['demo-image'] }] });
    if (p === '/api/ai/image' && m === 'POST') return json(200, { mime: 'image/png', b64: demoPicture(), provider: 'demo' });
    let mm;
    if ((mm = /^\/api\/ws\/([^/]+)\/doc$/.exec(p))) {
      const k = q.get('path') || '';
      if (m === 'GET') return json(200, S.docs[k] ? { exists: true, data: S.docs[k] } : { exists: false });
      if (m === 'PUT') { S.docs[k] = body.data; save(); return json(200, { ok: true }); }
      if (m === 'PATCH') { S.docs[k] = Object.assign({}, S.docs[k] || {}, body.data); save(); return json(200, { ok: true }); }
      if (m === 'DELETE') { delete S.docs[k]; save(); return json(200, { ok: true }); }
    }
    if ((mm = /^\/api\/ws\/([^/]+)\/col$/.exec(p))) {
      const k = q.get('path') || '';
      if (m === 'POST') { const id = rid(); S.docs[k + '/' + id] = body.data; save(); return json(200, { id }); }
      let docs = Object.keys(S.docs).filter((x) => x.slice(0, x.lastIndexOf('/')) === k).sort().map((x) => ({ id: x.slice(x.lastIndexOf('/') + 1), data: S.docs[x] }));
      const o = q.get('order'); if (o) { const [f, dir] = o.split(':'); docs.sort((a, b) => (a.data[f] > b.data[f] ? 1 : -1) * (dir === 'desc' ? -1 : 1)); }
      if (q.get('limit')) docs = docs.slice(0, +q.get('limit'));
      return json(200, { docs });
    }
    if (/^\/api\/workspaces\/[^/]+\/members$/.test(p) && m === 'GET') return json(200, { members: [{ id: S.user.id, name: S.user.name, avatar: null, role: 'admin', joinedAt: 0, email: S.user.email }] });
    if (/^\/api\/workspaces\/[^/]+\/invites$/.test(p)) return m === 'POST' ? json(200, { id: rid(), code: 'PREV-IEWC-0DE1', role: 'member' }) : json(200, { invites: [] });
    if (/^\/api\/workspaces\/[^/]+$/.test(p) && m === 'PATCH') { if (body && body.name) { S.ws.name = body.name; save(); } return json(200, { ok: true }); }
    if (p === '/api/workspaces' && m === 'POST') return json(200, { id: rid(), name: (body && body.name) || 'New workspace' });
    if (p === '/api/me' || p === '/api/auth/password') return json(200, { ok: true });
    if (p === '/api/admin/users') return json(200, { users: [] });
    if (p === '/api/admin/invites') return json(200, { invites: [], code: 'PREV-IEWC-0DE1' });
    if (p.startsWith('/api/admin/')) return json(400, { error: 'This is a preview. Keys, models and AIs can be changed in the real app.', code: 'preview' });
    return json(404, { error: 'That is not available in the preview.', code: 'preview' });
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opt = {}) => {
    const u = new URL(typeof url === 'string' ? url : url.url, location.href);
    if (!u.pathname.startsWith('/api/')) return realFetch(url, opt);
    let body = null; try { body = opt.body ? JSON.parse(opt.body) : null; } catch { /* not json */ }
    try { return await route((opt.method || 'GET').toUpperCase(), u, body); } catch (e) { return json(500, { error: 'The preview hit a snag: ' + e.message }); }
  };
  window.EventSource = function () { this.close = () => {}; this.addEventListener = () => {}; };
  window.__previewOAuth = (provider) => {
    login(provider === 'github' ? 'github.user@example.com' : 'google.user@example.com', provider === 'github' ? 'GitHub User' : 'Google User');
    location.reload();
  };
})();
