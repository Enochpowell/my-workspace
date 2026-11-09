'use strict';
/**
 * Your own AI services and model choices, saved from Settings, AI.
 *   - A "custom" provider is any OpenAI-compatible service: a name, a base URL, a model and a key.
 *   - A model override changes which model a built-in provider uses.
 * Both live in the settings table. Keys are stored by keys.js (encrypted).
 */
const { HttpError } = require('../http');
const { PROVIDERS } = require('./index');
const openai = require('./openai');
const { newId, now } = require('../util');

const MODEL_RE = /^[\w./:@+-]{1,120}$/;

function checkBaseUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new HttpError(400, 'That web address is not valid. It should start with https://', 'bad_request'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new HttpError(400, 'Use a plain http:// or https:// address.', 'bad_request');
  if (/^(169\.254\.|0\.0\.0\.0$)/.test(u.hostname)) throw new HttpError(400, 'That address is not allowed.', 'bad_request');
  return u.toString().replace(/\/+$/, '');
}
function checkModel(m) {
  const model = String(m || '').trim();
  if (!MODEL_RE.test(model)) throw new HttpError(400, 'That model name does not look right. Copy it exactly from the provider.', 'bad_request');
  return model;
}
function checkLabel(l) {
  const label = String(l || '').trim();
  if (label.length < 2 || label.length > 40) throw new HttpError(400, 'Give the AI a name of 2 to 40 characters.', 'bad_request');
  return label;
}

function register(config, c) {
  PROVIDERS[c.id] = { label: c.label, impl: openai, group: 'custom', custom: true };
  config.ai.providers[c.id] = { key: config.ai.providers[c.id] && config.ai.providers[c.id].key, model: c.model, baseUrl: c.baseUrl };
}
const readList = (db) => { const r = db.get("SELECT v FROM settings WHERE k = 'ai_custom'"); try { return r ? JSON.parse(r.v) : []; } catch { return []; } };
const writeList = (db, list) => db.run("INSERT INTO settings(k,v,updated_at) VALUES ('ai_custom',?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at", JSON.stringify(list), now());

/** Load custom providers and model overrides at startup (before keys are applied). */
function applySavedProviders(db, config) {
  for (const c of readList(db)) register(config, c);
  for (const row of db.all("SELECT k, v FROM settings WHERE k LIKE 'ai_model_%'")) {
    const id = row.k.slice('ai_model_'.length);
    if (config.ai.providers[id]) config.ai.providers[id].model = row.v;
  }
}

function saveModel(db, config, id, model) {
  const m = checkModel(model);
  db.run('INSERT INTO settings(k,v,updated_at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at', 'ai_model_' + id, m, now());
  config.ai.providers[id].model = m;
}
function resetModel(db, config, id) {
  db.run('DELETE FROM settings WHERE k = ?', 'ai_model_' + id);
  config.ai.providers[id].model = (config.ai.envModels || {})[id] || '';
}

function saveCustom(db, config, body) {
  const list = readList(db);
  let c = body.id ? list.find((x) => x.id === body.id) : null;
  if (body.id && !c) throw new HttpError(404, 'That AI was not found.', 'not_found');
  const label = checkLabel(body.label), model = checkModel(body.model);
  const baseUrl = body.baseUrl || !c ? checkBaseUrl(body.baseUrl) : c.baseUrl;
  if (list.length >= 40 && !c) throw new HttpError(400, 'That is plenty of custom AIs. Remove one first.', 'too_many');
  if (!c) { c = { id: 'c_' + newId().slice(0, 8) }; list.push(c); }
  Object.assign(c, { label, baseUrl, model });
  writeList(db, list);
  register(config, c);
  return c.id;
}
function removeCustom(db, config, id) {
  const list = readList(db);
  if (!list.some((x) => x.id === id)) throw new HttpError(404, 'That AI was not found.', 'not_found');
  writeList(db, list.filter((x) => x.id !== id));
  db.run('DELETE FROM settings WHERE k = ?', 'ai_key_' + id);
  delete PROVIDERS[id];
  delete config.ai.providers[id];
}

module.exports = { applySavedProviders, saveModel, resetModel, saveCustom, removeCustom };
