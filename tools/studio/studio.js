// Rally Pack Studio - authoring frontend for the Rally engine.
//
// The PROJECT JSON edited here is the source of truth: the generated pack .js
// is never parsed back. Draft persists to localStorage (its own key, distinct
// from any pack's storageKey, because the preview iframe shares this origin);
// projects export/import as envelope-tagged JSON files.
//
// This file owns the model + forms. Codegen (generatePack/buildHtml) lives in
// generate.js so the Playwright suite and the UI share one path.

"use strict";

const DRAFT_KEY = "rally_studio_project_v1";
const PROJECT_TAG = "rally-pack-studio";
const PROJECT_VERSION = 1;

// Vocabulary the engine reads through T(); keys are fixed, labels editable.
const TERM_KEYS = ["stand","stands","standTraits","taskForce","taskForces",
  "taskForceType","taskForceTypes","commander","battleGroup","battleGroups",
  "army","armies","force","forces","classRules"];
const DEPLOYMENT_TYPES = ["unit","independent","command","hero","cmdHero"];
const EFFECT_TYPES = ["ruleText","traitGrant","traitRemove","statShift",
  "costMult","costDelta","availability","orgDelta","limitDelta"];
// Effect types the current engine can honor (the rest are authored + emitted
// but inert until the modifier-stack engine phase lands).
const EFFECT_TYPES_LIVE = ["ruleText","traitGrant"];

let project = null;
let saveTimer = null;

/* ================= model ================= */

function emptyProject() {
  return {
    studio: { app: PROJECT_TAG, version: PROJECT_VERSION },
    meta: { id:"", name:"", edition:"", title:"", brand:"", storageKey:"",
      appTag:"", filePrefix:"", buyUrl:"", buyLabel:"",
      defaultPointsLimit:null, pointsPresets:[] },
    terms: Object.assign(
      { profileCols: [
          {key:"save",label:"Save"},{key:"dtime",label:"Double-Time"},
          {key:"assault",label:"Assault"},{key:"vuln",label:"Vulnerable"},
          {key:"snap",label:"Snap"},{key:"transport",label:"Transport"}],
        noProfileStrip: false,
        transportNouns: {action:"Mechanize",paired:"Mechanized",badge:"Transport",icon:"fa-truck",rider:"infantry"} },
      Object.fromEntries(TERM_KEYS.map(k=>[k,""]))),
    stats: [],
    weapon: { rangeOpts: [], fields: [], emptyText:"No weapons",
      tagPreset:"meleeRanged", customTag:"", initialDefaults:{}, newDefaults:{} },
    classes: [],
    factions: [],
    factionsDefaultKey: "",
    traits: { stand: [], weapon: [] },
    units: [],
    cost: { preset:"fixedPts", ptsAre:"perModel", base:0, weights:{},
      customSource:"", currencies:[] },
    deployment: { enabled: DEPLOYMENT_TYPES.slice() },
    orgCharts: [],
    org: { troopClasses:[], supportPremium:0, supportMax:2,
      commandDivisor:2, commandFixed:null, specialistDivisor:1,
      seniorDivisor:4, lordDivisor:8, largeAt:5, epicAt:10 },
    tacticalAssets: [],
    instance: { fields: [], costAdjust: {preset:"bracketTable", field:"",
      baseline:null, brackets:[], customSource:""} },
    modifiers: [],
    battleGroups: { note:"" },
    advanced: { premiumsSource:"", transportSource:"", orgSource:"" },
  };
}

