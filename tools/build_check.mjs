// Fast pre-commit sanity check: does the combined (pack + engine) source
// parse, and does the build produce a dist? Does NOT run the browser golden
// masters (those need a served dist + Playwright) - see README for those.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pack = process.argv[2] || 'laserstorm';

const combined =
  readFileSync(join(root, 'packs', `${pack}.js`), 'utf8') + '\n' +
  readFileSync(join(root, 'engine', 'app.js'), 'utf8');

// Parse-check the combined script (catches syntax errors from a bad split).
try { new vm.Script(combined, { filename: `${pack}+engine` }); }
catch (e) { console.error('SYNTAX ERROR in combined source:', e.message); process.exit(1); }

execSync(`node ${join(root, 'build.mjs')} ${pack}`, { stdio: 'inherit' });
if (!existsSync(join(root, 'dist', 'index.html'))) { console.error('build produced no dist'); process.exit(1); }
console.log('build_check OK');
