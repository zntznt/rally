// Golden-master regression guard for the GAME cost/org/transport rules.
//
// Dumps every observable output of the points engine to a JSON file so a
// refactor of the GAME pack can be proven behavior-preserving:
//
//   1. serve the app:      python3 -m http.server 3000
//   2. before your change: node tools/golden_master.js /tmp/before.json
//   3. make your change
//   4. after your change:  node tools/golden_master.js /tmp/after.json
//   5. diff:               diff <(jq -S . /tmp/before.json) <(jq -S . /tmp/after.json)
//
// An empty diff means the game math is unchanged. Any diff must be an
// intended rules change, not an accident of the refactor.
//
// Requires Playwright (installed globally in the dev container as
// /opt/node22/lib/node_modules/playwright; adjust the require path if yours
// differs, e.g. to the repo's own node_modules/playwright).
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }
const fs = require('fs');

const URL = process.env.APP_URL || 'http://localhost:3000/index.html';

(async () => {
  const out = process.argv[2];
  if (!out) { console.error('usage: node tools/golden_master.js <outfile.json>'); process.exit(2); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(400);

  const data = await page.evaluate(() => {
    localStorage.clear();
    const snap = {};

    // 1. Full calcPoints for every built-in unit
    snap.unitPoints = {};
    BUILTIN_UNITS.forEach(u => { snap.unitPoints[u.id] = calcPoints(u); });

    // 2. calcPoints for a synthetic custom unit of every class (exercises the
    //    formula, not the officialPts short-circuit)
    snap.customPoints = {};
    Object.keys(CLASS_INFO).forEach(cls => {
      const u = {id:null, name:'X', class:cls, speed:CLASS_INFO[cls].baseSpeed+2, mobility:cls==='ac'?'air':'troop',
        aim:4, assault:1, saveNumber:Math.max(CLASS_INFO[cls].minSave, CLASS_INFO[cls].baseSave-1), morale:4,
        standTraits:[['Stubborn',1]], weapons:[{name:'W',mode:'ai',type:'p',range:5,shots:2,impact:2,traits:[['Frag',0]]}]};
      snap.customPoints[cls] = calcPoints(u);
    });

    // 3. Transport math matrix
    snap.transport = {};
    const apc = BUILTIN_UNITS.find(u=>u.id==='std_apc');
    ['std_reg_inf','std_fg_at'].forEach(id => {
      const u = unitById(id) || BUILTIN_UNITS.find(x=>x.class==='fg');
      if(!u) return;
      ['unit','independent','hero','command','cmdHero'].forEach(vt => {
        snap.transport[`${u.id}|${vt}`] = {
          need: transportSlotsNeeded(u, vt),
          count: apc ? mechanizedCount(u, apc, vt) : null
        };
      });
    });

    // 4. Slot / entry point values incl. support premium + transports
    const tf = {id:'tf_g', name:'G', tfType:'infantry', faction:'', tacAsset:null, units:[
      {id:'sl1', unitId:'std_reg_inf', role:'core',    unitType:'unit',        quantity:2},
      {id:'sl2', unitId:'std_reg_inf', role:'support', unitType:'unit',        quantity:1},
      {id:'sl3', unitId:'std_reg_inf', role:'support', unitType:'independent', quantity:1, transport: apc ? apc.id : undefined},
      {id:'sl4', unitId:'std_med_tank', role:'specialist', unitType:'unit',    quantity:1},
    ]};
    state.taskForces.push(tf);
    snap.tfPoints = tfPoints(tf);
    snap.slotValues = tf.units.map(s => slotPointValue(tf, s));
    snap.sectionLimits = tfSectionLimits(tf);
    snap.maxQty = tf.units.map(s => { const m = maxQtyForSlot(tf, s); return m===Infinity?'inf':m; });

    // 5. Premiums table
    snap.premiums = {};
    Object.keys(CLASS_INFO).forEach(cls => { snap.premiums[cls] = premiumsFor(cls); });

    // 6. Deployment maps + a trait-requirement probe
    snap.viewMaps = {VIEW_PTS_KEY, VIEW_LABELS, ROLE_COST_MAP};
    snap.allowedRoles = {};
    [['Relic Bearer'],['Battle Cry']].forEach(([tn]) => {
      const u = {class:'inf', standTraits:[[tn,1]], weapons:[]};
      snap.allowedRoles[tn] = computeAllowedRoles(u);
    });

    state.taskForces = [];
    return snap;
  });

  fs.writeFileSync(out, JSON.stringify(data, null, 1));
  console.log('captured ->', out, '| errors:', errors.length ? errors.join('|') : 'none');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
