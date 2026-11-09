/**
 * 04-people-workspaces.js
 * Who is signed in, which workspace is open, switching and creating workspaces,
 * the People page (invites, roles, removal) and the platform-admin tools.
 *
 * Everything here talks to the server through HUB.api(method, url, body) (see runtime.js).
 * The server enforces every permission; this file only decides what to show.
 */
HELP.people = 'Invite people to this workspace, change roles and remove access.';
DESC.people = 'Invite people and manage access';

/* ---------------------------------------------------------------- loading screen */
function gateView() {
  const g = GATE || {};
  const box = (h, t) => `<section class="gen gate"><h2>${h}</h2><p class="sub">${t}</p></section>`;
  if (g.state === 'error') return box('Something went wrong', 'The workspace did not open. Refresh the page and try again.');
  return box('Opening your workspace…', 'One moment.');
}

/* ----------------------------------------------------------------- start the app */
/** Called once at the end of loading. Reads who you are, then opens the chosen workspace. */
async function boot() {
  try { DB = await claude.use('db'); UM = await claude.use('user'); } catch (e) { GATE = { state: 'error' }; view(); return; }
  const me = await UM.me();
  UID = me.id; OWNER = me.isOwner;                     // OWNER = admin of the CURRENT workspace
  ME.name = me.name; ME.avatar = me.avatar || ''; ME.email = me.email || '';
  WSK = OWNER ? 'Admin' : 'Member';
  if (OWNER) { PAGES.push(['people', 'People']); }
  try { await openWs('workspaces/' + HUB.wid); } catch (e) { GATE = { state: 'error' }; view(); return; }
  if (OWNER) { loadPeople(); setInterval(loadPeople, 60000); }
}

/* --------------------------------------------------------------------- People page */
let wsT;
/** Keep the workspace's name on the server in step with the editable name in the sidebar. */
function syncWsName(v) {
  if (!OWNER) return;
  clearTimeout(wsT);
  wsT = setTimeout(() => {
    const name = String(v || '').trim().slice(0, 50);
    if (!name) return;
    HUB.api('PATCH', `/api/workspaces/${HUB.wid}`, { name }).then(() => {
      const w = HUB.workspaces.find((x) => x.id === HUB.wid);
      if (w) w.name = name;
      renderRail();
    }).catch(() => {});
  }, 700);
}

async function loadPeople() {
  if (!OWNER) return;
  try {
    const wid = HUB.wid;
    const [m, i] = await Promise.all([HUB.api('GET', `/api/workspaces/${wid}/members`), HUB.api('GET', `/api/workspaces/${wid}/invites`)]);
    let users = null, ainv = null;
    if (HUB.me.isAdmin) {
      const [u, a] = await Promise.all([HUB.api('GET', '/api/admin/users'), HUB.api('GET', '/api/admin/invites')]);
      users = u.users; ainv = a.invites;
    }
    m.members.forEach((x) => { CH.names[x.id] = x.name; if (x.avatar) AV[x.id] = x.avatar; });
    PEOPLE = { members: m.members, invites: i.invites, users, ainvites: ainv, fresh: (PEOPLE && PEOPLE.fresh) || [], afresh: (PEOPLE && PEOPLE.afresh) || [] };
    renderNav();
    if (typeof loadMembers === 'function') loadMembers(); // keep the chat and task lists in step with the member list
    const ae = document.activeElement;
    if (page === 'people' && !(ae && ae.matches && ae.matches('input,select,textarea') && $('#main').contains(ae))) view();
  } catch (e) { status(e.message || 'Could not load the people list.', true); }
}
function peopleCounts() {
  if (!PEOPLE) return [[0, 'members'], [0, 'invites']];
  return [[PEOPLE.members.length, 'members'], [PEOPLE.invites.filter((x) => !x.usedAt).length, 'invites']];
}
const nameOf = (id) => (PEOPLE && (PEOPLE.members.find((m) => m.id === id) || {}).name) || 'Someone';
const fmtDate = (t) => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

