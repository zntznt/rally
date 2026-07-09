// Rally Pack Studio codegen. REFERENCE CONTRACT: packs/skirmish.js - every
// emission below mirrors its section order and shapes, because that file is
// the engine's documented minimum surface (GAME members + the 25 alias consts
// the engine's top level reads). If skirmish.js moves, this file moves.
//
// generatePack(project)  -> pack .js source (throws {errors} on validation)
// buildHtml(pack, engine, shell) -> the single-file app, exactly as build.mjs
// validateProject(project) -> [error strings]
//
// Loaded by both the studio page and tools/studio_functional.cjs so the UI
// and the test suite exercise one codegen path.

"use strict";

const KEY_RE = /^[a-z][a-zA-Z0-9_]*$/;

/* ================= validation ================= */

function validateProject(p) {
  const errs = [];
  const key = (v, what) => {
    if (!v) errs.push(`${what}: key is required`);
    else if (!KEY_RE.test(v)) errs.push(`${what}: key "${v}" must match ${KEY_RE}`);
  };
  const uniq = (list, what) => {
    const seen = new Set();
    for (const k of list) {
      if (seen.has(k)) errs.push(`${what}: duplicate key "${k}"`);
      seen.add(k);
    }
  };

  // meta
  key(p.meta.id, "meta.id");
  for (const f of ["name","title","brand","storageKey","appTag"])
    if (!p.meta[f]) errs.push(`meta.${f} is required`);

  // collections must exist
  if (!p.stats.length) errs.push("at least one stat is required");
  if (!p.classes.length) errs.push("at least one class is required");
  if (!p.factions.length) errs.push("at least one faction is required");
  if (!p.orgCharts.length) errs.push("at least one org chart is required");

  p.stats.forEach((s,i) => key(s.key, `stats[${i}]`));
  uniq(p.stats.map(s=>s.key), "stats");
  p.weapon.fields.forEach((f,i) => key(f.key, `weapon.fields[${i}]`));
  uniq(p.weapon.fields.map(f=>f.key), "weapon.fields");
  p.classes.forEach((c,i) => key(c.key, `classes[${i}]`));
  uniq(p.classes.map(c=>c.key), "classes");
  p.factions.forEach((f,i) => key(f.key, `factions[${i}]`));
  uniq(p.factions.map(f=>f.key), "factions");
  p.orgCharts.forEach((c,i) => key(c.key, `orgCharts[${i}]`));
  uniq(p.orgCharts.map(c=>c.key), "orgCharts");
  for (const kind of ["stand","weapon"]) {
    p.traits[kind].forEach((t,i) => key(t.key, `traits.${kind}[${i}]`));
    uniq(p.traits[kind].map(t=>t.key), `traits.${kind}`);
  }
  (p.instance.fields||[]).forEach((f,i) => key(f.key, `instance.fields[${i}]`));
  (p.modifiers||[]).forEach((m,i) => key(m.key, `modifiers[${i}]`));
  (p.cost.currencies||[]).forEach((c,i) => key(c.key, `cost.currencies[${i}]`));

  const classKeys = new Set(p.classes.map(c=>c.key));
  const factionKeys = new Set(p.factions.map(f=>f.key));
  const standKeys = new Set(p.traits.stand.map(t=>t.key));
  const weaponKeys = new Set(p.traits.weapon.map(t=>t.key));
  const statKeys = new Set(p.stats.map(s=>s.key));

  // trait reqs reference real things
  for (const kind of ["stand","weapon"]) {
    const pool = kind === "stand" ? standKeys : weaponKeys;
    p.traits[kind].forEach(t => (t.reqs||[]).forEach(r => {
      const vals = r.vals || [];
      if (r.type === "class")
        vals.forEach(v => { if (v !== "troop" && !classKeys.has(v))
          errs.push(`trait ${t.key}: class req "${v}" is not a class key`); });
      if (r.type === "faction")
        vals.forEach(v => { if (!factionKeys.has(v))
          errs.push(`trait ${t.key}: faction req "${v}" is not a faction key`); });
      if (r.type === "traitr")
        vals.forEach(v => { if (!pool.has(v) && !standKeys.has(v))
          errs.push(`trait ${t.key}: trait req "${v}" is not a trait key`); });
    }));
  }

  // units + expansion uniqueness
  const unitIds = [];
  p.units.forEach((u,i) => {
    const what = `units[${i}] (${u.name || u.id || "?"})`;
    key(u.id, what);
    if (!u.name) errs.push(`${what}: name is required`);
    if (!classKeys.has(u.class)) errs.push(`${what}: class "${u.class}" does not exist`);
    const facs = Array.isArray(u.faction) ? u.faction : (u.faction ? [u.faction] : []);
    facs.forEach(f => { if (f && !factionKeys.has(f)) errs.push(`${what}: faction "${f}" does not exist`); });
    for (const tk of u.standTraits||[]) {
      const base = String(tk).split(":")[0];
      if (!standKeys.has(base)) errs.push(`${what}: stand trait "${base}" does not exist`);
    }
    (u.weapons||[]).forEach((w,j) => (w.traits||[]).forEach(tk => {
      const base = String(tk).split(":")[0];
      if (!weaponKeys.has(base)) errs.push(`${what} weapon[${j}]: weapon trait "${base}" does not exist`);
    }));
    (u.loadouts||[]).forEach((l,j) => {
      if (!l.keySuffix) errs.push(`${what} loadout[${j}]: keySuffix is required`);
      else if (!KEY_RE.test(l.keySuffix)) errs.push(`${what} loadout[${j}]: keySuffix "${l.keySuffix}" must match ${KEY_RE}`);
      if (l.stats) Object.keys(l.stats).forEach(k => { if (!statKeys.has(k))
        errs.push(`${what} loadout[${j}]: stat override "${k}" is not a stat key`); });
      (l.addTraits||[]).forEach(tk => { const base = String(tk).split(":")[0];
        if (!standKeys.has(base)) errs.push(`${what} loadout[${j}]: added trait "${base}" does not exist`); });
      if (Array.isArray(l.weapons)) l.weapons.forEach((w,wj) => (w.traits||[]).forEach(tk => {
        const base = String(tk).split(":")[0];
        if (!weaponKeys.has(base)) errs.push(`${what} loadout[${j}] weapon[${wj}]: trait "${base}" does not exist`); }));
    });
    for (const [id] of expandUnitIds(u)) unitIds.push(id);
  });
  uniq(unitIds, "expanded unit ids");

  if (p.cost.preset === "custom" && !String(p.cost.customSource||"").trim())
    errs.push("cost preset is custom but customSource is empty");
  if (!(p.deployment.enabled||[]).includes("unit"))
    errs.push('deployment.enabled must include "unit"');

  // org chart slot refs
  p.orgCharts.forEach(c => Object.keys(c.slots||{}).forEach(k => {
    if (!classKeys.has(k)) errs.push(`orgChart ${c.key}: slot class "${k}" does not exist`);
  }));
  (p.org.troopClasses||[]).forEach(k => {
    if (!classKeys.has(k)) errs.push(`org.troopClasses: "${k}" is not a class key`);
  });

  return errs;
}

