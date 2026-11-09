'use strict';
/** Quick check that every JavaScript file parses.   npm run check */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
let bad = 0, total = 0;
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name.startsWith('.') || f.name === 'data') continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.js')) {
      total++;
      try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); }
      catch (e) { bad++; console.error('SYNTAX ERROR in', path.relative(root, p), '\n', String(e.stderr).split('\n').slice(0, 4).join('\n')); }
    }
  }
})(root);
console.log(`${total - bad}/${total} files OK`);
process.exit(bad ? 1 : 0);
