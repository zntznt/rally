// Functional behavior suite — the flows the golden masters can't cover.
//
// The two golden masters guard *points math* and *card rendering*. This suite
// guards *stateful UI flows*: persistence round-trips, undo, delete cascades,
// import validation, and XSS/attribute-injection sanitization. It drives the
// real engine headless via page.evaluate(), calling the same ambient globals
// the app uses (state, saveState, undoState, deleteTF, loadState, esc, ...).
//
//   python3 -m http.server 3001 --directory dist &
//   APP_URL=http://localhost:3001/index.html node tools/functional.cjs
//
// Exits 0 if every check passes, 1 otherwise (prints the failures). No
// baseline file — these are pass/fail assertions, not snapshots.
//
// Requires Playwright (resolved the same way as the golden masters).
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const URL = process.env.APP_URL || 'http://localhost:3001/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(400);

  // Each check runs in its own evaluate() with a fresh reload+clear so state
  // never leaks between them. Returns {pass, msg} which we assert on here.
  const checks = [];
  async function check(name, fn) {
    await page.reload();
    await page.waitForTimeout(250);
    let res;
    try {
      res = await page.evaluate(fn);
    } catch (e) {
      res = { pass: false, msg: 'threw in-page: ' + e.message };
    }
    checks.push({ name, ...res });
  }

  // 1. Persistence round-trip: a task force pushed onto state and saved must be
  //    byte-recoverable from localStorage via loadState().
  await check('persistence: TF survives save + reload', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    state.taskForces.push({ id: 'tf_test', name: 'Alpha', tfType: 'infantry',
      commander: 'Cmdr', faction: '', notes: '', pointsLimit: 0, units: [] });
    saveState();
    // wipe in-memory, reload from storage, must come back
    state.taskForces = [];
    loadState();
    const tf = state.taskForces.find(t => t.id === 'tf_test');
    return { pass: !!tf && tf.name === 'Alpha' && tf.commander === 'Cmdr',
      msg: tf ? `recovered name=${tf.name}` : 'TF not recovered from localStorage' };
  });

  // 2. Undo reverts the last mutation. saveState seeds the undo stack with the
  //    PRE-mutation snapshot, so undoState() after one add must empty the list.
  await check('undo: reverts last add', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    saveState();                                    // baseline: empty
    const before = state.taskForces.length;
    state.taskForces.push({ id: 'tf_u', name: 'Undo Me', tfType: 'infantry',
      commander: 'C', faction: '', notes: '', pointsLimit: 0, units: [] });
    saveState();                                    // commit the add
    const added = state.taskForces.length;
    undoState();                                    // pop back to baseline
    const after = state.taskForces.length;
    return { pass: before === 0 && added === 1 && after === 0,
      msg: `len before=${before} added=${added} afterUndo=${after}` };
  });

  // 3. Delete-TF cascade: deleting a task force must strip its id out of every
  //    army.taskForceIds (no dangling reference left behind).
  await check('cascade: deleteTF strips army.taskForceIds', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    state.taskForces.push({ id: 'tf_c', name: 'Ref', tfType: 'infantry',
      commander: 'C', faction: '', notes: '', pointsLimit: 0, units: [] });
    state.armies.push({ id: 'army_c', name: 'A', faction: '', bgCount: 1,
      pointsLimit: 0, armyType: 'tf', taskForceIds: ['tf_c'], battleGroups: [] });
    saveState();
    deleteTF('tf_c');
    const army = state.armies.find(a => a.id === 'army_c');
    const gone = !state.taskForces.some(t => t.id === 'tf_c');
    const unref = army && !army.taskForceIds.includes('tf_c');
    return { pass: gone && unref,
      msg: `tfGone=${gone} armyStillRefs=${army ? army.taskForceIds.join(',') : 'no army'}` };
  });

  // 4. Delete-army cascade: deleting an army must strip its id from every
  //    expeditionary-force armyGroup.armyIds.
  await check('cascade: deleteArmy strips force armyGroup.armyIds', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    state.armies.push({ id: 'army_d', name: 'D', faction: '', bgCount: 1,
      pointsLimit: 0, armyType: 'tf', taskForceIds: [], battleGroups: [] });
    state.expeditionaryForces.push({ id: 'ef_d', name: 'EF', agCount: 1,
      pointsTarget: 0, description: '', symbol: null,
      armyGroups: [{ id: 'ag1', armyIds: ['army_d'] }] });
    saveState();
    deleteArmy('army_d');
    const force = state.expeditionaryForces.find(f => f.id === 'ef_d');
    const gone = !state.armies.some(a => a.id === 'army_d');
    const unref = force && !force.armyGroups.some(g => (g.armyIds || []).includes('army_d'));
    return { pass: gone && unref,
      msg: `armyGone=${gone} forceStillRefs=${force ? JSON.stringify(force.armyGroups.map(g => g.armyIds)) : 'no force'}` };
  });

  // 5. esc() neutralizes HTML in user strings (the name-field surface).
  await check('xss: esc() encodes angle brackets and quotes', () => {
    const out = esc('<script>alert("x")</script>');
    const safe = !out.includes('<script>') && out.includes('&lt;script&gt;') &&
      out.includes('&quot;');
    return { pass: safe, msg: `esc output=${out}` };
  });

  // 6. Attribute-injection: faction icon/color are interpolated RAW into
  //    attributes and rely on _migrateState() (run by loadState) to sanitize a
  //    crafted import. A malicious icon must be forced to "shield".
  await check('xss: crafted faction icon sanitized on load', () => {
    localStorage.clear();
    const evil = {
      schemaVersion: 1, customUnits: [], customFactions: [
        { id: 'fac_x', name: 'Evil', icon: '"><img src=x onerror=alert(1)>', color: 'javascript:alert(1)' }
      ], customTraits: [], customTFTypes: [], customTacticalAssets: [],
      taskForces: [], armies: [], expeditionaryForces: [], tfTemplates: []
    };
    localStorage.setItem('ls_army_builder', JSON.stringify(evil));
    loadState();
    const f = state.customFactions.find(x => x.id === 'fac_x');
    const iconSafe = f && f.icon === 'shield';
    const colorSafe = f && f.color === '#8b949e';
    return { pass: iconSafe && colorSafe,
      msg: f ? `icon=${JSON.stringify(f.icon)} color=${JSON.stringify(f.color)}` : 'faction lost on load' };
  });

  // 7. Import validation. _parseImportArmyText reads the #import-army-text
  //    textarea and signals validity via the _pendingImport global (set to the
  //    payload on accept, left null on reject) + the import button's disabled
  //    state. A foreign app-tag must be rejected; a correct one accepted. We
  //    assert BOTH so the check can't pass vacuously.
  await check('import: foreign app-tag rejected, valid accepted', () => {
    const ta = document.getElementById('import-army-text');
    const btn = document.getElementById('import-army-btn');
    const drive = (obj) => { ta.value = JSON.stringify(obj); _parseImportArmyText(); };
    // reject: right shape, wrong app tag
    drive({ app: 'some-other-app', kind: 'army', version: 1,
      data: { army: { id: 'x', name: 'X' } } });
    const rejected = _pendingImport === null && (!btn || btn.disabled === true);
    // accept: a genuine army envelope
    drive({ app: 'laserstorm-army-builder', kind: 'army', version: 1,
      data: { army: { id: 'y', name: 'Y', armyType: 'tf', taskForceIds: [], battleGroups: [] } } });
    const accepted = _pendingImport !== null && _pendingImport.kind === 'army' &&
      (!btn || btn.disabled === false);
    return { pass: rejected && accepted,
      msg: `rejectedForeign=${rejected} acceptedValid=${accepted}` };
  });

  // 8. Import round-trip: exportArmy → parse → importArmy re-creates the army.
  await check('import: army export round-trips back into state', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    state.armies.push({ id: 'army_rt', name: 'RoundTrip', faction: '', bgCount: 1,
      pointsLimit: 0, armyType: 'tf', taskForceIds: [], battleGroups: [] });
    saveState();
    exportArmy('army_rt');                          // fills #export-json-text
    const json = document.getElementById('export-json-text').value;
    const parsed = JSON.parse(json);
    const validEnvelope = parsed.app === 'laserstorm-army-builder' &&
      parsed.kind === 'army' && parsed.data != null;
    // now delete and re-import
    deleteArmy('army_rt');
    const goneAfterDelete = !state.armies.some(a => a.id === 'army_rt');
    const newArmy = importArmy(parsed);
    const backByName = state.armies.some(a => a.name === 'RoundTrip');
    return { pass: validEnvelope && goneAfterDelete && !!newArmy && backByName,
      msg: `envelope=${validEnvelope} deleted=${goneAfterDelete} reimported=${backByName}` };
  });

  // 9. Corrupt-payload safety: unparseable localStorage must not throw on load;
  //    it should stash to the *_corrupt key and leave state at safe defaults.
  await check('robustness: corrupt localStorage does not crash load', () => {
    localStorage.clear();
    localStorage.setItem('ls_army_builder', '{not valid json at all');
    let threw = false;
    try { loadState(); } catch (e) { threw = true; }
    const stashed = localStorage.getItem('ls_army_builder_corrupt') != null;
    const stateOk = Array.isArray(state.taskForces) && Array.isArray(state.armies);
    return { pass: !threw && stateOk,
      msg: `threw=${threw} stashedCorrupt=${stashed} stateArraysOk=${stateOk}` };
  });

  // 10. This build uses its pack's storage key + app tag (pack-overridable
  //     identity). For the laserstorm build these are pinned to the legacy
  //     values, so existing saves/exports stay compatible.
  await check('storage: pack storage key + app tag resolve', () => {
    const sk = storageKey(), tag = appTag();
    // laserstorm build must keep the legacy identity (zero-migration guarantee)
    const okKey = sk === 'ls_army_builder';
    const okTag = tag === 'laserstorm-army-builder';
    return { pass: okKey && okTag, msg: `storageKey=${sk} appTag=${tag}` };
  });

  // 11. Legacy import compat: a file tagged with the OLD literal
  //     "laserstorm-army-builder" must still import (never orphan old exports).
  await check('import: legacy app-tag still accepted', () => {
    const ta = document.getElementById('import-army-text');
    const legacy = { app: 'laserstorm-army-builder', kind: 'army', version: 1,
      data: { army: { id: 'leg', name: 'Legacy', armyType: 'tf', taskForceIds: [], battleGroups: [] } } };
    ta.value = JSON.stringify(legacy);
    _parseImportArmyText();
    const accepted = _pendingImport !== null && _pendingImport.kind === 'army';
    return { pass: accepted, msg: `legacyAccepted=${accepted}` };
  });

  // 12. Migration read: data left under the legacy "ls_army_builder" key must be
  //     adopted when this pack's key differs. Simulate by writing legacy data,
  //     clearing this pack's key, and confirming loadState picks it up ONLY when
  //     the keys differ. For the laserstorm build storageKey()===legacy, so the
  //     read is a plain read; we assert the shim doesn't break that.
  await check('storage: migration read adopts legacy key when different', () => {
    localStorage.clear();
    const legacyBlob = JSON.stringify({ schemaVersion: 1, customUnits: [], customFactions: [],
      customTraits: [], customTFTypes: [], customTacticalAssets: [],
      taskForces: [{ id: 'tf_leg', name: 'FromLegacy', tfType: 'infantry', commander: 'C',
        faction: '', notes: '', pointsLimit: 0, units: [] }],
      armies: [], expeditionaryForces: [], tfTemplates: [] });
    localStorage.setItem('ls_army_builder', legacyBlob);
    // ensure this pack's key is empty so the shim must fall back (no-op if same key)
    if (storageKey() !== 'ls_army_builder') localStorage.removeItem(storageKey());
    state.taskForces = [];
    loadState();
    const adopted = state.taskForces.some(t => t.id === 'tf_leg');
    return { pass: adopted, msg: `key=${storageKey()} adoptedLegacyData=${adopted}` };
  });

  // 13. Builder edit-save must preserve fields the form doesn't own (a
  //     fixed-points pack's `pts`, imported extras): gatherBuilderUnit()
  //     rebuilds from schema inputs only, so the save path must merge into the
  //     existing unit, not replace it wholesale.
  await check('builder: edit-save preserves unknown unit fields', () => {
    localStorage.clear();
    state.customUnits = [];
    const cls = Object.keys(CLASS_INFO)[0];
    state.customUnits.push({ id: 'cu_keep', name: 'Keeper', class: cls, faction: '',
      customSize: 3, standTraits: [], weapons: [], pts: 7, extraField: 'survive-me' });
    saveState();
    editUnit('cu_keep');
    saveToLibrary();
    const u = state.customUnits.find(x => x.id === 'cu_keep');
    return { pass: !!u && u.pts === 7 && u.extraField === 'survive-me' && u.name === 'Keeper',
      msg: u ? `pts=${u.pts} extraField=${u.extraField}` : 'unit vanished' };
  });

  // 14. classes[].minSize must beat the legacy sh/beh literal: a class
  //     declaring minSize 1 accepts single-model units in the builder, and an
  //     undeclared class keeps the legacy clamp.
  await check('builder: classes[].minSize honored over sh/beh literal', () => {
    localStorage.clear();
    const cls = Object.keys(CLASS_INFO)[0];
    document.getElementById('b-class').value = cls;
    const sizeEl = document.getElementById('b-unit-size');
    const orig = CLASS_INFO[cls].minSize;
    try {
      CLASS_INFO[cls].minSize = 1;
      sizeEl.value = 1;
      const withMin = gatherBuilderUnit().customSize;
      delete CLASS_INFO[cls].minSize;
      sizeEl.value = 1;
      const legacy = gatherBuilderUnit().customSize;
      const legacyExpected = (cls === 'sh' || cls === 'beh') ? 1 : 2;
      return { pass: withMin === 1 && legacy === legacyExpected,
        msg: `minSize1->${withMin} legacy->${legacy} (expected 1/${legacyExpected})` };
    } finally {
      if (orig === undefined) delete CLASS_INFO[cls].minSize; else CLASS_INFO[cls].minSize = orig;
    }
  });

  // 15. The Mechanize button must follow GAME.transport.canRide, not
  //     class-name literals: with canRide stubbed false, no slot row offers it.
  await check('transport: mechanize button gated by canRide', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    const rider = allUnits().find(u => GAME.transport.canRide(u.class, u));
    if (!rider) return { pass: true, msg: 'pack has no ridable class - vacuously true' };
    state.taskForces.push({ id: 'tf_mech', name: 'MechTest', tfType: 'infantry',
      commander: 'C', faction: '', notes: '', pointsLimit: 0,
      units: [{ id: 'slot_m1', unitId: rider.id, unitType: 'unit', quantity: 1, role: 'core' }] });
    saveState();
    const panelHas = () => document.getElementById('tf-detail-panel').innerHTML
      .includes(`openTransportPickerTF('tf_mech','slot_m1')`);
    selectTF('tf_mech');
    const before = panelHas();
    const realCanRide = GAME.transport.canRide;
    GAME.transport.canRide = () => false;
    renderTFDetail();
    const after = panelHas();
    GAME.transport.canRide = realCanRide;
    renderTFDetail();
    return { pass: before === true && after === false,
      msg: `canRide=true shows btn:${before}, canRide=false shows btn:${after}` };
  });

  // 16. The Army modal faction list must come from GAME.factions.labels, not a
  //     hardcoded LaserStorm array.
  // 17. Instance mods: cost varies per slot mods (memo keys must separate),
  //     packs without instance fields are untouched, and modded entries never
  //     merge on re-add.
  await check('instance: mods reprice per slot and never merge', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    const u = allUnits()[0];
    // Pack-declares-instance-fields simulation: skill field + ctx-aware cost.
    GAME.schema.instance = [{ key: 'skill', label: 'Skill', kind: 'number', badgeWhenNot: 4 }];
    const realCost = GAME.cost.unitCost;
    try {
      GAME.cost.unitCost = function (unit, ctx) {
        const r = realCost(unit);
        if (!ctx || !ctx.mods || ctx.mods.skill == null) return r;
        const d = (4 - ctx.mods.skill) * 2;
        return Object.assign({}, r, { unitPts: r.unitPts + d, indPts: r.indPts + d });
      };
      saveState(); // nukes the cost memo
      const stock = { id: 'slot_i1', unitId: u.id, unitType: 'unit', quantity: 1, role: 'core' };
      const modded = { id: 'slot_i2', unitId: u.id, unitType: 'unit', quantity: 1, role: 'core', mods: { skill: 2 } };
      const a = slotPointValue(stock), b = slotPointValue(modded);
      const priced = b === a + 4;
      // second read of each must hit the cache and stay separated
      const priced2 = slotPointValue(stock) === a && slotPointValue(modded) === b;
      // no-merge guard: adding the same unit to a BG never merges into a modded entry
      state.armies.push({ id: 'army_i', name: 'A', bgCount: 1, armyType: 'fp', taskForceIds: [],
        battleGroups: [{ id: 'bg_i', name: 'BG', symbol: 'skull', entries: [
          { id: 'fpe_i1', unitId: u.id, unitType: 'unit', qty: 1, mods: { skill: 2 } }] }] });
      currentArmyId = 'army_i';
      libQuickAddUnit(u.id, 'bg_i', 'unit', null);
      const entries = state.armies[0].battleGroups[0].entries;
      const noMerge = entries.length === 2 && entries[0].qty === 1 && !entries[1].mods;
      return { pass: priced && priced2 && noMerge,
        msg: `stock=${a} modded=${b} cacheStable=${priced2} entriesAfterAdd=${entries.length}` };
    } finally {
      GAME.cost.unitCost = realCost;
      delete GAME.schema.instance;
      currentArmyId = null;
      localStorage.clear();
    }
  });

  // 18. Instance mods are user data: text values must render esc()'d in the
  //     slot row (same rule as the crafted-import XSS cases).
  await check('instance: mods text is escaped in slot rows', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    const u = allUnits()[0];
    GAME.schema.instance = [{ key: 'pilot', label: 'Pilot', kind: 'text', uniqueInstance: true }];
    try {
      state.taskForces.push({ id: 'tf_x', name: 'XSS', tfType: 'infantry', commander: 'C',
        faction: '', notes: '', pointsLimit: 0,
        units: [{ id: 'slot_x1', unitId: u.id, unitType: 'unit', quantity: 1, role: 'core',
          mods: { pilot: '<img src=x onerror="window.__pwned=1">' } }] });
      saveState();
      selectTF('tf_x');
      const panel = document.getElementById('tf-detail-panel');
      const injected = !!panel.querySelector('img[src="x"]') || !!window.__pwned;
      const shown = panel.innerHTML.includes('&lt;img');
      return { pass: !injected && shown, msg: `injected=${injected} escapedVisible=${shown}` };
    } finally { delete GAME.schema.instance; localStorage.clear(); }
  });

  // 19. Migration normalizes garbage mods from crafted saves/imports.
  await check('instance: _migrateState drops non-object mods', () => {
    localStorage.clear();
    state.taskForces = [{ id: 'tf_m', name: 'M', tfType: 'infantry', commander: 'C',
      faction: '', notes: '', pointsLimit: 0,
      units: [{ id: 'slot_m', unitId: 'u', unitType: 'unit', quantity: 1, role: 'core', mods: 'garbage' },
              { id: 'slot_m2', unitId: 'u', unitType: 'unit', quantity: 1, role: 'core', mods: { ok: 1 } }] }];
    _migrateState();
    const s = state.taskForces[0].units;
    return { pass: s[0].mods === undefined && typeof s[1].mods === 'object',
      msg: `garbage=${JSON.stringify(s[0].mods)} kept=${JSON.stringify(s[1].mods)}` };
  });

  // 20. Circumstance modifiers: the stack adds/steps/deduplicates, persists
  //     through save+reload, computes effectiveLimit, and renders in the army
  //     detail with the budget note.
  await check('modifiers: stack applies, persists, computes effectiveLimit', () => {
    localStorage.clear();
    state.taskForces = []; state.armies = []; state.expeditionaryForces = [];
    GAME.modifiers = [
      { key: 'forced_march', label: 'Forced March', group: 'Campaign', scope: 'army', stackable: true,
        effects: [{ type: 'limitDelta', pointsLimit: -50 }, { type: 'ruleText', text: 'No charge moves on turn 1.' }] },
      { key: 'fresh', label: 'Fresh', scope: 'army', stackable: false, excludes: ['forced_march'], effects: [] },
    ];
    try {
      state.armies.push({ id: 'army_c', name: 'Campaign Army', bgCount: 1, pointsLimit: 300,
        taskForceIds: [], battleGroups: [] });
      saveState();
      _armyAddModifier('army_c', 'forced_march');
      _armyAddModifier('army_c', 'forced_march');       // stackable -> n=2
      _armyAddModifier('army_c', 'fresh');
      _armyAddModifier('army_c', 'fresh');              // non-stackable -> no-op
      const a = state.armies.find(x => x.id === 'army_c');
      const stacked = a.modifiers.length === 2 && a.modifiers[0].n === 2;
      const eff = effectiveLimit(a) === 200;            // 300 - 2*50
      // persistence: modifiers ride the whole-state save untouched
      state.armies = [];
      loadState();
      const b = state.armies.find(x => x.id === 'army_c');
      const persisted = !!b && b.modifiers && b.modifiers.length === 2 && b.modifiers[0].n === 2;
      // rendering: stack card + after-modifiers budget note
      currentArmyId = 'army_c';
      renderArmyDetail();
      const html = document.getElementById('army-detail-panel').innerHTML;
      const rendered = html.includes('Forced March') && html.includes('after modifiers') &&
        html.includes('No charge moves');
      return { pass: stacked && eff && persisted && rendered,
        msg: `stacked=${stacked} effLimit=${effectiveLimit(b)} persisted=${persisted} rendered=${rendered}` };
    } finally { delete GAME.modifiers; currentArmyId = null; localStorage.clear(); }
  });

  await check('factions: army select built from GAME.factions.labels', () => {
    _refreshArmyFactionSelect();
    const opts = [...document.querySelectorAll('#army-faction option')].map(o => o.value);
    const expected = ['', ...Object.keys((GAME.factions && GAME.factions.labels) || {}),
      ...(state.customFactions || []).map(cf => cf.id), 'any'];
    const match = JSON.stringify(opts) === JSON.stringify(expected);
    return { pass: match, msg: match ? `${opts.length} options` : `got [${opts.join(',')}] want [${expected.join(',')}]` };
  });

  await browser.close();

  // Report
  let failed = 0;
  for (const c of checks) {
    const tag = c.pass ? 'PASS' : 'FAIL';
    if (!c.pass) failed++;
    console.log(`  [${tag}] ${c.name}${c.pass ? '' : '  -- ' + (c.msg || '')}`);
  }
  if (pageErrors.length) {
    console.log(`  page errors during run: ${pageErrors.length}`);
    pageErrors.forEach(e => console.log('    ! ' + e));
  }
  console.log(`functional: ${checks.length - failed}/${checks.length} passed` +
    (failed ? ` | FAILURES: ${failed}` : '') +
    (pageErrors.length ? ` | pageErrors: ${pageErrors.length}` : ''));
  process.exit(failed || pageErrors.length ? 1 : 0);
})();
