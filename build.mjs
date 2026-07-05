// Rally build: combine the game-agnostic engine with one game pack into a
// single self-contained offline HTML file (dist/index.html).
//
// WHY CONCATENATION (not esbuild/rollup bundling):
// The app uses inline on* handlers that both call global functions AND assign
// to module-scope variables (assetPickerSelectedId=..., libSort=..., etc.).
// Closure-bundling (IIFE) would silently break every one of these. Preserving
// them requires one shared global script scope, which concatenation gives us
// exactly. Moving to a real bundler is a future step gated on migrating those
// inline handlers to addEventListener/event-delegation first.
//
// Build order matters: packs are concatenated BEFORE the engine so the GAME
// object and its alias consts exist before the engine's top-level code reads
// them. Everything lands in one scope, so engine function declarations (hoisted)
// are still reachable from pack closures at render time.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

// Which pack to build with. Override via: node build.mjs <packName>
const packName = process.argv[2] || 'laserstorm';
const packFile = join(root, 'packs', `${packName}.js`);

const parts = [];
if (existsSync(packFile)) {
  parts.push(`/* ==== GAME PACK: ${packName} ==== */\n` + readFileSync(packFile, 'utf8'));
} else {
  console.warn(`(no pack file ${packName}.js yet — building engine only)`);
}
parts.push('/* ==== ENGINE ==== */\n' + readFileSync(join(root, 'engine', 'app.js'), 'utf8'));

const shell = readFileSync(join(root, 'src', 'shell.html'), 'utf8');
const app = parts.join('\n');
const out = shell.replace('/*__RALLY_APP__*/', () => app);

if (out === shell) { console.error('ERROR: placeholder /*__RALLY_APP__*/ not found in src/shell.html'); process.exit(1); }

writeFileSync(join(root, 'dist', 'index.html'), out);
console.log(`built dist/index.html  (pack: ${existsSync(packFile) ? packName : 'none'}, ${out.length} bytes)`);