/* ================= emission helpers ================= */

const J = v => JSON.stringify(v);
const J2 = v => JSON.stringify(v, null, 2);

// [id, factionKey] pairs a unit expands to (multi-faction × loadouts).
function expandUnitIds(u) {
  const facs = Array.isArray(u.faction) ? (u.faction.length ? u.faction : [""]) : [u.faction || ""];
  const multi = facs.length > 1;
  const out = [];
  for (const f of facs) {
    const fid = multi ? `${u.id}_${f}` : u.id;
    out.push([fid, f]);
    for (const l of u.loadouts||[]) out.push([`${fid}_${l.keySuffix}`, f]);
  }
  return out;
}

function traitTuple(project, kind, keyExpr) {
  const [k, n] = String(keyExpr).split(":");
  const t = project.traits[kind].find(x => x.key === k);
  const tup = [t.label, t.cost || 0];
  if (n && +n > 1) { tup.push(null); tup.push(+n); }
  return tup;
}

// One concrete pack unit object from a project unit (+ optional loadout).
function concreteUnit(p, u, faction, id, loadout) {
  const out = { id, name: loadout ? `${u.name} (${loadout.label || loadout.keySuffix})` : u.name,
    class: u.class, faction: faction || "", role: u.role || "core", builtIn: true };
  const stats = Object.assign({}, u.stats, loadout && loadout.stats || {});
  for (const s of p.stats) out[s.key] = stats[s.key];
  const traitKeys = (u.standTraits||[]).concat(loadout && loadout.addTraits || []);
  out.standTraits = traitKeys.map(k => traitTuple(p, "stand", k));
  if (p.cost.preset === "fixedPts")
    out.pts = (u.pts || 0) + (loadout ? (loadout.ptsDelta || 0) : 0);
  const size = loadout && loadout.size != null ? loadout.size : u.size;
  if (size != null && size !== "") out.customSize = size;
  if (u.description) out.description = u.description;
  const weapons = (loadout && Array.isArray(loadout.weapons)) ? loadout.weapons : (u.weapons||[]);
  out.weapons = weapons.map(w => {
    const wo = { name: w.name || "" };
    for (const f of p.weapon.fields) wo[f.key] = w[f.key];
    wo.traits = (w.traits||[]).map(k => traitTuple(p, "weapon", k));
    return wo;
  });
  // Reserved fields ride along inertly (the engine ignores unknown members;
  // export/import round-trips them).
  if (u.tags && u.tags.length) out.tags = u.tags;
  if (u.group) out.group = u.group;
  if (u.max != null) out.max = u.max;
  if (u.unique) out.unique = true;
  return out;
}