// A skirmish-equivalent project (renamed identity so it never collides with
// packs/skirmish.js saves). Doubles as living documentation of the schema and
// as the test fixture; keep it in sync with packs/skirmish.js when the
// contract moves.
function skirmishExampleProject() {
  const p = emptyProject();
  p.meta = { id:"skirmish_example", name:"Skirmish Example", edition:"Studio Example",
    title:"Skirmish Example Force Builder", brand:"Skirmish Example Force Builder",
    storageKey:"ls_skirmish_example", appTag:"skirmish-example-army-builder",
    filePrefix:"skirmish-example", buyUrl:"", buyLabel:"",
    defaultPointsLimit:null, pointsPresets:[] };
  Object.assign(p.terms, {
    stand:"Model", stands:"Models", standTraits:"Model Rules",
    taskForce:"Squad", taskForces:"Squads",
    taskForceType:"Squad Type", taskForceTypes:"Squad Types",
    commander:"Sergeant", battleGroup:"Detachment", battleGroups:"Detachments",
    army:"Warband", armies:"Warbands",
    force:"Campaign Roster", forces:"Campaign Rosters",
    classRules:"read-only unit rules",
    profileCols: [
      {key:"save",label:"Save"},{key:"dtime",label:"Advance"},
      {key:"assault",label:"Melee"},{key:"vuln",label:"Weak vs"},
      {key:"snap",label:"Overwatch"},{key:"transport",label:"Transport"}],
  });
  p.stats = [
    { key:"move", label:"Mv", formLabel:"Move", editPreset:"number", suffix:"",
      value:5, min:1, max:12, fallback:5, classDefaultField:"baseSpeed",
      options:[], formatPreset:"inches", customFormat:"", customEdit:"" },
    { key:"toughness", label:"Tuf", formLabel:"Toughness", editPreset:"number", suffix:"",
      value:3, min:1, max:8, fallback:3, classDefaultField:"",
      options:[], formatPreset:"plain", customFormat:"", customEdit:"" },
    { key:"skill", label:"Skl", formLabel:"Skill", editPreset:"numberSuffix", suffix:"+",
      value:4, min:2, max:6, fallback:4, classDefaultField:"",
      options:[], formatPreset:"suffix", customFormat:"", customEdit:"" },
    { key:"nerve", label:"Nrv", formLabel:"Nerve", editPreset:"numberSuffix", suffix:"+",
      value:5, min:2, max:6, fallback:5, classDefaultField:"",
      options:[], formatPreset:"suffix", customFormat:"", customEdit:"" },
  ];
  p.weapon = {
    rangeOpts: [ {label:'6"',val:6},{label:'12"',val:12},{label:'24"',val:24},{label:"Melee",val:0} ],
    fields: [
      { key:"range", label:"Range", printLabel:"Rng", editPreset:"select", optionsFrom:"rangeOpts",
        min:null, max:null, fallback:null, options:[], formatPreset:"rangeOrMelee", customFormat:"" },
      { key:"attacks", label:"Attacks", printLabel:"", editPreset:"number", optionsFrom:"",
        min:1, max:10, fallback:1, options:[], formatPreset:"plain", customFormat:"" },
      { key:"damage", label:"Damage", printLabel:"", editPreset:"number", optionsFrom:"",
        min:0, max:10, fallback:1, options:[], formatPreset:"plain", customFormat:"" },
    ],
    emptyText:"No weapons", tagPreset:"meleeRanged", customTag:"",
    initialDefaults:{ name:"", range:24, attacks:1, damage:1, traits:[] },
    newDefaults:{ name:"", range:12, attacks:1, damage:1, traits:[] },
  };
  p.classes = [
    { key:"troop", label:"Troop", size:5, minSize:1, mult:1, baseSave:6, saveDice:1, baseSpeed:5, minSave:2,
      profile:{ cat:"Infantry", represents:"5 rank-and-file", dtime:"Yes", assault:"Yes",
        vuln:"All", snap:"Move or Fire", transport:"No", save:"6+" } },
    { key:"elite", label:"Elite", size:3, minSize:1, mult:1, baseSave:5, saveDice:1, baseSpeed:6, minSave:2,
      profile:{ cat:"Infantry", represents:"3 specialists", dtime:"Yes", assault:"Yes",
        vuln:"All", snap:"Move or Fire", transport:"No", save:"5+" } },
  ];
  p.factions = [
    { key:"red", label:"Red Coalition", color:"#e53935", icon:"fire" },
    { key:"blue", label:"Blue Federation", color:"#1e88e5", icon:"snowflake" },
  ];
  p.traits.stand = [
    { key:"tough", label:"Tough", cost:0, costScope:"perStand", rated:false,
      desc:"Ignore the first wound each turn.", unitTrait:false, stackable:false, max:null, reqs:[] },
    { key:"fast", label:"Fast", cost:0, costScope:"perStand", rated:false,
      desc:"May move an extra 2\".", unitTrait:false, stackable:false, max:null, reqs:[] },
    { key:"leader", label:"Leader", cost:0, costScope:"perStand", rated:false,
      desc:"[Hero] Friendly models within 6\" reroll Nerve.", unitTrait:true, stackable:false, max:null,
      reqs:[ {type:"role", vals:["hero"]} ] },
  ];
  p.traits.weapon = [
    { key:"ap", label:"AP", cost:0, costScope:"perStand", rated:false,
      desc:"Ignores armour.", unitTrait:false, stackable:false, max:null, reqs:[] },
    { key:"blast", label:"Blast", cost:0, costScope:"perStand", rated:false,
      desc:"Hits all models in base contact.", unitTrait:false, stackable:false, max:null, reqs:[] },
  ];
  p.units = [
    { id:"sk_militia", name:"Militia", class:"troop", faction:"red", role:"core",
      pts:8, size:null, description:"", tags:[],
      stats:{ move:5, toughness:3, skill:4, nerve:5 }, standTraits:[],
      weapons:[ {name:"Rifle", range:24, attacks:1, damage:1, traits:[]} ], loadouts:[],
      group:"", max:null, unique:false, availability:null },
    { id:"sk_veterans", name:"Veterans", class:"troop", faction:"red", role:"core",
      pts:14, size:null, description:"", tags:[],
      stats:{ move:5, toughness:4, skill:3, nerve:4 }, standTraits:["tough"],
      weapons:[ {name:"Rifle", range:24, attacks:1, damage:1, traits:[]} ], loadouts:[],
      group:"", max:null, unique:false, availability:null },
    { id:"sk_commandos", name:"Commandos", class:"elite", faction:"blue", role:"core",
      pts:22, size:null, description:"", tags:[],
      stats:{ move:6, toughness:4, skill:2, nerve:3 }, standTraits:["fast"],
      weapons:[ {name:"Carbine", range:12, attacks:2, damage:1, traits:["ap"]} ], loadouts:[],
      group:"", max:null, unique:false, availability:null },
    { id:"sk_heavy", name:"Heavy Weapon Team", class:"elite", faction:"blue", role:"support",
      pts:30, size:null, description:"", tags:[],
      stats:{ move:4, toughness:4, skill:3, nerve:4 }, standTraits:[],
      weapons:[ {name:"Autocannon", range:24, attacks:3, damage:2, traits:["blast"]} ], loadouts:[],
      group:"", max:null, unique:false, availability:null },
  ];
  p.cost = { preset:"fixedPts", ptsAre:"perModel", base:0, weights:{}, customSource:"", currencies:[] };
  p.deployment = { enabled: DEPLOYMENT_TYPES.slice() };
  p.orgCharts = [
    { key:"patrol", label:"Patrol", slots:{ troop:{min:1,max:4}, elite:{min:0,max:2} }, total:null, allow:[] },
    { key:"strike", label:"Strike Team", slots:{ troop:{min:0,max:2}, elite:{min:1,max:3} }, total:null, allow:[] },
  ];
  p.org = { troopClasses:["troop"], supportPremium:0, supportMax:2,
    commandDivisor:2, commandFixed:null, specialistDivisor:1,
    seniorDivisor:4, lordDivisor:8, largeAt:5, epicAt:10 };
  p.tacticalAssets = [
    { id:"ambush", name:"Ambush", faction:"", use:["Deployment"],
      fn:"One unit deploys after all others, anywhere 9\" from the enemy." },
  ];
  // One display-only modifier so the modifiers form and codegen have a fixture.
  p.modifiers = [
    { key:"night_battle", label:"Night Battle", group:"Scenario", scope:"army",
      stackable:false, excludes:[],
      effects:[ { type:"ruleText",
        text:"Shooting beyond 12\" suffers -1 to hit. Overwatch is not allowed.",
        where:{classes:[],factions:[],tags:[]} } ] },
  ];
  return p;
}

/* ================= path helpers ================= */

function pGet(path) {
  return path.split(".").reduce((o,k)=> (o==null ? undefined : o[k]), project);
}
function pSet(path, v) {
  const parts = path.split(".");
  let o = project;
  for (let i=0;i<parts.length-1;i++) o = o[parts[i]];
  o[parts[parts.length-1]] = v;
}

/* ================= persistence ================= */

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({savedAt: Date.now(), project}));
    setDraftStatus("draft saved", true);
  } catch(e) {
    setDraftStatus("draft NOT saved: " + e.message, false);
  }
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.project || !d.project.studio || d.project.studio.app !== PROJECT_TAG) return null;
    return d.project;
  } catch(e) { return null; }
}
function scheduleSave() {
  setDraftStatus("editing...", false);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 400);
}
function setDraftStatus(txt, saved) {
  const el = document.getElementById("draft-status");
  if (el) { el.textContent = txt; el.classList.toggle("saved", !!saved); }
}

/* ================= export / import ================= */

