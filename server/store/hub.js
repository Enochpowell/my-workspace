'use strict';
/**
 * Live updates. Browsers open one Server-Sent-Events connection per workspace
 * (GET /api/events?ws=ID). When a document changes, the server sends the PATH
 * that changed (never the content). The browser then re-reads what it needs
 * through the normal, permission-checked API.
 */
class Hub {
  constructor() {
    /** @type {Map<string, Set<{res:any,userId:string}>>} workspace id -> connected clients */
    this.clients = new Map();
    this.timer = setInterval(() => this.ping(), 25_000);
    this.timer.unref();
  }

  /** Register a response stream. Returns a function that unregisters it. */
  add(wid, userId, res) {
    const client = { res, userId };
    if (!this.clients.has(wid)) this.clients.set(wid, new Set());
    this.clients.get(wid).add(client);
    return () => { const s = this.clients.get(wid); if (s) { s.delete(client); if (!s.size) this.clients.delete(wid); } };
  }

  /**
   * Tell connected people that `path` changed.
   * @param {string[]|null} audience limit to these user ids (private chats), or null for everyone in the workspace
   */
  publish(wid, path, audience) {
    const set = this.clients.get(wid);
    if (!set) return;
    const line = `data: ${JSON.stringify({ p: path })}\n\n`;
    for (const c of set) if (!audience || audience.includes(c.userId)) { try { c.res.write(line); } catch { /* closed */ } }
  }

  ping() {
    for (const set of this.clients.values()) for (const c of set) { try { c.res.write(': ping\n\n'); } catch { /* closed */ } }
  }

  /** Close a person's live connection to one workspace (after removal). */
  kick(wid, userId) {
    const set = this.clients.get(wid);
    if (!set) return;
    for (const c of [...set]) if (c.userId === userId) { try { c.res.end(); } catch { /* closed */ } set.delete(c); }
  }
  kickEverywhere(userId) { for (const wid of [...this.clients.keys()]) this.kick(wid, userId); }

  close() {
    clearInterval(this.timer);
    for (const set of this.clients.values()) for (const c of set) { try { c.res.end(); } catch { /* closed */ } }
    this.clients.clear();
  }
}

module.exports = { Hub };