function inviteText(f) {
  return `You’re invited to ${f.kind === 'acct' ? 'create an account on' : 'join'} ${brand().name}.\n\n1. Open: ${location.origin}\n2. Choose “Create your account”.\n3. Enter this invite code: ${f.code}\n${f.email ? `4. Use this email address: ${f.email}\n` : ''}\nThe code works once and expires on ${fmtDate(f.expiresAt)}.`;
}

function peopleView() {
  if (!PEOPLE) return banner('people') + '<p class="empty">Loading people…</p>';
  const freshRow = (f, i, pre) => `<article class="item person"><div class="who"><b>${esc(f.code)}</b><small>${f.email ? esc(f.email) : 'Anyone with the code'}${f.role ? ' · ' + esc(f.role) : ''} · expires ${fmtDate(f.expiresAt)}</small></div><div class="act"><button class="sm send" data-act="${pre}-mail" data-i="${i}">Email invite</button><button class="sm" data-act="${pre}-copy" data-i="${i}">Copy invite</button></div></article>`;
  const pendingRow = (v, cancelAct) => `<article class="item person"><div class="who"><b>${esc(v.email || 'Anyone with the code')}</b><small>${v.usedAt ? 'Joined: ' + esc(v.usedByName || 'someone') + ' · ' + fmtDate(v.usedAt) : (v.role ? esc(v.role) + ' · ' : '') + 'expires ' + fmtDate(v.expiresAt) + ' · code hidden'}</small></div><div class="act">${v.usedAt ? '' : `<button class="rm" data-act="${cancelAct}" data-id="${esc(v.id)}">Cancel invite</button>`}</div></article>`;
  const roleSel = (m) => m.id === UID
    ? `<span class="pill">${m.role === 'admin' ? 'Admin' : 'Member'} (you)</span>`
    : `<select data-perole="${esc(m.id)}" aria-label="Role for ${esc(m.name)}"><option value="member"${m.role === 'member' ? ' selected' : ''}>Member</option><option value="admin"${m.role === 'admin' ? ' selected' : ''}>Admin</option></select>`;
  const memberRow = (m) => `<article class="item person"><div class="who"><span class="mav">${av(m.id, 36)}</span><b>${esc(m.name)}</b><small>${esc(m.email || '')}</small></div><div class="act">${roleSel(m)}${m.id === UID ? '' : `<button class="rm" data-act="pe-rm" data-id="${esc(m.id)}">Remove</button>`}</div></article>`;
  const userRow = (u) => `<article class="item person"><div class="who"><b>${esc(u.name)}</b><small>${esc(u.email)} · ${u.workspaces} workspace${u.workspaces === 1 ? '' : 's'}${u.lastLogin ? ' · last seen ' + fmtDate(u.lastLogin) : ''}${u.disabled ? ' · DISABLED' : ''}</small></div><div class="act">${u.id === UID ? '<span class="pill">You</span>' : `<button class="${u.disabled ? 'sm' : 'rm'}" data-act="pa-user" data-id="${esc(u.id)}" data-disabled="${u.disabled ? '0' : '1'}">${u.disabled ? 'Enable' : 'Disable'}</button>`}</div></article>`;

  const pendingInvites = PEOPLE.invites;
  let html = banner('people') +
    `<section class="gen"><h2>Invite people to this workspace</h2><p class="sub">Add their email and create an invite. The code works once, only for that email, and expires in a few days. Send it from your own email, WhatsApp or any app. The person opens this site, chooses “Create your account” and enters the code.</p>
    <div class="f"><label for="iv-email">Their email</label><input id="iv-email" type="email" autocomplete="off" placeholder="name@example.com"></div>
    <div class="f"><label for="iv-role">They join as</label><select id="iv-role"><option value="member">Member</option><option value="admin">Admin</option></select></div>
    <div class="act"><button class="sm send" data-act="iv-add">Create invite</button></div>
    ${PEOPLE.fresh.length ? `<h3>New codes (shown only now)</h3><div class="list">${PEOPLE.fresh.map((f, i) => freshRow(f, i, 'iv')).join('')}</div>` : ''}</section>` +
    `<section><h2>Pending and used invites</h2><div class="list">${pendingInvites.length ? pendingInvites.map((v) => pendingRow(v, 'iv-cancel')).join('') : '<p class="empty">No invites yet.</p>'}</div></section>` +
    `<section><h2>Members</h2><div class="list">${PEOPLE.members.map(memberRow).join('')}</div></section>`;
  if (PEOPLE.users) {
    html += `<section class="gen"><h2>Platform admin</h2><p class="sub">Only you see this. Invite someone new who gets their <b>own</b> separate workspace, and switch accounts off if needed.</p>
      <div class="f"><label for="pa-email">Their email</label><input id="pa-email" type="email" autocomplete="off" placeholder="name@example.com"></div>
      <div class="act"><button class="sm send" data-act="pa-add">Create invite for a new account</button></div>
      ${PEOPLE.afresh.length ? `<h3>New codes (shown only now)</h3><div class="list">${PEOPLE.afresh.map((f, i) => freshRow(f, i, 'pa')).join('')}</div>` : ''}</section>
      <section><h2>Account invites</h2><div class="list">${PEOPLE.ainvites.length ? PEOPLE.ainvites.map((v) => pendingRow(v, 'pa-cancel')).join('') : '<p class="empty">None yet.</p>'}</div></section>
      <section><h2>Everyone on this server</h2><div class="list">${PEOPLE.users.map(userRow).join('')}</div></section>`;
  }
  return html + '<p class="note">Direct messages are private: not even an admin can read them. Admins can see everything else in the workspace.</p>';
}

