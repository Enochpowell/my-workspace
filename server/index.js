'use strict';
/** Starts the server. Run with:  npm start   (or  npm run dev  to restart on file changes) */
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { log } = require('./util');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`My workspace needs Node.js 22.13 or newer. You have ${process.version}. Install the current LTS from https://nodejs.org`);
  process.exit(1);
}

const config = loadConfig();
const app = createApp(config);

app.listen().then((addr) => {
  const users = app.db.get('SELECT COUNT(*) AS n FROM users').n;
  log.info(`My workspace running at http://${addr.address === '0.0.0.0' ? 'localhost' : addr.address}:${addr.port}`);
  if (users === 0) {
    if (config.adminSetupCode.length >= 16) log.info('No accounts yet. Open the site and use your ADMIN_SETUP_CODE on the sign-up page to create the first admin.');
    else log.warn('No accounts yet and ADMIN_SETUP_CODE is not set (needs 16+ characters). Run "npm run gen:secret", put it in .env, then restart.');
  }
  if (config.production && !config.publicUrl) log.warn('PUBLIC_URL is not set. Set it to your site address in production.');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { log.info(`${sig} received, shutting down…`); await app.close(); process.exit(0); });
}
process.on('unhandledRejection', (e) => log.error('Unhandled rejection:', e));
