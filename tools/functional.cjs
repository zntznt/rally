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