function downloadBlob(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type: type||"application/json"}));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}
function exportProject() {
  downloadBlob((project.meta.id || "pack") + "-project.json", JSON.stringify(project, null, 2));
}
function importProjectFile(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const p = JSON.parse(r.result);
      if (!p || !p.studio || p.studio.app !== PROJECT_TAG)
        throw new Error("not a Rally Pack Studio project (missing studio.app tag)");
      // Merge onto a fresh skeleton so older project files gain new fields.
      project = deepMerge(emptyProject(), p);
      renderAll(); saveDraft();
    } catch(e) { alert("Import failed: " + e.message); }
  };
  r.readAsText(file);
}
function deepMerge(base, over) {
  if (Array.isArray(over) || typeof over !== "object" || over === null) return over;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return over;
  const out = Object.assign({}, base);
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

/* ================= form infrastructure ================= */

function h(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
// Value coercion by data-t
function coerce(t, raw, el) {
  switch(t) {
    case "num":  return raw === "" ? null : +raw;
    case "bool": return el.checked;
    case "csv":  return raw.split(",").map(s=>s.trim()).filter(Boolean);
    case "csvnum": return raw.split(",").map(s=>s.trim()).filter(Boolean).map(Number);
    case "json": {
      if (raw.trim()==="") return null;
      try { const v = JSON.parse(raw); el.classList.remove("bad"); return v; }
      catch(e) { el.classList.add("bad"); return undefined; } // undefined = don't write
    }
    default: return raw;
  }
}
function fmtVal(t, v) {
  if (v == null) return "";
  if (t === "csv" || t === "csvnum") return Array.isArray(v) ? v.join(", ") : String(v);
  if (t === "json") return typeof v === "string" ? v : JSON.stringify(v);
  return String(v);
}

function inp(path, opts) {
  const o = opts || {};
  const t = o.t || "str";
  const v = fmtVal(t, pGet(path));
  if (o.kind === "textarea")
    return `<textarea data-p="${h(path)}" data-t="${t}" class="${o.cls||""}" placeholder="${h(o.ph||"")}">${h(v)}</textarea>`;
  if (o.kind === "select") {
    const cur = pGet(path);
    return `<select data-p="${h(path)}" data-t="${t}">` +
      (o.options||[]).map(op => {
        const [val,lab] = Array.isArray(op) ? op : [op,op];
        return `<option value="${h(val)}"${String(cur)===String(val)?" selected":""}>${h(lab)}</option>`;
      }).join("") + `</select>`;
  }
  if (o.kind === "check")
    return `<label class="check"><input type="checkbox" data-p="${h(path)}" data-t="bool"${pGet(path)?" checked":""}> ${h(o.label||"")}</label>`;
  const type = o.kind === "color" ? "color" : (t==="num" ? "number" : "text");
  return `<input type="${type}" data-p="${h(path)}" data-t="${t}" value="${h(v)}" placeholder="${h(o.ph||"")}">`;
}
function fld(label, inner, help) {
  return `<div class="fld"><label>${h(label)}</label>${inner}${help?`<span class="help">${help}</span>`:""}</div>`;
}
function itemHead(title, act, idx) {
  return `<div class="item-head"><span class="item-title">${h(title)}</span>
    <button class="btn btn-danger" data-act="${h(act)}" data-idx="${idx}">Remove</button></div>`;
}
function addBtn(act, label) {
  return `<button class="btn-add btn" data-act="${h(act)}">+ ${h(label)}</button>`;
}
function pendingTag(txt) { return `<span class="pending">${h(txt||"engine support pending")}</span>`; }

/* ================= sections ================= */

const SECTIONS = [
  { id:"meta", title:"Meta & Branding", render: renderMeta },
  { id:"terms", title:"Terminology", render: renderTerms },
  { id:"stats", title:"Stat Line", render: renderStats },
  { id:"weapon", title:"Weapon Line", render: renderWeapon },
  { id:"classes", title:"Classes", render: renderClasses },
  { id:"factions", title:"Factions", render: renderFactions },
  { id:"traits", title:"Traits", render: renderTraits },
  { id:"units", title:"Units", render: renderUnits },
  { id:"cost", title:"Cost Model", render: renderCost },
  { id:"deployment", title:"Deployment Types", render: renderDeployment },
  { id:"org", title:"Org Charts & Ratios", render: renderOrg },
  { id:"assets", title:"Tactical Assets", render: renderAssets },
  { id:"instance", title:"Instance Fields", render: renderInstance },
  { id:"modifiers", title:"Modifiers", render: renderModifiers },
  { id:"advanced", title:"Advanced", render: renderAdvanced },
];

function renderMeta() {
  return `<div class="grid">` +
    fld("Pack id", inp("meta.id", {ph:"lowercase_id"}), "filename + build key: <b>packs/&lt;id&gt;.js</b>, <b>node build.mjs &lt;id&gt;</b>") +
    fld("Game name", inp("meta.name")) +
    fld("Edition", inp("meta.edition")) +
    fld("App title", inp("meta.title"), "browser tab title") +
    fld("Nav brand", inp("meta.brand")) +
    fld("Storage key", inp("meta.storageKey", {ph:"ls_mygame"}), "localStorage key - unique per game") +
    fld("App tag", inp("meta.appTag", {ph:"mygame-army-builder"}), "export/import identity tag") +
    fld("File prefix", inp("meta.filePrefix"), "download filename prefix") +
    fld("Buy URL", inp("meta.buyUrl"), "empty hides the Buy link") +
    fld("Buy label", inp("meta.buyLabel")) +
    fld("Default points limit", inp("meta.defaultPointsLimit", {t:"num"})) +
    fld("Points presets", inp("meta.pointsPresets", {t:"csvnum", ph:"150, 200, 300"})) +
    `</div>`;
}

function renderTerms() {
  const termFlds = TERM_KEYS.map(k => fld(k, inp("terms."+k))).join("");
  const cols = (project.terms.profileCols||[]).map((c,i) =>
    `<div class="sub-item"><div class="grid">` +
      fld("Column key", inp(`terms.profileCols.${i}.key`)) +
      fld("Label", inp(`terms.profileCols.${i}.label`)) +
      `</div><button class="btn btn-danger" data-act="del-profilecol" data-idx="${i}">Remove</button></div>`).join("");
  const tn = ["action","paired","badge","icon","rider"].map(k =>
    fld("transport " + k, inp("terms.transportNouns."+k))).join("");
  return `<div class="grid">${termFlds}</div>
    <h3 style="font-size:12px;color:var(--text-muted);margin:10px 0 6px">Class-rules strip columns</h3>
    ${inp("terms.noProfileStrip", {kind:"check", label:"No class-rules strip (omit classProfiles entirely)"})}
    ${project.terms.noProfileStrip ? "" : cols + addBtn("add-profilecol","column")}
    <h3 style="font-size:12px;color:var(--text-muted);margin:14px 0 6px">Transport / attachment nouns</h3>
    <div class="grid">${tn}</div>`;
}

function statDescriptorFields(base, isWeaponField) {
  const s = pGet(base);
  const presetOpts = isWeaponField
    ? [["number","number"],["select","select"]]
    : [["number","number"],["numberSuffix","number + suffix"],["select","select"]];
  const fmtOpts = isWeaponField
    ? [["plain","plain"],["rangeOrMelee","range (Melee at 0)"],["suffix","value + suffix"],["custom","custom JS"]]
    : [["plain","plain"],["suffix","value + suffix"],["inches",'inches (5")'],["custom","custom JS"]];
  let out = `<div class="grid">` +
    fld("Key", inp(base+".key", {ph:"lowercase"})) +
    fld("Card label", inp(base+".label")) +
    (isWeaponField
      ? fld("Print label", inp(base+".printLabel"), "optional shorter print header")
      : fld("Form label", inp(base+".formLabel"))) +
    fld("Edit preset", inp(base+".editPreset", {kind:"select", options:presetOpts})) +
    (!isWeaponField ? fld("Suffix", inp(base+".suffix", {ph:"+"})) : "") +
    (!isWeaponField ? fld("Default value", inp(base+".value", {t:"num"})) : "") +
    fld("Min", inp(base+".min", {t:"num"})) +
    fld("Max", inp(base+".max", {t:"num"})) +
    fld("Fallback", inp(base+".fallback", {t:"num"}), "used when the input parses empty") +
    (!isWeaponField
      ? fld("Class default field", inp(base+".classDefaultField", {ph:"baseSpeed"}),
          "class info field applyClass copies in (empty = keep default value)")
      : fld("Options from", inp(base+".optionsFrom", {kind:"select", options:[["",""],["rangeOpts","rangeOpts"]]}),
          "select preset: draw options from the range list")) +
    fld("Format preset", inp(base+".formatPreset", {kind:"select", options:fmtOpts})) +
    `</div>`;
  if (s && s.editPreset === "select")
    out += fld("Select options (JSON)", inp(base+".options", {t:"json", kind:"textarea", ph:'[{"v":1,"l":"One"}]'}));
  if (s && s.formatPreset === "custom")
    out += fld("Custom format (JS expression body)", inp(base+".customFormat", {kind:"textarea", cls:"src",
      ph:"u => `${u.mykey}+`"}), "function (unit) => display string, spliced verbatim");
  if (s && !isWeaponField)
    out += fld("Custom edit descriptor (JSON, optional)", inp(base+".customEdit", {kind:"textarea",
      ph:"replaces the generated edit descriptor entirely - leave empty normally"}));
  return out;
}

function renderStats() {
  const items = project.stats.map((s,i) =>
    `<div class="item">${itemHead(s.key||("stat "+(i+1)), "del-stat", i)}${statDescriptorFields("stats."+i, false)}</div>`
  ).join("");
  return items + addBtn("add-stat","stat");
}

function renderWeapon() {
  const ro = (project.weapon.rangeOpts||[]).map((r,i) =>
    `<div class="sub-item"><div class="grid">` +
      fld("Label", inp(`weapon.rangeOpts.${i}.label`, {ph:'12"'})) +
      fld("Value", inp(`weapon.rangeOpts.${i}.val`, {t:"num"})) +
      `</div><button class="btn btn-danger" data-act="del-rangeopt" data-idx="${i}">Remove</button></div>`).join("");
  const fieldsHtml = (project.weapon.fields||[]).map((f,i) =>
    `<div class="item">${itemHead(f.key||("field "+(i+1)), "del-wfield", i)}${statDescriptorFields("weapon.fields."+i, true)}</div>`
  ).join("");
  return `<h3 style="font-size:12px;color:var(--text-muted);margin:0 0 6px">Range options</h3>
    ${ro}${addBtn("add-rangeopt","range option")}
    <h3 style="font-size:12px;color:var(--text-muted);margin:14px 0 6px">Weapon fields</h3>
    ${fieldsHtml}${addBtn("add-wfield","weapon field")}
    <div class="grid" style="margin-top:12px">` +
    fld("Empty text", inp("weapon.emptyText")) +
    fld("Tag preset", inp("weapon.tagPreset", {kind:"select", options:[["meleeRanged","Melee / Ranged (range 0 = melee)"],["custom","custom JS"]]})) +
    `</div>` +
    (project.weapon.tagPreset==="custom"
      ? fld("Custom tag (JS)", inp("weapon.customTag", {kind:"textarea", ph:"w => w.range === 0 ? \"Melee\" : \"Ranged\""}))
      : "") +
    fld("Initial weapon defaults (JSON)", inp("weapon.initialDefaults", {t:"json", kind:"textarea"}), "the builder's first weapon row") +
    fld("New weapon defaults (JSON)", inp("weapon.newDefaults", {t:"json", kind:"textarea"}), "added weapon rows");
}

function renderClasses() {
  const items = project.classes.map((c,i) => {
    const base = "classes."+i;
    const profile = c.profile == null ? "" :
      `<h4 style="font-size:11px;color:var(--text-dim);margin:8px 0 4px">Class-rules profile</h4><div class="grid">` +
        ["cat","represents","dtime","assault","vuln","snap","transport","save"]
          .map(k => fld(k, inp(`${base}.profile.${k}`))).join("") + `</div>`;
    return `<div class="item">${itemHead(c.key||("class "+(i+1)), "del-class", i)}
      <div class="grid">` +
      fld("Key", inp(base+".key")) +
      fld("Label", inp(base+".label")) +
      fld("Default size", inp(base+".size", {t:"num"})) +
      fld("Min size", inp(base+".minSize", {t:"num"}), "1 for single-model classes") +
      fld("Cost mult", inp(base+".mult", {t:"num"})) +
      fld("Base save", inp(base+".baseSave", {t:"num"})) +
      fld("Save dice", inp(base+".saveDice", {t:"num"})) +
      fld("Base speed", inp(base+".baseSpeed", {t:"num"})) +
      fld("Min save", inp(base+".minSave", {t:"num"})) +
      `</div>
      <label class="check"><input type="checkbox" data-act-change="toggle-profile" data-idx="${i}"${c.profile!=null?" checked":""}> has class-rules profile</label>
      ${profile}</div>`;
  }).join("");
  return items + addBtn("add-class","class");
}

function renderFactions() {
  const items = project.factions.map((f,i) =>
    `<div class="item">${itemHead(f.key||("faction "+(i+1)), "del-faction", i)}<div class="grid">` +
      fld("Key", inp(`factions.${i}.key`)) +
      fld("Label", inp(`factions.${i}.label`)) +
      fld("Color", inp(`factions.${i}.color`, {kind:"color"})) +
      fld("Icon", inp(`factions.${i}.icon`), "Font Awesome name, e.g. fire") +
      `</div></div>`).join("");
  return items + addBtn("add-faction","faction") +
    `<div style="margin-top:10px">` +
    fld("Default faction key", inp("factionsDefaultKey"),
      "units shown in a no-faction task force (empty = only faction-less units)") +
    `</div>`;
}

function traitItems(kind) {
  return (project.traits[kind]||[]).map((t,i) => {
    const base = `traits.${kind}.${i}`;
    const reqs = (t.reqs||[]).map((r,j) =>
      `<div class="sub-item"><div class="grid">` +
        fld("Req type", inp(`${base}.reqs.${j}.type`, {kind:"select",
          options:[["faction","faction"],["class","class"],["role","role"],["traitr","has trait"]]})) +
        fld("Values", inp(`${base}.reqs.${j}.vals`, {t:"csv", ph:"hero"})) +
        `</div><button class="btn btn-danger" data-act="del-req" data-kind="${kind}" data-idx="${i}" data-sub="${j}">Remove req</button></div>`).join("");
    return `<div class="item">${itemHead(t.key||("trait "+(i+1)), "del-trait-"+kind, i)}
      <div class="grid">` +
      fld("Key", inp(base+".key")) +
      fld("Label", inp(base+".label")) +
      fld("Cost", inp(base+".cost", {t:"num"}), "ignored by fixed-points unless > 0") +
      fld("Cost scope", inp(base+".costScope", {kind:"select", options:[["perStand","per stand/model"],["perUnit","per unit (flat)"]]})) +
      fld("Max stacks", inp(base+".max", {t:"num"})) +
      `</div>` +
      inp(base+".stackable", {kind:"check", label:"stackable (rating / count)"}) +
      inp(base+".rated", {kind:"check", label:"rated display - renders as Label(N)"}) +
      inp(base+".unitTrait", {kind:"check", label:"unit trait (marks the whole unit)"}) +
      fld("Description", inp(base+".desc", {kind:"textarea"})) +
      `<h4 style="font-size:11px;color:var(--text-dim);margin:8px 0 4px">Requirements</h4>
      ${reqs}<button class="btn" data-act="add-req" data-kind="${kind}" data-idx="${i}">+ requirement</button></div>`;
  }).join("");
}
function renderTraits() {
  return `<h3 style="font-size:12px;color:var(--text-muted);margin:0 0 6px">Stand traits</h3>
    ${traitItems("stand")}${addBtn("add-trait-stand","stand trait")}
    <h3 style="font-size:12px;color:var(--text-muted);margin:14px 0 6px">Weapon traits</h3>
    ${traitItems("weapon")}${addBtn("add-trait-weapon","weapon trait")}`;
}

function renderUnits() {
  const classOpts = project.classes.map(c=>[c.key, c.label||c.key]);
  const items = project.units.map((u,i) => {
    const base = `units.${i}`;
    const statFlds = project.stats.map(s =>
      fld(s.formLabel||s.key, inp(`${base}.stats.${s.key}`, {t:"num"}))).join("");
    const weapons = (u.weapons||[]).map((w,j) => {
      const wf = project.weapon.fields.map(f =>
        fld(f.label||f.key, inp(`${base}.weapons.${j}.${f.key}`, {t:"num"}))).join("");
      return `<div class="sub-item"><div class="grid">` +
        fld("Name", inp(`${base}.weapons.${j}.name`)) + wf +
        fld("Weapon traits", inp(`${base}.weapons.${j}.traits`, {t:"csv", ph:"ap, blast:2"}),
          "trait keys, :N for stack count") +
        `</div><button class="btn btn-danger" data-act="del-weapon" data-idx="${i}" data-sub="${j}">Remove weapon</button></div>`;
    }).join("");
    const loadouts = (u.loadouts||[]).map((l,j) => {
      const lbase = `${base}.loadouts.${j}`;
      return `<div class="sub-item"><div class="grid">` +
        fld("Key suffix", inp(lbase+".keySuffix", {ph:"hmg"})) +
        fld("Label", inp(lbase+".label", {ph:"HMG"})) +
        fld("Pts delta", inp(lbase+".ptsDelta", {t:"num"})) +
        fld("Size override", inp(lbase+".size", {t:"num"})) +
        `</div>` +
        fld("Stat overrides (JSON)", inp(lbase+".stats", {t:"json", kind:"textarea", ph:'{"skill": 3}'}),
          "quality grades / variants: override any stat") +
        fld("Weapons override (JSON)", inp(lbase+".weapons", {t:"json", kind:"textarea",
          ph:'[{"name":"HMG","range":24,"attacks":3,"damage":1,"traits":["ap"]}]'}), "replaces the weapon list when set") +
        fld("Added traits", inp(lbase+".addTraits", {t:"csv", ph:"tough"})) +
        `<button class="btn btn-danger" data-act="del-loadout" data-idx="${i}" data-sub="${j}">Remove loadout</button></div>`;
    }).join("");
    return `<div class="item">${itemHead((u.name||"unit "+(i+1)) + (u.id?` [${u.id}]`:""), "del-unit", i)}
      <div class="grid">` +
      fld("Id", inp(base+".id", {ph:"my_unit"})) +
      fld("Name", inp(base+".name")) +
      fld("Class", inp(base+".class", {kind:"select", options:[["",""],...classOpts]})) +
      fld("Faction(s)", inp(base+".faction", {t:"csv", ph:"red"}), "several keys = one entry generated per faction") +
      fld("Role", inp(base+".role", {kind:"select", options:[["core","core"],["support","support"]]})) +
      fld("Points", inp(base+".pts", {t:"num"}), "per-model or per-unit per the cost model") +
      fld("Size override", inp(base+".size", {t:"num"}), "empty = class default") +
      fld("Tags", inp(base+".tags", {t:"csv"}), "modifier/availability selector targets") +
      `</div>` +
      fld("Description", inp(base+".description")) +
      `<div class="grid">${statFlds}</div>` +
      fld("Stand traits", inp(base+".standTraits", {t:"csv", ph:"tough, fast:2"}), "trait keys, :N for stack count") +
      `<h4 style="font-size:11px;color:var(--text-dim);margin:8px 0 4px">Weapons</h4>
      ${weapons}<button class="btn" data-act="add-weapon" data-idx="${i}">+ weapon</button>
      <h4 style="font-size:11px;color:var(--text-dim);margin:8px 0 4px">Loadouts (generated as separate entries)</h4>
      ${loadouts}<button class="btn" data-act="add-loadout" data-idx="${i}">+ loadout</button>
      <details style="margin-top:8px"><summary style="font-size:11px;color:var(--text-dim);cursor:pointer">Reserved fields (validated, not yet engine-enforced)</summary>
      <div class="grid" style="margin-top:8px">` +
      fld("Group / entry id", inp(base+".group")) +
      fld("Max per army", inp(base+".max", {t:"num"})) +
      `</div>` + inp(base+".unique", {kind:"check", label:"unique (0-1 per army)"}) +
      `</details></div>`;
  }).join("");
  return items + addBtn("add-unit","unit");
}

function renderCost() {
  const p = project.cost;
  const weights = p.preset === "weightedSum"
    ? `<div class="grid">` + project.stats.map(s =>
        fld("w · " + (s.formLabel||s.key), inp(`cost.weights.${s.key}`, {t:"num"}))).join("") + `</div>`
    : "";
  const custom = p.preset === "custom"
    ? fld("Custom unitCost source (JS)", inp("cost.customSource", {kind:"textarea", cls:"src",
        ph:"function (unit, ctx) {\n  // must return at least: perStand, unitSize, unitPts, indPts, cmdPts,\n  // heroPts, cmdHeroPts, saveDice, breakdown:{standPts,standComps,weaponPts,weaponComps,mult}\n  // Extra fields are preserved. MUST be pure per unit: results are memoized\n  // per unit.id - never read army/task-force state here.\n}"}),
        "signature <b>(unit, ctx)</b> - ctx is reserved and currently undefined; return AT LEAST the required fields, extras are preserved")
    : "";
  const currencies = (p.currencies||[]).map((c,i) =>
    `<div class="sub-item"><div class="grid">` +
      fld("Key", inp(`cost.currencies.${i}.key`)) +
      fld("Label", inp(`cost.currencies.${i}.label`)) +
      `</div><button class="btn btn-danger" data-act="del-currency" data-idx="${i}">Remove</button></div>`).join("");
  return `<div class="grid">` +
    fld("Preset", inp("cost.preset", {kind:"select", options:[
      ["fixedPts","fixed points (units carry pts)"],
      ["weightedSum","weighted stat sum"],
      ["custom","custom JS"]]})) +
    fld("Points are", inp("cost.ptsAre", {kind:"select", options:[["perModel","per model"],["perUnit","per unit total"]]})) +
    (p.preset==="weightedSum" ? fld("Base", inp("cost.base", {t:"num"})) : "") +
    `</div>${weights}${custom}
    <h3 style="font-size:12px;color:var(--text-muted);margin:14px 0 6px">Currencies ${pendingTag("reserved - only pts is honored")}</h3>
    ${currencies}${addBtn("add-currency","currency")}`;
}

function renderDeployment() {
  const boxes = DEPLOYMENT_TYPES.map(t => {
    const on = (project.deployment.enabled||[]).includes(t);
    return `<label class="check"><input type="checkbox" data-act-change="toggle-deploy" data-key="${t}"${on?" checked":""}> ${t}</label>`;
  }).join("");
  return `<div class="hint">Disabled types are emitted as <b>null</b> premiums, which hides their cost tiles and deployment pills in the app.</div>${boxes}`;
}

function renderOrg() {
  const classKeys = project.classes.map(c=>c.key).filter(Boolean);
  const charts = project.orgCharts.map((oc,i) => {
    const base = `orgCharts.${i}`;
    const slots = classKeys.map(k =>
      `<div class="sub-item"><b style="font-size:11px">${h(k)}</b><div class="grid">` +
      fld("Min", inp(`${base}.slots.${k}.min`, {t:"num"})) +
      fld("Max", inp(`${base}.slots.${k}.max`, {t:"num"})) +
      `</div></div>`).join("");
    return `<div class="item">${itemHead(oc.key||("chart "+(i+1)), "del-orgchart", i)}<div class="grid">` +
      fld("Key", inp(base+".key")) +
      fld("Label", inp(base+".label")) +
      `</div>${slots}
      <details><summary style="font-size:11px;color:var(--text-dim);cursor:pointer">Reserved (not yet engine-enforced)</summary>
      <div class="grid" style="margin-top:8px">` +
      fld("Team total (JSON [min,max])", inp(base+".total", {t:"json", ph:"[3, 5]"})) +
      fld("Allowed unit ids/tags", inp(base+".allow", {t:"csv"})) +
      `</div></details></div>`;
  }).join("");
  return charts + addBtn("add-orgchart","org chart") +
    `<h3 style="font-size:12px;color:var(--text-muted);margin:14px 0 6px">Ratios & taxonomy</h3><div class="grid">` +
    fld("Troop classes", inp("org.troopClasses", {t:"csv"}), "classes counted as troops for reqs") +
    fld("Support premium", inp("org.supportPremium", {t:"num"}), "0 = applySupportPremium is identity") +
    fld("Support max", inp("org.supportMax", {t:"num"})) +
    fld("Command divisor", inp("org.commandDivisor", {t:"num"}), "cmd max = floor(core / divisor)") +
    fld("Command fixed", inp("org.commandFixed", {t:"num"}), "overrides divisor with a constant when set") +
    fld("Specialist divisor", inp("org.specialistDivisor", {t:"num"}), "specialist max = floor(coreOfClass / divisor)") +
    fld("Senior rank divisor", inp("org.seniorDivisor", {t:"num"})) +
    fld("Lord rank divisor", inp("org.lordDivisor", {t:"num"})) +
    fld("Large army at", inp("org.largeAt", {t:"num"})) +
    fld("Epic army at", inp("org.epicAt", {t:"num"})) +
    `</div>`;
}

function renderAssets() {
  const items = project.tacticalAssets.map((a,i) =>
    `<div class="item">${itemHead(a.name||("asset "+(i+1)), "del-asset", i)}<div class="grid">` +
      fld("Id", inp(`tacticalAssets.${i}.id`)) +
      fld("Name", inp(`tacticalAssets.${i}.name`)) +
      fld("Faction", inp(`tacticalAssets.${i}.faction`), "empty = any faction") +
      fld("Use", inp(`tacticalAssets.${i}.use`, {t:"csv", ph:"Deployment, Activation"})) +
      `</div>` + fld("Effect text", inp(`tacticalAssets.${i}.fn`, {kind:"textarea"})) + `</div>`).join("");
  return items + addBtn("add-asset","tactical asset");
}

function renderInstance() {
  const fields = (project.instance.fields||[]).map((f,i) => {
    const base = `instance.fields.${i}`;
    return `<div class="item">${itemHead(f.key||("field "+(i+1)), "del-instfield", i)}<div class="grid">` +
      fld("Key", inp(base+".key")) +
      fld("Label", inp(base+".label")) +
      fld("Kind", inp(base+".editPreset", {kind:"select", options:[["number","number"],["select","select"],["text","text"]]})) +
      fld("Default", inp(base+".value", {t:"num"})) +
      fld("Min", inp(base+".min", {t:"num"})) +
      fld("Max", inp(base+".max", {t:"num"})) +
      fld("Max length", inp(base+".maxLen", {t:"num"}), "text kind") +
      fld("Badge unless equal to", inp(base+".badgeWhenNot", {t:"num"}), "slot pill hidden at this value") +
      fld("Applies to classes", inp(base+".appliesTo.classes", {t:"csv"})) +
      `</div>` +
      (f.editPreset==="select" ? fld("Options (JSON)", inp(base+".options", {t:"json", kind:"textarea", ph:'[{"v":"std","l":"Standard"}]'})) : "") +
      inp(base+".costInert", {kind:"check", label:"cost-inert (never affects points)"}) +
      inp(base+".uniqueInstance", {kind:"check", label:"unique instance (clamps quantity to 1 when set)"}) +
      `</div>`;
  }).join("");
  const ca = project.instance.costAdjust || {};
  return `<div class="hint">Per-fielded-instance state (pilot skill, ammo, campaign notes). Authored and emitted as <b>GAME.schema.instance</b> now; the engine honors it when the instance-mods phase lands.${pendingTag()}</div>` +
    fields + addBtn("add-instfield","instance field") +
    `<h3 style="font-size:12px;color:var(--text-muted);margin:14px 0 6px">Cost adjustment</h3><div class="grid">` +
    fld("Preset", inp("instance.costAdjust.preset", {kind:"select", options:[["bracketTable","bracket table"],["custom","custom JS"]]})) +
    fld("Driven by field", inp("instance.costAdjust.field")) +
    fld("Baseline value", inp("instance.costAdjust.baseline", {t:"num"})) +
    `</div>` +
    (ca.preset==="bracketTable"
      ? fld("Brackets (JSON)", inp("instance.costAdjust.brackets", {t:"json", kind:"textarea",
          ph:'[{"ptsMax":7,"perStepBetter":1,"perStepWorse":-1}]'}))
      : fld("Custom adjust (JS)", inp("instance.costAdjust.customSource", {kind:"textarea", cls:"src",
          ph:"(basePts, mods, unit) => adjustedPts"})));
}

function renderModifiers() {
  const items = (project.modifiers||[]).map((m,i) => {
    const base = `modifiers.${i}`;
    const effects = (m.effects||[]).map((e,j) => {
      const ebase = `${base}.effects.${j}`;
      const live = EFFECT_TYPES_LIVE.includes(e.type);
      const params = e.type === "ruleText"
        ? fld("Rule text", inp(ebase+".text", {kind:"textarea"}))
        : e.type === "traitGrant" || e.type === "traitRemove"
        ? fld("Trait key", inp(ebase+".trait"))
        : e.type === "statShift"
        ? `<div class="grid">${fld("Stat key", inp(ebase+".stat"))}${fld("Delta", inp(ebase+".delta", {t:"num"}))}</div>`
        : e.type === "costMult"
        ? fld("Multiplier", inp(ebase+".mult", {t:"num"}))
        : e.type === "costDelta"
        ? fld("Delta pts", inp(ebase+".delta", {t:"num"}))
        : e.type === "limitDelta"
        ? fld("Points limit delta", inp(ebase+".pointsLimit", {t:"num"}))
        : fld("Params (JSON)", inp(ebase+".params", {t:"json", kind:"textarea"}));
      return `<div class="sub-item">
        <div class="grid">` +
        fld("Effect type", inp(ebase+".type", {kind:"select", options:EFFECT_TYPES.map(t=>[t,t])})) + `</div>
        ${live ? "" : pendingTag()}
        ${params}
        <div class="grid">` +
        fld("Where: classes", inp(ebase+".where.classes", {t:"csv"})) +
        fld("Where: factions", inp(ebase+".where.factions", {t:"csv"})) +
        fld("Where: tags", inp(ebase+".where.tags", {t:"csv"})) +
        `</div><button class="btn btn-danger" data-act="del-effect" data-idx="${i}" data-sub="${j}">Remove effect</button></div>`;
    }).join("");
    return `<div class="item">${itemHead(m.key||("modifier "+(i+1)), "del-modifier", i)}<div class="grid">` +
      fld("Key", inp(base+".key")) +
      fld("Label", inp(base+".label")) +
      fld("Group", inp(base+".group"), "picker section header") +
      fld("Scope", inp(base+".scope", {kind:"select", options:[["army","army"],["taskForce","task force"],["slot","slot"]]})) +
      fld("Excludes", inp(base+".excludes", {t:"csv"}), "modifier keys this one conflicts with") +
      `</div>` +
      inp(base+".stackable", {kind:"check", label:"stackable (may be applied more than once)"}) +
      `<h4 style="font-size:11px;color:var(--text-dim);margin:8px 0 4px">Effects</h4>
      ${effects}<button class="btn" data-act="add-effect" data-idx="${i}">+ effect</button></div>`;
  }).join("");
  return `<div class="hint">Circumstance layers stacked on an army (scenario rules, campaign fatigue, supply states). Emitted as <b>GAME.modifiers</b>; the current engine honors <b>ruleText</b>/<b>traitGrant</b> display when the modifier-stack phase lands - other effect types are authored now, applied later.</div>` +
    items + addBtn("add-modifier","modifier");
}

function renderAdvanced() {
  return `<div class="hint">Whole-section raw-JS escape hatches, spliced verbatim into the pack. They run only in your builds and previews.</div>` +
    fld("premiumsSource - replaces GAME.cost.premiumsFor", inp("advanced.premiumsSource", {kind:"textarea", cls:"src",
      ph:'function (cls) {\n  return { ind: 0.20, cmd: 0.50, hero: 0.50, cmdHero: 0.80 };\n  // return null values to hide a deployment type for a class\n}'})) +
    fld("transportSource - replaces GAME.transport (all four hooks)", inp("advanced.transportSource", {kind:"textarea", cls:"src",
      ph:'{\n  slotsFor: unit => 0,          // capacity a carrier offers\n  slotsNeeded: (unit, unitType) => 1,\n  canRide: (cls, unit) => false, // unit-aware since the seam fixes\n  canCarry: (cls, unit) => false\n}'})) +
    fld("orgSource - replaces the generated org functions", inp("advanced.orgSource", {kind:"textarea", cls:"src",
      ph:'{\n  commandRatio: core => Math.floor(core / 2),\n  specialistMax: coreOfClass => coreOfClass,\n  rankSlots: { senior: n => Math.floor(n/4), lord: n => Math.floor(n/8) },\n  armyScale: n => n >= 10 ? "epic" : n >= 5 ? "large" : "normal"\n}'})) +
    fld("Battle groups note", inp("battleGroups.note", {kind:"textarea"}),
      "documentation only: the engine currently hardcodes battle-group sizing (min = ceil(largest/2), 3 independents count as 1)");
}

/* ================= structural actions ================= */

const ACTIONS = {
  "add-stat":      () => project.stats.push({key:"",label:"",formLabel:"",editPreset:"number",suffix:"",value:0,min:0,max:10,fallback:0,classDefaultField:"",options:[],formatPreset:"plain",customFormat:"",customEdit:""}),
  "del-stat":      (i) => project.stats.splice(i,1),
  "add-profilecol":() => (project.terms.profileCols = project.terms.profileCols||[]).push({key:"",label:""}),
  "del-profilecol":(i) => project.terms.profileCols.splice(i,1),
  "add-rangeopt":  () => project.weapon.rangeOpts.push({label:"",val:0}),
  "del-rangeopt":  (i) => project.weapon.rangeOpts.splice(i,1),
  "add-wfield":    () => project.weapon.fields.push({key:"",label:"",printLabel:"",editPreset:"number",optionsFrom:"",min:0,max:10,fallback:0,options:[],formatPreset:"plain",customFormat:""}),
  "del-wfield":    (i) => project.weapon.fields.splice(i,1),
  "add-class":     () => project.classes.push({key:"",label:"",size:5,minSize:null,mult:1,baseSave:6,saveDice:1,baseSpeed:5,minSave:2,profile:null}),
  "del-class":     (i) => project.classes.splice(i,1),
  "add-faction":   () => project.factions.push({key:"",label:"",color:"#888888",icon:""}),
  "del-faction":   (i) => project.factions.splice(i,1),
  "add-trait-stand":  () => project.traits.stand.push(newTrait()),
  "del-trait-stand":  (i) => project.traits.stand.splice(i,1),
  "add-trait-weapon": () => project.traits.weapon.push(newTrait()),
  "del-trait-weapon": (i) => project.traits.weapon.splice(i,1),
  "add-unit":      () => project.units.push(newUnit()),
  "del-unit":      (i) => project.units.splice(i,1),
  "add-currency":  () => project.cost.currencies.push({key:"",label:""}),
  "del-currency":  (i) => project.cost.currencies.splice(i,1),
  "add-orgchart":  () => project.orgCharts.push({key:"",label:"",slots:Object.fromEntries(project.classes.map(c=>[c.key,{min:0,max:2}])),total:null,allow:[]}),
  "del-orgchart":  (i) => project.orgCharts.splice(i,1),
  "add-asset":     () => project.tacticalAssets.push({id:"",name:"",faction:"",use:[],fn:""}),
  "del-asset":     (i) => project.tacticalAssets.splice(i,1),
  "add-instfield": () => project.instance.fields.push({key:"",label:"",editPreset:"number",value:null,min:null,max:null,maxLen:null,options:[],badgeWhenNot:null,formatPreset:"plain",appliesTo:{classes:[]},costInert:false,uniqueInstance:false}),
  "del-instfield": (i) => project.instance.fields.splice(i,1),
  "add-modifier":  () => project.modifiers.push({key:"",label:"",group:"",scope:"army",stackable:false,excludes:[],effects:[]}),
  "del-modifier":  (i) => project.modifiers.splice(i,1),
};
function newTrait() {
  return {key:"",label:"",cost:0,costScope:"perStand",rated:false,desc:"",unitTrait:false,stackable:false,max:null,reqs:[]};
}
function newUnit() {
  return {id:"",name:"",class:project.classes[0]?.key||"",faction:"",role:"core",
    pts:0,size:null,description:"",tags:[],
    stats:Object.fromEntries(project.stats.map(s=>[s.key, s.value??0])),
    standTraits:[], weapons:[], loadouts:[], group:"", max:null, unique:false, availability:null};
}

// Actions with a sub-index (nested lists)
function runAction(act, el) {
  const i = +el.dataset.idx, j = +el.dataset.sub, kind = el.dataset.kind;
  switch(act) {
    case "add-req":     project.traits[kind][i].reqs.push({type:"role",vals:[]}); break;
    case "del-req":     project.traits[kind][i].reqs.splice(j,1); break;
    case "add-weapon":  project.units[i].weapons.push(JSON.parse(JSON.stringify(project.weapon.newDefaults||{})) ); break;
    case "del-weapon":  project.units[i].weapons.splice(j,1); break;
    case "add-loadout": project.units[i].loadouts.push({keySuffix:"",label:"",ptsDelta:0,size:null,stats:null,weapons:null,addTraits:[]}); break;
    case "del-loadout": project.units[i].loadouts.splice(j,1); break;
    case "add-effect":  project.modifiers[i].effects.push({type:"ruleText",text:"",where:{classes:[],factions:[],tags:[]}}); break;
    case "del-effect":  project.modifiers[i].effects.splice(j,1); break;
    default:
      if (ACTIONS[act]) ACTIONS[act](i);
      else return false;
  }
  return true;
}

/* ================= render ================= */

function renderAll() {
  const nav = document.getElementById("side-nav");
  nav.innerHTML = SECTIONS.map(s=>`<a href="#sec-${s.id}">${h(s.title)}</a>`).join("");
  const main = document.getElementById("form-col");
  main.innerHTML = SECTIONS.map(s =>
    `<section class="card" id="sec-${s.id}" data-sec="${s.id}"><h2>${h(s.title)}</h2><div class="sec-body">${s.render()}</div></section>`
  ).join("");
}
function rerenderSection(id) {
  const sec = SECTIONS.find(s=>s.id===id);
  const el = document.querySelector(`#sec-${id} .sec-body`);
  if (sec && el) el.innerHTML = sec.render();
}
function sectionOf(el) {
  const sec = el.closest("[data-sec]");
  return sec ? sec.dataset.sec : null;
}

/* ================= generation + preview ================= */

let _sources = null;      // {engine, shell} cache
let _lastBlobUrl = null;

async function fetchSources() {
  if (_sources) return _sources;
  try {
    const [engine, shell] = await Promise.all([
      fetch("../../engine/app.js").then(r => { if (!r.ok) throw new Error("engine " + r.status); return r.text(); }),
      fetch("../../src/shell.html").then(r => { if (!r.ok) throw new Error("shell " + r.status); return r.text(); }),
    ]);
    _sources = { engine, shell };
    return _sources;
  } catch (e) {
    document.getElementById("serve-warning").style.display = "block";
    throw e;
  }
}

function tryGenerate() {
  try { return { pack: generatePack(project) }; }
  catch (e) { return { errors: e.errors || [e.message] }; }
}

function showPreviewPanel() { document.getElementById("preview-wrap").style.display = "flex"; }
function setPreviewStatus(html, errsText) {
  showPreviewPanel();
  document.getElementById("preview-status").innerHTML = html;
  document.getElementById("preview-errors").textContent = errsText || "";
}

// The preview copy is instrumented (error listener + boot beacon); download
// copies are byte-pristine. Splices use indexOf+slice - the same reason
// buildHtml uses a function replacer: $&-like sequences in the app source.
function instrumentHtml(html) {
  const probe = `<script>
window.addEventListener("error", function (e) {
  parent.postMessage({ studio: "err", msg: String(e.message||e), line: e.lineno||0, src: String(e.filename||"") }, "*");
});
window.addEventListener("unhandledrejection", function (e) {
  parent.postMessage({ studio: "err", msg: "unhandled rejection: " + String(e.reason) }, "*");
});
<\/script>`;
  const beacon = `<script>
// typeof guard: the pack's top-level "const GAME" is scoped to the script,
// not mirrored onto window, so window.GAME would read undefined.
parent.postMessage({ studio: "boot",
  title: document.title,
  name: (typeof GAME !== "undefined" && GAME.meta && GAME.meta.name) || "" }, "*");
<\/script>`;
  const headAt = html.indexOf("<head>");
  if (headAt < 0) throw new Error("<head> not found in shell");
  let out = html.slice(0, headAt + 6) + probe + html.slice(headAt + 6);
  const bodyEnd = out.lastIndexOf("</body>");
  if (bodyEnd < 0) throw new Error("</body> not found in shell");
  out = out.slice(0, bodyEnd) + beacon + out.slice(bodyEnd);
  return out;
}

let _previewErrors = [];
async function generateAndPreview() {
  const g = tryGenerate();
  if (g.errors) {
    setPreviewStatus(`<span style="color:#ef5350;font-weight:bold">Validation failed (${g.errors.length})</span>`,
      g.errors.map(e => "- " + e).join("\n"));
    document.getElementById("preview-frame").style.display = "none";
    return;
  }
  let sources;
  try { sources = await fetchSources(); }
  catch (e) { setPreviewStatus(`<span style="color:#ef5350">Cannot fetch engine/shell: ${h(e.message)}</span>`); return; }
  let html;
  try { html = instrumentHtml(buildHtml(g.pack, sources.engine, sources.shell, project.meta.id)); }
  catch (e) { setPreviewStatus(`<span style="color:#ef5350">Build failed: ${h(e.message)}</span>`); return; }

  _previewErrors = [];
  setPreviewStatus(`<span style="color:var(--text-muted)">Booting...</span>`);
  if (_lastBlobUrl) URL.revokeObjectURL(_lastBlobUrl);
  _lastBlobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const frame = document.getElementById("preview-frame");
  frame.style.display = "block";
  frame.src = _lastBlobUrl;
  document.getElementById("btn-reset-preview").style.display = "inline-block";
  document.getElementById("btn-close-preview").style.display = "inline-block";
}

function onPreviewMessage(ev) {
  const d = ev.data;
  if (!d || !d.studio) return;
  if (d.studio === "err") {
    _previewErrors.push(`${d.msg}${d.line ? ` (line ${d.line})` : ""}`);
    setPreviewStatus(`<span style="color:#ef5350;font-weight:bold">Pack errored (${_previewErrors.length})</span>`,
      _previewErrors.map(e => "! " + e).join("\n"));
  } else if (d.studio === "boot" && !_previewErrors.length) {
    setPreviewStatus(`<span style="color:#66bb6a;font-weight:bold">Pack booted:</span> ${h(d.title)} <span style="color:var(--text-muted)">(GAME.meta.name = ${h(d.name)})</span>`);
  }
}

async function downloadPack() {
  const g = tryGenerate();
  if (g.errors) { generateAndPreview(); return; }
  downloadBlob((project.meta.id || "pack") + ".js", g.pack, "text/javascript");
}
async function downloadHtml() {
  const g = tryGenerate();
  if (g.errors) { generateAndPreview(); return; }
  let sources;
  try { sources = await fetchSources(); }
  catch (e) { setPreviewStatus(`<span style="color:#ef5350">Cannot fetch engine/shell: ${h(e.message)}</span>`); return; }
  try {
    downloadBlob("index.html", buildHtml(g.pack, sources.engine, sources.shell, project.meta.id), "text/html");
  } catch (e) { setPreviewStatus(`<span style="color:#ef5350">Build failed: ${h(e.message)}</span>`); }
}

/* ================= wiring ================= */

function boot() {
  project = loadDraft();
  if (project) setDraftStatus("draft restored", true);
  else { project = emptyProject(); setDraftStatus("new project", false); }
  renderAll();

  const main = document.getElementById("form-col");
  // Write-through for every value input.
  main.addEventListener("input", ev => {
    const el = ev.target;
    if (!el.dataset || !el.dataset.p) return;
    const v = coerce(el.dataset.t || "str", el.value, el);
    if (v !== undefined) pSet(el.dataset.p, v);
    scheduleSave();
  });
  // Selects/checkboxes that alter which fields are visible re-render their section.
  main.addEventListener("change", ev => {
    const el = ev.target;
    if (el.dataset && el.dataset.actChange) {
      const i = +el.dataset.idx;
      if (el.dataset.actChange === "toggle-profile") {
        project.classes[i].profile = el.checked
          ? {cat:"",represents:"",dtime:"",assault:"",vuln:"",snap:"",transport:"",save:""} : null;
      } else if (el.dataset.actChange === "toggle-deploy") {
        const k = el.dataset.key, en = new Set(project.deployment.enabled||[]);
        el.checked ? en.add(k) : en.delete(k);
        project.deployment.enabled = DEPLOYMENT_TYPES.filter(t=>en.has(t));
      }
      scheduleSave();
      const sid = sectionOf(el); if (sid) rerenderSection(sid);
      return;
    }
    if (!el.dataset || !el.dataset.p) return;
    // Presets that reveal conditional fields
    const revealers = [".editPreset",".formatPreset",".type","cost.preset","weapon.tagPreset",
      "instance.costAdjust.preset","terms.noProfileStrip"];
    if (revealers.some(r => el.dataset.p.endsWith(r) || el.dataset.p === r)) {
      const sid = sectionOf(el); if (sid) rerenderSection(sid);
    }
  });
  // Structural add/remove buttons.
  main.addEventListener("click", ev => {
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    if (runAction(el.dataset.act, el)) {
      scheduleSave();
      const sid = sectionOf(el); if (sid) rerenderSection(sid);
    }
  });

  document.getElementById("btn-example").addEventListener("click", () => {
    if (project && JSON.stringify(project) !== JSON.stringify(emptyProject()) &&
        !confirm("Replace the current draft with the Skirmish example?")) return;
    project = skirmishExampleProject();
    renderAll(); saveDraft();
  });
  document.getElementById("btn-export").addEventListener("click", exportProject);
  document.getElementById("btn-import").addEventListener("click", () =>
    document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", ev => {
    if (ev.target.files && ev.target.files[0]) importProjectFile(ev.target.files[0]);
    ev.target.value = "";
  });

  document.getElementById("btn-generate").addEventListener("click", generateAndPreview);
  document.getElementById("btn-dl-pack").addEventListener("click", downloadPack);
  document.getElementById("btn-dl-html").addEventListener("click", downloadHtml);
  document.getElementById("btn-reset-preview").addEventListener("click", () => {
    // The blob: iframe shares this origin, so the previewed pack's saves live
    // in OUR localStorage under its storageKey.
    if (project.meta.storageKey) {
      localStorage.removeItem(project.meta.storageKey);
      localStorage.removeItem(project.meta.storageKey + "_corrupt");
    }
    const frame = document.getElementById("preview-frame");
    if (frame.src) frame.src = frame.src; // reload
  });
  document.getElementById("btn-close-preview").addEventListener("click", () => {
    const frame = document.getElementById("preview-frame");
    frame.src = "about:blank";
    document.getElementById("preview-wrap").style.display = "none";
    if (_lastBlobUrl) { URL.revokeObjectURL(_lastBlobUrl); _lastBlobUrl = null; }
  });
  window.addEventListener("message", onPreviewMessage);
}

document.addEventListener("DOMContentLoaded", boot);