function expandUnits(p) {
  const out = [];
  for (const u of p.units) {
    const facs = Array.isArray(u.faction) ? (u.faction.length ? u.faction : [""]) : [u.faction || ""];
    const multi = facs.length > 1;
    for (const f of facs) {
      const fid = multi ? `${u.id}_${f}` : u.id;
      out.push(concreteUnit(p, u, f, fid, null));
      for (const l of u.loadouts||[]) out.push(concreteUnit(p, u, f, `${fid}_${l.keySuffix}`, l));
    }
  }
  return out;
}

/* -------- traits -------- */

function emitTraitPool(p, kind) {
  const lines = p.traits[kind].map(t => {
    const opts = {};
    if (t.unitTrait) opts.unitTrait = true;
    if (t.stackable) opts.stackable = true;
    if (t.max != null) opts.max = t.max;
    const parts = [J(t.label), String(t.cost || 0), J(t.desc || "")];
    if (Object.keys(opts).length) parts.push(J(opts));
    return `  ${t.key}: [${parts.join(", ")}],`;
  });
  return `{\n${lines.join("\n")}\n}`;
}
function emitTraitReqs(p) {
  const lines = [];
  for (const kind of ["stand","weapon"])
    for (const t of p.traits[kind])
      if (t.reqs && t.reqs.length)
        lines.push(`  ${t.key}: ${J(t.reqs.map(r => ({type:r.type, vals:r.vals})))},`);
  return `{\n${lines.join("\n")}\n}`;
}

/* -------- cost -------- */

function emitTraitCostMeta(p) {
  // unitCost sees trait TUPLES ([label, cost, x, count]), so scope is keyed by
  // label. Only emitted when some trait carries a nonzero cost.
  const m = {};
  for (const kind of ["stand","weapon"])
    for (const t of p.traits[kind])
      if (t.cost) m[t.label] = t.costScope === "perUnit" ? "perUnit" : "perStand";
  return m;
}

