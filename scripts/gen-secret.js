'use strict';
/** Prints a long random secret. Use it for ADMIN_SETUP_CODE:   npm run gen:secret */
const crypto = require('node:crypto');
console.log(crypto.randomBytes(24).toString('base64url'));
console.error('\nCopy the line above into your .env file, for example:\n  ADMIN_SETUP_CODE=<that line>\n');
