// Rendering & builder-form golden master for the GAME schema.
//
// Captures (a) every card renderer's output for a representative unit set
// (on-screen + print, incl. mech pairs) and (b) the builder form: per-class
// stat-input DOM, gathered unit JSON, weapon-editor DOM, and an editUnit
// round-trip. Use exactly like tools/golden_master.js:
//
//   python3 -m http.server 3000
//   node tools/render_master.js /tmp/before.json    # before your change
//   node tools/render_master.js /tmp/after.json     # after
//   then compare structurally, e.g.:
//   python3 -c "import json,sys; a=json.load(open('/tmp/before.json')); b=json.load(open('/tmp/after.json')); d=[k for k in set(a)|set(b) if a.get(k)!=b.get(k)]; print(d or 'IDENTICAL')"
//
// DOM snapshots normalize whitespace between tags; gathered-unit objects
// should be compared structurally (key order is not significant).
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }
const fs = require('fs');
const URL = process.env.APP_URL || 'http://localhost:3000/index.html';

(async () => {
  const out = process.argv[2];
  if (!out) { console.error('usage: node tools/render_master.js <outfile.json>'); process.exit(2); }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(400);

  const cards = await page.evaluate(() => {
    localStorage.clear();
    const norm = s => String(s).replace(/>\s+</g, '><').trim();
    // representative units: grav (min speed), aircraft (dogfighter/hover/plain),
    // field gun, super heavy, behemoth, plus a transport for mech pairs
    const ids = ['std_reg_inf','pre_leafblade','std_sh_tank','std_paladin','sl_drones','war_longship','std_med_tank','std_air_stk'];
    const snap = {};
    const pal = {cardBg:'#fff',cardBorder:'#ccc',pageText:'#111',mutedText:'#666',wepBg:'#eee',wepBorder:'#ddd',
                 statBg:'#f5f5f5',statBorder:'#eee',ptsBoxBg:'#222',ptsBoxText:'#fff'};
    ids.forEach(id => {
      const u = unitById(id);
      if (!u) return;
      ['unit','independent','hero'].forEach(vt => {
        snap[`card|${id}|${vt}`] = norm(unitCardHTML(u, '', vt, {}));
        snap[`print|${id}|${vt}`] = norm(_pUnitCard(u, vt, '', {}, pal, false));
      });
    });
    // mech pairs (on-screen + print) - infantry/fg carried by an APC
    const apc = unitById('war_longship');
    ['std_reg_inf','std_med_tank'].forEach(id => {
      const u = unitById(id);
      if (!u || !apc) return;
      snap[`mechscreen|${id}`] = norm(mechPairCardHTML(u, apc, mechanizedCount(u, apc, 'unit'), '', 'unit', {}));
      snap[`mechprint|${id}`]  = norm(_pMechPair(u, 'unit', apc, mechanizedCount(u, apc, 'unit'), '', pal, false));
    });
    return snap;
  });

  await page.reload(); await page.waitForTimeout(400);
  const form = await page.evaluate(() => {
    localStorage.clear();
    const norm = s => String(s).replace(/>\s+</g, '><').trim();
    const snap = {};
    const grid = () => document.querySelector('.stand-stats-grid');

    // 1. Per class: form grid DOM + gathered unit + savenumber min/max +
    //    mobility options/disabled state
    Object.keys(CLASS_INFO).forEach(cls => {
      document.getElementById('b-class').value = cls;
      onClassChange();
      const mob = document.getElementById('b-mobility');
      snap[`grid|${cls}`] = norm(grid().innerHTML);
      snap[`gather|${cls}`] = gatherBuilderUnit();
      snap[`meta|${cls}`] = {
        saveMin: document.getElementById('b-savenumber').min,
        saveMax: document.getElementById('b-savenumber').max,
        saveDice: document.getElementById('b-savedice').textContent,
        mobOptions: [...mob.options].map(o=>[o.value,o.textContent]),
        mobDisabled: mob.disabled,
        mobValue: mob.value,
        sizeMin: document.getElementById('b-unit-size').min,
        sizeVal: document.getElementById('b-unit-size').value,
      };
    });

    // 2. Weapon editor DOM with two configured weapons
    document.getElementById('b-class').value = 'afv';
    onClassChange();
    builderWeapons = [
      {name:'Main Gun', mode:'gp', type:'p', range:10, shots:2, impact:5, traits:[['Frag',0]]},
      {name:'', mode:'ai', type:'s', range:2, shots:1, impact:0, traits:[]},
    ];
    renderWeaponRows();
    snap['weaponRows'] = norm(document.getElementById('b-weapons-container').innerHTML);
    snap['gatherWeapons'] = gatherBuilderUnit().weapons;

    // 3. Typed-in values flow through gather (property values, not attributes)
    document.getElementById('b-speed').value = '9';
    document.getElementById('b-aim').value = '3';
    document.getElementById('b-assault').value = '4';
    document.getElementById('b-savenumber').value = '7';
    document.getElementById('b-morale').value = '2';
    document.getElementById('b-mobility').value = 'grav';
    snap['gatherTyped'] = gatherBuilderUnit();

    // 4. editUnit round-trip on a seeded custom unit
    const cu = {id:'custom_rt', name:'RT Unit', description:'d', class:'scout', faction:'',
      speed:7, mobility:'grav', aim:4, assault:1, saveNumber:5, morale:3, customSize:3,
      standTraits:[['Stubborn',1]],
      weapons:[{name:'Zapper', mode:'at', type:'s', range:5, shots:3, impact:4, traits:[['Targeting',0]]}]};
    state.customUnits.push(cu); _unitIdCache=null; _calcPtsCache=null;
    editUnit('custom_rt');
    snap['editGrid'] = norm(grid().innerHTML);
    snap['editGather'] = gatherBuilderUnit();
    snap['editWeaponRows'] = norm(document.getElementById('b-weapons-container').innerHTML);

    return snap;
  });

  const data = {};
  Object.entries(cards).forEach(([k,v]) => data['card:'+k] = v);
  Object.entries(form).forEach(([k,v]) => data['form:'+k] = v);
  fs.writeFileSync(out, JSON.stringify(data, null, 1));
  console.log('captured', Object.keys(data).length, 'entries ->', out, '| errors:', errs.length ? errs.join('|') : 'none');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
