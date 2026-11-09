'use strict';
/**
 * AI providers behind ONE simple function: streamChat(config, providerId, prompt, { signal }).
 *
 * To switch AI, a person picks a provider in the menu (or you change AI_PROVIDER in .env).
 * API keys live only in the server's environment. They are never sent to the browser.
 *
 * Supported out of the box:
 *   gemini      Google Gemini            (free key from Google AI Studio)
 *   anthropic   Anthropic Claude         (paid)
 *   openai      OpenAI                   (paid)
 *   groq        Groq                     (free tier, OpenAI-compatible)
 *   openrouter  OpenRouter               (some free models, OpenAI-compatible)
 *   ollama      Ollama on your computer  (free, no key)
 *
 * To add another OpenAI-compatible service, add one entry to PROVIDERS and to config.js.
 */
const { HttpError } = require('../http');
const gemini = require('./gemini');
const anthropic = require('./anthropic');
const openai = require('./openai');
const { PRESETS } = require('./catalog');

const PROVIDERS = {
  gemini: { label: 'Google Gemini', impl: gemini },
  anthropic: { label: 'Anthropic Claude', impl: anthropic },
  openai: { label: 'OpenAI', impl: openai },
  groq: { label: 'Groq', impl: openai },
  openrouter: { label: 'OpenRouter', impl: openai },
  ollama: { label: 'Ollama (this computer)', impl: openai },
  ...Object.fromEntries(PRESETS.map((p) => [p.id, { label: p.label, impl: openai, group: 'more', local: !!p.local, aggregator: !!p.aggregator }])),
};
for (const id of ['gemini', 'anthropic', 'openai', 'groq', 'openrouter', 'ollama']) PROVIDERS[id].group = 'main';
PROVIDERS.openrouter.aggregator = true;

const settingsFor = (config, id) => config.ai.providers[id];
function isConfigured(config, id) {
  const s = settingsFor(config, id);
  if (!s) return false;
  return PROVIDERS[id].local || id === 'ollama' ? !!s.model : !!s.key;
}

/** What the menu shows: every provider, and whether it is ready to use. Never includes keys. */
function listProviders(config) {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id, label: p.label, model: settingsFor(config, id).model || '', configured: isConfigured(config, id),
    group: p.group || 'custom', custom: !!p.custom, aggregator: !!p.aggregator, needsKey: !(p.local || id === 'ollama'),
  }));
}

/** Pick the provider to use: the person's choice, else AI_PROVIDER, else the first configured one. */
function resolveProvider(config, requested) {
  const order = [requested, config.ai.defaultProvider, ...Object.keys(PROVIDERS)];
  const id = order.find((x) => x && PROVIDERS[x] && isConfigured(config, x));
  if (!id) throw new HttpError(503, 'No AI is set up yet. Add an API key to the .env file (see docs/AI-PROVIDERS.md).', 'not_configured');
  return id;
}

/** Async generator that yields pieces of text as the AI writes them. */
async function* streamChat(config, providerId, prompt, { signal, maxTokens } = {}) {
  const s = settingsFor(config, providerId);
  const ctx = { config, settings: s, prompt, signal, providerId, timeoutMs: maxTokens && maxTokens > config.ai.maxOutputTokens ? Math.max(config.ai.timeoutMs, 180000) : config.ai.timeoutMs, maxTokens: Math.min(16384, maxTokens || config.ai.maxOutputTokens) };
  yield* PROVIDERS[providerId].impl.stream(ctx);
}

module.exports = { listProviders, resolveProvider, streamChat, isConfigured, PROVIDERS };
