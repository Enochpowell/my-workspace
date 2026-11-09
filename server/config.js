'use strict';
/**
 * Reads settings from environment variables (and from a ".env" file if present).
 * Every setting is documented in ".env.example".
 *
 * This file has no dependencies: it contains its own tiny .env reader.
 */
const { PRESETS } = require('./ai/catalog');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** Load KEY=value lines from a .env file into process.env (never overwrites real env vars). */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const int = (v, d, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

/**
 * Build the configuration object.
 * @param {object} [overrides] values that win over the environment (used by tests)
 */
function loadConfig(overrides = {}) {
  if (!overrides.__skipDotEnv) loadDotEnv(path.join(ROOT, '.env'));
  const env = { ...process.env, ...overrides };
  const production = env.NODE_ENV === 'production';
  const dataDir = path.resolve(ROOT, env.DATA_DIR || './data');

  const cfg = {
    root: ROOT,
    publicDir: path.join(ROOT, 'public'),
    production,
    port: int(env.PORT, 3000, 0, 65535),
    host: env.HOST || '127.0.0.1',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
    trustProxy: bool(env.TRUST_PROXY, false),
    // Sign in with Google / GitHub. Each needs a free developer app; see docs/SECURITY.md.
    oauth: {
      google: { id: env.GOOGLE_CLIENT_ID || '', secret: env.GOOGLE_CLIENT_SECRET || '', authUrl: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', userUrl: env.GOOGLE_USER_URL || 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid email profile' },
      github: { id: env.GITHUB_CLIENT_ID || '', secret: env.GITHUB_CLIENT_SECRET || '', authUrl: env.GITHUB_AUTH_URL || 'https://github.com/login/oauth/authorize', tokenUrl: env.GITHUB_TOKEN_URL || 'https://github.com/login/oauth/access_token', userUrl: env.GITHUB_USER_URL || 'https://api.github.com/user', emailsUrl: env.GITHUB_EMAILS_URL || 'https://api.github.com/user/emails', scope: 'read:user user:email' },
    },
    dataDir,
    dbFile: env.DB_FILE || path.join(dataDir, 'bitwixt.db'),
    autoBackup: bool(env.AUTO_BACKUP, true),
    backupKeep: int(env.BACKUP_KEEP, 14, 1, 365),
    adminSetupCode: env.ADMIN_SETUP_CODE || '',
    sessionDays: int(env.SESSION_DAYS, 30, 1, 365),
    inviteDays: int(env.INVITE_DAYS, 7, 1, 90),
    maxWorkspacesPerUser: int(env.MAX_WORKSPACES_PER_USER, 3, 1, 50),
    // Limits (documented in docs/SECURITY.md)
    // Multiplies the sign-up / AI / save limits (tests raise it; leave at 1 in real use).
    rateMultiplier: int(env.RATE_MULTIPLIER, 1, 1, 1000),
    maxBodyBytes: 1_200_000,
    maxDocBytes: 900_000,
    ai: {
      defaultProvider: env.AI_PROVIDER || 'gemini',
      timeoutMs: int(env.AI_TIMEOUT_MS, 60_000, 5_000, 300_000),
      maxPromptChars: 120_000,
      maxOutputTokens: int(env.AI_MAX_OUTPUT_TOKENS, 2048, 64, 8192),
      // Each provider is described by plain data; see server/ai/index.js
      providers: {
        gemini: { key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || 'gemini-2.5-flash' },
        anthropic: { key: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5', baseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com' },
        openai: { key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-4o-mini', baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1' },
        groq: { key: env.GROQ_API_KEY, model: env.GROQ_MODEL || 'llama-3.3-70b-versatile', baseUrl: env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1' },
        openrouter: { key: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free', baseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1' },
        // Ollama runs locally and needs no key: it counts as configured when a model name is set.
        ollama: { key: '', model: env.OLLAMA_MODEL || '', baseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434/v1' },
        ...Object.fromEntries(PRESETS.map((p) => [p.id, { key: p.local ? '' : env[`${p.id.toUpperCase()}_API_KEY`], model: env[`${p.id.toUpperCase()}_MODEL`] || p.model, baseUrl: env[`${p.id.toUpperCase()}_BASE_URL`] || p.baseUrl }])),
      },
      geminiBaseUrl: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
      videoModel: env.GEMINI_VIDEO_MODEL || 'veo-3.1-generate-preview',
      imageModels: { openai: env.OPENAI_IMAGE_MODEL || 'gpt-image-1', gemini: env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image' },
    },
  };
  cfg.ai.envKeys = Object.fromEntries(Object.entries(cfg.ai.providers).map(([k, v]) => [k, v.key]));
  cfg.ai.envModels = Object.fromEntries(Object.entries(cfg.ai.providers).map(([k, v]) => [k, v.model]));
  return cfg;
}

module.exports = { loadConfig, ROOT };
