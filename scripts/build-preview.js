'use strict';
/**
 * Builds ONE html file that runs the whole workspace in the browser with a pretend server inside it.
 * Use it to click through every screen without installing anything. Run:  npm run build:preview
 * Output: preview/workspace-preview.html
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

const { loadConfig } = require('../server/config');
const AI = require('../server/ai');
const providers = AI.listProviders(loadConfig({})).map((p) => ({ ...p, configured: false }));
providers.unshift({ id: 'demo', label: 'Demo AI (preview only)', model: 'demo', configured: true, group: 'main', custom: false, aggregator: false, needsKey: false });

let runtime = read('public/js/runtime.js');
const loader = 's.src = `/js/${name}.js`; s.onload = resolve; s.onerror = () => reject(new Error(\'Could not load \' + name));\n    document.body.appendChild(s);';
if (!runtime.includes(loader)) throw new Error('runtime.js changed: update build-preview.js (script loader)');
runtime = runtime.replace(loader, 's.textContent = window.__SCRIPTS[name]; document.body.appendChild(s); resolve();');
const oauth = /location\.href = `\/api\/auth\/oauth\/\$\{p\}\/start[^`]*`;/;
if (!oauth.test(runtime)) throw new Error('runtime.js changed: update build-preview.js (oauth redirect)');
runtime = runtime.replace(oauth, 'window.__previewOAuth(p, mode, code);');

const names = ['logo-data', '00-config', '01-utils-data', '02-state-storage', '03-views', '04-people-workspaces', '05-send-helpers', '06-appearance-menu', '07-chat', '08-profile-tasks', '09-pages-actions', '10-website', '11-video', '99-start'];
const scripts = {};
for (const n of names) scripts[n] = read(`public/js/${n}.js`);

const shell = read('public/index.html');
const body = shell.slice(shell.indexOf('<body>') + 6, shell.indexOf('<script src="/js/runtime.js"></script>'));
const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>My workspace (preview)</title>
<style>${read('public/css/app.css')}</style><style>${read('public/css/auth.css')}</style></head>
<body>${body}
<script>window.__PREVIEW_PROVIDERS__=${safe(JSON.stringify(providers))};window.__SCRIPTS=${safe(JSON.stringify(scripts))};</script>
<script>${safe(read('scripts/preview-mock.js'))}</script>
<script>${safe(runtime)}</script>
</body></html>`;
fs.mkdirSync(path.join(ROOT, 'preview'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'preview/workspace-preview.html'), html);
console.log(`preview/workspace-preview.html written (${Math.round(html.length / 1024)} KB)`);