function emitUnitCost(p) {
  if (p.cost.preset === "custom") {
    return `// Custom cost model (author-supplied). Signature (unit, ctx): ctx is
// reserved and currently always undefined. MUST be pure per unit - results
// are memoized per unit.id; never read army or task-force state here.
GAME.cost.unitCost = (${p.cost.customSource.trim()});`;
  }
  const scopeMeta = emitTraitCostMeta(p);
  const traitMath = `
  let tPerStand = 0, tPerUnit = 0;
  const scope = ${J(scopeMeta)};
  const addT = t => {
    const c = (+t[1] || 0) * (t[3] || 1);
    if (scope[t[0]] === "perUnit") tPerUnit += c; else tPerStand += c;
  };
  (unit.standTraits || []).forEach(addT);
  (unit.weapons || []).forEach(w => (w.traits || []).forEach(addT));`;
  const comps = `
  const standComps = [{ label: "Base cost", val: base }];
  if (tPerStand) standComps.push({ label: "Traits", val: tPerStand });
  if (tPerUnit) standComps.push({ label: "Unit upgrades (flat)", val: tPerUnit });`;

  if (p.cost.preset === "weightedSum") {
    const terms = Object.entries(p.cost.weights||{})
      .filter(([k,w]) => statKeyed(p,k) && w)
      .map(([k,w]) => `${+w} * (+unit.${k} || 0)`);
    const sum = terms.length ? terms.join(" + ") : "0";
    return `// Weighted-sum cost model: perStand = max(1, ceil(base + sum(w_i * stat_i)))
// plus trait costs. Pure per unit (memoized per unit.id).
GAME.cost.unitCost = function (unit, ctx) {
  const ci = CLASS_INFO[unit.class] || CLASS_INFO[Object.keys(CLASS_INFO)[0]];
  const size = unit.customSize ? Math.max(1, unit.customSize) : ci.size;
  const base = Math.max(1, Math.ceil(${p.cost.base || 0} + ${sum}));${traitMath}
  const perStand = base + tPerStand;${comps}
  return {
    perStand: perStand,
    unitSize: size,
    defaultSize: ci.size,
    belowDefault: size < ci.size,
    unitPts: perStand * size + tPerUnit,
    indPts: perStand + tPerUnit,
    cmdPts: perStand + tPerUnit,
    heroPts: perStand + tPerUnit,
    cmdHeroPts: perStand + tPerUnit,
    saveDice: ci.saveDice,
    allowedRoles: unit.allowedRoles || null,
    breakdown: { standPts: perStand, standComps: standComps, weaponPts: 0, weaponComps: [], mult: ci.mult },
  };
};`;
  }

  // fixedPts (the skirmish shape, extended: trait costs are honored and
  // per-unit totals are supported via ptsAre).
  const perUnitPts = p.cost.ptsAre === "perUnit";
  return `// Fixed-points cost model: units carry hand-entered pts${perUnitPts ? " (per UNIT total)" : " (per stand/model)"}.
// Trait costs are added (${perUnitPts ? "flat" : "per-stand unless the trait is perUnit-scoped"}).
// Pure per unit (memoized per unit.id).
GAME.cost.unitCost = function (unit, ctx) {
  const ci = CLASS_INFO[unit.class] || CLASS_INFO[Object.keys(CLASS_INFO)[0]];
  const size = unit.customSize ? Math.max(1, unit.customSize) : ci.size;
  const pts = Number.isFinite(+unit.pts) ? +unit.pts : 0;${traitMath}
${perUnitPts
? `  const unitTotal = pts + tPerStand * size + tPerUnit;
  const base = pts, perStand = Math.round((pts / size) * 100) / 100 + tPerStand;`
: `  const base = pts, perStand = pts + tPerStand;
  const unitTotal = perStand * size + tPerUnit;`}${comps}
  const single = ${perUnitPts ? "unitTotal" : "perStand + tPerUnit"};
  return {
    perStand: perStand,
    unitSize: size,
    defaultSize: ci.size,
    belowDefault: size < ci.size,
    unitPts: unitTotal,
    indPts: single,
    cmdPts: single,
    heroPts: single,
    cmdHeroPts: single,
    saveDice: ci.saveDice,
    allowedRoles: unit.allowedRoles || null,
    breakdown: { standPts: perStand, standComps: standComps, weaponPts: 0, weaponComps: [], mult: ci.mult },
  };
};`;
}
function statKeyed(p, k) { return p.stats.some(s => s.key === k); }

function emitPremiums(p) {
  if (String(p.advanced.premiumsSource||"").trim())
    return `// Author-supplied premium model.
GAME.cost.premiumsFor = (${p.advanced.premiumsSource.trim()});`;
  const en = new Set(p.deployment.enabled||[]);
  const prem = t => en.has(t) ? "0.00" : "null";
  return `GAME.cost.premiumsFor = function () {
  // Zero premiums for enabled deployment types; null HIDES a type's cost
  // tile and deployment pill entirely (availableTypesFor skips null).
  return { ind: ${prem("independent")}, cmd: ${prem("command")}, hero: ${prem("hero")}, cmdHero: ${prem("cmdHero")} };
};`;
}

