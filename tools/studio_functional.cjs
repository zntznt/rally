// Pack Studio functional suite - guards the authoring flow end-to-end: the
// studio page boots clean, drafts autosave and restore, generatePack emits
// the full engine contract (25 alias consts, loadout/faction expansion, null
// premiums for disabled deployment types), and buildHtml's output BOOTS as a
// real app with the authored data visible.
//
// Prereq: the REPO ROOT served at 3001 (npm run studio), because the studio
// fetches ../../engine/app.js and ../../src/shell.html live.
//
//   npm run studio &
//   npm run studio:test        -> "studio functional: N/N passed", exit 0
//
// Same pass/fail conventions as tools/functional.cjs; no baseline file.
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const URL_ = process.env.STUDIO_URL || 'http://localhost:3001/tools/studio/';

const ALIASES = ["STAND_TRAITS","WEAPON_TRAITS","TRAIT_REQS","CLASS_INFO","premiumsFor",
  "CLASS_PROFILE","RANGE_OPTS","BUILTIN_UNITS","FACTION_COLORS","BUILTIN_FACTION_ICONS",
  "BUILTIN_FACTION_LABELS","FACTION_LABEL_MAP","TRAIT_FACTION_NAMES","TACTICAL_ASSETS",
  "TF_TYPES","SECTION_TYPES","ROLE_COST_MAP","TYPE_LABELS","VIEW_PTS_KEY","VIEW_LABELS",
  "_TF_CLASS_KEYS","_TF_CLASS_NAMES","TROOP_CLASSES","transportSlotsFor","transportSlotsNeeded"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('dialog', d => d.accept());

  const checks = [];
  const check = (name, pass, msg) => checks.push({ name, pass, msg });

  // 1. Studio page boots clean.
  await page.goto(URL_);
  await page.waitForTimeout(400);
  check('studio page loads without page errors', pageErrors.length === 0, pageErrors.join('; '));

  // 2. Load the Skirmish example, edit the game name, draft autosaves.
  await page.evaluate(() => localStorage.removeItem('rally_studio_project_v1'));
  await page.click('#btn-example');
  await page.waitForTimeout(200);
  await page.fill('[data-p="meta.name"]', 'Skirmish Renamed');
  await page.waitForTimeout(700); // past the 400ms debounce
  const draft = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rally_studio_project_v1') || 'null');
    return d && d.project ? d.project.meta.name : null;
  });
  check('draft autosaves the edit', draft === 'Skirmish Renamed', `draft meta.name = ${draft}`);

  // 3. generatePack: contract surface + expansion behaviors.
  const gen = await page.evaluate(() => {
    // exercise loadouts + multi-faction + disabled deployment on the example
    project.units[0].loadouts = [{ keySuffix: 'hmg', label: 'HMG', ptsDelta: 5, size: null,
      stats: { skill: 3 }, weapons: null, addTraits: ['tough'] }];
    project.units[1].faction = ['red', 'blue'];
    project.deployment.enabled = ['unit', 'independent', 'hero'];  // command + cmdHero off
    saveDraft();  // direct model mutation bypasses the form's autosave path
    const src = generatePack(project);
    let parses = true, parseErr = '';
    try { new Function(src); } catch (e) { parses = false; parseErr = e.message; }
    return { src, parses, parseErr };
  });
  check('generated pack declares const GAME', /\bconst GAME = \{/.test(gen.src));
  const missing = ALIASES.filter(a => !new RegExp(`const ${a} = `).test(gen.src));
  check('all 25 alias consts emitted', missing.length === 0, 'missing: ' + missing.join(','));
  check('generated pack parses (new Function)', gen.parses, gen.parseErr);
  check('loadout expands to a concrete unit entry',
    gen.src.includes('"sk_militia_hmg"') && gen.src.includes('Militia (HMG)') && gen.src.includes('"pts": 13'),
    'expected sk_militia_hmg @ 13 pts in emitted units');
  check('multi-faction unit expands per faction',
    gen.src.includes('"sk_veterans_red"') && gen.src.includes('"sk_veterans_blue"'));
  check('disabled deployment types emit null premiums',
    /return \{ ind: 0\.00, cmd: null, hero: 0\.00, cmdHero: null \};/.test(gen.src),
    'premiumsFor should null cmd/cmdHero');

  // 4. buildHtml output boots as a real app in a second page.
  const html = await page.evaluate(async () => {
    const sources = await fetchSources();
    return buildHtml(generatePack(project), sources.engine, sources.shell, project.meta.id);
  });
  const app = await browser.newPage();
  const appErrors = [];
  app.on('pageerror', e => appErrors.push(e.message));
  // Serve the built HTML on the http origin (not setContent/about:blank, whose
  // opaque origin denies localStorage - the real preview runs on a blob: URL
  // that inherits the studio's origin, so http matches production behavior).
  const previewUrl = new URL('__studio_built_app__/index.html', URL_).href;
  await app.route('**/__studio_built_app__/index.html', route =>
    route.fulfill({ body: html, contentType: 'text/html' }));
  await app.goto(previewUrl);
  await app.waitForTimeout(600);
  const boot = await app.evaluate(() => ({
    name: (typeof GAME !== 'undefined' && GAME.meta && GAME.meta.name) || null,
    brand: (document.querySelector('.nav-brand') || {}).textContent || null,
    units: typeof allUnits === 'function' ? allUnits().length : -1,
    hmgCost: typeof calcPoints === 'function' && typeof unitById === 'function' && unitById('sk_militia_hmg')
      ? calcPoints(unitById('sk_militia_hmg')).perStand : null,
  }));
  check('built app boots without page errors', appErrors.length === 0, appErrors.slice(0,3).join('; '));
  check('built app carries the edited name', boot.name === 'Skirmish Renamed', `GAME.meta.name = ${boot.name}`);
  check('nav brand rendered', !!boot.brand && boot.brand.includes('Skirmish Example Force Builder'), `brand = ${boot.brand}`);
  check('expanded units loaded (4 base + 1 loadout + 1 faction dup)', boot.units === 6, `allUnits = ${boot.units}`);
  check('loadout pts delta priced (8 + 5 = 13)', boot.hmgCost === 13, `perStand = ${boot.hmgCost}`);
  await app.close();

  // 5. Studio reload restores the draft (including the structural edits).
  await page.reload();
  await page.waitForTimeout(400);
  const restored = await page.evaluate(() => ({
    name: project.meta.name,
    loadouts: project.units[0].loadouts.length,
    status: document.getElementById('draft-status').textContent,
  }));
  check('draft restores after reload', restored.name === 'Skirmish Renamed' && restored.loadouts === 1,
    JSON.stringify(restored));

  await browser.close();

  let failed = 0;
  for (const c of checks) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    if (!c.pass) failed++;
    console.log(`  [${tag}] ${c.name}${c.pass ? '' : '  -- ' + (c.msg || '')}`);
  }
  console.log(`studio functional: ${checks.length - failed}/${checks.length} passed` +
    (failed ? ` | FAILURES: ${failed}` : ''));
  process.exit(failed ? 1 : 0);
})();