/* ----------------------------------------------------------------- click handlers */
function openMail(to, subject, body) {
  go(`mailto:${encodeURIComponent(to || '').replace('%40', '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}
const copyText = (t, ok) => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => status(ok)).catch(() => status('Could not copy. Select the text and copy it.', true));

document.addEventListener('click', async (e) => {
  // Switch workspace (rail or menu)
  const w = e.target.closest('[data-ws]');
  if (w) {
    const id = w.dataset.ws; closeSB();
    if (id === HUB.wid) { goPage('home'); return; }
    localStorage.setItem('hub:ws', id); location.reload(); return;
  }
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const a = b.dataset.act, wid = HUB.wid, i = +b.dataset.i;
  try {
    if (a === 'wsmenu') { goPage('settings'); setTimeout(() => { const h = $('#set-ws'); if (h) h.scrollIntoView(); }, 80); }
    else if (a === 'wsx-create') {
      const name = ($('#ws-new').value || '').trim();
      const r = await HUB.api('POST', '/api/workspaces', { name });
      localStorage.setItem('hub:ws', r.id); location.reload();
    } else if (a === 'wsx-join') {
      await HUB.api('POST', '/api/invites/accept', { code: $('#ws-code').value });
      status('Joined. Reloading…'); setTimeout(() => location.reload(), 500);
    } else if (a === 'ai-key-save') {
      const el = $('#ai-key'); if (!el || !el.value.trim()) { status('Paste the key first.', true); return; }
      await HUB.api('PUT', '/api/admin/ai-key/' + b.dataset.p, { key: el.value.trim() });
      el.value = ''; HUB.providers = (await HUB.api('GET', '/api/ai/providers')).providers; AI = true; view();
      status('Key saved. It is stored on the server and not shown again.');
    } else if (a === 'ai-key-del') {
      await HUB.api('DELETE', '/api/admin/ai-key/' + b.dataset.p);
      HUB.providers = (await HUB.api('GET', '/api/ai/providers')).providers; view(); status('Key removed.');
    } else if (a === 'ai-model-save' || a === 'ai-model-reset') {
      const el = $('#ai-model');
      await HUB.api('PUT', '/api/admin/ai-model/' + b.dataset.p, { model: a === 'ai-model-reset' ? '' : (el ? el.value.trim() : '') });
      HUB.providers = (await HUB.api('GET', '/api/ai/providers')).providers; view(); status('Model saved.');
    } else if (a === 'ai-add') {
      const v = (id) => ($('#' + id) || {}).value || '';
      const r = await HUB.api('PUT', '/api/admin/ai-provider', { label: v('ac-name'), baseUrl: v('ac-url'), model: v('ac-model'), key: v('ac-key') });
      HUB.providers = (await HUB.api('GET', '/api/ai/providers')).providers; localStorage.setItem('hub:ai', r.id); view(); status('Added. It is now your chosen AI on this device.');
    } else if (a === 'ai-del') {
      await HUB.api('DELETE', '/api/admin/ai-provider/' + b.dataset.p);
      HUB.providers = (await HUB.api('GET', '/api/ai/providers')).providers; localStorage.removeItem('hub:ai'); view(); status('Removed.');
    } else if (a === 'pw-change') {
      await HUB.api('POST', '/api/auth/password', { current: $('#pw-cur').value, next: $('#pw-new').value });
      $('#pw-cur').value = ''; $('#pw-new').value = '';
      status('Password changed. Your other devices were signed out.');
    } else if (a === 'iv-add' && PEOPLE) {
      const email = ($('#iv-email').value || '').trim();
      const r = await HUB.api('POST', `/api/workspaces/${wid}/invites`, { email: email || undefined, role: $('#iv-role').value });
      PEOPLE.fresh.unshift({ ...r, kind: 'ws' });
      status('Invite created. Send it now: the code is only shown here.');
      await loadPeople(); view();
    } else if (a === 'iv-mail' || a === 'iv-copy') {
      const f = PEOPLE.fresh[i]; if (!f) return;
      if (a === 'iv-mail') openMail(f.email, `Your invite to ${brand().name}`, inviteText(f)); else copyText(inviteText(f), 'Invite copied. Paste it into WhatsApp or any app.');
    } else if (a === 'iv-cancel') {
      await HUB.api('DELETE', `/api/workspaces/${wid}/invites/${b.dataset.id}`); await loadPeople(); view();
    } else if (a === 'pe-rm') {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to remove'; return; }
      await HUB.api('DELETE', `/api/workspaces/${wid}/members/${b.dataset.id}`); status('Removed.'); await loadPeople(); view();
    } else if (a === 'pa-add' && PEOPLE) {
      const r = await HUB.api('POST', '/api/admin/invites', { email: ($('#pa-email').value || '').trim() || undefined });
      PEOPLE.afresh.unshift({ ...r, kind: 'acct' });
      status('Invite created. Send it now: the code is only shown here.');
      await loadPeople(); view();
    } else if (a === 'pa-mail' || a === 'pa-copy') {
      const f = PEOPLE.afresh[i]; if (!f) return;
      if (a === 'pa-mail') openMail(f.email, `Your invite to ${brand().name}`, inviteText(f)); else copyText(inviteText(f), 'Invite copied. Paste it into WhatsApp or any app.');
    } else if (a === 'pa-cancel') {
      await HUB.api('DELETE', `/api/admin/invites/${b.dataset.id}`); await loadPeople(); view();
    } else if (a === 'pa-user') {
      await HUB.api('PATCH', `/api/admin/users/${b.dataset.id}`, { disabled: b.dataset.disabled === '1' }); await loadPeople(); view();
    }
  } catch (err) { status(err.message || 'That did not work.', true); }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  try {
    if (t.dataset && t.dataset.perole) {
      await HUB.api('PATCH', `/api/workspaces/${HUB.wid}/members/${t.dataset.perole}`, { role: t.value });
      status('Role updated.'); loadPeople();
    } else if (t.id === 'ai-prov') {
      if (t.value) localStorage.setItem('hub:ai', t.value); else localStorage.removeItem('hub:ai');
      status('AI provider changed for this device.');
      if (page === 'settings') view();
    }
  } catch (err) { status(err.message || 'That did not work.', true); loadPeople(); }
});