/* -------- org -------- */

function emitOrgFns(p) {
  const o = p.org;
  const src = String(p.advanced.orgSource||"").trim();
  const cmd = o.commandFixed != null
    ? `core => ${+o.commandFixed}`
    : `core => Math.floor(core / ${+o.commandDivisor || 2})`;
  const spec = (+o.specialistDivisor || 1) === 1
    ? `coreOfClass => coreOfClass`
    : `coreOfClass => Math.floor(coreOfClass / ${+o.specialistDivisor})`;
  let out = `GAME.org.supportPremium = ${+o.supportPremium || 0};
GAME.org.supportMax = ${+o.supportMax || 0};
GAME.org.commandRatio = ${cmd};
GAME.org.specialistMax = ${spec};
GAME.org.rankSlots = { senior: n => Math.floor(n / ${+o.seniorDivisor || 4}), lord: n => Math.floor(n / ${+o.lordDivisor || 8}) };
GAME.org.armyScale = n => n >= ${+o.epicAt || 10} ? "epic" : n >= ${+o.largeAt || 5} ? "large" : "normal";
GAME.cost.applySupportPremium = ${(+o.supportPremium || 0) > 0
    ? `base => Math.ceil(base * (1 + ${+o.supportPremium}))`
    : `base => base;   // no support premium`};`;
  if (src) out += `
// Author-supplied org overrides replace the generated functions above.
Object.assign(GAME.org, (${src}));`;
  return out;
}

/* -------- transport -------- */

function emitTransport(p) {
  const src = String(p.advanced.transportSource||"").trim();
  if (src) return `// Author-supplied transport model. canRide/canCarry receive (classKey, unit).
Object.assign(GAME.transport, (${src}));
const transportSlotsFor = GAME.transport.slotsFor;
const transportSlotsNeeded = GAME.transport.slotsNeeded;`;
  return `// No transports in this game: the stub contract the engine expects.
GAME.transport.slotsFor = () => 0;
GAME.transport.slotsNeeded = () => 1;
GAME.transport.canRide = () => false;
GAME.transport.canCarry = () => false;
const transportSlotsFor = GAME.transport.slotsFor;
const transportSlotsNeeded = GAME.transport.slotsNeeded;`;
}

/* -------- schema -------- */

function emitStatFormat(s) {
  switch (s.formatPreset) {
    case "inches": return `u => \`\${u.${s.key}}"\``;
    case "suffix": return `u => \`\${u.${s.key}}${s.suffix || "+"}\``;
    case "custom": return `(${String(s.customFormat||"").trim()})`;
    default:       return `u => \`\${u.${s.key}}\``;
  }
}
function emitStatEdit(s) {
  if (String(s.customEdit||"").trim()) return String(s.customEdit).trim();
  const id = `"b-${s.key}"`;
  const apply = s.classDefaultField
    ? `(el, ci) => { el.value = ci.${s.classDefaultField}; }`
    : `el => { el.value = ${s.value ?? 0}; }`;
  if (s.editPreset === "select") {
    const opts = JSON.stringify(s.options || []);
    return `{ id: ${id}, kind: "select", numeric: true, options: () => (${opts}),
        applyClass: ${apply} }`;
  }
  const after = s.editPreset === "numberSuffix"
    ? `\n        after: \`<span class="stat-sfx">${s.suffix || "+"}</span>\`,` : "";
  return `{ id: ${id}, kind: "number", value: ${s.value ?? 0}, min: ${s.min ?? 0}, max: ${s.max ?? 99}, fallback: ${s.fallback ?? s.value ?? 0},${after}
        applyClass: ${apply} }`;
}
function emitWeaponFieldFormat(f) {
  switch (f.formatPreset) {
    case "rangeOrMelee": return `w => w.${f.key} === 0 ? "Melee" : \`\${w.${f.key}}"\``;
    case "suffix":       return `w => \`\${w.${f.key}}+\``;
    case "custom":       return `(${String(f.customFormat||"").trim()})`;
    default:             return `w => \`\${w.${f.key}}\``;
  }
}
function emitSchema(p) {
  const stats = p.stats.map(s =>
    `    { key: ${J(s.key)}, label: ${J(s.label)}, formLabel: ${J(s.formLabel || s.label)}, format: ${emitStatFormat(s)},
      edit: ${emitStatEdit(s)} },`).join("\n");
  const fields = p.weapon.fields.map(f => {
    const pl = f.printLabel ? `, printLabel: ${J(f.printLabel)}` : "";
    return `      { key: ${J(f.key)}, label: ${J(f.label)}${pl}, format: ${emitWeaponFieldFormat(f)} },`;
  }).join("\n");
  const edits = p.weapon.fields.map(f => {
    if (f.editPreset === "select") {
      const opts = f.optionsFrom === "rangeOpts"
        ? `() => RANGE_OPTS.map(r => ({ v: r.val, l: r.label }))`
        : `() => (${JSON.stringify(f.options || [])})`;
      return `      { key: ${J(f.key)}, label: ${J(f.label)}, kind: "select", numeric: true, options: ${opts} },`;
    }
    return `      { key: ${J(f.key)}, label: ${J(f.label)}, kind: "number", min: ${f.min ?? 0}, max: ${f.max ?? 99}, fallback: ${f.fallback ?? 0} },`;
  }).join("\n");
  const tag = p.weapon.tagPreset === "custom"
    ? `(${String(p.weapon.customTag||"").trim()})`
    : `w => \`\${w.range === 0 ? "Melee" : "Ranged"}\``;
  return `GAME.schema = {
  stats: [
${stats}
  ],
  weapon: {
    tag: ${tag},
    fields: [
${fields}
    ],
    emptyText: ${J(p.weapon.emptyText || "No weapons")},
    edit: [
${edits}
    ],
    initialWeapon: () => (${J(p.weapon.initialDefaults || {})}),
    newWeapon: () => (${J(p.weapon.newDefaults || {})}),
  },
};`;
}

