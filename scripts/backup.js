'use strict';
/** Makes a safe copy of the database into DATA_DIR/backups.   npm run backup */
const { loadConfig } = require('../server/config');
const { createApp } = require('../server/app');

const config = loadConfig({ AUTO_BACKUP: 'false' });
const app = createApp(config);
const file = app.backupNow();
console.log(file ? `Backup written to ${file}` : 'A backup for today already exists.');
app.close().then(() => process.exit(0));
