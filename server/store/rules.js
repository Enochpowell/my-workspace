'use strict';
/**
 * WHO MAY DO WHAT inside a workspace's data store.
 *
 * The browser never decides this. Every read and write passes through these rules on the server.
 *
 * Top-level collections (the first part of a path):
 *   blobs      workspace data (offers, quotations, calendar...) and PDFs. Any member.
 *   comments   comment threads on items. Any member.
 *   channels   chat. Extra rules below: private chats are only visible to the people in them.
 * Anything else is refused.
 */
const { HttpError } = require('../http');

const deny = (msg = 'You are not allowed to do that.') => { throw new HttpError(403, msg, 'forbidden'); };

/** Direct-message ids look like "dm_<userA>.<userB>" (ids sorted). Returns [a, b] or null. */
function parseDm(cid) {
  const m = /^dm_([^.]+)\.([^.]+)$/.exec(cid);
  return m ? [m[1], m[2]] : null;
}

function readDoc(db, wid, path) {
  const r = db.get('SELECT data FROM docs WHERE workspace_id = ? AND path = ?', wid, path);
  return r ? JSON.parse(r.data) : null;
}
const isMember = (db, wid, uid) => !!db.get('SELECT 1 AS x FROM members WHERE workspace_id = ? AND user_id = ?', wid, uid);

/** May this person see this chat channel? `doc` is the channel document (or null if it does not exist yet). */
function canSeeChannel({ db, wid, user, role }, cid, doc) {
  const dm = parseDm(cid);
  if (dm) return dm.includes(user.id) && dm.every((id) => isMember(db, wid, id));
  if (!doc) return cid === 'general' || role === 'admin';
  if (doc.kind === 'dm') return Array.isArray(doc.members) && doc.members.includes(user.id);
  if (!Array.isArray(doc.members)) return true; // open to the whole workspace
  return doc.members.includes(user.id) || role === 'admin';
}

/** People who should receive live "something changed" signals for a path (null = everyone). */
function audienceFor({ db, wid }, segs) {
  if (segs[0] !== 'channels' || !segs[1]) return null;
  const dm = parseDm(segs[1]);
  if (dm) return dm;
  const doc = readDoc(db, wid, 'channels/' + segs[1]);
  if (doc && Array.isArray(doc.members)) {
    const admins = db.all("SELECT user_id FROM members WHERE workspace_id = ? AND role = 'admin'", wid).map((r) => r.user_id);
    return [...new Set([...doc.members, ...admins])];
  }
  return null;
}

function validMessage(data, user) {
  if (data.by !== user.id) deny('Messages must be sent as yourself.');
  if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1000) throw new HttpError(400, 'A message must be 1 to 1000 characters.', 'bad_message');
  if (typeof data.at !== 'number' || !Number.isFinite(data.at)) throw new HttpError(400, 'A message needs a timestamp.', 'bad_message');
}

/**
 * Check a single-document operation.
 * @param {object} c context { db, wid, user, role }
 * @param {'get'|'set'|'update'|'delete'} op
 * @param {string[]} segs path segments
 * @param {object|null} data the new data (set/update) or null
 * @param {object|null} existing the current document or null
 */
function authorizeDoc(c, op, segs, data, existing) {
  const top = segs[0];
  if (top === 'blobs' || (top === 'comments' && segs.length !== 4)) return;
  const isMsgDoc = (top === 'channels' && segs[2] === 'msgs' && segs.length === 4) || (top === 'comments' && segs[2] === 'msgs' && segs.length === 4);

  if (isMsgDoc) {
    if (top === 'channels') {
      const cdoc = readDoc(c.db, c.wid, 'channels/' + segs[1]);
      if (!canSeeChannel(c, segs[1], cdoc)) deny('That conversation is private.');
    }
    if (op === 'get') return;
    if (op === 'update') deny('Messages cannot be edited.');
    if (op === 'set') {
      if (existing) deny('Messages cannot be edited.');
      validMessage(data, c.user);
      return;
    }
    if (op === 'delete') { if (!existing || existing.by === c.user.id || c.role === 'admin') return; deny('You can delete your own messages.'); }
  }

  if (top === 'channels' && segs.length === 2) {
    const cid = segs[1];
    const doc = existing;
    if (op === 'get') { if (!canSeeChannel(c, cid, doc)) deny('That conversation is private.'); return; }
    if (op === 'set') {
      if (!doc) { // creating a channel
        if (data.kind === 'dm') {
          const dm = parseDm(cid);
          const members = Array.isArray(data.members) ? [...data.members].sort() : [];
          if (!dm || members.length !== 2 || members[0] !== dm[0] || members[1] !== dm[1] || !dm.includes(c.user.id) || !dm.every((id) => isMember(c.db, c.wid, id))) deny('Invalid direct message.');
        } else if (data.kind === 'group') {
          if (cid === 'general') { if (data.members !== null && data.members !== undefined) deny(); }
          else if (data.by !== c.user.id) deny('Groups must be created as yourself.');
          if (Array.isArray(data.members) && !data.members.every((id) => typeof id === 'string' && isMember(c.db, c.wid, id))) deny('Everyone in a group must be in the workspace.');
        } else deny('Unknown channel type.');
        if (typeof data.name !== 'string' && data.kind === 'group') throw new HttpError(400, 'A group needs a name.', 'bad_request');
        return;
      }
      if (c.role === 'admin' || doc.by === c.user.id) return;
      deny('Only the group creator or an admin can change a group.');
    }
    if (op === 'update') {
      const keys = Object.keys(data);
      if (keys.every((k) => k === 'lastAt' || k === 'lastBy')) { // message bookkeeping
        if (!doc || !canSeeChannel(c, cid, doc)) deny();
        if (data.lastBy !== undefined && data.lastBy !== c.user.id) deny();
        return;
      }
      if (doc && keys.every((k) => k === 'name') && (c.role === 'admin' || doc.by === c.user.id)) return;
      deny('Only the group creator or an admin can rename a group.');
    }
    if (op === 'delete') {
      if (cid === 'general') deny('The General channel cannot be deleted.');
      if (doc && (c.role === 'admin' || doc.by === c.user.id)) return;
      deny('Only the group creator or an admin can delete a group.');
    }
  }
  deny();
}

/** Check listing a collection. Returns a filter function for rows (or null for "no filtering"). */
function authorizeCollection(c, segs) {
  const top = segs[0];
  if (top === 'blobs' && segs.length === 1) return null;
  if (top === 'comments' && segs.length === 3 && segs[2] === 'msgs') return null;
  if (top === 'channels' && segs.length === 1) {
    return (row) => canSeeChannel(c, row.id, JSON.parse(row.data));
  }
  if (top === 'channels' && segs.length === 3 && segs[2] === 'msgs') {
    const cdoc = readDoc(c.db, c.wid, 'channels/' + segs[1]);
    if (!canSeeChannel(c, segs[1], cdoc)) deny('That conversation is private.');
    return null;
  }
  deny();
}

module.exports = { authorizeDoc, authorizeCollection, audienceFor, parseDm, canSeeChannel, readDoc };