/* -------- reserved surfaces (engine phases pending) -------- */

function emitInstance(p) {
  if (!(p.instance.fields||[]).length) return "";
  const fields = p.instance.fields.map(f => {
    const o = { key:f.key, label:f.label, kind:f.editPreset };
    if (f.value != null) o.value = f.value;
    if (f.min != null) o.min = f.min;
    if (f.max != null) o.max = f.max;
    if (f.maxLen != null) o.maxLen = f.maxLen;
    if (f.editPreset === "select") o.options = f.options || [];
    if (f.badgeWhenNot != null) o.badgeWhenNot = f.badgeWhenNot;
    if (f.appliesTo && f.appliesTo.classes && f.appliesTo.classes.length) o.appliesTo = f.appliesTo;
    if (f.costInert) o.costInert = true;
    if (f.uniqueInstance) o.uniqueInstance = true;
    return "  " + J(o) + ",";
  }).join("\n");
  const ca = p.instance.costAdjust || {};
  const adjust = ca.field ? `
GAME.cost.instanceAdjust = ${J2({ preset: ca.preset || "bracketTable", field: ca.field,
    baseline: ca.baseline, brackets: ca.brackets || [] })};` : "";
  return `
// ── PER-INSTANCE FIELDS ──────────────────────────────────
// Declared now, honored when the engine's instance-mods phase lands: the
// current engine ignores GAME.schema.instance entirely. Rebuild this pack
// against a newer engine to activate per-instance editing/repricing.
GAME.schema.instance = [
${fields}
];${adjust}`;
}

function emitModifiers(p) {
  if (!(p.modifiers||[]).length) return "";
  return `
// ── CIRCUMSTANCE MODIFIERS ───────────────────────────────
// Pack vocabulary for army-level circumstance layers (scenario rules,
// campaign states). Inert to the current engine; the modifier-stack phase
// reads it. army.modifiers = [{key, n?, note?}] is the state shape.
GAME.modifiers = ${J2(p.modifiers)};`;
}

/* ================= generatePack ================= */

