'use strict';
/**
 * Video generation with Google's Veo, through the Gemini API (needs a Gemini key with billing; Google describes
 * Veo 3.1 as making 8 second clips with sound). It is a slow job: start it, poll until done, then download.
 * Jobs and the finished file are kept in memory for 30 minutes, then forgotten. The key never leaves the server.
 * The model name is a setting (GEMINI_VIDEO_MODEL) because Google renames Veo models often.
 */
const { HttpError } = require('../http');
const { newId } = require('../util');

const jobs = new Map();
const KEEP_MS = 30 * 60 * 1000, MAX_JOBS = 20, MAX_BYTES = 80 * 1024 * 1024;
const sweep = () => { const t = Date.now(); for (const [k, v] of jobs) if (t - v.t > KEEP_MS) jobs.delete(k); while (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value); };

async function said(res, key) {
  let text = '';
  try { text = await res.text(); } catch { /* ignore */ }
  let msg = text;
  try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error)) || text; } catch { /* plain */ }
  msg = String(typeof msg === 'string' ? msg : JSON.stringify(msg)).replace(/\s+/g, ' ').trim();
  if (key) msg = msg.split(key).join('[key]');
  return msg.length > 260 ? msg.slice(0, 257) + '...' : msg;
}
async function fail(res, key) {
  const m = await said(res, key), tail = m ? ` Gemini said: "${m}"` : '';
  if (res.status === 401 || res.status === 403) return new HttpError(502, `Gemini refused the request. Check the key in Settings, AI. Video generation usually needs billing switched on for the key.${tail}`, 'ai_key');
  if (res.status === 429) return new HttpError(429, `Gemini says there is no quota for video right now. Video is a paid feature on most keys.${tail}`, 'rate_limited');
  if (res.status === 404) return new HttpError(502, `Gemini does not know that video model. Change the video model.${tail}`, 'ai_model');
  return new HttpError(502, `Gemini could not start the video.${tail}`, 'ai_error');
}
const keyOf = (config) => {
  const k = config.ai.providers.gemini && config.ai.providers.gemini.key;
  if (!k) throw new HttpError(400, 'No video service is set up. Add a Gemini key in Settings, AI. Video generation usually needs billing switched on for the key.', 'no_provider');
  return k;
};

async function startVideo(config, userId, { prompt, aspect, model }, signal) {
  const key = keyOf(config);
  sweep();
  const m = model && /^[\w./:@+-]{1,80}$/.test(model) ? model : config.ai.videoModel;
  const base = config.ai.geminiBaseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(m)}:predictLongRunning`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: aspect === '16:9' ? '16:9' : '9:16' } }),
  });
  if (!res.ok) throw await fail(res, key);
  const j = await res.json();
  if (!j.name) throw new HttpError(502, 'Gemini did not start a video job.', 'ai_error');
  const id = newId();
  jobs.set(id, { op: j.name, user: userId, t: Date.now(), done: false, error: '', buf: null });
  return { id };
}

async function checkVideo(config, userId, id, signal) {
  const job = jobs.get(id);
  if (!job || job.user !== userId) throw new HttpError(404, 'That video job was not found. It may have expired.', 'not_found');
  if (job.done || job.error) return { done: job.done, error: job.error, size: job.buf ? job.buf.length : 0 };
  const key = keyOf(config), base = config.ai.geminiBaseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/v1beta/${job.op}`, { signal, headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw await fail(res, key);
  const j = await res.json();
  if (!j.done) return { done: false };
  if (j.error) { job.error = `Gemini could not make the video. It said: "${String(j.error.message || '').slice(0, 220)}"`; return { done: false, error: job.error }; }
  const r = j.response || {}, gv = r.generateVideoResponse || r;
  const sample = ((gv.generatedSamples || gv.generatedVideos || [])[0]) || {};
  const uri = (sample.video && sample.video.uri) || '';
  if (!uri) {
    const why = (gv.raiMediaFilteredReasons || []).join(' ').slice(0, 220);
    job.error = `Gemini finished but sent no video.${why ? ` It said: "${why}"` : ' The description may have been blocked by its safety rules.'}`;
    return { done: false, error: job.error };
  }
  const file = await fetch(uri, { signal, redirect: 'follow', headers: { 'x-goog-api-key': key } });
  if (!file.ok) throw await fail(file, key);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) { job.error = 'The video was too large to bring here.'; return { done: false, error: job.error }; }
  job.buf = buf; job.done = true;
  return { done: true, size: buf.length };
}

function videoFile(userId, id) {
  const job = jobs.get(id);
  if (!job || job.user !== userId || !job.buf) throw new HttpError(404, 'That video is not ready or has expired.', 'not_found');
  return job.buf;
}

module.exports = { startVideo, checkVideo, videoFile };
