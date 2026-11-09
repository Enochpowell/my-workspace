'use strict';
/** Shared helpers for talking to AI services that stream with Server-Sent Events. */
const { HttpError } = require('../http');

/** Turn an HTTP error from an AI service into a safe message (never includes the key). */
async function failure(res, providerLabel) {
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
  const s = res.status;
  if (s === 401 || s === 403) return new HttpError(502, `${providerLabel} rejected the API key. Check the key in your .env file.`, 'ai_auth');
  if (s === 429) return new HttpError(429, `${providerLabel} says the free limit or rate limit was reached. Wait a little, or pick another AI in the menu.`, 'rate_limited');
  if (s === 404) return new HttpError(502, `${providerLabel} could not find that model name. Check the *_MODEL setting in .env.`, 'ai_model');
  if (s === 400 && /api key|API_KEY/i.test(detail)) return new HttpError(502, `${providerLabel} rejected the API key. Check the key in your .env file.`, 'ai_auth');
  return new HttpError(502, `${providerLabel} returned an error (${s}). Try again, or pick another AI in the menu.`, 'ai_error');
}

/** fetch() with a timeout that also respects the caller's abort signal. */
async function post(url, { headers, body, signal, timeoutMs, label }) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: combined });
  } catch (e) {
    if (signal && signal.aborted) throw e;
    if (e && e.name === 'TimeoutError') throw new HttpError(504, `${label} took too long to answer. Try again.`, 'ai_timeout');
    throw new HttpError(502, `Could not reach ${label}. Check the internet connection (and OLLAMA_BASE_URL if you use Ollama).`, 'ai_unreachable');
  }
  if (!res.ok) throw await failure(res, label);
  return res;
}

/** Read an SSE response and yield the text of each "data:" event. */
async function* events(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
        const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
        if (data) yield data;
      }
    }
    const tail = buf.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (tail) yield tail;
  } finally { try { reader.cancel(); } catch { /* already closed */ } }
}

module.exports = { post, events };