function generatePack(project) {
  const p = project;
  const errs = validateProject(p);
  if (errs.length) { const e = new Error("validation failed"); e.errors = errs; throw e; }

  const meta = { id: p.meta.id, name: p.meta.name, edition: p.meta.edition,
    title: p.meta.title, brand: p.meta.brand,
    storageKey: p.meta.storageKey, appTag: p.meta.appTag,
    filePrefix: p.meta.filePrefix || p.meta.id };
  if (p.meta.buyUrl) { meta.buyUrl = p.meta.buyUrl; meta.buyLabel = p.meta.buyLabel || "Buy"; }

  const terms = {};
  for (const k of ["stand","stands","standTraits","taskForce","taskForces",
    "taskForceType","taskForceTypes","commander","battleGroup","battleGroups",
    "army","armies","force","forces","classRules"])
    if (p.terms[k]) terms[k] = p.terms[k];
  terms.profileCols = p.terms.noProfileStrip ? [] : (p.terms.profileCols || []);
  const tn = p.terms.transportNouns || {};
  const tnOut = {};
  for (const k of ["action","paired","badge","icon","rider"]) if (tn[k]) tnOut[k] = tn[k];
  if (Object.keys(tnOut).length) terms.transportNouns = tnOut;
  if (!p.terms.noProfileStrip && (p.terms.profileCols||[]).length)
    terms.profileTipCols = p.terms.profileCols;

  const classes = {};
  for (const c of p.classes) {
    const o = { label: c.label, size: c.size, mult: c.mult, baseSave: c.baseSave,
      saveDice: c.saveDice, baseSpeed: c.baseSpeed, minSave: c.minSave };
    if (c.minSize != null) o.minSize = c.minSize;
    classes[c.key] = o;
  }
  const classProfiles = {};
  for (const c of p.classes) if (c.profile) classProfiles[c.key] = c.profile;

  const factionColors = {}, factionIcons = {}, factionLabels = {};
  for (const f of p.factions) {
    factionColors[f.key] = f.color; factionIcons[f.key] = f.icon; factionLabels[f.key] = f.label;
  }

  const units = expandUnits(p);
  const orgCharts = {};
  for (const c of p.orgCharts) {
    const slots = {};
    for (const [k,v] of Object.entries(c.slots||{}))
      slots[k] = Array.isArray(v) ? v : [v.min ?? 0, v.max ?? 0];
    orgCharts[c.key] = { label: c.label, slots };
  }

  const src = `// ${meta.name} (${meta.edition || "no edition"}) - GENERATED by Rally Pack Studio.
// Project JSON is the source of truth; regenerate rather than hand-editing.
// Contract reference: packs/skirmish.js (GAME members + 25 alias consts).

const GAME = {
  meta: ${J2(meta).replace(/\n/g, "\n  ")},

  terms: ${J2(terms).replace(/\n/g, "\n  ")},
  traits: {}, classes: null, classProfiles: null, factions: {}, units: null,
  tacticalAssets: null, orgCharts: null, deployment: {}, org: {}, cost: {}, transport: {},
};

// ── TRAITS ────────────────────────────────────────────────
GAME.traits.stand = ${emitTraitPool(p, "stand")};
const STAND_TRAITS = GAME.traits.stand;
GAME.traits.weapon = ${emitTraitPool(p, "weapon")};
const WEAPON_TRAITS = GAME.traits.weapon;
GAME.traits.reqs = ${emitTraitReqs(p)};
const TRAIT_REQS = GAME.traits.reqs;

// ── CLASSES ───────────────────────────────────────────────
GAME.classes = ${J2(classes)};
const CLASS_INFO = GAME.classes;
${emitPremiums(p)}
const premiumsFor = GAME.cost.premiumsFor;
GAME.classProfiles = ${J2(classProfiles)};
const CLASS_PROFILE = GAME.classProfiles;
GAME.weapons = {};
GAME.weapons.rangeOpts = ${J(p.weapon.rangeOpts || [])};
const RANGE_OPTS = GAME.weapons.rangeOpts;

// ── UNITS ─────────────────────────────────────────────────
GAME.units = ${J2(units)};
const BUILTIN_UNITS = GAME.units;

// ── COST ENGINE ───────────────────────────────────────────
${emitUnitCost(p)}

// ── FACTIONS ──────────────────────────────────────────────
GAME.factions.colors = ${J(factionColors)};
const FACTION_COLORS = GAME.factions.colors;
GAME.factions.icons = ${J(factionIcons)};
const BUILTIN_FACTION_ICONS = GAME.factions.icons;
GAME.factions.labels = ${J(factionLabels)};
const BUILTIN_FACTION_LABELS = GAME.factions.labels;
const FACTION_LABEL_MAP = GAME.factions.labels;
GAME.factions.keySet = new Set(${J(p.factions.map(f=>f.key))});
const TRAIT_FACTION_NAMES = GAME.factions.keySet;
${p.factionsDefaultKey ? `GAME.factions.defaultKey = ${J(p.factionsDefaultKey)};` : ""}

GAME.tacticalAssets = ${J2((p.tacticalAssets||[]).map(a =>
    ({ id:a.id, name:a.name, faction:a.faction || null, use:a.use || [], fn:a.fn || "" })))};
const TACTICAL_ASSETS = GAME.tacticalAssets;

// ── ORG CHARTS ────────────────────────────────────────────
GAME.orgCharts = ${J2(orgCharts)};
const TF_TYPES = GAME.orgCharts;
GAME.org.sectionTypes = {
  core: ["unit", "independent", "hero"],
  specialist: ["independent", "hero"],
  command: ["command", "cmdHero"],
  support: ["unit", "independent", "hero"],
};
const SECTION_TYPES = GAME.org.sectionTypes;

// ── DEPLOYMENT ────────────────────────────────────────────
GAME.deployment.roleCostMap = { unit: "unit", troop: "unit", independent: "ind", command: "cmd", hero: "hero", cmdHero: "cmdHero" };
const ROLE_COST_MAP = GAME.deployment.roleCostMap;
GAME.deployment.typeLabels = { unit: "Unit", independent: "Independent", hero: "Hero", command: "Command", cmdHero: "Cmd Hero" };
GAME.deployment.ptsKey = { unit: "unitPts", independent: "indPts", hero: "heroPts", command: "cmdPts", cmdHero: "cmdHeroPts" };
GAME.deployment.shortLabels = { unit: "Unit", independent: "Ind", hero: "Hero", command: "Cmd", cmdHero: "H.Cmd" };
const TYPE_LABELS = GAME.deployment.typeLabels;
const VIEW_PTS_KEY = GAME.deployment.ptsKey;
const VIEW_LABELS = GAME.deployment.shortLabels;

// ── ORG TAXONOMY + RATIOS ─────────────────────────────────
GAME.org.classKeys = ${J(p.classes.map(c=>c.key))};
GAME.org.classNames = ${J(Object.fromEntries(p.classes.map(c=>[c.key, c.label])))};
const _TF_CLASS_KEYS = GAME.org.classKeys;
const _TF_CLASS_NAMES = GAME.org.classNames;
GAME.org.troopClasses = ${J(p.org.troopClasses || [])};
const TROOP_CLASSES = GAME.org.troopClasses;
${emitOrgFns(p)}

// ── TRANSPORT ─────────────────────────────────────────────
${emitTransport(p)}

// ── SCHEMA ────────────────────────────────────────────────
${emitSchema(p)}
${emitInstance(p)}${emitModifiers(p)}`;

  // Parse check: catches splice-level syntax damage (bad custom sources,
  // stray backticks in labels) without executing anything.
  try { new Function(src); }
  catch (e) {
    const err = new Error("generated pack does not parse: " + e.message);
    err.errors = ["generated pack does not parse: " + e.message];
    throw err;
  }
  return src;
}

/* ================= buildHtml ================= */

// Mirrors build.mjs exactly: pack + engine concatenated into the shell's
// /*__RALLY_APP__*/ placeholder. The FUNCTION replacer is load-bearing - a
// plain string replacement would corrupt $&-like sequences in the app source.
function buildHtml(packSource, engineSource, shellSource, packName) {
  const app = `/* ==== GAME PACK: ${packName || "studio"} ==== */\n` + packSource +
    "\n" + "/* ==== ENGINE ==== */\n" + engineSource;
  const out = shellSource.replace("/*__RALLY_APP__*/", () => app);
  if (out === shellSource)
    throw new Error("placeholder /*__RALLY_APP__*/ not found in the shell");
  return out;
}

// Node (test) + browser (studio page) export.
if (typeof module !== "undefined" && module.exports)
  module.exports = { validateProject, generatePack, buildHtml, expandUnits };
