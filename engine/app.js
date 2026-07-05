







function renderClassProfile() {
  const cls = document.getElementById("b-class").value;
  const ci = CLASS_INFO[cls], cp = CLASS_PROFILE[cls];
  const el = document.getElementById("b-class-profile");
  if(!el || !cp) { if(el) el.innerHTML=""; return; }
  // Column headers come from GAME.terms.profileCols (pack-driven) with a
  // fallback to LaserStorm's columns so a pack that omits them still renders.
  const cols = (GAME.terms && GAME.terms.profileCols) || [
    {key:"save",label:"Save"},{key:"dtime",label:"Double-Time"},{key:"assault",label:"Assault"},
    {key:"vuln",label:"Vulnerable"},{key:"snap",label:"Snap"},{key:"transport",label:"Transport"},
  ];
  el.innerHTML = `
    <div class="cp-head"><i class="fa-solid fa-circle-info"></i> <b>${cp.cat}</b> represents ${cp.represents} &bull; <span style="color:var(--text-faint)">${T("classRules")}</span></div>
    <div class="cp-tags">
      ${cols.map(c=>`<span class="cp-tag"><b>${esc(c.label)}</b><span>${cp[c.key]!=null?cp[c.key]:""}</span></span>`).join("")}
    </div>`;
}



// ============================================================
// STATE
// ============================================================
const SCHEMA_VERSION = 1;
let state = {
  schemaVersion: SCHEMA_VERSION,
  customUnits: [],
  customFactions: [],
  customTraits: [],
  customTFTypes: [],
  customTacticalAssets: [],
  taskForces: [],
  armies: [],
  expeditionaryForces: [],
  tfTemplates: []
};

let currentBuilderTraits = [];
let builderFactionPrev = "";
let builderMobilityPrev = "";
let builderSelectedRole = "unit";
let builderBreakdownOpen = false;
let editingCustomTraitId = null;
let editingCustomFactionId = null;
let currentWeaponTraits = {};
let traitPickerTarget = null;
let traitPickerStepperCounts = {};
let traitPickerWeaponIdx = null;
let currentTFId = null;
let currentFactionId = null;
let editingTFId = null;
let editingCustomTFTypeId = null;
let assetPickerTFId = null;
let assetPickerSelectedId = null;
let editingCustomAssetId = null;
let addUnitTargetTFId = null;
let addUnitTargetRole = "core";
let addUnitSelectedId = null;
let addUnitSelectedType = "unit";
let addUnitShowUnavailable = false;
let addUnitQty = 1;
let currentArmyId = null;
let editingArmyId = null;
let tfRemoveBlockedId = null;
let addTFTargetArmyId = null;
let addTFSelectedId = null;
let bgUnitTargetArmyId = null;
let bgUnitTargetBgId = null;
let bgUnitSelectedItems = new Set();
let bgUnitShowUnavailable = false;
let bgTFTargetArmyId = null;
let bgTFTargetBgId = null;
let bgTFSelectedId = null;
let bgSymbolPickerBgId = null;
let editingBGId = null;
let armyIconPickerOpen = false;
let activeBGTabId = null;
let bgViewMode = "tabs";   // "tabs" | "flat" - army detail Battle Groups
// Transport picker state
let _tpKind = null; let _tpTFId = null; let _tpSlotId = null;
let _tpArmyId = null; let _tpBgId = null; let _tpEntryId = null;
let _tpSelected = null; let _tpForUnit = null; let _tpUnitType = "unit";
let activeTFTab = "core";
let tfViewMode = "tabs";    // "tabs" | "flat" - task force detail sections
let _newTFTemplateId = null;
let _savingTFTemplateFromId = null;
let currentForceId = null;
let editingForceId = null;
let activeAGTabId = null;
let agViewMode = "tabs";    // "tabs" | "flat" - expeditionary force army groups
let agSymbolPickerAgId = null;
let forceIconPickerOpen = false;
let editingAGId = null;
let addArmyTargetForceId = null;
let addArmyTargetAgId = null;
let fpUnitTargetArmyId = null;
let fpUnitTargetBgId = null;
let fpUnitAddedCount = 0;
let fpAddQty = 1;
let libFilterClass = "all";
let libFilterFaction = "all";
let libSort = "name-asc";
let libViewType = "unit";
let editingUnitId = null;

// ============================================================
// PERSISTENCE
// ============================================================
const _TERROR_DESC = "[Unit] This Unit inflicts 2 Terror dice per stack. Can be taken multiple times.";
const _TRANS_DESC  = "This unit can carry Infantry or Cavalry stands. Each stack adds 1 transport slot.";
const _terrorMigMap = {"Terror +2":1,"Terror +4":2,"Terror +6":3};
const _transMigMap  = {"Transport 1":1,"Transport 2":2,"Transport 3":3};
function migrateCustomUnit(u) {
  (u.standTraits||[]).forEach((t,i) => {
    if(_terrorMigMap[t[0]] !== undefined) u.standTraits[i] = ["Terror",1,_TERROR_DESC,_terrorMigMap[t[0]]];
    if(_transMigMap[t[0]]  !== undefined) u.standTraits[i] = ["Transport",1.5,_TRANS_DESC,_transMigMap[t[0]]];
  });
}
// ── Undo stack ───────────────────────────────────────────────────────────
const _UNDO_LIMIT = 30;
const _undoStack = [];

const _EMPTY_STATE = JSON.stringify({schemaVersion:SCHEMA_VERSION,customUnits:[],customFactions:[],customTraits:[],customTFTypes:[],customTacticalAssets:[],taskForces:[],armies:[],expeditionaryForces:[],tfTemplates:[]});

// ── Backup reminder ─────────────────────────────────────────────────────────
// Data lives only in localStorage, so nudge the user to export a Full Backup
// once they've built up content. Tracking is kept in a SEPARATE key (device-
// local) so it never rides along in a shared/exported state.
const _BACKUP_KEY = "ls_army_builder_backup";
const _BACKUP_NUDGE_AT = 6;    // first nudge after this many saves of fresh work
const _BACKUP_SNOOZE   = 15;   // extra saves to wait after a "Later" dismissal
function _loadBackupMeta() {
  try { const m = JSON.parse(localStorage.getItem(_BACKUP_KEY)); if (m && typeof m.saves === "number") return m; } catch (e) {}
  return { saves: 0, nextNudgeAt: _BACKUP_NUDGE_AT, lastBackupAt: null };
}
function _saveBackupMeta(m) { try { localStorage.setItem(_BACKUP_KEY, JSON.stringify(m)); } catch (e) {} }
function _hasContent() {
  return ["customUnits","customFactions","customTraits","customTFTypes","customTacticalAssets","taskForces","armies","expeditionaryForces","tfTemplates"]
    .some(k => (state[k] || []).length);
}
function _maybeShowBackupNudge() {
  const el = document.getElementById("backup-nudge");
  if (!el) return;
  const m = _loadBackupMeta();
  const onDataPage = document.getElementById("page-data")?.classList.contains("active");
  el.style.display = (_hasContent() && m.saves >= m.nextNudgeAt && !onDataPage) ? "block" : "none";
}
function _markBackedUp() {   // user has a fresh backup -> reset the reminder baseline
  _saveBackupMeta({ saves: 0, nextNudgeAt: _BACKUP_NUDGE_AT, lastBackupAt: Date.now() });
  const el = document.getElementById("backup-nudge"); if (el) el.style.display = "none";
}
function backupNudgeBackup() {
  const el = document.getElementById("backup-nudge"); if (el) el.style.display = "none";
  doExportFullBackup();   // records the backup baseline itself
}
function backupNudgeDismiss() {
  const m = _loadBackupMeta();
  m.nextNudgeAt = (m.saves || 0) + _BACKUP_SNOOZE;
  _saveBackupMeta(m);
  const el = document.getElementById("backup-nudge"); if (el) el.style.display = "none";
}

function saveState() {
  _unitIdCache = null;
  _calcPtsCache = null;
  _slotAssignedMap = null;
  const prev = localStorage.getItem(storageKey()) || _EMPTY_STATE;
  _undoStack.push(prev);
  if (_undoStack.length > _UNDO_LIMIT) _undoStack.shift();
  _updateUndoBtn();
  localStorage.setItem(storageKey(), JSON.stringify(state));
  const _bm = _loadBackupMeta();
  _bm.saves = (_bm.saves || 0) + 1;
  _saveBackupMeta(_bm);
  _maybeShowBackupNudge();
}

function undoState() {
  _unitIdCache = null;
  _calcPtsCache = null;
  _slotAssignedMap = null;
  if (!_undoStack.length) return;
  const prev = _undoStack.pop();
  localStorage.setItem(storageKey(), prev);
  const saved = JSON.parse(prev);
  state.customUnits = saved.customUnits || [];
  state.customFactions = saved.customFactions || [];
  state.customTraits = saved.customTraits || [];
  state.customTFTypes = saved.customTFTypes || [];
  state.customTacticalAssets = saved.customTacticalAssets || [];
  state.taskForces = saved.taskForces || [];
  state.armies = saved.armies || [];
  state.expeditionaryForces = saved.expeditionaryForces || [];
  state.tfTemplates = saved.tfTemplates || [];
  _updateUndoBtn();
  _rerenderCurrentPage();
  _showUndoToast();
}

function _updateUndoBtn() {
  const btn = document.getElementById("nav-undo-btn");
  if (!btn) return;
  if (_undoStack.length) {
    btn.style.display = "inline-flex";
    btn.title = `Undo last change (${_undoStack.length} step${_undoStack.length !== 1 ? "s" : ""} available) - Ctrl+Z`;
  } else {
    btn.style.display = "none";
  }
}

function _rerenderCurrentPage() {
  const active = document.querySelector(".page.active");
  if (!active) return;
  const id = active.id.replace("page-", "");
  if (id === "library") { renderLibrary(); return; }
  if (id === "factions") {
    const isBuiltin = currentFactionId && !!FACTION_COLORS[currentFactionId];
    if (currentFactionId && (isBuiltin || (state.customFactions||[]).find(f => f.id === currentFactionId))) {
      renderFactionDetail();
    } else {
      currentFactionId = null;
      const lv = document.getElementById("fac-list-view");
      const dv = document.getElementById("fac-detail-view");
      if(lv) lv.style.display = "";
      if(dv) dv.style.display = "none";
      renderFactionList();
    }
    return;
  }
  if (id === "taskforces") {
    if (currentTFId && state.taskForces.find(t => t.id === currentTFId)) {
      renderTFDetail();
    } else {
      currentTFId = null;
      const lv = document.getElementById("tf-list-view");
      const dv = document.getElementById("tf-detail-view");
      if(lv) lv.style.display = "";
      if(dv) dv.style.display = "none";
      renderTFList();
    }
    return;
  }
  if (id === "builder") { calculateBuilder(); return; }
  if (id === "data") { renderDataPage(); return; }
  if (id === "armies") {
    if (currentArmyId && state.armies.find(a => a.id === currentArmyId)) {
      renderArmyDetail();
    } else {
      currentArmyId = null;
      const lv = document.getElementById("army-list-view");
      const dv = document.getElementById("army-detail-view");
      if (lv) lv.style.display = "";
      if (dv) dv.style.display = "none";
      renderArmyList();
    }
    return;
  }
  if (id === "forces") {
    if (currentForceId && state.expeditionaryForces.find(f => f.id === currentForceId)) {
      renderForceDetail();
    } else {
      currentForceId = null;
      const lv = document.getElementById("force-list-view");
      const dv = document.getElementById("force-detail-view");
      if (lv) lv.style.display = "";
      if (dv) dv.style.display = "none";
      renderForceList();
    }
  }
}

let _undoToastTimer = null;
// General-purpose feedback toast (shares the undo toast element).
function showToast(text) {
  const toast = document.getElementById("undo-toast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("visible");
  clearTimeout(_undoToastTimer);
  _undoToastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
}
function _showUndoToast() {
  const toast = document.getElementById("undo-toast");
  if (!toast) return;
  toast.textContent = _undoStack.length
    ? `Undone - ${_undoStack.length} more step${_undoStack.length !== 1 ? "s" : ""} available`
    : "Undone - no more history";
  toast.classList.add("visible");
  clearTimeout(_undoToastTimer);
  _undoToastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}
function loadState() {
  _unitIdCache = null;
  _calcPtsCache = null;
  _slotAssignedMap = null;
  // Migration read: prefer this pack's key; if empty, adopt data left under the
  // legacy "ls_army_builder" key (a pack that renamed its key inherits existing
  // saves instead of orphaning them). For LaserStorm storageKey() IS the legacy
  // key, so this is a plain read with no behavior change. The first saveState()
  // then persists forward under storageKey().
  let raw = localStorage.getItem(storageKey());
  if (!raw && storageKey() !== _LEGACY_STORAGE_KEY) raw = localStorage.getItem(_LEGACY_STORAGE_KEY);
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      state.customUnits = saved.customUnits || [];
      state.customFactions = saved.customFactions || [];
      state.customTraits = saved.customTraits || [];
      state.customTFTypes = saved.customTFTypes || [];
      state.customTacticalAssets = saved.customTacticalAssets || [];
      state.taskForces = saved.taskForces || [];
      state.armies = saved.armies || [];
      state.expeditionaryForces = saved.expeditionaryForces || [];
      state.tfTemplates = saved.tfTemplates || [];
      state.schemaVersion = saved.schemaVersion || 0;
      const needsStamp = state.schemaVersion < SCHEMA_VERSION;
      _migrateState();
      if (needsStamp) {
        state.schemaVersion = SCHEMA_VERSION;
        // Persist stamp directly so old saves are upgraded on disk right away
        localStorage.setItem(storageKey(), JSON.stringify(state));
      }
      // Always run: drop BG entries left dangling by deletions since last save
      pruneOrphanedBGEntries();
    } catch(e) {
      // Don't let the next saveState() overwrite a possibly hand-recoverable
      // save - stash the corrupt payload under a side key first.
      try { localStorage.setItem(corruptKey(), raw); } catch(e2) {}
    }
  }
}

// Bring loaded or imported data up to the current shape. Every step only
// touches data that still has the legacy shape, so it is safe to run on
// every load and after every full import.
function _migrateState() {
  // Migration: convert legacy faction string → reqs array
  (state.customTraits||[]).forEach(t => { if(!t.reqs) t.reqs = t.faction ? [{type:"faction",vals:[t.faction]}] : []; });
  // Migrate old terror/transport traits on custom units
  (state.customUnits||[]).forEach(migrateCustomUnit);
  // Migration: ensure every slot has a stable, globally unique id (older data
  // may lack one, and older imports copied slot ids verbatim - duplicate ids
  // across TFs corrupt battle-group assignment tracking).
  const seenSlotIds = new Set();
  const slotRemap = {};   // "<tfId>|<oldSlotId>" → new id
  (state.taskForces||[]).forEach(tf => (tf.units||[]).forEach(s => {
    if(!s.id || seenSlotIds.has(s.id)) {
      const nid = "slot_"+uid();
      if(s.id) slotRemap[tf.id+"|"+s.id] = nid;
      s.id = nid;
    }
    seenSlotIds.add(s.id);
  }));
  if(Object.keys(slotRemap).length) {
    (state.armies||[]).forEach(a => (a.battleGroups||[]).forEach(bg => (bg.entries||[]).forEach(e => {
      if(e.tfId && e.slotId && slotRemap[e.tfId+"|"+e.slotId]) e.slotId = slotRemap[e.tfId+"|"+e.slotId];
    })));
  }
  // Migration: legacy "commander" slot role → "command" so section limits apply
  (state.taskForces||[]).forEach(tf => (tf.units||[]).forEach(s => { if(s.role==="commander") s.role="command"; }));
  // Migration: backfill activation symbols on BGs that predate this feature
  (state.armies||[]).forEach(a => a.battleGroups && a.battleGroups.forEach(bg => {
    if(!bg.symbol) _autoAssignBGSymbol(a, bg);
  }));
  // Migration: BG entries pre-dated split support - give each the full
  // quantity of its slot (older data placed a whole stack in one group).
  (state.armies||[]).forEach(a => (a.battleGroups||[]).forEach(bg => (bg.entries||[]).forEach(e => {
    if(e.qty == null) {
      const tf = state.taskForces.find(t=>t.id===e.tfId);
      const s = tf && (tf.units||[]).find(x=>x.id===e.slotId);
      e.qty = s ? s.quantity : 1;
    }
  })));
  // Clean up the literal string "null" written by an old icon-deselect bug
  (state.armies||[]).forEach(a => { if(a.symbol==="null") a.symbol = null; });
  (state.expeditionaryForces||[]).forEach(f => { if(f.symbol==="null") f.symbol = null; });
  // Migration: emoji → FA name
  const _ICON_MIG = {
    "⬢":"shield","▲":"flag","◆":"gem","●":"circle","■":"square",
    "★":"star","✦":"star","♦":"gem","⚔":"shield","⚡":"bolt",
    "☠":"skull","⚙":"gear","✿":"leaf","☯":"infinity","☽":"moon",
    "♣":"clover","♠":"flag","♥":"heart","⚜":"crown","☢":"radiation",
    "⚛":"atom","⊕":"circle-plus","⬟":"shield","⬡":"shield"
  };
  (state.customFactions||[]).forEach(f => {
    if(f.icon && _ICON_MIG[f.icon]) f.icon = _ICON_MIG[f.icon];
    // Icons/colors are interpolated into class/style attributes unescaped -
    // reject anything a crafted import could have smuggled in.
    if(f.icon && !/^[a-z0-9-]+$/.test(String(f.icon))) f.icon = "shield";
    if(f.color && !/^#[0-9a-fA-F]{3,8}$/.test(String(f.color))) f.color = "#8b949e";
  });
}

// ============================================================
// UTILITY
// ============================================================
let _uidSeq = 0;
function uid() {
  // Timestamp + monotonic counter + random suffix: same-millisecond calls in
  // tight loops (imports, migrations) can never collide.
  _uidSeq = (_uidSeq + 1) % 46656;   // 36^3
  return Date.now().toString(36) + _uidSeq.toString(36).padStart(3,"0") + Math.random().toString(36).slice(2,8).padEnd(6,"0");
}
function roundToFive(v) { v = Math.ceil(v); return v + (v%5===0 ? 0 : 5-(v%5)); }
function esc(s) {
  return String(s==null?"":s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
// User-facing term lookup. Reads GAME.terms; falls back to a built-in default
// so a pack that omits a term still renders a sane word instead of "undefined".
// These defaults are LaserStorm's vocabulary (the historical wording), so the
// engine behaves identically for a pack with no terms block.
const _TERM_FALLBACK = {
  stand:"Stand", stands:"Stands", standTraits:"Stand Traits",
  taskForce:"Task Force", taskForces:"Task Forces",
  taskForceType:"Task Force Type", taskForceTypes:"Task Force Types",
  commander:"Commander",
  battleGroup:"Battle Group", battleGroups:"Battle Groups",
  army:"Army", armies:"Armies",
  force:"Expeditionary Force", forces:"Expeditionary Forces",
  classRules:"read-only class rules",
};
function T(key) {
  return (GAME.terms && GAME.terms[key] != null) ? GAME.terms[key] : (_TERM_FALLBACK[key] || key);
}
// Count-aware term for INLINE COUNT contexts ("6 stands", "1 model"). Returns
// T("stand")/T("stands") by n, lowercased — inline counts read lowercase in the
// card text, whereas the same term is title-case as a section label ("Stand
// Traits"). Lowercasing here keeps LaserStorm's card text byte-identical while
// still letting a pack rename the word.
function Tn(n, singularKey) {
  return (n === 1 ? T(singularKey) : T(singularKey + "s")).toLowerCase();
}

// ── Storage / export identity (pack-overridable) ──────────
// The legacy LaserStorm build used the literal key "ls_army_builder" and the
// export tag "laserstorm-army-builder". Packs pin these via GAME.meta so a
// different game gets isolated storage without orphaning existing saves.
const _LEGACY_STORAGE_KEY = "ls_army_builder";
const _LEGACY_APP_TAG     = "laserstorm-army-builder";
function storageKey()   { return (GAME.meta && GAME.meta.storageKey) || _LEGACY_STORAGE_KEY; }
function corruptKey()   { return storageKey() + "_corrupt"; }
function appTag()       { return (GAME.meta && GAME.meta.appTag) || _LEGACY_APP_TAG; }
function filePrefix()   { return (GAME.meta && GAME.meta.filePrefix) || (GAME.meta && GAME.meta.id) || "rally"; }
// Import accepts this pack's tag AND the legacy literal, so old export files
// (always tagged "laserstorm-army-builder") still import into any build.
function importTagOk(tag) { return tag === appTag() || tag === _LEGACY_APP_TAG; }

function confirmBtn(btn, action, ms=5000) {
  if (btn._confirming) {
    clearTimeout(btn._confirmTimer);
    btn._confirming = false;
    _revertConfirmBtn(btn);
    action();
    return;
  }
  btn._confirming = true;
  btn._origText = btn.textContent;
  btn._origBg = btn.style.background;
  btn._origBorderColor = btn.style.borderColor;
  btn._origColor = btn.style.color;
  btn.textContent = "CONFIRM";
  btn.style.background = "#8b0000";
  btn.style.borderColor = "#cc0000";
  btn.style.color = "#fff";
  btn._confirmTimer = setTimeout(() => { btn._confirming = false; _revertConfirmBtn(btn); }, ms);
}

function _revertConfirmBtn(btn) {
  btn.textContent = btn._origText;
  btn.style.background = btn._origBg;
  btn.style.borderColor = btn._origBorderColor;
  btn.style.color = btn._origColor;
}

function allUnits() {
  return [...BUILTIN_UNITS, ...state.customUnits];
}
let _unitIdCache = null;
let _calcPtsCache = null;
function unitById(id) {
  if (!_unitIdCache) {
    _unitIdCache = new Map();
    for (const u of BUILTIN_UNITS) _unitIdCache.set(u.id, u);
    for (const u of state.customUnits) _unitIdCache.set(u.id, u);
  }
  return _unitIdCache.get(id);
}

// Returns the set of role vals required by all selected traits, or null if unrestricted.
// The result drives which deployment-type cost columns are shown for this unit.
function computeAllowedRoles(unit) {
  const standDict  = allStandTraits();
  const weaponDict = allWeaponTraits();
  const roleVals   = new Set();
  function addFrom(t, dict) {
    const found = findTraitEntry(dict, t[0]);
    if (!found) return;
    const [key, entry] = found;
    // "troop" in a role req is a class constraint (non-vehicle stand), not a
    // deployment type - it must not unlock the Unit cost column (a trait
    // requiring hero AND troop would otherwise offer full-Unit deployment).
    allTraitReqs(key, entry).filter(r => r.type === "role").forEach(r => r.vals.forEach(v => { if(v!=="troop") roleVals.add(v); }));
  }
  (unit.standTraits || []).forEach(t => addFrom(t, standDict));
  (unit.weapons || []).flatMap(w => w.traits || []).forEach(t => addFrom(t, weaponDict));
  return roleVals.size > 0 ? [...roleVals] : null;
}

// Game-agnostic shell: memoizes the game pack's cost function per unit id.
// The cache is invalidated by saveState/loadState/undoState.
function calcPoints(unit) {
  if (unit.id) {
    if (!_calcPtsCache) _calcPtsCache = new Map();
    const hit = _calcPtsCache.get(unit.id);
    if (hit) return hit;
  }
  const r = GAME.cost.unitCost(unit);
  if (unit.id) _calcPtsCache.set(unit.id, r);
  return r;
}


function rangeLabel(rv) {
  return {0:"10\"",2:"20\"",5:"30\"",10:"40\"",20:"50\""}[rv] || rv+"\"";
}
function classLabel(c) { return (CLASS_INFO[c]||{}).label||c; }
function classBadge(c, noTip) {
  const cp = CLASS_PROFILE[c], ci = CLASS_INFO[c]||{};
  if(!cp || noTip) return `<span class="badge badge-${c}">${classLabel(c)}</span>`;
  const tip = `${ci.label} - ${cp.cat}. Save ${cp.save} | Assault ${cp.assault} | Vulnerable ${cp.vuln} | Snap ${cp.snap} | Transport ${cp.transport}.`;
  return `<span class="badge badge-${c} tip" data-tip="${esc(tip)}">${classLabel(c)}</span>`;
}
function roleBadge(r) { return `<span class="badge badge-${r}">${r}</span>`; }


function factionPill(factionId, opts={}) {
  if(!factionId) return "";
  const {marginLeft=false, marginRight=false, small=false} = opts;
  const pad = small ? "1px 6px" : "1px 7px";
  const size = "10px";
  const ml = marginLeft ? "margin-left:4px;" : "";
  const mr = marginRight ? "margin-right:3px;" : "";
  const base = (label, color, tipAttr="") =>
    `<span class="${tipAttr?"tip":""}" ${tipAttr} style="display:inline-block;padding:${pad};border-radius:10px;font-size:${size};font-weight:bold;background:${color}22;color:${color};border:1px solid ${color}55;${ml}${mr}">${label}</span>`;
  if(FACTION_COLORS[factionId]) {
    const icon = BUILTIN_FACTION_ICONS[factionId];
    const label = icon ? `<i class="fa-solid fa-${icon}"></i> ${BUILTIN_FACTION_LABELS[factionId]||factionId}` : (BUILTIN_FACTION_LABELS[factionId]||factionId);
    return base(label, FACTION_COLORS[factionId]);
  }
  const cf = (state.customFactions||[]).find(x=>x.id===factionId);
  if(cf) {
    const label = `<i class="fa-solid fa-${cf.icon}"></i> ${esc(cf.name)}`;
    const tipAttr = cf.description ? `data-tip="${esc(cf.description)}"` : "";
    return base(label, cf.color, tipAttr);
  }
  return "";
}

function factionBadge(unit) {
  const f = unit.faction;
  if(f) return factionPill(f);
  if(!unit.builtIn) return `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:bold;background:#88888822;color:#888;border:1px solid #88888855">No Faction</span>`;
  return "";
}

function traitFactionKey(traitEntry) {
  if(traitEntry && traitEntry.length >= 4 && typeof traitEntry[3] === 'string') return traitEntry[3] || null;
  const m = (traitEntry?.[2]||"").match(/^\[(\w+)\]/);
  if(!m) return null;
  const tag = m[1].toLowerCase();
  return TRAIT_FACTION_NAMES.has(tag) ? tag : null;
}

function _customTraitPrimaryFaction(t) {
  const facReq = (t.reqs||[]).find(r=>r.type==="faction");
  return facReq ? facReq.vals[0] : (t.faction||null);
}
function allStandTraits() {
  const custom = {};
  (state.customTraits||[]).filter(t=>t.type==="stand"||t.type==="both").forEach(t=>{
    const fac = _customTraitPrimaryFaction(t);
    const optsObj = {};
    if(t.stackable) { optsObj.stackable = true; if(t.stackCap) optsObj.max = t.stackCap; }
    if(t.unitTrait) optsObj.unitTrait = true;
    const opts = Object.keys(optsObj).length ? optsObj : null;
    custom["custom_"+t.id] = opts ? (fac ? [t.name,t.cost,t.description,fac,opts] : [t.name,t.cost,t.description,opts]) : [t.name,t.cost,t.description,fac];
  });
  return Object.assign({}, STAND_TRAITS, custom);
}
function allWeaponTraits() {
  const custom = {};
  (state.customTraits||[]).filter(t=>t.type==="weapon"||t.type==="both").forEach(t=>{
    const fac = _customTraitPrimaryFaction(t);
    const opts = t.stackable ? {stackable:true, ...(t.stackCap ? {max:t.stackCap} : {})} : null;
    custom["custom_"+t.id] = opts ? (fac ? [t.name,t.cost,t.description,fac,opts] : [t.name,t.cost,t.description,opts]) : [t.name,t.cost,t.description,fac];
  });
  return Object.assign({}, WEAPON_TRAITS, custom);
}

// Returns structured requirement array for a trait.
// Custom traits use their reqs[] field; built-ins use TRAIT_REQS.
function allTraitReqs(key, entry) {
  if(key && key.startsWith("custom_")) {
    const ct = (state.customTraits||[]).find(t=>"custom_"+t.id===key);
    if(ct) {
      if(ct.reqs && ct.reqs.length) return ct.reqs;
      if(ct.faction) return [{type:"faction", vals:[ct.faction]}];
    }
    return [];
  }
  return TRAIT_REQS[key] || [];
}

// Strip all leading [Bracket] prefix blocks from a description string.
function traitIsStackable(entry) {
  if (!entry) return false;
  const last = entry[entry.length - 1];
  return typeof last === 'object' && last !== null && last.stackable === true;
}
function traitIsUnitTrait(entry) {
  if (!entry) return false;
  const last = entry[entry.length - 1];
  return typeof last === 'object' && last !== null && !!last.unitTrait;
}
function traitCount(t) { return typeof t[3] === 'number' ? t[3] : 1; }
// Traits are referenced by name; imports dedupe names case-insensitively, so
// every name lookup must be case-insensitive too or imported units lose their
// trait metadata (and the picker silently drops the trait).
function traitNameEq(a,b){ return String(a??"").toLowerCase() === String(b??"").toLowerCase(); }
function findTraitEntry(dict, name){ return Object.entries(dict).find(([,v])=>traitNameEq(v[0],name)) || null; }


// Minimum movement shown on unit cards. Aircraft: 3/4 Speed, half with
// Dogfighter, none with Hover. Grav: half Speed, but only when the unit
// actually took the Minimum Speed drawback trait.
function minSpeedFor(unit) {
  const has = n => (unit.standTraits||[]).some(t=>traitNameEq(t[0],n));
  if (unit.mobility === "air") {
    if (has("Hover")) return null;
    return Math.ceil(unit.speed * (has("Dogfighter") ? 1/2 : 3/4));
  }
  if (unit.mobility === "grav") return has("Minimum Speed") ? Math.ceil(unit.speed/2) : null;
  return null;
}


// Shell renderers that draw GAME.schema.stats in each card layout.
// On-screen: the .stat / .stat-name / .stat-val / .stat-sub structure.
function statRowCells(unit, pts) {
  return GAME.schema.stats.map(f => {
    const sub = f.sub ? f.sub(unit, pts) : null;
    return `<div class="stat"><span class="stat-name">${f.label}</span><span class="stat-val">${f.format(unit,pts)}</span>${sub!=null?`<span class="stat-sub">${sub}</span>`:""}</div>`;
  }).join("");
}
// Print: returns [label, valueHTML] tuples; the sub-value is appended to the
// value as a muted <small> (each print card wraps these in its own grid cell).
function statPrintCells(unit, pts, pal) {
  return GAME.schema.stats.map(f => {
    const sub = f.sub ? f.sub(unit, pts) : null;
    const val = `${f.format(unit,pts)}${sub!=null?` <small style="font-size:9px;color:${pal.mutedText}">${sub}</small>`:""}`;
    return [f.label, val];
  });
}
// One weapon line for on-screen cards; traitsSuffix is pre-rendered trait HTML.
function weaponRowHTML(w, traitsSuffix) {
  const wName = w.name ? `<strong>${esc(w.name)}</strong> ` : "";
  const cells = GAME.schema.weapon.fields.map(f=>`${f.label} <span>${f.format(w)}</span>`).join(" | ");
  return `<div class="weapon-row">${wName}<span class="wtype">${GAME.schema.weapon.tag(w)}</span> | ${cells}${traitsSuffix}</div>`;
}
// The "Rng X | Shots Y | Impact +Z" fragment for print cards (the print
// renderer supplies the surrounding name/tag markup and palette).
function weaponPrintLine(w) {
  return GAME.schema.weapon.fields.map(f=>`${f.printLabel||f.label} <strong>${f.format(w)}</strong>`).join(" | ");
}
// Builds the builder page's stat inputs from GAME.schema.stats (runs once at
// boot). Each field renders as a .stat-block; onClassChange() then applies
// the class defaults via each field's edit.applyClass.
function renderBuilderStatInputs() {
  const grid = document.querySelector(".stand-stats-grid");
  if (!grid) return;
  grid.style.gridTemplateColumns = `repeat(${GAME.schema.stats.length},minmax(0,1fr))`;
  grid.innerHTML = GAME.schema.stats.map(f => {
    const e = f.edit;
    const inner = e.kind === "select"
      ? `<select id="${e.id}" onchange="${e.changeExpr||"calculateBuilder()"}"></select>`
      : `<div class="stat-row">${e.before||""}<input type="number" id="${e.id}" value="${e.value}" min="${e.min}" max="${e.max}" oninput="calculateBuilder()" onchange="calculateBuilder()">${e.after||""}</div>`;
    return `<div class="stat-block"><div class="stat-label">${f.formLabel||f.label}</div>${inner}</div>`;
  }).join("");
}
// The weapon editor's stat blocks for weapon i, from GAME.schema.weapon.edit.
function weaponEditCellsHTML(w, i) {
  return GAME.schema.weapon.edit.map(f => {
    if (f.kind === "select") {
      const opts = (typeof f.options === "function" ? f.options() : f.options)
        .map(o=>`<option value="${o.v}" ${w[f.key]===o.v?"selected":""}>${o.l}</option>`).join("");
      const assign = f.numeric
        ? `builderWeapons[${i}].${f.key}=parseInt(this.value)`
        : `builderWeapons[${i}].${f.key}=this.value`;
      return `<div class="stat-block"><div class="stat-label">${f.label}</div><select onchange="${assign};calculateBuilder()">${opts}</select></div>`;
    }
    const assign = `builderWeapons[${i}].${f.key}=parseInt(this.value)||${f.fallback};calculateBuilder()`;
    return `<div class="stat-block"><div class="stat-label">${f.label}</div><div class="stat-row">${f.before||""}<input type="number" value="${w[f.key]}" min="${f.min}" max="${f.max}" onchange="${assign}" oninput="${assign}"></div></div>`;
  }).join("");
}
function classReqOk(clsReq, cls) {
  return clsReq.vals.includes(cls) || (clsReq.vals.includes("troop") && TROOP_CLASSES.includes(cls));
}
function troopRoleForbids(reqs, cls) {
  return reqs.some(r => r.type==="role" && r.vals.includes("troop")) && !TROOP_CLASSES.includes(cls);
}
function traitStackMax(entry) {
  const last = entry?.[entry.length - 1];
  return (typeof last === 'object' && last?.max) || 99;
}

function cleanTraitDesc(desc) {
  return (desc||"").replace(/^(\[[^\]]*\]\s*)+/, "").trim();
}

const TRAIT_REQ_COLORS = {faction:"", class:"#f57c00", mobility:"#0097a7", role:"#5c6bc0", traitr:"#7b1fa2"};
const TRAIT_CLASS_LABELS = {inf:"Infantry",cav:"Cavalry",fg:"Field Gun",scout:"Scout",afv:"AFV",ac:"Aircraft",sh:"SH",beh:"Behemoth",troop:"Troop"};
const TRAIT_ROLE_LABELS  = {unit:"Unit",hero:"Hero",independent:"Independent",command:"Command",cmdHero:"Cmd Hero",troop:"Troop"};
const TRAIT_MOB_LABELS   = {troop:"Troop",grav:"Grav",walk:"Walker",wheel:"Wheeled",track:"Tracked",air:"Air"};

function traitReqColor(type, val) {
  if(type === "faction") {
    const cf = (state.customFactions||[]).find(f=>f.id===val);
    return cf ? cf.color : (FACTION_COLORS[val] || "#888");
  }
  return TRAIT_REQ_COLORS[type] || "#888";
}

function traitReqLabel(type, vals) {
  if(type === "faction") return vals.map(v => {
    const cf = (state.customFactions||[]).find(f=>f.id===v);
    return cf ? cf.name : (FACTION_LABEL_MAP[v] || v);
  }).join(" / ");
  if(type === "class")    return vals.map(v => TRAIT_CLASS_LABELS[v]||v).join(" / ");
  if(type === "mobility") return vals.map(v => TRAIT_MOB_LABELS[v]||v).join(" / ");
  if(type === "role")     return vals.map(v => TRAIT_ROLE_LABELS[v]||v).join(" / ");
  if(type === "traitr")   { const t = STAND_TRAITS[vals[0]] || WEAPON_TRAITS[vals[0]]; return "req. "+(t?.[0]||vals[0]); }
  return vals.join(" / ");
}

function traitReqBadgeHTML(req) {
  const color = traitReqColor(req.type, req.vals[0]);
  const label = traitReqLabel(req.type, req.vals);
  return `<span class="trait-badge" style="background:${color}22;color:${color};border-color:${color}55;font-size:9px;padding:0 5px">${label}</span>`;
}

function traitTipHTML(traitArr, allTraits) {
  if(!traitArr||!traitArr.length) return `<span style="color:#8b949e;font-size:11px">None</span>`;
  return traitArr.map(t => {
    const name = t[0];
    const cnt = traitCount(t);
    const [key, entry] = findTraitEntry(allTraits, name)
      || (() => { const base=name.replace(/\s[+]?\d+$/,""); return base!==name ? (findTraitEntry(allTraits, base)||[null,null]) : [null,null]; })();
    const cleanDesc = cleanTraitDesc(entry?.[2] || "");
    const isUT = traitIsUnitTrait(entry);
    const utRule = "Unit Trait: effect applies to the whole unit. No effect if any stand of the same class lacks this trait. If multiple levels exist, only the least powerful applies.";
    const fullDesc = isUT ? (cleanDesc ? cleanDesc + "\n\n" + utRule : utRule) : cleanDesc;
    const fac = traitFactionKey(entry);
    const facObj = fac ? (state.customFactions||[]).find(f=>f.id===fac) : null;
    const color = facObj ? facObj.color : (fac ? (FACTION_COLORS[fac]||"#888") : "#555");
    const bg = fac ? `${color}22` : "#21262d";
    const border = fac ? `${color}55` : "#30363d";
    const textColor = fac ? color : "#8b949e";
    const displayName = cnt > 1 ? `${name} ${cnt}` : name;
    const tipAttr = fullDesc ? ` class="trait-badge tip" data-tip="${esc(fullDesc)}"` : ` class="trait-badge"`;
    const utMark = isUT ? `<sup style="font-size:7px;color:#7986cb;vertical-align:super;margin-left:1px;font-style:italic">U</sup>` : "";
    return `<span${tipAttr} style="background:${bg};color:${textColor};border-color:${border}">${esc(displayName)}${utMark}</span>`;
  }).join("");
}

function unitCardHTML(unit, actions, viewType="unit", opts={}) {
  const pts = calcPoints(unit);
  const traitsHTML = traitTipHTML(unit.standTraits||[], allStandTraits());
  const weaponsHTML = (unit.weapons||[]).length===0
    ? `<div class="weapon-row" style="color:#8b949e;font-style:italic">${GAME.schema.weapon.emptyText}</div>`
    : (unit.weapons||[]).map(w => {
        const wtHTML = (w.traits||[]).length
          ? " | " + traitTipHTML(w.traits, allWeaponTraits())
          : "";
        return weaponRowHTML(w, wtHTML);
      }).join("");
  const pKey = VIEW_PTS_KEY[viewType] || "unitPts";
  const pVal = pts[pKey] != null ? pts[pKey] : "-";
  const pLabel = VIEW_LABELS[viewType] || "Unit";
  const standsHTML = viewType === "unit"
    ? `<span style="font-size:11px;color:var(--text-muted);flex-shrink:0;white-space:nowrap">${pts.unitSize} ${Tn(pts.unitSize,"stand")}</span>`
    : "";
  return `
    <div class="unit-card">
      <div class="unit-card-header">
        <div style="min-width:0">
          <div style="display:flex;align-items:baseline;gap:6px;min-width:0">
            <span class="unit-name-wrap" style="min-width:0;flex:1">
              <span class="unit-name-row">
                <span class="unit-name">${esc(unit.name)}</span>
                ${unit.description ? `<button class="unit-desc-btn" title="Toggle description" onclick="const d=this.closest('.unit-card').querySelector('.unit-desc');const e=d.classList.toggle('expanded');this.classList.toggle('active',e)"><i class="fa-solid fa-circle-info"></i></button>` : ""}
              </span>
              ${unit.description ? `<span class="unit-desc">${esc(unit.description)}</span>` : ""}
            </span>
            ${standsHTML}
          </div>
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:3px">
            ${classBadge(unit.class, true)}${factionBadge(unit)}
            ${!unit.builtIn?`<span class="badge" style="background:#333;color:#aaa">Custom</span>`:""}
            ${opts.tfBadge||""}
          </div>
        </div>
        <div class="pts-box" style="flex:0 0 auto;width:46px;padding:4px 2px;align-self:flex-start">
          <div class="pts-box-val">${pVal}</div>
          <div class="pts-box-label">${pLabel}</div>
        </div>
      </div>
      <div class="stat-row">${statRowCells(unit, pts)}</div>
      <div class="unit-card-traits"><span class="unit-card-section-label">${T("standTraits")}</span>${traitsHTML}</div>
      ${weaponsHTML}
      ${actions ? `<div class="unit-card-actions">${actions}</div>` : ""}
    </div>`;
}

function mechPairCardHTML(infUnit, tuUnit, n, actionsHTML, viewType, opts={}) {
  function halfInner(unit, vt, extra={}) {
    const pts = calcPoints(unit);
    const traitsHTML = traitTipHTML(unit.standTraits||[], allStandTraits());
    const weaponsHTML = (unit.weapons||[]).length===0
      ? `<div class="weapon-row" style="color:#8b949e;font-style:italic">${GAME.schema.weapon.emptyText}</div>`
      : (unit.weapons||[]).map(w => {
          const wtHTML = (w.traits||[]).length ? " | " + traitTipHTML(w.traits, allWeaponTraits()) : "";
          return weaponRowHTML(w, wtHTML);
        }).join("");
    const pKey = VIEW_PTS_KEY[vt] || "unitPts";
    const pVal = extra.ptsVal != null ? extra.ptsVal : (pts[pKey] != null ? pts[pKey] : "-");
    const pLabel = VIEW_LABELS[vt] || "Unit";
    const topRightHTML = extra.countBadge != null
      ? `<span style="font-size:12px;font-weight:bold;color:#66bb6a;flex-shrink:0;white-space:nowrap">&times;${extra.countBadge}</span>`
      : (vt === "unit" ? `<span style="font-size:11px;color:var(--text-muted);flex-shrink:0;white-space:nowrap">${pts.unitSize} ${Tn(pts.unitSize,"stand")}</span>` : "");
    const transportTagHTML = extra.transportTag||"";
    return `<div class="mech-half" style="flex:1;min-width:0;padding:10px 10px 8px">
        <div class="unit-card-header">
          <div style="min-width:0">
            <div style="display:flex;align-items:baseline;gap:6px;min-width:0">
              <span class="unit-name-wrap" style="min-width:0;flex:1">
                <span class="unit-name-row">
                  <span class="unit-name">${esc(unit.name)}</span>
                  ${unit.description ? `<button class="unit-desc-btn" title="Toggle description" onclick="const d=this.closest('.mech-half').querySelector('.unit-desc');const e=d.classList.toggle('expanded');this.classList.toggle('active',e)"><i class="fa-solid fa-circle-info"></i></button>` : ""}
                </span>
                ${unit.description ? `<span class="unit-desc">${esc(unit.description)}</span>` : ""}
              </span>
              ${topRightHTML}
            </div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:3px">
              ${classBadge(unit.class, true)}${factionBadge(unit)}
              ${!unit.builtIn?`<span class="badge" style="background:#333;color:#aaa">Custom</span>`:""}
              ${extra.tfBadge||""}${transportTagHTML}
            </div>
          </div>
          <div class="pts-box" style="flex:0 0 auto;width:46px;padding:4px 2px;align-self:flex-start">
            <div class="pts-box-val">${pVal}</div>
            <div class="pts-box-label">${pLabel}</div>
          </div>
        </div>
        <div class="stat-row">${statRowCells(unit, pts)}</div>
        <div class="unit-card-traits"><span class="unit-card-section-label">${T("standTraits")}</span>${traitsHTML}</div>
        ${weaponsHTML}
      </div>`;
  }
  const tuPtsVal = calcPoints(tuUnit).perStand;
  const transportTag = `<span class="badge" style="background:#1a2a1a;color:#66bb6a;border:1px solid #66bb6a44">Transport</span>`;
  return `<div class="unit-card" style="padding:0;overflow:hidden">
    <div style="display:flex;align-items:stretch">
      ${halfInner(infUnit, viewType, {tfBadge: opts.tfBadge||""})}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px;background:#0d1a0d;border-left:1px solid #1e3a1e55;border-right:1px solid #1e3a1e55;gap:5px;min-width:28px;flex-shrink:0">
        <i class="fa-solid fa-truck" style="color:#66bb6a;font-size:13px"></i>
        <span style="font-size:7px;font-weight:bold;text-transform:uppercase;letter-spacing:.7px;color:#4a8a4a;writing-mode:vertical-rl;transform:rotate(180deg)">Mechanized</span>
      </div>
      ${halfInner(tuUnit, "unit", {countBadge: n, ptsVal: tuPtsVal, transportTag})}
    </div>
    ${actionsHTML ? `<div class="unit-card-actions" style="padding:8px 10px;border-top:1px solid var(--border-subtle)">${actionsHTML}</div>` : ""}
  </div>`;
}

// ============================================================
// NAVIGATION
// ============================================================
function showPage(p) {
  document.querySelectorAll(".page").forEach(el=>el.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(el=>el.classList.remove("active"));
  document.getElementById("page-"+p).classList.add("active");
  document.getElementById("tab-"+p).classList.add("active");
  if(p==="library") renderLibrary();
  if(p==="factions") {
    currentFactionId = null;
    const lv = document.getElementById("fac-list-view");
    const dv = document.getElementById("fac-detail-view");
    if(lv) lv.style.display = "";
    if(dv) dv.style.display = "none";
    renderFactionList();
  }
  if(p==="taskforces") {
    currentTFId = null;
    const lv = document.getElementById("tf-list-view");
    const dv = document.getElementById("tf-detail-view");
    if(lv) lv.style.display = "";
    if(dv) dv.style.display = "none";
    renderTFList();
  }
  if(p==="armies") {
    currentArmyId = null;
    const lv = document.getElementById("army-list-view");
    const dv = document.getElementById("army-detail-view");
    if (lv) lv.style.display = "";
    if (dv) dv.style.display = "none";
    renderArmyList();
  }
  if(p==="forces") {
    currentForceId = null;
    const lv = document.getElementById("force-list-view");
    const dv = document.getElementById("force-detail-view");
    if (lv) lv.style.display = "";
    if (dv) dv.style.display = "none";
    renderForceList();
  }
  if(p==="data") renderDataPage();
  _maybeShowBackupNudge();   // hide on the Data page, re-show elsewhere if due
}

// ============================================================
// DATA IMPORT / EXPORT
// ============================================================
let _pendingImport = null;     // parsed payload awaiting import
let _fullImportArmed = false;  // two-step confirm for destructive full import
let _exportJSONStr = "";       // last generated export JSON (download fallback)
let _exportFilename = filePrefix()+"-export.json";

// Categories shown in the selective export picker, listed roughly in
// dependency order. Each entry: state key, label, FontAwesome icon, and
// per-item name/meta accessors used to render the checkbox rows.
const EXPORT_CATS = [
  { key:"customFactions",       label:"Factions",             icon:"flag",           name:f=>f.name, meta:()=>"" },
  { key:"customTraits",         label:"Custom Traits",        icon:"star",           name:t=>t.name, meta:t=>(t.cost>=0?"+":"")+t.cost+"p" },
  { key:"customUnits",          label:"Units",                icon:"chess-pawn",     name:u=>u.name, meta:u=>factionName(u.faction)||"" },
  { key:"customTFTypes",        label:T("taskForceTypes"),    icon:"gear",           name:t=>t.name, meta:()=>"" },
  { key:"customTacticalAssets", label:"Tactical Assets",      icon:"bolt",           name:a=>a.name, meta:()=>"" },
  { key:"taskForces",           label:T("taskForces"),        icon:"users",          name:t=>t.name, meta:t=>(t.units||[]).length+" slot"+((t.units||[]).length!==1?"s":"") },
  { key:"armies",               label:T("armies"),            icon:"chess-rook",     name:a=>a.name, meta:a=>isFreePick(a)?"Free Pick":T("taskForce") },
  { key:"expeditionaryForces",  label:T("forces"),            icon:"earth-americas", name:f=>f.name, meta:f=>(f.armyGroups||[]).length+" group"+((f.armyGroups||[]).length!==1?"s":"") },
];
let _exportSel = {};        // { catKey: Set(ids) } - items the user ticked
let _exportOpenCats = {};   // { catKey: bool }     - which categories are expanded

function renderDataPage(){
  _exportSel = {}; EXPORT_CATS.forEach(c=>_exportSel[c.key]=new Set());
  _exportOpenCats = {};
  renderDataOverview();
  renderExportPicker();
  _dataHideMsg("data-export-msg");
  const importText = document.getElementById("import-text");
  if(importText) importText.value = "";
  const importFile = document.getElementById("import-file");
  if(importFile) importFile.value = "";
  _pendingImport = null;
  _fullImportArmed = false;
  const prev = document.getElementById("import-preview");
  if(prev) prev.style.display = "none";
  const ib = document.getElementById("import-btn");
  if(ib){ ib.disabled = true; ib.innerHTML = '<i class="fa-solid fa-upload"></i> Import'; }
  _dataHideMsg("data-import-msg");
}

function renderDataOverview(){
  const el = document.getElementById("data-overview");
  if(!el) return;
  el.innerHTML = EXPORT_CATS.map(c=>{
    const n = (state[c.key]||[]).length;
    return `<div class="data-stat${n?"":" zero"}">
      <div class="data-stat-icon"><i class="fa-solid fa-${c.icon}"></i></div>
      <div><div class="data-stat-val">${n}</div><div class="data-stat-label">${esc(c.label)}</div></div>
    </div>`;
  }).join("");
}

function renderExportPicker(){
  const el = document.getElementById("export-picker");
  if(!el) return;
  const cats = EXPORT_CATS.filter(c=>(state[c.key]||[]).length);
  if(!cats.length){
    el.innerHTML = `<div class="exp-empty">Nothing to export yet - create some units, factions, or armies first.</div>`;
    updateExportSummary();
    return;
  }
  el.innerHTML = cats.map(c=>{
    const items = state[c.key]||[];
    const sel = _exportSel[c.key];
    const open = !!_exportOpenCats[c.key];
    const itemsHTML = items.map(it=>{
      const meta = c.meta(it);
      return `<label class="exp-item">
        <input type="checkbox" class="exp-cb" ${sel.has(it.id)?"checked":""} onclick="toggleExportItem('${c.key}','${esc(it.id)}',event)">
        <span class="exp-item-name">${esc(c.name(it)||"-")}</span>
        ${meta?`<span class="exp-item-meta">${esc(meta)}</span>`:""}
      </label>`;
    }).join("");
    return `<div class="exp-cat${open?" open":""}" data-cat="${c.key}">
      <div class="exp-cat-head" onclick="toggleExportCatCollapse('${c.key}')">
        <input type="checkbox" class="exp-cb" id="exp-cat-cb-${c.key}" onclick="toggleExportCategory('${c.key}',event)">
        <span class="exp-cat-icon"><i class="fa-solid fa-${c.icon}"></i></span>
        <span class="exp-cat-name">${esc(c.label)}</span>
        <span class="exp-cat-count">${items.length}</span>
        <span class="exp-cat-sel" id="exp-cat-sel-${c.key}" ${sel.size?'':'style="display:none"'}>${sel.size} picked</span>
        <span class="exp-cat-chev"><i class="fa-solid fa-chevron-right"></i></span>
      </div>
      <div class="exp-items">${itemsHTML}</div>
    </div>`;
  }).join("");
  cats.forEach(c=>_syncExportCatCheckbox(c.key));
  updateExportSummary();
}

function _syncExportCatCheckbox(catKey){
  const items = state[catKey]||[];
  const sel = _exportSel[catKey];
  const cb = document.getElementById("exp-cat-cb-"+catKey);
  if(cb){ cb.checked = sel.size>0 && sel.size===items.length; cb.indeterminate = sel.size>0 && sel.size<items.length; }
  const selEl = document.getElementById("exp-cat-sel-"+catKey);
  if(selEl){ selEl.textContent = sel.size+" picked"; selEl.style.display = sel.size?"":"none"; }
}

function toggleExportItem(catKey, id, ev){
  if(ev) ev.stopPropagation();
  const sel = _exportSel[catKey];
  if(sel.has(id)) sel.delete(id); else sel.add(id);
  _syncExportCatCheckbox(catKey);
  updateExportSummary();
}

function toggleExportCategory(catKey, ev){
  if(ev) ev.stopPropagation();
  const items = state[catKey]||[];
  const sel = _exportSel[catKey];
  const selectAll = sel.size !== items.length;  // partial or empty -> select all
  sel.clear();
  if(selectAll) items.forEach(it=>sel.add(it.id));
  const itemsBox = document.querySelector('.exp-cat[data-cat="'+catKey+'"] .exp-items');
  if(itemsBox) itemsBox.querySelectorAll('.exp-cb').forEach(c=>c.checked=selectAll);
  _syncExportCatCheckbox(catKey);
  updateExportSummary();
}

function toggleExportCatCollapse(catKey){
  _exportOpenCats[catKey] = !_exportOpenCats[catKey];
  const catEl = document.querySelector('.exp-cat[data-cat="'+catKey+'"]');
  if(catEl) catEl.classList.toggle("open", !!_exportOpenCats[catKey]);
}

function exportSelectAll(){
  EXPORT_CATS.forEach(c=>{ _exportSel[c.key] = new Set((state[c.key]||[]).map(it=>it.id)); });
  renderExportPicker();
}
function exportSelectNone(){
  EXPORT_CATS.forEach(c=>_exportSel[c.key] = new Set());
  renderExportPicker();
}

function updateExportSummary(){
  const explicit = EXPORT_CATS.reduce((s,c)=>s+_exportSel[c.key].size,0);
  const bundle = collectSelectionBundle();
  const total = EXPORT_CATS.reduce((s,c)=>s+(bundle[c.key]||[]).length,0);
  const dep = total - explicit;
  const el = document.getElementById("export-summary");
  if(el){
    el.innerHTML = explicit
      ? `<strong>${explicit}</strong> selected${dep>0?` <span style="color:var(--text-faint)">+${dep} dependenc${dep!==1?"ies":"y"}</span>`:""}`
      : "Nothing selected";
  }
  const genBtn = document.getElementById("export-gen-btn");
  if(genBtn) genBtn.disabled = explicit===0;
}

// Expand the user's explicit selections into a complete, self-contained bundle
// by transitively pulling in everything the selected items reference. Returns
// an object { catKey: [items...] } preserving each category's state order.
function collectSelectionBundle(){
  const out = {}; EXPORT_CATS.forEach(c=>out[c.key]=new Set(_exportSel[c.key]));
  const mapOf = key => new Map((state[key]||[]).map(x=>[x.id,x]));
  const facMap=mapOf("customFactions"), unitMap=mapOf("customUnits"),
        tfMap=mapOf("taskForces"), armyMap=mapOf("armies"),
        assetMap=mapOf("customTacticalAssets"), tfTypeMap=mapOf("customTFTypes"),
        forceMap=mapOf("expeditionaryForces");
  const traitByName = new Map((state.customTraits||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const traitMap = mapOf("customTraits");

  const addUnitDeps = u => {
    if(u.faction && facMap.has(u.faction)) out.customFactions.add(u.faction);
    const names = new Set();
    (u.standTraits||[]).forEach(t=>{ if(t&&t[0]!=null) names.add(String(t[0]).toLowerCase()); });
    (u.weapons||[]).forEach(w=>(w.traits||[]).forEach(t=>{ if(t&&t[0]!=null) names.add(String(t[0]).toLowerCase()); }));
    names.forEach(nm=>{ const tr=traitByName.get(nm); if(tr) out.customTraits.add(tr.id); });
  };
  const addTFDeps = tf => {
    if(tf.tfType && tfTypeMap.has(tf.tfType)) out.customTFTypes.add(tf.tfType);
    if(tf.tacAsset && tf.tacAsset.startsWith("custom_")){ const b=tf.tacAsset.slice(7); if(assetMap.has(b)) out.customTacticalAssets.add(b); }
    if(tf.faction && facMap.has(tf.faction)) out.customFactions.add(tf.faction);
    (tf.units||[]).forEach(s=>[s.unitId,s.transport].forEach(id=>{ if(id&&unitMap.has(id)) out.customUnits.add(id); }));
  };
  const addArmyDeps = a => {
    if(a.faction && facMap.has(a.faction)) out.customFactions.add(a.faction);
    (a.taskForceIds||[]).forEach(id=>{ if(tfMap.has(id)) out.taskForces.add(id); });
    (a.battleGroups||[]).forEach(bg=>(bg.entries||[]).forEach(e=>{
      [e.unitId,e.transport].forEach(id=>{ if(id&&unitMap.has(id)) out.customUnits.add(id); });
      if(e.tfId && tfMap.has(e.tfId)) out.taskForces.add(e.tfId);
    }));
  };

  // An explicitly-chosen faction also drags in its units (mirrors the original
  // "export a faction" feature). A faction pulled in only as a unit's dependency
  // does NOT back-fill its sibling units.
  new Set(_exportSel.customFactions).forEach(fid=>{
    (state.customUnits||[]).forEach(u=>{ if(u.faction===fid) out.customUnits.add(u.id); });
  });

  let changed=true, guard=0;
  while(changed && guard++<16){
    const before = EXPORT_CATS.reduce((s,c)=>s+out[c.key].size,0);
    out.expeditionaryForces.forEach(id=>{ const f=forceMap.get(id); if(f) (f.armyGroups||[]).forEach(g=>(g.armyIds||[]).forEach(aid=>{ if(armyMap.has(aid)) out.armies.add(aid); })); });
    out.armies.forEach(id=>{ const a=armyMap.get(id); if(a) addArmyDeps(a); });
    out.taskForces.forEach(id=>{ const tf=tfMap.get(id); if(tf) addTFDeps(tf); });
    out.customUnits.forEach(id=>{ const u=unitMap.get(id); if(u) addUnitDeps(u); });
    out.customTraits.forEach(id=>{ const t=traitMap.get(id); if(!t) return;
      if(t.faction&&facMap.has(t.faction)) out.customFactions.add(t.faction);
      (t.reqs||[]).forEach(r=>{ if(r&&r.type==="faction") (r.vals||[]).forEach(v=>{ if(facMap.has(v)) out.customFactions.add(v); }); });
    });
    out.customTacticalAssets.forEach(id=>{ const a=assetMap.get(id); if(a&&a.faction&&facMap.has(a.faction)) out.customFactions.add(a.faction); });
    const after = EXPORT_CATS.reduce((s,c)=>s+out[c.key].size,0);
    changed = after!==before;
  }

  const result={}; EXPORT_CATS.forEach(c=>{ result[c.key]=(state[c.key]||[]).filter(x=>out[c.key].has(x.id)); });
  return result;
}

function doExportSelection(){
  const explicit = EXPORT_CATS.reduce((s,c)=>s+_exportSel[c.key].size,0);
  if(!explicit){ _dataMsg("data-export-msg","error","Tick at least one item to export."); return; }
  const bundle = collectSelectionBundle();
  const data={}; EXPORT_CATS.forEach(c=>{ if(bundle[c.key].length) data[c.key]=bundle[c.key]; });
  const payload = { app:appTag(), kind:"selection", version:1, exportedAt:new Date().toISOString(), data };
  const summary = EXPORT_CATS.filter(c=>bundle[c.key].length).map(c=>`${bundle[c.key].length} ${c.label.toLowerCase()}`).join(", ");
  _openExportModal(payload, "Export - Selection", summary, filePrefix()+"-selection");
}

function doExportFullBackup(){
  const data = {
    customUnits:state.customUnits||[], customFactions:state.customFactions||[],
    customTraits:state.customTraits||[], customTFTypes:state.customTFTypes||[],
    customTacticalAssets:state.customTacticalAssets||[], taskForces:state.taskForces||[],
    armies:state.armies||[], expeditionaryForces:state.expeditionaryForces||[],
    tfTemplates:state.tfTemplates||[]
  };
  const payload = { app:appTag(), kind:"full", version:1, exportedAt:new Date().toISOString(), data };
  const summary = `${data.customUnits.length} unit(s), ${data.customFactions.length} faction(s), ${data.taskForces.length} task force(s), ${data.armies.length} army(ies)`;
  _markBackedUp();
  _openExportModal(payload, "Export - Full Backup", summary, filePrefix()+"-backup");
}

function _openExportModal(payload, title, summary, fnameBase){
  const json = JSON.stringify(payload, null, 2);
  _exportJSONStr = json;
  _exportFilename = `${fnameBase}-${new Date().toISOString().slice(0,10)}.json`;
  const ta = document.getElementById("export-json-text"); if(ta) ta.value = json;
  const ttl = document.getElementById("export-json-title"); if(ttl) ttl.textContent = title;
  const sum = document.getElementById("export-json-summary"); if(sum) sum.textContent = summary;
  const copyBtn = document.getElementById("export-copy-btn"); if(copyBtn){ copyBtn.innerHTML='<i class="fa-solid fa-copy"></i> Copy to clipboard'; copyBtn.disabled=false; }
  const dlBtn = document.getElementById("export-download-btn"); if(dlBtn) dlBtn.innerHTML='<i class="fa-solid fa-download"></i> Download .json';
  openModal("modal-export-json");
}

// Derive a filename from whatever JSON is currently shown, so this works for
// army / task force exports (opened from their own pages) too.
function downloadExportJSON(){
  const ta = document.getElementById("export-json-text");
  const json = ta ? ta.value : _exportJSONStr;
  if(!json) return;
  let fname = _exportFilename;
  try {
    const p = JSON.parse(json);
    const stamp = new Date().toISOString().slice(0,10);
    const base =
      p.kind==="army"      ? filePrefix()+"-army-"+(p.armyName||"") :
      p.kind==="taskforce" ? filePrefix()+"-tf-"+(p.taskForceName||(p.data&&p.data.taskForce&&p.data.taskForce.name)||"") :
      p.kind==="full"      ? filePrefix()+"-backup" :
      p.kind==="faction"   ? filePrefix()+"-faction-"+(p.faction||"") :
      p.kind==="force"     ? filePrefix()+"-force-"+((p.data&&p.data.force&&p.data.force.name)||"") :
                             filePrefix()+"-selection";
    fname = (base.replace(/[^a-z0-9\-]+/gi,"_").replace(/_+/g,"_").replace(/^_|_$/g,"")||(filePrefix()+"-export"))+"-"+stamp+".json";
  } catch(e){}
  const blob = new Blob([json], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; document.body.appendChild(a); a.click();
  document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url), 1000);
  const btn = document.getElementById("export-download-btn");
  if(btn){ btn.innerHTML='<i class="fa-solid fa-check"></i> Downloaded'; setTimeout(()=>{ btn.innerHTML='<i class="fa-solid fa-download"></i> Download .json'; },1800); }
}

function onImportFileChange(ev){
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const ta = document.getElementById("import-text");
    if(ta){ ta.value = e.target.result; onImportTextChange(); }
  };
  reader.onerror = () => _dataMsg("data-import-msg","error","Couldn't read that file.");
  reader.readAsText(file);
  ev.target.value = "";  // allow re-selecting the same file later
}

function resetAllData(){
  state.customUnits=[]; state.customFactions=[]; state.customTraits=[];
  state.customTFTypes=[]; state.customTacticalAssets=[];
  state.taskForces=[]; state.armies=[]; state.expeditionaryForces=[];
  state.tfTemplates=[];
  saveState();
  renderDataPage();
  _dataMsg("data-import-msg","success","All data has been reset to empty.");
}

function copyExportJSON(){
  const ta = document.getElementById("export-json-text");
  if(!ta) return;
  const btn = document.getElementById("export-copy-btn");
  navigator.clipboard.writeText(ta.value).then(()=>{
    if(btn){ btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!'; btn.disabled = true; }
    setTimeout(()=>{
      if(btn){ btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy to clipboard'; btn.disabled = false; }
    }, 2000);
  }).catch(()=>{
    ta.select();
    if(btn){ btn.innerHTML = '<i class="fa-solid fa-copy"></i> Select all &amp; copy manually'; }
  });
}

let _importDataDebounce = null;
function onImportTextChange(){
  const ib = document.getElementById("import-btn");
  const prev = document.getElementById("import-preview");
  _pendingImport = null; _fullImportArmed = false;
  if(ib){ ib.disabled = true; ib.innerHTML = '<i class="fa-solid fa-upload"></i> Import'; }
  _dataHideMsg("data-import-msg");
  if(prev) prev.style.display = "none";
  clearTimeout(_importDataDebounce);
  _importDataDebounce = setTimeout(_parseImportDataText, 150);
}
function _parseImportDataText(){
  const ta = document.getElementById("import-text");
  const ib = document.getElementById("import-btn");
  const prev = document.getElementById("import-preview");
  const raw = ta && ta.value.trim();
  if(!raw) return;
  let payload;
  try { payload = JSON.parse(raw); }
  catch(err){ _dataMsg("data-import-msg","error","Not valid JSON - check for missing brackets or commas."); return; }
  if(!payload || !importTagOk(payload.app) || !payload.data){
    _dataMsg("data-import-msg","error","This doesn't look like a LaserStorm export - missing required fields."); return;
  }
  _pendingImport = payload;
  const d = payload.data;
  const nf=(d.customFactions||[]).length, nt=(d.customTraits||[]).length, nu=(d.customUnits||[]).length;
  let html;
  if(payload.kind==="army"){
    _dataMsg("data-import-msg","error",`This is an army export. Use the <strong>Armies</strong> page &rarr; <em>Import</em> button to import it.`); return;
  }
  if(payload.kind==="full"){
    html = `<strong>Full backup</strong> detected - `+
      `${nu} unit(s), ${nf} faction(s), ${nt} trait(s), ${(d.customTFTypes||[]).length} task force type(s), ${(d.customTacticalAssets||[]).length} asset(s), `+
      `${(d.taskForces||[]).length} task force(s), ${(d.armies||[]).length} army(ies), ${(d.expeditionaryForces||[]).length} force(s).<br>`+
      `<span style="color:#f85149;font-weight:bold">Importing will REPLACE all of your current data.</span>`;
    if(ib) ib.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Replace all data';
  } else if(payload.kind==="faction"){
    html = `<strong>Faction export</strong>: ${esc(payload.faction||((d.customFactions||[])[0]||{}).name||"-")} - `+
      `${nf} faction(s), ${nu} unit(s), ${nt} trait(s) will be merged (duplicates skipped).`;
    if(ib) ib.innerHTML = '<i class="fa-solid fa-upload"></i> Import faction';
  } else if(payload.kind==="selection"){
    const parts = [
      nu?`${nu} unit(s)`:null, nf?`${nf} faction(s)`:null, nt?`${nt} trait(s)`:null,
      (d.customTFTypes||[]).length?`${d.customTFTypes.length} task force type(s)`:null,
      (d.customTacticalAssets||[]).length?`${d.customTacticalAssets.length} asset(s)`:null,
      (d.taskForces||[]).length?`${d.taskForces.length} task force(s)`:null,
      (d.armies||[]).length?`${d.armies.length} army(ies)`:null,
      (d.expeditionaryForces||[]).length?`${d.expeditionaryForces.length} force(s)`:null,
    ].filter(Boolean);
    html = `<strong>Selection export</strong> - ${parts.length?parts.join(", "):"empty"} will be merged into your data (duplicates skipped).`;
    if(ib) ib.innerHTML = '<i class="fa-solid fa-upload"></i> Import selection';
  } else if(payload.kind==="taskforce"){
    _dataMsg("data-import-msg","error",`This is a task force export. Use the <strong>Task Forces</strong> page &rarr; <em>Import</em> button to import it.`); return;
  } else if(payload.kind==="force"){
    _dataMsg("data-import-msg","error",`This is an expeditionary force export. Use the <strong>Forces</strong> page &rarr; <em>Import</em> button to import it.`); return;
  } else {
    _dataMsg("data-import-msg","error","Unknown export kind."); return;
  }
  if(prev){ prev.innerHTML = html; prev.style.display=""; }
  if(ib) ib.disabled = false;
}

function doImport(){
  if(!_pendingImport){ _dataMsg("data-import-msg","error","Paste valid JSON first."); return; }
  const payload = _pendingImport;
  if(payload.kind==="full"){
    if(!_fullImportArmed){
      _fullImportArmed = true;
      const ib = document.getElementById("import-btn");
      if(ib) ib.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Click again to confirm REPLACE';
      _dataMsg("data-import-msg","error","This will erase your current data. Click the button again to confirm.");
      return;
    }
    importFull(payload.data);
  } else if(payload.kind==="selection"){
    importSelection(payload.data);
  } else {
    importFaction(payload.data);
  }
}

function importFull(d){
  const arr = v => Array.isArray(v) ? v : [];
  state.customUnits = arr(d.customUnits);
  state.customFactions = arr(d.customFactions);
  state.customTraits = arr(d.customTraits);
  state.customTFTypes = arr(d.customTFTypes);
  state.customTacticalAssets = arr(d.customTacticalAssets);
  state.taskForces = arr(d.taskForces);
  state.armies = arr(d.armies);
  state.expeditionaryForces = arr(d.expeditionaryForces);
  state.tfTemplates = arr(d.tfTemplates);
  // A backup may come from an older app version - run the same migrations a
  // legacy localStorage save would get, so the shape is current before saving.
  _migrateState();
  saveState();
  _markBackedUp();   // they restored from a file they have -> no immediate loss risk
  renderDataPage();
  _dataMsg("data-import-msg","success","Full backup imported. All data replaced.");
}

function importFaction(d){
  _normalizeBundle(d);
  let addedF=0,skipF=0,addedT=0,skipT=0,addedU=0,skipU=0;
  // Factions: dedupe by name. Units reference a faction by id, so track how
  // each imported faction id resolves to an id that exists in the current data.
  const facById = new Map((state.customFactions||[]).map(f=>[f.id,f]));
  const facByName = new Map((state.customFactions||[]).map(f=>[String(f.name).toLowerCase(),f]));
  const facIdMap = {}; // imported faction id -> resolved id in current state
  (d.customFactions||[]).forEach(f=>{
    const nameLc = String(f.name||"").toLowerCase();
    const existing = facByName.get(nameLc);
    if(existing){ facIdMap[f.id] = existing.id; skipF++; return; }
    let newId = f.id;
    if(!newId || facById.has(newId)) newId = "fac_"+uid();
    const nf = Object.assign({}, f, { id:newId });
    state.customFactions.push(nf);
    facById.set(newId,nf); facByName.set(nameLc,nf);
    facIdMap[f.id] = newId; addedF++;
  });
  const remapFac = id => (id && facIdMap[id]) ? facIdMap[id] : id;

  // Traits: dedupe by name; remap any faction ids they reference.
  const traitByName = new Map((state.customTraits||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const traitById = new Set((state.customTraits||[]).map(t=>t.id));
  (d.customTraits||[]).forEach(t=>{
    const nameLc = String(t.name||"").toLowerCase();
    if(traitByName.has(nameLc)){ skipT++; return; }
    let newId = t.id;
    if(!newId || traitById.has(newId)) newId = uid();
    const nt = Object.assign({}, t, { id:newId });
    if(nt.faction) nt.faction = remapFac(nt.faction);
    if(Array.isArray(nt.reqs)) nt.reqs = nt.reqs.map(r =>
      (r && r.type==="faction" && Array.isArray(r.vals))
        ? Object.assign({}, r, { vals: r.vals.map(remapFac) }) : r);
    state.customTraits.push(nt);
    traitByName.set(nameLc,nt); traitById.add(newId); addedT++;
  });

  // Units: remap faction id, dedupe by name+faction.
  const unitById = new Set((state.customUnits||[]).map(u=>u.id));
  const unitKey = u => String(u.name||"").toLowerCase()+"||"+String(u.faction||"").toLowerCase();
  const unitKeys = new Set((state.customUnits||[]).map(unitKey));
  (d.customUnits||[]).forEach(u=>{
    const nu = Object.assign({}, u, { faction: remapFac(u.faction) });
    if(unitKeys.has(unitKey(nu))){ skipU++; return; }
    let newId = nu.id;
    if(!newId || unitById.has(newId)) newId = "custom_"+uid();
    nu.id = newId;
    if(typeof migrateCustomUnit==="function") migrateCustomUnit(nu);
    state.customUnits.push(nu);
    unitById.add(newId); unitKeys.add(unitKey(nu)); addedU++;
  });

  saveState();
  renderDataPage();
  const skipped = skipF+skipU+skipT;
  _dataMsg("data-import-msg","success",
    `Imported ${addedF} faction(s), ${addedU} unit(s), ${addedT} trait(s).`+
    (skipped?` Skipped ${skipped} item(s) already present.`:""));
}

// Imported ids get interpolated into inline event handlers, so only plain
// token ids may be kept verbatim - anything else is treated like a collision
// and the importer generates a fresh id for it.
function safeImportId(id){ return typeof id==="string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(id); }

// Coerce a bundle's category fields to arrays so a malformed file fails the
// preview counts instead of throwing halfway through a state mutation.
function _normalizeBundle(d){
  ["customUnits","customFactions","customTraits","customTFTypes","customTacticalAssets",
   "taskForces","armies","expeditionaryForces","tfTemplates"].forEach(k=>{
    if(d[k]!==undefined && !Array.isArray(d[k])) d[k]=[];
  });
  return d;
}

// Merge a selection bundle (any mix of the eight categories) into current data.
// Library-style items (factions, traits, units, TF types, assets) dedupe by
// name and remap ids; container items (task forces, armies, forces) always get
// fresh ids with their internal references remapped - same rules as the
// per-army / per-task-force importers, applied across every category at once.
function importSelection(d){
  _normalizeBundle(d);
  const counts = { factions:0, traits:0, units:0, tfTypes:0, assets:0, taskForces:0, armies:0, forces:0, skipped:0 };

  // 1. Factions (dedupe by name)
  const facById = new Map((state.customFactions||[]).map(f=>[f.id,f]));
  const facByName = new Map((state.customFactions||[]).map(f=>[String(f.name).toLowerCase(),f]));
  const facIdMap = {};
  (d.customFactions||[]).forEach(f=>{
    const k=String(f.name||"").toLowerCase(); const ex=facByName.get(k);
    if(ex){ facIdMap[f.id]=ex.id; counts.skipped++; return; }
    let id=(!safeImportId(f.id)||facById.has(f.id))?"fac_"+uid():f.id;
    const nf=Object.assign({},f,{id}); state.customFactions.push(nf); facById.set(id,nf); facByName.set(k,nf); facIdMap[f.id]=id; counts.factions++;
  });
  const remapFac=id=>(id&&facIdMap[id])?facIdMap[id]:id;

  // 2. Traits (dedupe by name)
  const traitByName=new Map((state.customTraits||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const traitById=new Set((state.customTraits||[]).map(t=>t.id));
  (d.customTraits||[]).forEach(t=>{
    const k=String(t.name||"").toLowerCase(); if(traitByName.has(k)){ counts.skipped++; return; }
    let id=(!safeImportId(t.id)||traitById.has(t.id))?uid():t.id;
    const nt=Object.assign({},t,{id});
    if(nt.faction) nt.faction=remapFac(nt.faction);
    if(Array.isArray(nt.reqs)) nt.reqs=nt.reqs.map(r=>(r&&r.type==="faction"&&Array.isArray(r.vals))?Object.assign({},r,{vals:r.vals.map(remapFac)}):r);
    state.customTraits.push(nt); traitByName.set(k,nt); traitById.add(id); counts.traits++;
  });

  // 3. Units (dedupe by name+faction)
  const unitById=new Map((state.customUnits||[]).map(u=>[u.id,u]));
  const unitKey=u=>String(u.name||"").toLowerCase()+"||"+String(u.faction||"").toLowerCase();
  const unitKeyToId=new Map((state.customUnits||[]).map(u=>[unitKey(u),u.id]));
  const unitIdMap={};
  (d.customUnits||[]).forEach(u=>{
    const nu=Object.assign({},u,{faction:remapFac(u.faction)}); const k=unitKey(nu);
    if(unitKeyToId.has(k)){ unitIdMap[u.id]=unitKeyToId.get(k); counts.skipped++; return; }
    let id=(!safeImportId(nu.id)||unitById.has(nu.id))?"custom_"+uid():nu.id; nu.id=id;
    if(typeof migrateCustomUnit==="function") migrateCustomUnit(nu);
    state.customUnits.push(nu); unitById.set(id,nu); unitKeyToId.set(k,id); unitIdMap[u.id]=id; counts.units++;
  });
  const remapUnit=id=>(id&&unitIdMap[id])?unitIdMap[id]:id;

  // 4. TF types (dedupe by name)
  const tfTypeByName=new Map((state.customTFTypes||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const tfTypeById=new Map((state.customTFTypes||[]).map(t=>[t.id,t]));
  const tfTypeIdMap={};
  (d.customTFTypes||[]).forEach(t=>{
    const k=String(t.name||"").toLowerCase(); const ex=tfTypeByName.get(k);
    if(ex){ tfTypeIdMap[t.id]=ex.id; counts.skipped++; return; }
    let id=(!safeImportId(t.id)||tfTypeById.has(t.id))?"ctft_"+uid():t.id;
    const nt=Object.assign({},t,{id}); state.customTFTypes.push(nt); tfTypeByName.set(k,nt); tfTypeById.set(id,nt); tfTypeIdMap[t.id]=id; counts.tfTypes++;
  });
  const remapTFType=id=>(id&&tfTypeIdMap[id])?tfTypeIdMap[id]:id;

  // 5. Tactical assets (dedupe by name)
  const assetByName=new Map((state.customTacticalAssets||[]).map(a=>[String(a.name).toLowerCase(),a]));
  const assetById=new Map((state.customTacticalAssets||[]).map(a=>[a.id,a]));
  const assetIdMap={};
  (d.customTacticalAssets||[]).forEach(a=>{
    const k=String(a.name||"").toLowerCase(); const ex=assetByName.get(k);
    if(ex){ assetIdMap[a.id]=ex.id; counts.skipped++; return; }
    let id=(!safeImportId(a.id)||assetById.has(a.id))?uid():a.id;
    const na=Object.assign({},a,{id}); state.customTacticalAssets.push(na); assetByName.set(k,na); assetById.set(id,na); assetIdMap[a.id]=id; counts.assets++;
  });
  const remapTacAsset=raw=>{ if(!raw) return raw; if(raw.startsWith("custom_")){ const b=raw.slice(7); return "custom_"+(assetIdMap[b]||b);} return raw; };

  // 6. Task forces (fresh ids, references remapped)
  const tfIdMap={};
  const slotIdMap={};   // keyed "<oldTfId>|<oldSlotId>" - slot ids repeat across bundles
  (d.taskForces||[]).forEach(tf=>{
    const id="tf_"+uid(); tfIdMap[tf.id]=id;
    state.taskForces.push(Object.assign({},tf,{
      id, tfType:remapTFType(tf.tfType), tacAsset:remapTacAsset(tf.tacAsset),
      faction:remapFac(tf.faction),
      units:(tf.units||[]).map(s=>{
        const sid="slot_"+uid(); slotIdMap[tf.id+"|"+s.id]=sid;
        return Object.assign({},s,{id:sid,unitId:remapUnit(s.unitId),transport:s.transport?remapUnit(s.transport):s.transport});
      })
    }));
    counts.taskForces++;
  });
  const remapTF=id=>(id&&tfIdMap[id])?tfIdMap[id]:id;

  // 7. Armies (fresh ids, references remapped)
  const armyIdMap={};
  (d.armies||[]).forEach(a=>{
    const id="army_"+uid(); armyIdMap[a.id]=id;
    state.armies.push(Object.assign({},a,{
      id,
      faction:remapFac(a.faction),
      taskForceIds:(a.taskForceIds||[]).map(remapTF),
      battleGroups:(a.battleGroups||[]).map(bg=>Object.assign({},bg,{
        id:"bg_"+uid(),
        entries:(bg.entries||[]).map(e=>{ const ne=Object.assign({},e,{id:"e_"+uid()});
          if(ne.tfId){ if(ne.slotId) ne.slotId=slotIdMap[ne.tfId+"|"+ne.slotId]||ne.slotId; ne.tfId=remapTF(ne.tfId); }
          if(ne.unitId) ne.unitId=remapUnit(ne.unitId);
          if(ne.transport) ne.transport=remapUnit(ne.transport);
          return ne; })
      }))
    }));
    counts.armies++;
  });
  const remapArmy=id=>(id&&armyIdMap[id])?armyIdMap[id]:id;

  // 8. Expeditionary forces (fresh ids, army refs remapped)
  (d.expeditionaryForces||[]).forEach(f=>{
    state.expeditionaryForces.push(Object.assign({},f,{
      id:"ef_"+uid(),
      armyGroups:(f.armyGroups||[]).map(g=>Object.assign({},g,{ id:"ag_"+uid(), armyIds:(g.armyIds||[]).map(remapArmy) }))
    }));
    counts.forces++;
  });

  saveState();
  renderDataPage();
  const parts=[];
  if(counts.units) parts.push(`${counts.units} unit(s)`);
  if(counts.factions) parts.push(`${counts.factions} faction(s)`);
  if(counts.traits) parts.push(`${counts.traits} trait(s)`);
  if(counts.tfTypes) parts.push(`${counts.tfTypes} task force type(s)`);
  if(counts.assets) parts.push(`${counts.assets} asset(s)`);
  if(counts.taskForces) parts.push(`${counts.taskForces} task force(s)`);
  if(counts.armies) parts.push(`${counts.armies} army(ies)`);
  if(counts.forces) parts.push(`${counts.forces} force(s)`);
  _dataMsg("data-import-msg","success",
    (parts.length?`Imported ${parts.join(", ")}.`:"Nothing new to import.")+
    (counts.skipped?` Skipped ${counts.skipped} duplicate(s).`:""));
}

function _dataMsg(id, type, html){
  const el = document.getElementById(id);
  if(!el) return;
  const bg = type==="success" ? "rgba(46,160,67,.15)" : "rgba(248,81,73,.15)";
  const bd = type==="success" ? "#2ea043" : "#f85149";
  el.style.display="block";
  el.innerHTML = `<div style="background:${bg};border:1px solid ${bd};border-radius:6px;padding:9px 12px;font-size:13px;color:#e0e0e0">${html}</div>`;
}
function _dataHideMsg(id){ const el=document.getElementById(id); if(el){ el.style.display="none"; el.innerHTML=""; } }

// ── Per-army export / import ─────────────────────────────────────────────────

function collectArmyBundle(armyId) {
  const army = (state.armies||[]).find(a=>a.id===armyId);
  if(!army) return null;
  const fp = isFreePick(army);

  // Collect task forces used by this army (TF armies only)
  const tfIdSet = new Set(army.taskForceIds||[]);
  const tfs = (state.taskForces||[]).filter(tf=>tfIdSet.has(tf.id));

  // Gather all unit IDs referenced in the army
  const unitIdSet = new Set();
  if(fp) {
    (army.battleGroups||[]).forEach(bg=>(bg.entries||[]).forEach(e=>{
      if(e.unitId) unitIdSet.add(e.unitId);
      if(e.transport) unitIdSet.add(e.transport);
    }));
  } else {
    tfs.forEach(tf=>(tf.units||[]).forEach(slot=>{
      if(slot.unitId) unitIdSet.add(slot.unitId);
      if(slot.transport) unitIdSet.add(slot.transport);
    }));
  }

  // Custom units only (built-in units are always present, don't need bundling)
  const customUnits = (state.customUnits||[]).filter(u=>unitIdSet.has(u.id));

  // Custom traits referenced by those units (matched by name)
  const traitNames = new Set();
  customUnits.forEach(u=>{
    (u.standTraits||[]).forEach(t=>{ if(t&&t[0]!=null) traitNames.add(String(t[0]).toLowerCase()); });
    (u.weapons||[]).forEach(w=>(w.traits||[]).forEach(t=>{ if(t&&t[0]!=null) traitNames.add(String(t[0]).toLowerCase()); }));
  });
  const customTraits = (state.customTraits||[]).filter(t=>traitNames.has(String(t.name).toLowerCase()));

  // Factions those units belong to, plus factions referenced by the army/TF
  // restriction fields and by the bundled traits' faction requirements
  const facIdSet = new Set(customUnits.map(u=>u.faction).filter(Boolean));
  if(army.faction) facIdSet.add(army.faction);
  tfs.forEach(tf=>{ if(tf.faction) facIdSet.add(tf.faction); });
  customTraits.forEach(t=>{
    if(t.faction) facIdSet.add(t.faction);
    (t.reqs||[]).forEach(r=>{ if(r&&r.type==="faction") (r.vals||[]).forEach(v=>facIdSet.add(v)); });
  });
  const customFactions = (state.customFactions||[]).filter(f=>facIdSet.has(f.id));

  // Custom TF types used by the army's task forces
  const tfTypeIds = new Set();
  tfs.forEach(tf=>{ if(tf.tfType && (state.customTFTypes||[]).some(ct=>ct.id===tf.tfType)) tfTypeIds.add(tf.tfType); });
  const customTFTypes = (state.customTFTypes||[]).filter(t=>tfTypeIds.has(t.id));

  // Custom tactical assets used by the army's task forces
  const assetIds = new Set();
  tfs.forEach(tf=>{ if(tf.tacAsset&&tf.tacAsset.startsWith("custom_")) assetIds.add(tf.tacAsset.slice(7)); });
  const customTacticalAssets = (state.customTacticalAssets||[]).filter(a=>assetIds.has(a.id));

  return { army, taskForces:tfs, customTFTypes, customTacticalAssets, customUnits, customFactions, customTraits };
}

function exportArmy(armyId) {
  const bundle = collectArmyBundle(armyId);
  if(!bundle) return;
  const payload = {
    app:appTag(), kind:"army", version:1,
    exportedAt:new Date().toISOString(), armyName:bundle.army.name,
    data:bundle
  };
  const json = JSON.stringify(payload, null, 2);
  const ta = document.getElementById("export-json-text");
  if(ta) ta.value = json;
  const ttl = document.getElementById("export-json-title");
  if(ttl) ttl.textContent = `Export - ${bundle.army.name}`;
  const sum = document.getElementById("export-json-summary");
  if(sum) {
    const parts = [];
    if(bundle.taskForces.length) parts.push(`${bundle.taskForces.length} task force${bundle.taskForces.length!==1?"s":""}`);
    if(bundle.customUnits.length) parts.push(`${bundle.customUnits.length} custom unit${bundle.customUnits.length!==1?"s":""}`);
    if(bundle.customFactions.length) parts.push(`${bundle.customFactions.length} custom faction${bundle.customFactions.length!==1?"s":""}`);
    if(bundle.customTraits.length) parts.push(`${bundle.customTraits.length} custom trait${bundle.customTraits.length!==1?"s":""}`);
    sum.textContent = parts.length ? parts.join(", ") : "no custom dependencies";
  }
  const copyBtn = document.getElementById("export-copy-btn");
  if(copyBtn){ copyBtn.innerHTML='<i class="fa-solid fa-copy"></i> Copy to clipboard'; copyBtn.disabled=false; }
  openModal("modal-export-json");
}

function openImportArmyModal() {
  const ta = document.getElementById("import-army-text");
  if(ta) ta.value = "";
  const prev = document.getElementById("import-army-preview");
  if(prev) prev.style.display="none";
  _dataHideMsg("import-army-msg");
  const btn = document.getElementById("import-army-btn");
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-upload"></i> Import Army'; }
  _pendingImport = null;
  openModal("modal-import-army");
}

let _importArmyDebounce = null;
function onImportArmyTextChange() {
  clearTimeout(_importArmyDebounce);
  _importArmyDebounce = setTimeout(_parseImportArmyText, 120);
}

function _parseImportArmyText() {
  const ta = document.getElementById("import-army-text");
  const btn = document.getElementById("import-army-btn");
  const prev = document.getElementById("import-army-preview");
  _pendingImport = null;
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-upload"></i> Import Army'; }
  _dataHideMsg("import-army-msg");
  if(prev) prev.style.display="none";
  const raw = ta&&ta.value.trim();
  if(!raw) return;
  let payload;
  try { payload = JSON.parse(raw); }
  catch(e){ _dataMsg("import-army-msg","error","Not valid JSON - check for missing brackets or commas."); return; }
  if(!payload||!importTagOk(payload.app)||!payload.data){
    _dataMsg("import-army-msg","error","This doesn't look like a LaserStorm export - missing required fields."); return;
  }
  if(payload.kind!=="army"){
    _dataMsg("import-army-msg","error",`This is a <strong>${esc(String(payload.kind))}</strong> export, not an army export. Use the Data page to import it.`); return;
  }
  const d = payload.data;
  const a = d.army||{};
  const fp = a.armyType==="fp";
  const parts = [
    `<strong>${esc(a.name||"Unnamed Army")}</strong>`,
    fp ? "Free Pick army" : "Task Force army",
    a.faction ? `faction: ${esc(factionName(a.faction)||a.faction)}` : null,
    d.taskForces&&d.taskForces.length ? `${d.taskForces.length} task force${d.taskForces.length!==1?"s":""}` : null,
    d.customUnits&&d.customUnits.length ? `${d.customUnits.length} custom unit${d.customUnits.length!==1?"s":""}` : null,
    d.customFactions&&d.customFactions.length ? `${d.customFactions.length} custom faction${d.customFactions.length!==1?"s":""}` : null,
    d.customTraits&&d.customTraits.length ? `${d.customTraits.length} custom trait${d.customTraits.length!==1?"s":""}` : null,
    d.customTFTypes&&d.customTFTypes.length ? `${d.customTFTypes.length} custom task force type${d.customTFTypes.length!==1?"s":""}` : null,
    d.customTacticalAssets&&d.customTacticalAssets.length ? `${d.customTacticalAssets.length} custom asset${d.customTacticalAssets.length!==1?"s":""}` : null,
  ].filter(Boolean);
  if(prev){ prev.innerHTML = parts.join(" &bull; "); prev.style.display=""; }
  if(btn){ btn.disabled=false; }
  _pendingImport = payload;
}

function doImportArmy() {
  if(!_pendingImport||_pendingImport.kind!=="army"){ _dataMsg("import-army-msg","error","Paste valid army JSON first."); return; }
  const newArmy = importArmy(_pendingImport);
  if(!newArmy){ _dataMsg("import-army-msg","error","This army export is missing its army data and can't be imported."); return; }
  closeModal("modal-import-army");
  // Navigate to the new army
  const lv = document.getElementById("army-list-view");
  const dv = document.getElementById("army-detail-view");
  if(lv) lv.style.display="none";
  if(dv) dv.style.display="";
  currentArmyId = newArmy.id;
  renderArmyDetail();
}

function importArmy(payload) {
  const d = payload.data;
  if(!d || !d.army) return null;
  _normalizeBundle(d);

  // 1. Merge factions (dedup by name)
  const facById = new Map((state.customFactions||[]).map(f=>[f.id,f]));
  const facByName = new Map((state.customFactions||[]).map(f=>[String(f.name).toLowerCase(),f]));
  const facIdMap = {};
  (d.customFactions||[]).forEach(f=>{
    const k = String(f.name||"").toLowerCase();
    const ex = facByName.get(k);
    if(ex){ facIdMap[f.id]=ex.id; return; }
    let newId = (!safeImportId(f.id)||facById.has(f.id)) ? "fac_"+uid() : f.id;
    const nf = Object.assign({},f,{id:newId});
    state.customFactions.push(nf); facById.set(newId,nf); facByName.set(k,nf);
    facIdMap[f.id]=newId;
  });
  const remapFac = id=>(id&&facIdMap[id])?facIdMap[id]:id;

  // 2. Merge traits (dedup by name)
  const traitByName = new Map((state.customTraits||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const traitById = new Set((state.customTraits||[]).map(t=>t.id));
  (d.customTraits||[]).forEach(t=>{
    const k = String(t.name||"").toLowerCase();
    if(traitByName.has(k)) return;
    let newId = (!safeImportId(t.id)||traitById.has(t.id)) ? uid() : t.id;
    const nt = Object.assign({},t,{id:newId});
    if(nt.faction) nt.faction=remapFac(nt.faction);
    if(Array.isArray(nt.reqs)) nt.reqs=nt.reqs.map(r=>(r&&r.type==="faction"&&Array.isArray(r.vals))?Object.assign({},r,{vals:r.vals.map(remapFac)}):r);
    state.customTraits.push(nt); traitByName.set(k,nt); traitById.add(newId);
  });

  // 3. Merge units (dedup by name+faction combo)
  const unitByIdMap = new Map((state.customUnits||[]).map(u=>[u.id,u]));
  const unitKey = u=>String(u.name||"").toLowerCase()+"||"+String(u.faction||"").toLowerCase();
  const unitKeyToId = new Map((state.customUnits||[]).map(u=>[unitKey(u),u.id]));
  const unitIdMap = {};
  (d.customUnits||[]).forEach(u=>{
    const nu = Object.assign({},u,{faction:remapFac(u.faction)});
    const k = unitKey(nu);
    if(unitKeyToId.has(k)){ unitIdMap[u.id]=unitKeyToId.get(k); return; }
    let newId = (!safeImportId(nu.id)||unitByIdMap.has(nu.id)) ? "custom_"+uid() : nu.id;
    nu.id=newId;
    if(typeof migrateCustomUnit==="function") migrateCustomUnit(nu);
    state.customUnits.push(nu); unitByIdMap.set(newId,nu); unitKeyToId.set(k,newId);
    unitIdMap[u.id]=newId;
  });
  const remapUnit = id=>(id&&unitIdMap[id])?unitIdMap[id]:id;

  // 4. Merge custom TF types (dedup by name)
  const tfTypeByName = new Map((state.customTFTypes||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const tfTypeById = new Map((state.customTFTypes||[]).map(t=>[t.id,t]));
  const tfTypeIdMap = {};
  (d.customTFTypes||[]).forEach(t=>{
    const k = String(t.name||"").toLowerCase();
    const ex = tfTypeByName.get(k);
    if(ex){ tfTypeIdMap[t.id]=ex.id; return; }
    let newId = (!safeImportId(t.id)||tfTypeById.has(t.id)) ? "ctft_"+uid() : t.id;
    const nt = Object.assign({},t,{id:newId});
    state.customTFTypes.push(nt); tfTypeByName.set(k,nt); tfTypeById.set(newId,nt);
    tfTypeIdMap[t.id]=newId;
  });
  const remapTFType = id=>(id&&tfTypeIdMap[id])?tfTypeIdMap[id]:id;

  // 5. Merge custom tactical assets (dedup by name)
  const assetByName = new Map((state.customTacticalAssets||[]).map(a=>[String(a.name).toLowerCase(),a]));
  const assetById = new Map((state.customTacticalAssets||[]).map(a=>[a.id,a]));
  const assetIdMap = {};
  (d.customTacticalAssets||[]).forEach(a=>{
    const k = String(a.name||"").toLowerCase();
    const ex = assetByName.get(k);
    if(ex){ assetIdMap[a.id]=ex.id; return; }
    let newId = (!safeImportId(a.id)||assetById.has(a.id)) ? uid() : a.id;
    const na = Object.assign({},a,{id:newId});
    state.customTacticalAssets.push(na); assetByName.set(k,na); assetById.set(newId,na);
    assetIdMap[a.id]=newId;
  });
  // tacAsset field in a TF is stored as "custom_<id>", so remap accordingly
  const remapTacAsset = raw=>{
    if(!raw) return raw;
    if(raw.startsWith("custom_")){
      const bare=raw.slice(7);
      return "custom_"+(assetIdMap[bare]||bare);
    }
    return raw;
  };

  // 6. Import task forces with fresh IDs (always new - armies own their TFs)
  const tfIdMap = {};
  const slotIdMap = {};   // keyed "<oldTfId>|<oldSlotId>" - slot ids repeat across exports
  (d.taskForces||[]).forEach(tf=>{
    const newTFId = "tf_"+uid();
    tfIdMap[tf.id]=newTFId;
    const newTF = Object.assign({},tf,{
      id:newTFId,
      tfType:remapTFType(tf.tfType),
      tacAsset:remapTacAsset(tf.tacAsset),
      faction:remapFac(tf.faction),
      units:(tf.units||[]).map(slot=>{
        const sid = "slot_"+uid(); slotIdMap[tf.id+"|"+slot.id]=sid;
        return Object.assign({},slot,{
          id:sid,
          unitId:remapUnit(slot.unitId),
          transport:slot.transport?remapUnit(slot.transport):slot.transport
        });
      })
    });
    state.taskForces.push(newTF);
  });
  const remapTF = id=>(id&&tfIdMap[id])?tfIdMap[id]:id;

  // 7. Import the army with a fresh ID, remapping all internal references
  const orig = d.army;
  const newArmy = Object.assign({},orig,{
    id:"army_"+uid(),
    faction:remapFac(orig.faction),
    taskForceIds:(orig.taskForceIds||[]).map(remapTF),
    battleGroups:(orig.battleGroups||[]).map(bg=>Object.assign({},bg,{
      id:"bg_"+uid(),
      entries:(bg.entries||[]).map(e=>{
        const ne = Object.assign({},e,{id:"e_"+uid()});
        if(ne.tfId){ if(ne.slotId) ne.slotId = slotIdMap[ne.tfId+"|"+ne.slotId]||ne.slotId; ne.tfId = remapTF(ne.tfId); }
        if(ne.unitId) ne.unitId = remapUnit(ne.unitId);
        if(ne.transport) ne.transport = remapUnit(ne.transport);
        return ne;
      })
    }))
  });
  state.armies.push(newArmy);
  saveState();
  return newArmy;
}

function closeModal(id) { document.getElementById(id).classList.remove("open"); }
function openModal(id) { document.getElementById(id).classList.add("open"); }
function toggleCostRef() {
  const body = document.getElementById("cost-ref-body");
  const chev = document.getElementById("cost-ref-chev");
  const open = body.style.display === "none";
  body.style.display = open ? "" : "none";
  chev.innerHTML = open ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
}

function toggleBuilderBreakdown() {
  builderBreakdownOpen = !builderBreakdownOpen;
  const body = document.getElementById("builder-breakdown-body");
  const chev = document.getElementById("builder-breakdown-chev");
  if (body) body.style.display = builderBreakdownOpen ? "" : "none";
  if (chev) chev.innerHTML = builderBreakdownOpen ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
}

// ============================================================
// UNIT BUILDER
// ============================================================
let builderWeapons = [];

function setEditMode(unit) {
  const hint = document.getElementById("b-edit-hint");
  const saveBtn = document.getElementById("b-save-btn");
  const newBtn = document.getElementById("b-new-btn");
  if(unit) {
    editingUnitId = unit.id;
    hint.style.display = "block";
    hint.innerHTML = `<i class="fa-solid fa-pen"></i> Editing <strong>${esc(unit.name)}</strong> - saving updates it in place.`;
    saveBtn.textContent = "Update Unit";
    newBtn.style.display = "inline-block";
  } else {
    editingUnitId = null;
    hint.style.display = "none";
    saveBtn.textContent = "Save to Library";
    newBtn.style.display = "none";
  }
}

function resetBuilder() {
  document.getElementById("b-name").value = "";
  document.getElementById("b-description").value = "";
  // First class key from the GAME pack, not a hardcoded "inf".
  document.getElementById("b-class").value = Object.keys(GAME.classes)[0];
  document.getElementById("b-faction").value = "";
  builderFactionPrev = "";
  builderMobilityPrev = "";
  builderSelectedRole = "unit";
  currentBuilderTraits = [];
  builderWeapons = [];
  setEditMode(null);
  onClassChange();
}

function onClassChange() {
  const cls = document.getElementById("b-class").value;
  const ci = CLASS_INFO[cls];
  // Reset every schema stat input to the new class's defaults
  GAME.schema.stats.forEach(f => {
    const el = document.getElementById(f.edit.id);
    if(el && f.edit.applyClass) f.edit.applyClass(el, ci, cls);
  });
  const mobEl = document.getElementById("b-mobility");
  if(mobEl) builderMobilityPrev = mobEl.value;
  const sizeEl = document.getElementById("b-unit-size");
  if(sizeEl) {
    sizeEl.value = ci.size;
    sizeEl.min = (cls==="sh"||cls==="beh") ? 1 : 2;
    const hint = document.getElementById("b-size-hint");
    if(hint) hint.textContent = `(def ${ci.size})`;
  }
  currentBuilderTraits = [];
  document.getElementById("b-traits-display").innerHTML = `<span style="color:#8b949e;font-size:11px">None</span>`;
  builderWeapons = [GAME.schema.weapon.initialWeapon()];
  renderWeaponRows();
  renderClassProfile();
  calculateBuilder();
}

function renderWeaponRows() {
  const container = document.getElementById("b-weapons-container");
  container.innerHTML = "";
  if (!builderWeapons.length) {
    container.innerHTML = `<div style="font-size:11px;color:var(--text-faint);font-style:italic;padding:8px 0;text-align:center"><i class="fa-solid fa-crosshairs" style="margin-right:5px;opacity:.5"></i>No ranged weapons - assault only. Use <strong style="color:var(--text-muted);font-style:normal">Add Weapon</strong> to arm this unit.</div>`;
    return;
  }
  builderWeapons.forEach((w,i) => {
    const div = document.createElement("div");
    div.className = "weapon-builder";
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;font-weight:bold;color:#8b949e;text-transform:uppercase;white-space:nowrap">Weapon ${i+1}</span>
        <input type="text" value="${esc(w.name||"")}" placeholder="Name (optional)" style="flex:1;font-size:12px;padding:3px 8px;background:#161b22;border-color:#21262d"
          oninput="builderWeapons[${i}].name=this.value" onchange="builderWeapons[${i}].name=this.value">
        <button class="trait-edit-btn" onclick="confirmBtn(this,()=>removeWeapon(${i}))">Remove</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${GAME.schema.weapon.edit.length},minmax(0,1fr));gap:6px">${weaponEditCellsHTML(w, i)}</div>
      <div class="form-group" style="margin-top:8px">
        <label>Weapon Traits <span class="trait-edit-btn" onclick="openTraitPicker('weapon',${i})">edit</span></label>
        <div id="wtrait-display-${i}" style="font-size:11px;color:#8b949e;margin-top:4px">${traitTipHTML(w.traits||[], allWeaponTraits())||"None"}</div>
      </div>`;
    container.appendChild(div);
  });
}

function addWeaponRow() {
  builderWeapons.push(GAME.schema.weapon.newWeapon());
  renderWeaponRows();
  calculateBuilder();
}
function removeWeapon(i) {
  builderWeapons.splice(i,1);
  renderWeaponRows();
  calculateBuilder();
}

let _traitPickerDebounce = null;
function onTraitPickerSearchChange() { clearTimeout(_traitPickerDebounce); _traitPickerDebounce = setTimeout(refreshTraitPickerList, 150); }
function refreshTraitPickerList() {
  const list = document.getElementById("trait-modal-list");
  list.innerHTML = "";
  const traits = traitPickerTarget==="stand" ? allStandTraits() : allWeaponTraits();
  const curTraits = traitPickerTarget==="stand"
    ? currentBuilderTraits
    : (builderWeapons[traitPickerWeaponIdx]?.traits||[]);
  const selected = curTraits.map(t=>String(t[0]).toLowerCase());
  const selectedTraitKeys = new Set(curTraits.map(t=>findTraitEntry(traits,t[0])?.[0]).filter(Boolean));
  const currentFaction  = document.getElementById("b-faction")?.value  || "";
  const currentClass    = document.getElementById("b-class")?.value    || "";
  const currentMobility = document.getElementById("b-mobility")?.value || "";
  const search = (document.getElementById("trait-picker-search")?.value||"").toLowerCase();

  const entries = Object.entries(traits).map(([key, val]) => {
    const reqs      = allTraitReqs(key, val);
    const facReq    = reqs.find(r=>r.type==="faction");
    const clsReq    = reqs.find(r=>r.type==="class");
    const mobReq    = reqs.find(r=>r.type==="mobility");
    const traitrReq = reqs.find(r=>r.type==="traitr");
    const locked = (facReq    && !facReq.vals.includes(currentFaction))
                || (clsReq    && !classReqOk(clsReq, currentClass))
                || troopRoleForbids(reqs, currentClass)
                || (mobReq    && !mobReq.vals.includes(currentMobility))
                || (traitrReq && !selectedTraitKeys.has(traitrReq.vals[0]));
    const group  = facReq ? "faction:"+facReq.vals[0]
                 : key.startsWith("custom_") ? "custom"
                 : "general";
    return {key, val, reqs, locked, group};
  });

  const filtered = search
    ? entries.filter(e => e.val[0].toLowerCase().includes(search) || (e.val[2]||"").toLowerCase().includes(search))
    : entries;

  const groups = {};
  filtered.forEach(e => { (groups[e.group]||(groups[e.group]=[])).push(e); });

  // Always include a section for every custom faction (even if no traits gated to it yet)
  (state.customFactions||[]).forEach(f => {
    const gk = "faction:"+f.id;
    if(!groups[gk]) groups[gk] = [];
  });

  const factionGroupKeys = Object.keys(groups).filter(g=>g.startsWith("faction:"));
  const groupOrder = ["general",...factionGroupKeys,"custom"].filter(g=>groups[g]?.length || g.startsWith("faction:"));

  function groupLabel(g) {
    if(g==="general") return "General";
    if(g==="custom")  return "Custom";
    const fid = g.slice(8);
    const cf = (state.customFactions||[]).find(f=>f.id===fid);
    return cf ? cf.name : (FACTION_LABEL_MAP[fid]||fid);
  }

  if(!groupOrder.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:var(--text-faint);font-size:12px;padding:8px 4px";
    empty.textContent = "No traits match.";
    list.appendChild(empty);
    return;
  }

  groupOrder.forEach((g, gi) => {
    const hdr = document.createElement("div");
    hdr.className = "trait-group-header";
    if(gi===0) hdr.style.cssText = "margin-top:0;padding-top:0";
    hdr.textContent = groupLabel(g);
    list.appendChild(hdr);

    if(!groups[g].length) {
      const hint = document.createElement("div");
      hint.style.cssText = "color:var(--text-faint);font-size:11px;padding:4px 2px 6px";
      hint.textContent = "No traits for this faction yet - create some in Custom Traits.";
      list.appendChild(hint);
    }
    groups[g].forEach(({key, val, reqs, locked}) => {
      const stackable = traitIsStackable(val);
      const row = document.createElement("div");
      row.className = "trait-row";
      if(locked) row.style.cssText = "opacity:0.4;pointer-events:none";

      const info = document.createElement("label");
      info.className = "trait-row-info";
      info.style.cursor = locked ? "default" : "pointer";

      const nameEl = document.createElement("div");
      nameEl.className = "trait-row-name";
      const costStr = val[1]===0 ? "free" : (val[1]>0?"+":"")+val[1]+" pts";
      const utBadge = traitIsUnitTrait(val) ? `<span style="font-size:9px;background:#3949ab22;color:#7986cb;border:1px solid #3949ab55;border-radius:8px;padding:0 4px;margin-left:4px;vertical-align:middle;font-weight:normal">Unit</span>` : "";
      nameEl.innerHTML = esc(val[0]) + `<span class="trait-cost">${costStr}</span>` + utBadge;
      info.appendChild(nameEl);

      if(reqs.length) {
        const reqsEl = document.createElement("div");
        reqsEl.style.cssText = "display:flex;flex-wrap:wrap;gap:2px;margin-top:3px";
        reqsEl.innerHTML = reqs.map(traitReqBadgeHTML).join("");
        info.appendChild(reqsEl);
      }
      const cleanDesc = cleanTraitDesc(val[2]||"");
      if(cleanDesc) {
        const descEl = document.createElement("div");
        descEl.className = "trait-row-desc";
        descEl.textContent = cleanDesc;
        info.appendChild(descEl);
      }
      if(stackable) {
        const count = traitPickerStepperCounts[key]||0;
        const max = traitStackMax(val);
        const stepper = document.createElement("div");
        stepper.className = "trait-stepper";
        stepper.innerHTML = `<button class="trait-stepper-btn" onclick="stepperDecr('${key}',${max})" ${count<=0?"disabled":""}>−</button><span class="trait-stepper-count" id="step_${key}">${count}</span><button class="trait-stepper-btn" onclick="stepperIncr('${key}',${max})" ${count>=max?"disabled":""}>+</button>`;
        row.appendChild(stepper);
        row.appendChild(info);
      } else {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = key;
        cb.checked = selected.includes(String(val[0]).toLowerCase());
        cb.disabled = locked;
        cb.id = "trait_cb_"+key;
        cb.addEventListener("change", applyTraitsLive);
        info.htmlFor = "trait_cb_"+key;
        row.appendChild(cb);
        row.appendChild(info);
      }
      list.appendChild(row);
    });
  });
}

function stepperIncr(key, max) {
  traitPickerStepperCounts[key] = Math.min((traitPickerStepperCounts[key]||0)+1, max);
  const el = document.getElementById("step_"+key);
  if(el) {
    el.textContent = traitPickerStepperCounts[key];
    el.previousElementSibling.disabled = traitPickerStepperCounts[key] <= 0;
    el.nextElementSibling.disabled = traitPickerStepperCounts[key] >= max;
  }
  applyTraitsLive();
}
function stepperDecr(key, max) {
  traitPickerStepperCounts[key] = Math.max((traitPickerStepperCounts[key]||0)-1, 0);
  const el = document.getElementById("step_"+key);
  if(el) {
    el.textContent = traitPickerStepperCounts[key];
    el.previousElementSibling.disabled = traitPickerStepperCounts[key] <= 0;
    el.nextElementSibling.disabled = traitPickerStepperCounts[key] >= max;
  }
  applyTraitsLive();
}

function openTraitPicker(target, wIdx) {
  traitPickerTarget = target;
  traitPickerWeaponIdx = wIdx;
  traitPickerStepperCounts = {};
  const allT = target==="stand" ? allStandTraits() : allWeaponTraits();
  const curT = target==="stand" ? currentBuilderTraits : (builderWeapons[wIdx]?.traits||[]);
  curT.forEach(t => {
    if(typeof t[3]==="number" && t[3]>0) {
      const k = findTraitEntry(allT, t[0])?.[0];
      if(k) traitPickerStepperCounts[k] = t[3];
    }
  });
  document.getElementById("trait-modal-title").textContent = target==="stand" ? T("standTraits") : `Weapon ${wIdx+1} Traits`;
  const searchEl = document.getElementById("trait-picker-search");
  if(searchEl) searchEl.value = "";
  refreshTraitPickerList();
  openModal("modal-traits");
}

function applyTraitsLive() {
  const traits = traitPickerTarget==="stand" ? allStandTraits() : allWeaponTraits();
  const checkboxes = document.querySelectorAll("#trait-modal-list input[type=checkbox]");

  // Collect all currently-checked keys (checkboxes + steppers)
  const checkedKeys = new Set();
  checkboxes.forEach(cb => { if(cb.checked) checkedKeys.add(cb.value); });
  Object.entries(traits).forEach(([key,val]) => {
    if(traitIsStackable(val) && (traitPickerStepperCounts[key]||0) > 0) checkedKeys.add(key);
  });

  // Drop any trait whose traitr prerequisite is no longer selected
  const toDrop = new Set();
  checkedKeys.forEach(key => {
    const traitrReq = allTraitReqs(key, traits[key]).find(r=>r.type==="traitr");
    if(traitrReq && !checkedKeys.has(traitrReq.vals[0])) toDrop.add(key);
  });
  toDrop.forEach(key => { checkedKeys.delete(key); traitPickerStepperCounts[key] = 0; });

  // Build final selected array preserving DOM order
  const selected = [];
  checkboxes.forEach(cb => { if(checkedKeys.has(cb.value)) selected.push(traits[cb.value]); });
  Object.entries(traits).forEach(([key,val]) => {
    if(!traitIsStackable(val)) return;
    const count = traitPickerStepperCounts[key]||0;
    if(count>0 && checkedKeys.has(key)) selected.push([val[0],val[1],val[2],count]);
  });
  if(traitPickerTarget==="stand") {
    currentBuilderTraits = selected;
    document.getElementById("b-traits-display").innerHTML = traitTipHTML(selected, allStandTraits())||"None";
  } else {
    builderWeapons[traitPickerWeaponIdx].traits = selected;
    const el = document.getElementById(`wtrait-display-${traitPickerWeaponIdx}`);
    if(el) el.innerHTML = traitTipHTML(selected, allWeaponTraits())||"None";
  }
  calculateBuilder();
  refreshTraitPickerList();
}

function closeTraitModal() { closeModal("modal-traits"); }

function gatherBuilderUnit() {
  const standTraits = currentBuilderTraits.slice();
  const weapons = builderWeapons.map(w => ({...w, traits:(w.traits||[]).slice()}));
  const cls = document.getElementById("b-class").value;
  const ci = CLASS_INFO[cls] || CLASS_INFO.inf;
  const minSize = (cls==="sh"||cls==="beh") ? 1 : 2;
  const rawSize = parseInt(document.getElementById("b-unit-size")?.value) || ci.size;
  const unit = {
    name: document.getElementById("b-name").value || "Unnamed Unit",
    description: document.getElementById("b-description").value.trim() || "",
    class: cls,
    faction: document.getElementById("b-faction").value || "",
    customSize: Math.max(minSize, rawSize),
    standTraits,
    weapons
  };
  // Stat fields come from the schema-generated inputs
  GAME.schema.stats.forEach(f => {
    const el = document.getElementById(f.edit.id);
    unit[f.key] = f.edit.kind === "select" ? el.value : (parseInt(el.value) || f.edit.fallback);
  });
  unit.allowedRoles = computeAllowedRoles(unit);
  return unit;
}

function selectBuilderRole(key) {
  builderSelectedRole = key;
  calculateBuilder();
}

function calculateBuilder() {
  const unit = gatherBuilderUnit();
  const pts = calcPoints(unit);
  const ci = CLASS_INFO[unit.class];
  const pr = premiumsFor(unit.class);
  const bd = pts.breakdown;

  // Available cost tiles in display order
  const roleTiles = [
    {key:"unit",    label:`Unit (${pts.unitSize} ${Tn(pts.unitSize,"stand")})`, pts:pts.unitPts},
    {key:"ind",     label:"Independent",  pts:pts.indPts,     prem:pr.ind},
    {key:"cmd",     label:"Command",      pts:pts.cmdPts,     prem:pr.cmd},
    {key:"hero",    label:"Ind. Hero",    pts:pts.heroPts,    prem:pr.hero},
    {key:"cmdHero", label:"Cmd Hero",     pts:pts.cmdHeroPts, prem:pr.cmdHero},
  ].filter(r => r.pts != null);

  // Auto-correct selection if the chosen role is no longer available
  if (!roleTiles.find(r => r.key === builderSelectedRole))
    builderSelectedRole = roleTiles[0]?.key || "unit";

  const tilesHTML = roleTiles.map(r => {
    const sel = r.key === builderSelectedRole;
    return `<div style="text-align:center;padding:7px 10px;border-radius:8px;cursor:pointer;transition:opacity .1s;${
      sel ? "background:#0d1e36;border:1px solid #1f6feb" : "border:1px solid transparent;opacity:0.45"
    }" onclick="selectBuilderRole('${r.key}')">
      <div class="points-big" style="${sel ? "" : "font-size:20px;color:#8b949e"}">${r.pts}</div>
      <div class="points-label" style="${sel ? "" : "color:#444"}">${r.label}</div>
    </div>`;
  }).join("");

  function fmtBD(v) { return (v>0?"+":"") + (Number.isInteger(v) ? v : v.toFixed(1)); }

  const bdHTML = bd ? (() => {
    const standRows = bd.standComps.map(c =>
      `<div class="detail-row"><span>${esc(c.label)}</span><span>${fmtBD(c.val)}</span></div>`).join("");
    const wpnLabel = unit.weapons.length
      ? (unit.weapons.length === 1 ? "1 weapon" : `${unit.weapons.length} weapons`)
      : "no weapons";
    const wpnRows = bd.weaponComps.map(w => {
      const subRows = (w.comps||[]).map(c =>
        `<div class="detail-row-2"><span>${esc(c.label)}</span><span>${fmtBD(c.val)}</span></div>`).join("");
      const multRows = (w.mults||[]).map(m =>
        `<div class="detail-row-2" style="color:#555;font-style:italic"><span>${esc(m)}</span><span></span></div>`).join("");
      return `<div class="detail-row"><span>${esc(w.label)}</span><span>+${w.cost}</span></div>${subRows}${multRows}`;
    }).join("");

    const sel = roleTiles.find(r => r.key === builderSelectedRole);
    let typeRow = "";
    if (sel) {
      if (builderSelectedRole === "unit") {
        const premNote = pts.belowDefault ? ` <span style="color:#ffb74d;font-size:10px;font-weight:normal">(+10% small unit)</span>` : "";
        typeRow = `<div class="summary-row"><span>Unit &times;${pts.unitSize} stands${premNote}</span><span>${sel.pts} pts</span></div>`;
      } else {
        const pct = Math.round((sel.prem||0) * 100);
        const premStr = pct === 0 ? "no premium" : `+${pct}%`;
        typeRow = `<div class="summary-row"><span>${sel.label} <span style="color:#555;font-size:11px;font-weight:normal">(${premStr})</span></span><span>${sel.pts} pts</span></div>`;
      }
    }

    return `
      <div class="summary-row"><span>Stand cost <span style="color:#555;font-size:11px;font-weight:normal">(${wpnLabel} excluded)</span></span><span>${bd.standPts}</span></div>
      ${standRows}
      <div class="summary-row"><span>Weapon systems</span><span>${bd.weaponPts > 0 ? "+"+bd.weaponPts : bd.weaponPts}</span></div>
      ${wpnRows}
      <div class="summary-row"><span>Class multiplier</span><span>&times;${bd.mult}</span></div>
      <div class="summary-row"><span>Per ${T("stand")}</span><span>${pts.perStand} pts</span></div>
      ${typeRow}`;
  })() : "";

  // Live card preview reflecting the selected role/view
  const ROLE_TO_VIEW = {unit:"unit", ind:"independent", cmd:"command", hero:"hero", cmdHero:"cmdHero"};
  const previewView = ROLE_TO_VIEW[builderSelectedRole] || "unit";
  const previewHTML = unitCardHTML(unit, "", previewView);

  document.getElementById("b-result").innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px">
      ${tilesHTML}
    </div>
    <div class="builder-preview-label">Preview</div>
    <div style="margin-bottom:14px">${previewHTML}</div>
    <div class="builder-breakdown-toggle" onclick="toggleBuilderBreakdown()">
      <span>Cost Breakdown</span>
      <span id="builder-breakdown-chev" style="color:#555">${builderBreakdownOpen ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>'}</span>
    </div>
    <div id="builder-breakdown-body" style="display:${builderBreakdownOpen ? "" : "none"};margin-top:8px">${bdHTML}</div>`;
}

function saveAsNewUnit() {
  const nameEl = document.getElementById("b-name");
  let name = nameEl.value.trim();
  const nameTaken = n => state.customUnits.some(u => u.name === n);
  if (!name || name === "Unnamed Unit") {
    showFieldErr("b-name", "Give your unit a name before saving as new.");
    return;
  }
  if (nameTaken(name)) {
    showFieldErr("b-name", `"${name}" already exists - change the name to save as a new unit.`);
    return;
  }
  editingUnitId = null;
  setEditMode(null);
  saveToLibrary();
}

function saveToLibrary() {
  const unit = gatherBuilderUnit();
  if(!unit.name || unit.name==="Unnamed Unit") { showFieldErr("b-name","Give your unit a name first."); return; }
  const duplicate = state.customUnits.find(u => u.name === unit.name && u.id !== editingUnitId);
  if(duplicate) { showFieldErr("b-name",`"${unit.name}" already exists - choose a different name.`); return; }
  calculateBuilder();
  unit.builtIn = false;
  if(editingUnitId) {
    const idx = state.customUnits.findIndex(u=>u.id===editingUnitId);
    if(idx>=0) {
      unit.id = editingUnitId;
      state.customUnits[idx] = unit;
      saveState();
      renderAll();
      flashBtn("b-save-btn","Saved!");
      return;
    }
  }
  unit.id = "custom_"+uid();
  state.customUnits.push(unit);
  setEditMode(unit);
  saveState();
  flashBtn("b-save-btn","Saved to Library!");
}


// Symbols for the Initiative Deck activation mechanic.
// Each battle group carries one; when that symbol card is drawn the group activates.
const BG_SYMBOLS = {
  // Strike
  "skull":               { icon:"fa-solid fa-skull",               color:"#ef5350", label:"Skull"              },
  "skull-crossbones":    { icon:"fa-solid fa-skull-crossbones",    color:"#e53935", label:"Death's Head"       },
  "crosshairs":          { icon:"fa-solid fa-crosshairs",          color:"#66bb6a", label:"Crosshairs"         },
  "gun":                 { icon:"fa-solid fa-gun",                 color:"#90a4ae", label:"Firearm"            },
  "bomb":                { icon:"fa-solid fa-bomb",                color:"#ff7043", label:"Bomb"               },
  "explosion":           { icon:"fa-solid fa-explosion",           color:"#ff6e40", label:"Shockwave"          },
  "land-mine-on":        { icon:"fa-solid fa-land-mine-on",        color:"#ffcc80", label:"Minefield"          },
  "bullseye":            { icon:"fa-solid fa-bullseye",            color:"#ef9a9a", label:"Bullseye"           },
  "bolt":                { icon:"fa-solid fa-bolt",                color:"#ffd740", label:"Laser"              },
  "fire":                { icon:"fa-solid fa-fire",                color:"#ff5252", label:"Incendiary"         },
  "hand-fist":           { icon:"fa-solid fa-hand-fist",           color:"#ff8a65", label:"Assault"            },
  "person-rifle":        { icon:"fa-solid fa-person-rifle",        color:"#a5d6a7", label:"Rifleman"           },
  "person-military-rifle":{ icon:"fa-solid fa-person-military-rifle", color:"#81c784", label:"Line Infantry"   },
  // Vehicles
  "rocket":              { icon:"fa-solid fa-rocket",              color:"#82b1ff", label:"Rocket"             },
  "jet-fighter":         { icon:"fa-solid fa-jet-fighter",         color:"#80cbc4", label:"Jet Fighter"        },
  "helicopter":          { icon:"fa-solid fa-helicopter",          color:"#b2dfdb", label:"Helicopter"         },
  "plane":               { icon:"fa-solid fa-plane",               color:"#64b5f6", label:"Stratofighter"      },
  "paper-plane":         { icon:"fa-solid fa-paper-plane",         color:"#b3e5fc", label:"Scout Drone"        },
  "parachute-box":       { icon:"fa-solid fa-parachute-box",       color:"#fff176", label:"Airdrop"            },
  "motorcycle":          { icon:"fa-solid fa-motorcycle",          color:"#90a4ae", label:"Outrider"           },
  "truck-monster":       { icon:"fa-solid fa-truck-monster",       color:"#8d6e63", label:"War Rig"            },
  "truck-field":         { icon:"fa-solid fa-truck-field",         color:"#a5d6a7", label:"Supply Column"      },
  "truck-pickup":        { icon:"fa-solid fa-truck-pickup",        color:"#80cbc4", label:"Raider"             },
  "truck-plane":         { icon:"fa-solid fa-truck-plane",         color:"#b0bec5", label:"Sky Hauler"         },
  "meteor":              { icon:"fa-solid fa-meteor",              color:"#ff6e40", label:"Orbital Drop"       },
  "satellite-dish":      { icon:"fa-solid fa-satellite-dish",      color:"#80deea", label:"Comms Dish"         },
  "satellite":           { icon:"fa-solid fa-satellite",           color:"#90caf9", label:"Orbital Station"    },
  "anchor":              { icon:"fa-solid fa-anchor",              color:"#546e7a", label:"Anchor"             },
  "user-astronaut":      { icon:"fa-solid fa-user-astronaut",      color:"#b3e5fc", label:"Voidborn"           },
  // Tech
  "robot":               { icon:"fa-solid fa-robot",               color:"#b0bec5", label:"Mechanized"         },
  "microchip":           { icon:"fa-solid fa-microchip",           color:"#64b5f6", label:"Cyber Ops"          },
  "atom":                { icon:"fa-solid fa-atom",                color:"#80deea", label:"Nuclear"            },
  "gears":               { icon:"fa-solid fa-gears",               color:"#78909c", label:"Engineering"        },
  "tower-broadcast":     { icon:"fa-solid fa-tower-broadcast",     color:"#a5d6a7", label:"Command Tower"      },
  "tower-observation":   { icon:"fa-solid fa-tower-observation",   color:"#80cbc4", label:"Vigil Post"         },
  "wifi":                { icon:"fa-solid fa-wifi",                color:"#4fc3f7", label:"Network"            },
  "network-wired":       { icon:"fa-solid fa-network-wired",       color:"#7986cb", label:"Hardwired Ops"      },
  "server":              { icon:"fa-solid fa-server",              color:"#a1887f", label:"Data Core"          },
  "terminal":            { icon:"fa-solid fa-terminal",            color:"#a5d6a7", label:"Command Line"       },
  "magnet":              { icon:"fa-solid fa-magnet",              color:"#f48fb1", label:"Magnetic"           },
  // Hazard
  "radiation":           { icon:"fa-solid fa-radiation",           color:"#ffee58", label:"Radiation"          },
  "biohazard":           { icon:"fa-solid fa-biohazard",           color:"#69f0ae", label:"Biohazard"          },
  "snowflake":           { icon:"fa-solid fa-snowflake",           color:"#b3e5fc", label:"Cryo"               },
  "tornado":             { icon:"fa-solid fa-tornado",             color:"#90a4ae", label:"Tempest"            },
  "cloud-bolt":          { icon:"fa-solid fa-cloud-bolt",          color:"#ce93d8", label:"Storm"              },
  "smog":                { icon:"fa-solid fa-smog",                color:"#78909c", label:"Toxic Veil"         },
  "syringe":             { icon:"fa-solid fa-syringe",             color:"#ef9a9a", label:"Injection"          },
  "flask":               { icon:"fa-solid fa-flask",               color:"#a5d6a7", label:"Chemical"           },
  "burst":               { icon:"fa-solid fa-burst",               color:"#ffd740", label:"Detonation"         },
  "circle-radiation":    { icon:"fa-solid fa-circle-radiation",    color:"#ffcc80", label:"Fallout Zone"       },
  // Command
  "star":                { icon:"fa-solid fa-star",                color:"#ffd740", label:"Elite"              },
  "crown":               { icon:"fa-solid fa-crown",               color:"#ce93d8", label:"High Command"       },
  "shield":              { icon:"fa-solid fa-shield",              color:"#42a5f5", label:"Shield"             },
  "shield-halved":       { icon:"fa-solid fa-shield-halved",       color:"#1e88e5", label:"Vanguard"           },
  "medal":               { icon:"fa-solid fa-medal",               color:"#ffd54f", label:"Veteran"            },
  "certificate":         { icon:"fa-solid fa-certificate",         color:"#ffd740", label:"War Charter"        },
  "flag":                { icon:"fa-solid fa-flag",                color:"#ef5350", label:"Standard Bearer"    },
  "users":               { icon:"fa-solid fa-users",               color:"#64b5f6", label:"Regiment"           },
  "chess-king":          { icon:"fa-solid fa-chess-king",          color:"#f5f5f5", label:"King"               },
  "chess-rook":          { icon:"fa-solid fa-chess-rook",          color:"#bdbdbd", label:"Fortress"           },
  "dungeon":             { icon:"fa-solid fa-dungeon",             color:"#78909c", label:"Iron Vault"         },
  "gem":                 { icon:"fa-solid fa-gem",                 color:"#e040fb", label:"Precursor"          },
  // Recon
  "eye":                 { icon:"fa-solid fa-eye",                 color:"#ce93d8", label:"Recon"              },
  "eye-slash":           { icon:"fa-solid fa-eye-slash",           color:"#9575cd", label:"Shadow Ops"         },
  "arrows-to-eye":       { icon:"fa-solid fa-arrows-to-eye",       color:"#80deea", label:"Omniscient"         },
  "user-secret":         { icon:"fa-solid fa-user-secret",         color:"#78909c", label:"Infiltrator"        },
  "ghost":               { icon:"fa-solid fa-ghost",               color:"#b0bec5", label:"Phantom"            },
  "mask":                { icon:"fa-solid fa-mask",                color:"#b0bec5", label:"Faceless"           },
  "compass":             { icon:"fa-solid fa-compass",             color:"#80deea", label:"Wayfinder"          },
  "masks-theater":       { icon:"fa-solid fa-masks-theater",       color:"#ff8a65", label:"Deceiver"           },
  "wand-sparkles":       { icon:"fa-solid fa-wand-sparkles",       color:"#f48fb1", label:"Psi-Surge"          },
  "fingerprint":         { icon:"fa-solid fa-fingerprint",         color:"#4db6ac", label:"Tracker"            },
  "dna":                 { icon:"fa-solid fa-dna",                 color:"#81c784", label:"Bio-Signature"      },
  "heart":               { icon:"fa-solid fa-heart",               color:"#f06292", label:"Devoted"            },
  "infinity":            { icon:"fa-solid fa-infinity",            color:"#80deea", label:"Eternal Guard"      },
  // Organic
  "virus":               { icon:"fa-solid fa-virus",               color:"#69f0ae", label:"Viral"              },
  "viruses":             { icon:"fa-solid fa-viruses",             color:"#ef9a9a", label:"Contagion"           },
  "bacteria":            { icon:"fa-solid fa-bacteria",            color:"#a5d6a7", label:"Spore Cloud"         },
  "virus-covid":         { icon:"fa-solid fa-virus-covid",         color:"#ce93d8", label:"Viral Agent"         },
  "dragon":              { icon:"fa-solid fa-dragon",              color:"#ff7043", label:"Drake"              },
  "spider":              { icon:"fa-solid fa-spider",              color:"#9e9e9e", label:"Arachnid"           },
  "worm":                { icon:"fa-solid fa-worm",                color:"#a5d6a7", label:"Crawler"            },
  "bugs":                { icon:"fa-solid fa-bugs",                color:"#8d6e63", label:"Swarm Host"         },
  "brain":               { icon:"fa-solid fa-brain",               color:"#f48fb1", label:"Psychic"            },
  "pills":               { icon:"fa-solid fa-pills",               color:"#fff176", label:"Stimulant"          },
  "paw":                 { icon:"fa-solid fa-paw",                 color:"#bcaaa4", label:"Beastmaster"        },
  "locust":              { icon:"fa-solid fa-locust",              color:"#c5e1a5", label:"Locust"             },
  "staff-snake":         { icon:"fa-solid fa-staff-snake",         color:"#81c784", label:"Venomous"           },
  "leaf":                { icon:"fa-solid fa-leaf",                color:"#81c784", label:"Biomass"            },
  "sun":                 { icon:"fa-solid fa-sun",                 color:"#ffd740", label:"Sol"                },
  "moon":                { icon:"fa-solid fa-moon",                color:"#b3e5fc", label:"Umbra"              },
  // Sequential text (BG-only)
  n1:{text:"1",color:"#64b5f6",label:"1"}, n2:{text:"2",color:"#64b5f6",label:"2"},
  n3:{text:"3",color:"#64b5f6",label:"3"}, n4:{text:"4",color:"#64b5f6",label:"4"},
  n5:{text:"5",color:"#64b5f6",label:"5"},
  r1:{text:"I",   color:"#ffd54f",label:"I"  }, r2:{text:"II", color:"#ffd54f",label:"II" },
  r3:{text:"III", color:"#ffd54f",label:"III"}, r4:{text:"IV", color:"#ffd54f",label:"IV" },
  r5:{text:"V",   color:"#ffd54f",label:"V"  },
  ga:{text:"α",color:"#f48fb1",label:"Alpha"  }, gb:{text:"β",color:"#f48fb1",label:"Beta"   },
  gc:{text:"γ",color:"#f48fb1",label:"Gamma"  }, gd:{text:"δ",color:"#f48fb1",label:"Delta"  },
  ge:{text:"ε",color:"#f48fb1",label:"Epsilon"},
  la:{text:"A",color:"#a5d6a7",label:"A"}, lb:{text:"B",color:"#a5d6a7",label:"B"},
  lc:{text:"C",color:"#a5d6a7",label:"C"}, ld:{text:"D",color:"#a5d6a7",label:"D"},
  le:{text:"E",color:"#a5d6a7",label:"E"},
};
// Backwards-compat aliases for keys stored in old save data
const _BG_SYM_ALIASES = { skullx:"skull-crossbones", jet:"jet-fighter", tower:"tower-broadcast" };
function _bgSymLookup(key) {
  if(!key) return BG_SYMBOLS[ICON_SYMBOL_KEYS[0]];
  return BG_SYMBOLS[_BG_SYM_ALIASES[key]||key] || BG_SYMBOLS[ICON_SYMBOL_KEYS[0]];
}
const ICON_SYMBOL_KEYS = [
  "skull","skull-crossbones","crosshairs","gun","bomb","explosion","land-mine-on","bullseye","bolt","fire","hand-fist","person-rifle","person-military-rifle",
  "rocket","jet-fighter","helicopter","plane","paper-plane","parachute-box","motorcycle","truck-monster","truck-field","truck-pickup","truck-plane","meteor","satellite-dish","satellite","anchor","user-astronaut",
  "robot","microchip","atom","gears","tower-broadcast","tower-observation","wifi","network-wired","server","terminal","magnet",
  "radiation","biohazard","snowflake","tornado","cloud-bolt","smog","syringe","flask","burst","circle-radiation",
  "star","crown","shield","shield-halved","medal","certificate","flag","users","chess-king","chess-rook","dungeon","gem",
  "eye","eye-slash","arrows-to-eye","user-secret","ghost","mask","compass","masks-theater","wand-sparkles","fingerprint","dna","heart","infinity",
  "virus","viruses","bacteria","virus-covid","dragon","spider","worm","bugs","brain","pills","paw","locust","staff-snake","leaf","sun","moon",
];
const BG_SYMBOLS_ORDER = [...ICON_SYMBOL_KEYS,"n1","n2","n3","n4","n5","r1","r2","r3","r4","r5","ga","gb","gc","gd","ge","la","lb","lc","ld","le"];
const BG_SYMBOL_GROUPS = [
  { label:"Strike",   keys:["skull","skull-crossbones","crosshairs","gun","bomb","explosion","land-mine-on","bullseye","bolt","fire","hand-fist","person-rifle","person-military-rifle"] },
  { label:"Vehicles", keys:["rocket","jet-fighter","helicopter","plane","paper-plane","parachute-box","motorcycle","truck-monster","truck-field","truck-pickup","truck-plane","meteor","satellite-dish","satellite","anchor","user-astronaut"] },
  { label:"Tech",     keys:["robot","microchip","atom","gears","tower-broadcast","tower-observation","wifi","network-wired","server","terminal","magnet"] },
  { label:"Hazard",   keys:["radiation","biohazard","snowflake","tornado","cloud-bolt","smog","syringe","flask","burst","circle-radiation"] },
  { label:"Command",  keys:["star","crown","shield","shield-halved","medal","certificate","flag","users","chess-king","chess-rook","dungeon","gem"] },
  { label:"Recon",    keys:["eye","eye-slash","arrows-to-eye","user-secret","ghost","mask","compass","masks-theater","wand-sparkles","fingerprint","dna","heart","infinity"] },
  { label:"Organic",  keys:["virus","viruses","bacteria","virus-covid","dragon","spider","worm","bugs","brain","pills","paw","locust","staff-snake","leaf","sun","moon"] },
  { label:"Numbers",  keys:["n1","n2","n3","n4","n5"] },
  { label:"Roman",    keys:["r1","r2","r3","r4","r5"] },
  { label:"Greek",    keys:["ga","gb","gc","gd","ge"] },
  { label:"Letters",  keys:["la","lb","lc","ld","le"] },
];
// Icon-only groups (no sequential text) - used by army designation and faction pickers
const ARMY_ICON_GROUPS = BG_SYMBOL_GROUPS.slice(0, 7);

function _bgSymInner(sd, size) {
  if(!sd) return "";
  const sz = size || 13;
  return sd.text
    ? `<span style="font-family:var(--font-display);font-size:${sd.text.length>3?"8":sd.text.length>2?"9":sd.text.length>1?"11":"13"}px;font-weight:bold;letter-spacing:0;line-height:1">${sd.text}</span>`
    : `<i class="${sd.icon}" style="font-size:${sz}px"></i>`;
}

// Returns a symbol-def object for a BG - uses army.bgIconMode for sequential modes.
function bgDesignation(army, bg) {
  const mode = army.bgIconMode || "custom";
  if(mode === "custom") {
    return _bgSymLookup(bg.symbol || ICON_SYMBOL_KEYS[0]);
  }
  const idx = (army.battleGroups||[]).indexOf(bg);
  const colors = { numbers:"#64b5f6", roman:"#ffd54f", greek:"#f48fb1", letters:"#a5d6a7" };
  const texts  = {
    numbers: String(idx+1),
    roman:   ["I","II","III","IV","V"][idx] ?? String(idx+1),
    greek:   ["α","β","γ","δ","ε"][idx] ?? String(idx+1),
    letters: ["A","B","C","D","E"][idx] ?? String(idx+1),
  };
  return { text: texts[mode], color: colors[mode], label: texts[mode] };
}



function rebuildFactionSelect(selectValue) {
  const sel = document.getElementById("b-faction");
  if(!sel) return;
  // Default to keeping the current selection - rebuilding while a unit is on
  // the builder must not silently reset its faction to "No Faction".
  if(selectValue === undefined) selectValue = sel.value;
  // Built-in factions come from the GAME pack, not a hardcoded list, so a
  // different game ships different factions without touching the engine.
  const builtins = Object.entries(GAME.factions.labels || {}).map(([v,l]) => ({v,l}));
  sel.innerHTML = `<option value="">No Faction</option>`
    + builtins.map(b=>`<option value="${b.v}">${b.l}</option>`).join("")
    + (state.customFactions||[]).map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join("")
    + `<option value="__new__">+ New Faction&hellip;</option>`;
  sel.value = selectValue;
  if(sel.value !== selectValue) sel.value = "";   // selected faction was deleted
  builderFactionPrev = sel.value;
}

// Apply the GAME pack's branding to the static shell chrome (title, nav-brand,
// Buy link) so each game looks like its own app. buyUrl is optional: a pack
// without a storefront leaves the Buy link hidden.
function applyBranding() {
  const m = GAME.meta || {};
  document.title = m.title || `${m.name || "Rally"} Force Builder`;
  const brand = document.getElementById("nav-brand");
  if(brand) brand.textContent = m.brand || m.title || m.name || "Force Builder";
  const buy = document.getElementById("nav-buy-link");
  if(buy) {
    if(m.buyUrl) {
      buy.href = m.buyUrl;
      buy.textContent = m.buyLabel || `Buy ${m.name || ""}`.trim();
      buy.style.display = "";          // let the mobile CSS rule hide it on small screens
    } else {
      buy.style.display = "none";
    }
  }
}

// Rewrite the static shell's terminology at boot. Elements carry data-term="key"
// (their text becomes T("key")) or data-term-tpl="... {key} ..." (each {token}
// is replaced by T("token")). The static HTML keeps LaserStorm's words as a
// no-JS default; this only touches elements that opted in with an attribute, so
// mixed-content nodes stay intact.
function applyTerms(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-term]").forEach(el => {
    el.textContent = T(el.dataset.term);
  });
  scope.querySelectorAll("[data-term-tpl]").forEach(el => {
    el.textContent = el.dataset.termTpl.replace(/\{(\w+)\}/g, (_, k) => T(k));
  });
}

// Populate the builder's Class <select> from GAME.classes rather than a
// hardcoded HTML option list, so a different game's classes appear without
// editing the shell. Preserves the current selection across rebuilds.
function rebuildClassSelect(selectValue) {
  const sel = document.getElementById("b-class");
  if(!sel) return;
  if(selectValue === undefined) selectValue = sel.value;
  sel.innerHTML = Object.entries(GAME.classes || {})
    .map(([k,ci]) => `<option value="${k}">${esc(ci.label || k)}</option>`).join("");
  if(selectValue && GAME.classes[selectValue]) sel.value = selectValue;
}

// Removes traits from traitArr that fail faction/class/mobility/traitr requirements.
// traitPool is allStandTraits() or allWeaponTraits().
function pruneTraits(traitArr, traitPool, faction, cls, mobility) {
  const keyOf = t => findTraitEntry(traitPool, t[0])?.[0];
  const activeKeys = new Set(traitArr.map(keyOf).filter(Boolean));
  const drop = new Set();
  traitArr.forEach(t => {
    const key = keyOf(t);
    if(!key) return;
    const reqs = allTraitReqs(key, traitPool[key]);
    const facReq    = reqs.find(r=>r.type==="faction");
    const clsReq    = reqs.find(r=>r.type==="class");
    const mobReq    = reqs.find(r=>r.type==="mobility");
    const traitrReq = reqs.find(r=>r.type==="traitr");
    if(facReq    && faction  !== undefined && !facReq.vals.includes(faction))     drop.add(t[0]);
    if(clsReq    && cls      !== undefined && !classReqOk(clsReq, cls))           drop.add(t[0]);
    if(cls !== undefined && troopRoleForbids(reqs, cls))                          drop.add(t[0]);
    if(mobReq    && mobility !== undefined && !mobReq.vals.includes(mobility))    drop.add(t[0]);
    if(traitrReq && !activeKeys.has(traitrReq.vals[0]))                          drop.add(t[0]);
  });
  if(!drop.size) return traitArr;
  const pruned = traitArr.filter(t=>!drop.has(t[0]));
  // Cascade: a traitr-dependent trait may now lose its prerequisite
  const prunedKeys = new Set(pruned.map(keyOf).filter(Boolean));
  return pruned.filter(t => {
    const key = keyOf(t);
    const traitrReq = key ? allTraitReqs(key, traitPool[key]).find(r=>r.type==="traitr") : null;
    return !traitrReq || prunedKeys.has(traitrReq.vals[0]);
  });
}

function onFactionSelectChange() {
  const sel = document.getElementById("b-faction");
  const newFaction = sel.value;
  if(newFaction === "__new__") {
    sel.value = builderFactionPrev;
    openFactionModal(true);
    return;
  }
  builderFactionPrev = newFaction;
  const cls      = document.getElementById("b-class")?.value || "";
  const mobility = document.getElementById("b-mobility")?.value || "";
  currentBuilderTraits = pruneTraits(currentBuilderTraits, allStandTraits(), newFaction, cls, mobility);
  document.getElementById("b-traits-display").innerHTML = traitTipHTML(currentBuilderTraits, allStandTraits())||"None";
  builderWeapons.forEach(w => { w.traits = pruneTraits(w.traits||[], allWeaponTraits(), newFaction, cls, mobility); });
  renderWeaponRows();
  calculateBuilder();
}

function onMobilityChange() {
  const sel = document.getElementById("b-mobility");
  const newMobility = sel.value;
  builderMobilityPrev = newMobility;
  const faction2 = document.getElementById("b-faction")?.value || "";
  const cls2     = document.getElementById("b-class")?.value   || "";
  currentBuilderTraits = pruneTraits(currentBuilderTraits, allStandTraits(), faction2, cls2, newMobility);
  document.getElementById("b-traits-display").innerHTML = traitTipHTML(currentBuilderTraits, allStandTraits())||"None";
  builderWeapons.forEach(w => { w.traits = pruneTraits(w.traits||[], allWeaponTraits(), faction2, cls2, newMobility); });
  renderWeaponRows();
  calculateBuilder();
}

function openFactionModal(fromBuilder) {
  window._factionModalFromBuilder = !!fromBuilder;
  editingCustomFactionId = null;
  document.getElementById("faction-name").value = "";
  document.getElementById("faction-icon").value = "shield";
  document.getElementById("faction-color").value = "#ff6600";
  document.getElementById("faction-description").value = "";
  document.getElementById("faction-save-btn").textContent = "Create";
  document.getElementById("faction-form-header").textContent = "New Faction";
  document.getElementById("faction-cancel-edit-btn").style.display = "none";
  clearFieldErr("faction-name");
  renderFactionModalContent();
  openModal("modal-faction");
}

function editCustomFaction(id) {
  const f = (state.customFactions||[]).find(f=>f.id===id);
  if(!f) return;
  editingCustomFactionId = id;
  document.getElementById("faction-name").value = f.name;
  document.getElementById("faction-icon").value = f.icon||"shield";
  document.getElementById("faction-color").value = f.color||"#ff6600";
  document.getElementById("faction-description").value = f.description||"";
  document.getElementById("faction-save-btn").textContent = "Save Changes";
  document.getElementById("faction-form-header").textContent = "Edit Faction";
  document.getElementById("faction-cancel-edit-btn").style.display = "";
  renderFactionModalContent();
  document.getElementById("faction-name").focus();
}

function cancelEditCustomFaction() {
  editingCustomFactionId = null;
  document.getElementById("faction-name").value = "";
  document.getElementById("faction-icon").value = "shield";
  document.getElementById("faction-color").value = "#ff6600";
  document.getElementById("faction-description").value = "";
  clearFieldErr("faction-name");
  document.getElementById("faction-save-btn").textContent = "Create";
  document.getElementById("faction-form-header").textContent = "New Faction";
  document.getElementById("faction-cancel-edit-btn").style.display = "none";
  renderFactionModalContent();
}

function renderFactionModalContent() {
  modalMsg("faction-modal-msg", "");
  const list = document.getElementById("faction-modal-list");
  const facs = state.customFactions||[];
  list.innerHTML = facs.length
    ? `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">`
      + facs.map(f=>`
        <div class="custom-trait-item">
          <div style="flex:1;min-width:0">
            <div style="font-weight:bold;color:${f.color};font-size:13px"><i class="fa-solid fa-${f.icon}" style="margin-right:5px"></i>${esc(f.name)}</div>
            ${f.description?`<div style="font-size:10px;color:#8b949e;font-style:italic;margin-top:2px">${esc(f.description)}</div>`:""}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
            <button class="trait-edit-btn" onclick="editCustomFaction('${f.id}')"><i class="fa-solid fa-pencil"></i> Edit</button>
            <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteCustomFaction('${f.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </div>`).join("")
      + `</div>`
    : `<div style="color:var(--text-inactive);font-size:12px;margin-bottom:4px">No custom factions yet.</div>`;

  renderFactionIconPicker();
}

function renderFactionIconPicker() {
  const selIcon = document.getElementById("faction-icon").value;
  document.getElementById("faction-icon-picker").innerHTML = ARMY_ICON_GROUPS.map(grp => `
    <div style="margin-bottom:8px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.08em;color:var(--text-inactive);text-transform:uppercase;margin-bottom:4px">${grp.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${grp.keys.map(s => {
          const sd = BG_SYMBOLS[s];
          if(!sd) return "";
          const isCurrent = s === selIcon;
          return `<button type="button" onclick="selectFactionIcon('${s}')" title="${sd.label}"
            style="width:32px;height:32px;border-radius:6px;padding:0;border:${isCurrent?"2px solid "+sd.color:"1px solid "+sd.color+"44"};background:${isCurrent?sd.color+"2a":"transparent"};color:${sd.color};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:border-color .12s,background .12s"><i class="${sd.icon}" style="font-size:15px"></i></button>`;
        }).join("")}
      </div>
    </div>`).join("");
}

function selectFactionIcon(icon) {
  document.getElementById("faction-icon").value = icon;
  renderFactionIconPicker();
}

function saveCustomFaction() {
  const name = document.getElementById("faction-name").value.trim();
  if(!name) { showFieldErr("faction-name","Enter a faction name."); return; }
  const icon = document.getElementById("faction-icon").value || "shield";
  const color = document.getElementById("faction-color").value || "#ff6600";
  const description = document.getElementById("faction-description").value.trim();
  let selectId;
  if(editingCustomFactionId) {
    const idx = (state.customFactions||[]).findIndex(f=>f.id===editingCustomFactionId);
    if(idx !== -1) state.customFactions[idx] = {...state.customFactions[idx], name, icon, color, description};
    editingCustomFactionId = null;
    document.getElementById("faction-save-btn").textContent = "Create";
    document.getElementById("faction-form-header").textContent = "New Faction";
    document.getElementById("faction-cancel-edit-btn").style.display = "none";
  } else {
    const id = "fac_" + uid();
    state.customFactions.push({id, name, icon, color, description});
    selectId = window._factionModalFromBuilder ? id : undefined;
  }
  document.getElementById("faction-name").value = "";
  document.getElementById("faction-icon").value = "shield";
  document.getElementById("faction-color").value = "#ff6600";
  document.getElementById("faction-description").value = "";
  clearFieldErr("faction-name");
  saveState();
  rebuildFactionSelect(selectId);
  renderLibFactionFilters();
  renderFactionModalContent();
  _refreshFactionPage();
}

function deleteCustomFaction(id) {
  const faction = (state.customFactions||[]).find(f=>f.id===id);
  if(!faction) return;
  const usedBy = [];
  // Units in library
  state.customUnits.filter(u=>u.faction===id).forEach(u=>usedBy.push(`Unit: ${u.name}`));
  // Traits with this faction in reqs
  (state.customTraits||[]).forEach(t=>{
    const uses = (t.reqs||[]).some(r=>r.type==="faction"&&r.vals.includes(id)) || t.faction===id;
    if(uses) usedBy.push(`Trait: ${t.name}`);
  });
  // Task forces / armies restricted to this faction
  (state.taskForces||[]).forEach(tf=>{ if(tf.faction===id) usedBy.push(`Task Force: ${tf.name}`); });
  (state.armies||[]).forEach(a=>{ if(a.faction===id) usedBy.push(`Army: ${a.name}`); });
  // Custom tactical assets locked to this faction
  (state.customTacticalAssets||[]).forEach(a=>{ if(a.faction===id) usedBy.push(`Tactical Asset: ${a.name}`); });
  // Current builder session
  const builderFaction = document.getElementById("b-faction")?.value;
  if(builderFaction===id) usedBy.unshift("(current unit in builder)");
  if(usedBy.length) {
    const modalOpen = document.getElementById("modal-faction")?.classList.contains("open");
    if(modalOpen) {
      modalMsg("faction-modal-msg", `<strong>${esc(faction.name)}</strong> is in use and can't be deleted:<ul style="margin:4px 0 0 16px;padding:0">${usedBy.map(n=>`<li>${esc(n)}</li>`).join("")}</ul><div style="margin-top:4px">Remove it from those first.</div>`);
    } else {
      showToast(`"${faction.name}" is in use by ${usedBy.length} item${usedBy.length!==1?"s":""} (${usedBy[0]}${usedBy.length>1?", …":""}) and can't be deleted.`);
    }
    return;
  }
  state.customFactions = state.customFactions.filter(f=>f.id!==id);
  saveState();
  rebuildFactionSelect();
  renderLibFactionFilters();
  renderFactionModalContent();
  if(libFilterFaction===id) { libFilterFaction="all"; renderLibrary(); }
  if(currentFactionId===id) showFactionList();
  else _refreshFactionPage();
}

function _ctReqSections() {
  return [
    {
      type:"faction", label:"Faction",
      opts: [
        {val:"standard", label:'<i class="fa-solid fa-shield"></i> Standard', color:FACTION_COLORS.standard},
        {val:"precursor",label:'<i class="fa-solid fa-gem"></i> Precursor',color:FACTION_COLORS.precursor},
        {val:"soulless", label:'<i class="fa-solid fa-robot"></i> Soulless', color:FACTION_COLORS.soulless},
        {val:"swarm",    label:'<i class="fa-solid fa-virus"></i> Swarm',    color:FACTION_COLORS.swarm},
        {val:"warrior",  label:'<i class="fa-solid fa-hand-fist"></i> Warrior',  color:FACTION_COLORS.warrior},
        ...(state.customFactions||[]).map(f=>({val:f.id,label:`<i class="fa-solid fa-${f.icon}"></i> ${esc(f.name)}`,color:f.color}))
      ]
    },
    {
      type:"class", label:"Class", color:"#f57c00",
      opts:[
        {val:"inf",  label:"Infantry"},{val:"cav",  label:"Cavalry"},{val:"fg",   label:"Field Gun"},
        {val:"scout",label:"Scout"},   {val:"afv",  label:"AFV"},    {val:"ac",   label:"Aircraft"},
        {val:"sh",   label:"SH"},      {val:"beh",  label:"Behemoth"},{val:"troop",label:"Troop (any)"}
      ]
    },
    {
      type:"mobility", label:"Mobility", color:"#0097a7",
      opts:[
        {val:"troop",label:"Troop"},{val:"wheel",label:"Wheeled"},{val:"track",label:"Tracked"},
        {val:"walk", label:"Walker"},{val:"grav",label:"Grav"},   {val:"air",  label:"Air"}
      ]
    },
    {
      type:"role", label:"Unit type", color:"#5c6bc0",
      opts:[
        {val:"independent",label:"Independent"},{val:"command",    label:"Command"},
        {val:"hero",       label:"Hero"},        {val:"cmdHero",    label:"Cmd Hero"}
      ]
    }
  ];
}

function renderCustomTraitReqPills() {
  const container = document.getElementById("ct-reqs-container");
  if(!container) return;
  container.innerHTML = _ctReqSections().map(sec => {
    const secColor = sec.color || "";
    return `<div>
      <div style="font-size:10px;color:var(--text-inactive);text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">${sec.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px">${sec.opts.map(o=>{
        const c = o.color || secColor;
        return `<button type="button" class="req-pill" data-type="${sec.type}" data-val="${o.val}"
          style="background:${c}22;color:${c};border-color:${c}55" onclick="toggleTraitReqPill(this)">${o.label}</button>`;
      }).join("")}</div>
    </div>`;
  }).join("");
}

function toggleTraitReqPill(btn) {
  btn.classList.toggle("req-pill-on");
}

function getCustomTraitReqs() {
  const byType = {};
  document.querySelectorAll("#ct-reqs-container .req-pill.req-pill-on").forEach(p => {
    const t = p.dataset.type, v = p.dataset.val;
    (byType[t] = byType[t]||[]).push(v);
  });
  const traitReq = document.getElementById("ct-req-trait")?.value;
  if(traitReq) byType["traitr"] = [traitReq];
  return Object.entries(byType).map(([type,vals])=>({type,vals}));
}

function setCustomTraitReqPills(reqs) {
  document.querySelectorAll("#ct-reqs-container .req-pill").forEach(p=>p.classList.remove("req-pill-on"));
  const sel = document.getElementById("ct-req-trait");
  if(sel) sel.value = "";
  (reqs||[]).forEach(req => {
    if(req.type === "traitr") {
      if(sel && req.vals[0]) sel.value = req.vals[0];
      return;
    }
    req.vals.forEach(val => {
      const p = document.querySelector(`#ct-reqs-container .req-pill[data-type="${req.type}"][data-val="${val}"]`);
      if(p) p.classList.add("req-pill-on");
    });
  });
}

function openCustomTraitModal() {
  editingCustomTraitId = null;
  clearFieldErr("ct-name");
  document.getElementById("ct-name").value = "";
  document.getElementById("ct-cost").value = "1";
  document.getElementById("ct-type").value = "stand";
  document.getElementById("ct-description").value = "";
  document.getElementById("ct-stackable").checked = false;
  document.getElementById("ct-stackcap").value = "";
  document.getElementById("ct-stackcap-row").style.display = "none";
  document.getElementById("ct-unit-trait").checked = false;
  document.getElementById("ct-save-btn").textContent = "Create";
  document.getElementById("ct-form-header").textContent = "New Trait";
  document.getElementById("ct-cancel-edit-btn").style.display = "none";
  renderCustomTraitReqPills();
  updateReqTraitDropdown();
  renderCustomTraitList();
  openModal("modal-custom-trait");
}

function updateReqTraitDropdown() {
  const type = document.getElementById("ct-type").value;
  const traits = type === "weapon" ? WEAPON_TRAITS : STAND_TRAITS;
  const sel = document.getElementById("ct-req-trait");
  if(!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">None</option>`
    + Object.entries(traits)
        .filter(([key]) => !(TRAIT_REQS[key] && TRAIT_REQS[key].length))
        .sort((a, b) => a[1][0].localeCompare(b[1][0]))
        .map(([key, val]) => `<option value="${esc(key)}">${esc(val[0])}</option>`)
        .join("");
  if([...sel.options].some(o => o.value === current)) sel.value = current;
  const utRow = document.getElementById("ct-unit-trait-row");
  if(utRow) utRow.style.display = type === "weapon" ? "none" : "";
}

function toggleStackCap() {
  const on = document.getElementById("ct-stackable").checked;
  document.getElementById("ct-stackcap-row").style.display = on ? "" : "none";
  if(!on) document.getElementById("ct-stackcap").value = "";
}

function editCustomTrait(id) {
  const t = (state.customTraits||[]).find(t=>t.id===id);
  if(!t) return;
  editingCustomTraitId = id;
  document.getElementById("ct-name").value = t.name;
  document.getElementById("ct-cost").value = t.cost;
  document.getElementById("ct-type").value = t.type;
  updateReqTraitDropdown();
  document.getElementById("ct-description").value = t.description||"";
  document.getElementById("ct-stackable").checked = !!t.stackable;
  document.getElementById("ct-stackcap").value = t.stackCap||"";
  document.getElementById("ct-stackcap-row").style.display = t.stackable ? "" : "none";
  document.getElementById("ct-unit-trait").checked = !!t.unitTrait;
  const utRowE = document.getElementById("ct-unit-trait-row");
  if(utRowE) utRowE.style.display = t.type === "weapon" ? "none" : "";
  renderCustomTraitReqPills();
  const reqs = t.reqs && t.reqs.length ? t.reqs : (t.faction ? [{type:"faction",vals:[t.faction]}] : []);
  setCustomTraitReqPills(reqs);
  document.getElementById("ct-save-btn").textContent = "Save Changes";
  document.getElementById("ct-form-header").textContent = "Edit Trait";
  document.getElementById("ct-cancel-edit-btn").style.display = "";
  document.getElementById("ct-name").focus();
}

function cancelEditCustomTrait() {
  editingCustomTraitId = null;
  clearFieldErr("ct-name");
  document.getElementById("ct-name").value = "";
  document.getElementById("ct-cost").value = "1";
  document.getElementById("ct-type").value = "stand";
  document.getElementById("ct-description").value = "";
  document.getElementById("ct-stackable").checked = false;
  document.getElementById("ct-stackcap").value = "";
  document.getElementById("ct-stackcap-row").style.display = "none";
  document.getElementById("ct-unit-trait").checked = false;
  updateReqTraitDropdown();
  document.getElementById("ct-save-btn").textContent = "Create";
  document.getElementById("ct-form-header").textContent = "New Trait";
  document.getElementById("ct-cancel-edit-btn").style.display = "none";
  document.querySelectorAll("#ct-reqs-container .req-pill").forEach(p=>p.classList.remove("req-pill-on"));
}

function renderCustomTraitList() {
  modalMsg("custom-trait-msg", "");
  const list = document.getElementById("custom-trait-list");
  const traits = state.customTraits||[];
  if(!traits.length) {
    list.innerHTML = `<div style="color:var(--text-inactive);font-size:12px;margin-bottom:4px">No custom traits yet.</div>`;
    return;
  }
  const typeLabel = {stand:"Stand",weapon:"Weapon",both:"Stand+Weapon"};
  list.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">`
    + traits.map(t => {
      const reqBadges = (t.reqs && t.reqs.length)
        ? t.reqs.map(traitReqBadgeHTML).join("")
        : (t.faction ? traitReqBadgeHTML({type:"faction",vals:[t.faction]}) : "");
      return `<div class="custom-trait-item">
        <div style="flex:1;min-width:0">
          <div style="font-weight:bold;color:var(--text-primary);font-size:13px">${esc(t.name)} <span style="font-size:10px;color:var(--text-faint);font-weight:normal">(${t.cost >= 0 ? '+' : ''}${t.cost} pts)</span></div>
          <div style="margin-top:2px">${reqBadges}</div>
          <div style="font-size:10px;color:var(--text-faint);margin-top:1px">${typeLabel[t.type]||t.type}${t.unitTrait ? " - <span style=\"color:#7986cb\">Unit Trait</span>" : ""}${t.stackable ? ` - stackable${t.stackCap ? `, max ${t.stackCap}` : ""}` : ""}${t.description ? ` - ${esc(t.description)}` : ""}</div>
        </div>
        <button class="trait-edit-btn" onclick="editCustomTrait('${t.id}')"><i class="fa-solid fa-pencil"></i> Edit</button>
        <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteCustomTrait('${t.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>`;
    }).join("")
    + `</div>`;
}

function saveCustomTrait() {
  const name = document.getElementById("ct-name").value.trim();
  if(!name) { showFieldErr("ct-name","Enter a trait name."); return; }
  // Traits are referenced by name everywhere, so a duplicate name would make
  // the picker check (and cost) both traits at once.
  const clash =
    findTraitEntry(STAND_TRAITS, name) || findTraitEntry(WEAPON_TRAITS, name) ||
    (state.customTraits||[]).some(t => t.id!==editingCustomTraitId && traitNameEq(t.name, name));
  if(clash) { showFieldErr("ct-name","A trait with this name already exists."); return; }
  const cost = parseFloat(document.getElementById("ct-cost").value)||0;
  const type = document.getElementById("ct-type").value;
  const description = document.getElementById("ct-description").value.trim();
  const reqs = getCustomTraitReqs();
  const facReq = reqs.find(r=>r.type==="faction");
  const faction = facReq ? facReq.vals[0] : "";
  const stackable = document.getElementById("ct-stackable").checked;
  const stackCapRaw = parseInt(document.getElementById("ct-stackcap").value);
  const stackCap = (stackable && stackCapRaw >= 2) ? stackCapRaw : null;
  const unitTrait = type !== "weapon" && document.getElementById("ct-unit-trait").checked;
  if(editingCustomTraitId) {
    const idx = state.customTraits.findIndex(t=>t.id===editingCustomTraitId);
    if(idx !== -1) {
      const oldName = state.customTraits[idx].name;
      state.customTraits[idx] = {id:editingCustomTraitId, name, cost, description, faction, type, reqs, stackable, stackCap, unitTrait};
      // Propagate the rename AND the new cost/description into the trait
      // tuples embedded in saved units, then refresh each affected unit's
      // allowedRoles snapshot (requirements may have changed too).
      const touch = t => { if(t[0]===oldName || t[0]===name) { t[0]=name; t[1]=cost; t[2]=description; return true; } return false; };
      state.customUnits.forEach(u => {
        let hit = false;
        (u.standTraits||[]).forEach(t => { if(touch(t)) hit = true; });
        (u.weapons||[]).forEach(w => { (w.traits||[]).forEach(t => { if(touch(t)) hit = true; }); });
        if(hit) u.allowedRoles = computeAllowedRoles(u);
      });
    }
    editingCustomTraitId = null;
    document.getElementById("ct-save-btn").textContent = "Create";
    document.getElementById("ct-form-header").textContent = "New Trait";
    document.getElementById("ct-cancel-edit-btn").style.display = "none";
  } else {
    state.customTraits.push({id:uid(), name, cost, description, faction, type, reqs, stackable, stackCap, unitTrait});
  }
  saveState();
  renderCustomTraitList();
  clearFieldErr("ct-name");
  document.getElementById("ct-name").value = "";
  document.getElementById("ct-cost").value = "1";
  document.getElementById("ct-type").value = "stand";
  document.getElementById("ct-description").value = "";
  document.getElementById("ct-stackable").checked = false;
  document.getElementById("ct-stackcap").value = "";
  document.getElementById("ct-stackcap-row").style.display = "none";
  document.getElementById("ct-unit-trait").checked = false;
  updateReqTraitDropdown();
  document.querySelectorAll("#ct-reqs-container .req-pill").forEach(p=>p.classList.remove("req-pill-on"));
  if(document.getElementById("modal-traits").classList.contains("open")) {
    refreshTraitPickerList();
  }
}

function deleteCustomTrait(id) {
  const trait = state.customTraits.find(t=>t.id===id);
  if(!trait) return;
  // Check library units
  const usedBy = state.customUnits.filter(u =>
    (u.standTraits||[]).some(t=>traitNameEq(t[0],trait.name)) ||
    (u.weapons||[]).some(w=>(w.traits||[]).some(t=>traitNameEq(t[0],trait.name)))
  ).map(u=>u.name);
  // Check current builder session
  const inBuilder = currentBuilderTraits.some(t=>traitNameEq(t[0],trait.name)) ||
    builderWeapons.some(w=>(w.traits||[]).some(t=>traitNameEq(t[0],trait.name)));
  if(inBuilder) usedBy.unshift("(current unit in builder)");
  if(usedBy.length) {
    modalMsg("custom-trait-msg", `<strong>${esc(trait.name)}</strong> is in use and can't be deleted:<ul style="margin:4px 0 0 16px;padding:0">${usedBy.map(n=>`<li>${esc(n)}</li>`).join("")}</ul><div style="margin-top:4px">Remove it from those units first.</div>`);
    return;
  }
  state.customTraits = state.customTraits.filter(t=>t.id!==id);
  saveState();
  renderCustomTraitList();
}

// ============================================================
// LIBRARY
// ============================================================

function renderLibFactionFilters() {
  const builtins = [
    {v:"all",   l:"All Factions",    c:null},
    {v:"standard",  l:'<i class="fa-solid fa-shield"></i> Standard',  c:"#007eff"},
    {v:"precursor", l:'<i class="fa-solid fa-gem"></i> Precursor', c:"#9c27b0"},
    {v:"soulless",  l:'<i class="fa-solid fa-robot"></i> Soulless',  c:"#607d8b"},
    {v:"swarm",     l:'<i class="fa-solid fa-virus"></i> Swarm',     c:"#4caf50"},
    {v:"warrior",   l:'<i class="fa-solid fa-hand-fist"></i> Warrior',   c:"#f44336"},
  ];
  const customs = (state.customFactions||[]).map(f=>({v:f.id, l:`<i class="fa-solid fa-${f.icon}"></i> ${esc(f.name)}`, c:f.color}));
  const extras = [
    {v:"none",   l:'<i class="fa-solid fa-ban"></i> No Faction', c:"#888"},
    {v:"custom", l:'<i class="fa-solid fa-pen"></i> Custom',     c:"#ffd700"},
  ];
  const all = [...builtins, ...customs, ...extras];
  document.getElementById("lib-faction-filters").innerHTML =
    `<span class="pill-group-label">Faction</span>` +
    all.map(p=>{
      const style = p.c ? `style="--fc:${p.c}"` : "";
      const active = libFilterFaction===p.v ? " active" : "";
      return `<div class="pill${active}" ${style} onclick="setLibFactionFilter(this,'${p.v}')">${p.l}</div>`;
    }).join("");
}

function setLibFactionFilter(el, faction) {
  libFilterFaction = faction;
  renderLibFactionFilters();
  renderLibrary();
}

function setLibFilter(el, cls) {
  document.querySelectorAll("#lib-filters .pill").forEach(p=>p.classList.remove("active"));
  el.classList.add("active");
  libFilterClass = cls;
  renderLibrary();
}

function setLibViewType(el, type) {
  document.querySelectorAll("#lib-view-filters .pill").forEach(p=>p.classList.remove("active"));
  el.classList.add("active");
  libViewType = type;
  renderLibrary();
}

function clearLibSearch() {
  const el = document.getElementById("lib-search");
  if(el) el.value = "";
  renderLibrary();
}

function clearLibFilters() {
  libFilterFaction = "all";
  libFilterClass = "all";
  libSort = "name-asc";
  const searchEl = document.getElementById("lib-search");
  if(searchEl) searchEl.value = "";
  document.querySelectorAll("#lib-filters .pill").forEach(p=>p.classList.remove("active"));
  const allPill = document.querySelector('#lib-filters .pill[data-filter="all"]');
  if(allPill) allPill.classList.add("active");
  const sortEl = document.getElementById("lib-sort");
  if(sortEl) sortEl.value = "name-asc";
  renderLibrary();
}

function _updateLibFilterIndicators() {
  const searchVal = document.getElementById("lib-search")?.value || "";
  const clearSearchBtn = document.getElementById("lib-search-clear");
  if(clearSearchBtn) clearSearchBtn.style.display = searchVal ? "block" : "none";
  let n = 0;
  if(libFilterFaction !== "all") n++;
  if(libFilterClass !== "all") n++;
  if(searchVal) n++;
  const badge = document.getElementById("lib-active-badge");
  const clearBtn = document.getElementById("lib-clear-filters");
  if(badge) { badge.style.display = n ? "inline-block" : "none"; if(n) badge.textContent = n + (n===1?" filter":" filters"); }
  if(clearBtn) clearBtn.style.display = n ? "block" : "none";
}

let _libSearchDebounce = null;
function onLibSearchChange() { clearTimeout(_libSearchDebounce); _libSearchDebounce = setTimeout(renderLibrary, 150); }

let _libFilterCollapsed = false;
function toggleLibFilterPanel() {
  _libFilterCollapsed = !_libFilterCollapsed;
  const panel = document.getElementById("lib-filter-panel");
  if(panel) panel.classList.toggle("collapsed", _libFilterCollapsed);
}

function renderLibrary() {
  renderLibFactionFilters();
  _updateLibFilterIndicators();
  const panel = document.getElementById("lib-filter-panel");
  if(panel) panel.classList.toggle("collapsed", _libFilterCollapsed);
  const sortEl = document.getElementById("lib-sort");
  if(sortEl && sortEl.value !== libSort) sortEl.value = libSort;
  const search = (document.getElementById("lib-search")?.value||"").toLowerCase();
  let units = allUnits();
  if(libFilterFaction==="custom") { units = units.filter(u=>!u.builtIn); }
  else if(libFilterFaction==="none") { units = units.filter(u=>!u.builtIn && !u.faction); }
  else if(libFilterFaction!=="all") { units = units.filter(u=>u.faction===libFilterFaction); }
  if(libFilterClass!=="all") units = units.filter(u=>u.class===libFilterClass);
  if(search) units = units.filter(u=>u.name.toLowerCase().includes(search));
  // Hide units that have no cost for the current view type
  let roleHidden = 0;
  if(libViewType !== "unit") {
    const pKey = VIEW_PTS_KEY[libViewType];
    const before = units.length;
    units = units.filter(u => calcPoints(u)[pKey] != null);
    roleHidden = before - units.length;
  }
  const classOrder = ["inf","cav","fg","scout","afv","ac","sh","beh"];
  units.sort((a,b) => {
    switch(libSort) {
      case "name-desc":  return b.name.localeCompare(a.name);
      case "pts-asc":    { const k=VIEW_PTS_KEY[libViewType]; return (calcPoints(a)[k]??calcPoints(a).perStand) - (calcPoints(b)[k]??calcPoints(b).perStand); }
      case "pts-desc":   { const k=VIEW_PTS_KEY[libViewType]; return (calcPoints(b)[k]??calcPoints(b).perStand) - (calcPoints(a)[k]??calcPoints(a).perStand); }
      case "class":      return (classOrder.indexOf(a.class)-classOrder.indexOf(b.class)) || a.name.localeCompare(b.name);
      case "speed-desc": return (b.speed - a.speed) || a.name.localeCompare(b.name);
      case "speed-asc":  return (a.speed - b.speed) || a.name.localeCompare(b.name);
      case "aim-asc":    return (a.aim - b.aim) || a.name.localeCompare(b.name);
      case "aim-desc":   return (b.aim - a.aim) || a.name.localeCompare(b.name);
      case "save-asc":   return (a.saveNumber - b.saveNumber) || a.name.localeCompare(b.name);
      case "save-desc":  return (b.saveNumber - a.saveNumber) || a.name.localeCompare(b.name);
      case "morale-asc":   return (a.morale - b.morale) || a.name.localeCompare(b.name);
      case "morale-desc":  return (b.morale - a.morale) || a.name.localeCompare(b.name);
      case "assault-desc": return (b.assault - a.assault) || a.name.localeCompare(b.name);
      case "assault-asc":  return (a.assault - b.assault) || a.name.localeCompare(b.name);
      default:             return a.name.localeCompare(b.name);
    }
  });
  const countEl = document.getElementById("lib-count");
  if(countEl) {
    const roleLabel = VIEW_LABELS[libViewType] || "Unit";
    const roleNote = (libViewType !== "unit" && roleHidden > 0)
      ? ` <span style="color:var(--text-faint)">&bull; ${roleHidden} can't be fielded as ${roleLabel}</span>`
      : "";
    countEl.innerHTML = units.length
      ? `<strong style="color:var(--text-secondary)">${units.length}</strong> unit${units.length!==1?"s":""}${roleNote}`
      : "";
  }
  // Active free-pick army for quick-add feature
  const _qaArmy = currentArmyId ? state.armies.find(a=>a.id===currentArmyId) : null;
  const _qaFP   = _qaArmy && isFreePick(_qaArmy);
  const ctxEl = document.getElementById("lib-quick-add-ctx");
  if(ctxEl) {
    if(_qaFP) {
      ctxEl.style.display = "";
      ctxEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:6px;background:var(--accent-tint);border:1px solid #007eff33;font-size:12px;color:var(--accent-light);margin-bottom:10px">
        <i class="fa-solid fa-bolt" style="font-size:10px;flex-shrink:0"></i>
        <span>Quick-add active - click <strong><i class="fa-solid fa-square-plus"></i> Add to BG</strong> on any card to add it to <strong>${esc(_qaArmy.name)}</strong>.</span>
        <button onclick="showPage('armies');selectArmy('${_qaArmy.id}')" style="background:none;border:none;color:var(--accent-light);cursor:pointer;padding:0;font-size:11px;white-space:nowrap;text-decoration:underline;margin-left:auto;flex-shrink:0">Open army →</button>
      </div>`;
    } else {
      ctxEl.style.display = "none";
    }
  }

  const list = document.getElementById("lib-list");
  if(!units.length) {
    const msg = search
      ? `No units match &ldquo;${esc(search)}&rdquo;`
      : libFilterFaction==="custom"
        ? "No custom units yet - use Create Unit to build one"
        : "No units found";
    list.innerHTML=`<div class="empty"><div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div>${msg}</div>`;
    return;
  }
  list.innerHTML = units.map(u => {
    let qaBtn = "";
    if(_qaArmy) {
      if(!_qaFP) {
        qaBtn = `<button class="trait-edit-btn" disabled title="Quick-add is only available for Free Pick armies" style="opacity:.35;cursor:not-allowed;margin-left:auto"><i class="fa-solid fa-square-plus"></i> Add to BG</button>`;
      } else if(!fpUnitMatchesFaction(u, _qaArmy)) {
        const uf = esc(factionName(u.faction)||u.faction||"unaligned");
        const af = esc(factionName(_qaArmy.faction)||_qaArmy.faction);
        qaBtn = `<button class="trait-edit-btn" disabled title="Faction mismatch - unit is ${uf}, army requires ${af}" style="opacity:.35;cursor:not-allowed;margin-left:auto"><i class="fa-solid fa-square-plus"></i> Add to BG</button>`;
      } else {
        qaBtn = `<button class="trait-edit-btn" onclick="openLibQuickAddPopover('${u.id}',this);event.stopPropagation()" title="Quick-add to a battle group"><i class="fa-solid fa-square-plus"></i> Add to BG</button>`;
      }
    }
    const actions = `
      ${u.builtIn?"":`<button class="trait-edit-btn" onclick="editUnit('${u.id}')">Edit</button>`}
      <button class="trait-edit-btn" onclick="cloneUnit('${u.id}')"><i class="fa-solid fa-copy"></i> Clone</button>
      ${u.builtIn?"":`<button class="trait-edit-btn" onclick="confirmBtn(this,()=>deleteCustomUnit('${u.id}'))">Delete</button>`}
      ${qaBtn}`;
    return unitCardHTML(u, actions, libViewType);
  }).join("");
}

function openLibQuickAddPopover(unitId, btnEl) {
  const army = currentArmyId ? state.armies.find(a=>a.id===currentArmyId) : null;
  if(!army || !isFreePick(army)) return;
  const unit = unitById(unitId);
  if(!unit) return;
  const popover = document.getElementById("lib-quick-add-popover");
  if(!popover) return;

  const pts = calcPoints(unit);
  const typeSpecs = [
    {type:"unit",        label:"Unit",    key:"unitPts"},
    {type:"independent", label:"Ind",     key:"indPts"},
    {type:"hero",        label:"Hero",    key:"heroPts"},
    {type:"command",     label:"Cmd",     key:"cmdPts"},
    {type:"cmdHero",     label:"CmdHero", key:"cmdHeroPts"},
  ];
  const availTypes = typeSpecs.filter(t => pts[t.key] != null);

  const bgs = army.battleGroups || [];
  const bgRows = !bgs.length
    ? `<div style="font-size:12px;color:var(--text-faint);font-style:italic;padding:2px 0">No battle groups - open the army to add them.</div>`
    : bgs.map(bg => {
        const btns = availTypes.map(t =>
          `<button onclick="libQuickAddUnit('${unitId}','${bg.id}','${t.type}',this);event.stopPropagation()" class="trait-edit-btn" style="font-size:10px;padding:3px 8px;line-height:1.4;text-align:center;white-space:nowrap"><i class="fa-solid fa-plus" style="font-size:8px"></i> ${t.label} <span style="opacity:.65;font-size:9px">${pts[t.key]}p</span></button>`
        ).join("");
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-subtle)">
          <span style="font-size:12px;font-weight:600;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(bg.name)}</span>
          <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0">${btns}</div>
        </div>`;
      }).join("");

  popover.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--border-subtle);background:var(--surface-page)">
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:700">Add to Battle Group</div>
        <div style="font-size:13px;font-weight:bold;color:var(--text-primary);margin-top:1px">${esc(army.name)}</div>
      </div>
      <button onclick="closeLibQuickAddPopover()" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:16px;padding:2px 6px;line-height:1;transition:color .12s" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-faint)'"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div style="padding:6px 12px 10px">${bgRows}</div>`;

  popover.style.display = "block";
  const rect = btnEl.getBoundingClientRect();
  const pw = 320;
  let left = Math.max(8, rect.right - pw);
  let top = rect.bottom + 6;
  if(top + popover.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - popover.offsetHeight - 6);
  popover.style.left = left + "px";
  popover.style.top = top + "px";
  popover.style.width = pw + "px";
}

function closeLibQuickAddPopover() {
  const p = document.getElementById("lib-quick-add-popover");
  if(p) p.style.display = "none";
}

function libQuickAddUnit(unitId, bgId, unitType, btnEl) {
  const army = state.armies.find(a=>a.id===currentArmyId);
  const bg = army && (army.battleGroups||[]).find(b=>b.id===bgId);
  if(!army || !bg) return;
  bg.entries = bg.entries || [];
  const existing = bg.entries.find(e => e.unitId === unitId && e.unitType === unitType);
  if(existing) {
    existing.qty = (existing.qty||1) + 1;
  } else {
    bg.entries.push({id:"fpe_"+uid(), unitId, unitType, qty:1});
  }
  saveState();
  if(btnEl) {
    const origHTML = btnEl.innerHTML;
    const origBC = btnEl.style.borderColor;
    const origC = btnEl.style.color;
    btnEl.innerHTML = '<i class="fa-solid fa-check"></i>';
    btnEl.style.borderColor = "#66bb6a55";
    btnEl.style.color = "#66bb6a";
    setTimeout(() => { btnEl.innerHTML=origHTML; btnEl.style.borderColor=origBC; btnEl.style.color=origC; }, 900);
  }
}

function deleteCustomUnit(id) {
  state.customUnits = state.customUnits.filter(u=>u.id!==id);
  _unitIdCache = null;   // clear before pruning so unitById() reflects the deletion
  state.taskForces.forEach(tf => {
    tf.units = tf.units.filter(u=>u.unitId!==id);
    tf.units.forEach(s=>{ if(s.transport===id) delete s.transport; });
  });
  (state.armies||[]).forEach(a=>(a.battleGroups||[]).forEach(bg=>(bg.entries||[]).forEach(e=>{
    if(e.transport===id) delete e.transport;
  })));
  // The unit on the builder no longer exists - drop edit mode (keeps the
  // form contents so a mistaken delete can be re-saved as a new unit).
  if(editingUnitId===id) setEditMode(null);
  pruneOrphanedBGEntries();
  saveState();
  renderLibrary();
  renderTFList();
  if(currentTFId) renderTFDetail();
  renderArmyList();
  if(currentArmyId) renderArmyDetail();
}

function cloneUnit(id) {
  const src = unitById(id);
  if (!src) return;
  const clone = JSON.parse(JSON.stringify(src));
  clone.id = "custom_" + uid();
  clone.builtIn = false;
  // Clones are priced by the calculator - keeping a built-in's hand-tuned
  // officialPts would silently change the price on the first re-save.
  delete clone.officialPts;
  const baseName = "Copy of " + src.name;
  let name = baseName, n = 2;
  while (state.customUnits.some(u => u.name === name)) name = baseName + " (" + n++ + ")";
  clone.name = name;
  state.customUnits.push(clone);
  saveState();
  editUnit(clone.id);
}

function editUnit(id) {
  const unit = state.customUnits.find(u=>u.id===id);
  if(!unit) return;
  document.getElementById("b-name").value = unit.name;
  document.getElementById("b-description").value = unit.description || "";
  document.getElementById("b-class").value = unit.class;
  document.getElementById("b-faction").value = unit.faction||"";
  builderFactionPrev = unit.faction||"";
  onClassChange();
  if(unit.customSize) {
    const sizeEl = document.getElementById("b-unit-size");
    if(sizeEl) sizeEl.value = unit.customSize;
  }
  // Write the unit's stat values into the schema-generated inputs
  GAME.schema.stats.forEach(f => {
    const el = document.getElementById(f.edit.id);
    if(el && unit[f.key] !== undefined) el.value = unit[f.key];
  });
  builderMobilityPrev = unit.mobility;
  builderSelectedRole = "unit";
  currentBuilderTraits = (unit.standTraits||[]).slice();
  document.getElementById("b-traits-display").innerHTML = traitTipHTML(currentBuilderTraits, allStandTraits())||"None";
  builderWeapons = (unit.weapons||[]).map(w=>({...w, traits:(w.traits||[]).slice()}));
  renderWeaponRows();
  setEditMode(unit);
  calculateBuilder();
  showPage("builder");
}

// ============================================================
// FACTIONS PAGE
// ============================================================

function renderFactionList() {
  const list = document.getElementById("fac-list-content");
  if(!list) return;

  const unitsByFac = {};
  allUnits().forEach(u => { const k = u.faction||"_none"; unitsByFac[k] = (unitsByFac[k]||0)+1; });

  const traitsByFac = {};
  (state.customTraits||[]).forEach(t => {
    const fid = t.faction || (t.reqs||[]).find(r=>r.type==="faction")?.vals?.[0];
    if(fid) traitsByFac[fid] = (traitsByFac[fid]||0)+1;
  });

  const tfsByFac = {};
  (state.taskForces||[]).forEach(tf => {
    if(tf.faction && tf.faction !== "any") tfsByFac[tf.faction] = (tfsByFac[tf.faction]||0)+1;
  });

  const builtins = [
    {id:"standard",  label:"Standard",  icon:BUILTIN_FACTION_ICONS.standard,  color:FACTION_COLORS.standard},
    {id:"precursor", label:"Precursor", icon:BUILTIN_FACTION_ICONS.precursor, color:FACTION_COLORS.precursor},
    {id:"soulless",  label:"Soulless",  icon:BUILTIN_FACTION_ICONS.soulless,  color:FACTION_COLORS.soulless},
    {id:"swarm",     label:"Swarm",     icon:BUILTIN_FACTION_ICONS.swarm,     color:FACTION_COLORS.swarm},
    {id:"warrior",   label:"Warrior",   icon:BUILTIN_FACTION_ICONS.warrior,   color:FACTION_COLORS.warrior},
  ];

  const builtinHTML = builtins.map(f => {
    const n = unitsByFac[f.id]||0;
    return `<div class="fac-builtin-row" onclick="showFactionDetail('${f.id}')">
      <div class="fac-builtin-icon" style="background:${f.color}1a;color:${f.color}"><i class="fa-solid fa-${f.icon}"></i></div>
      <span class="fac-builtin-name" style="color:${f.color}">${f.label}</span>
      <span style="font-size:10px;color:var(--text-faint)">${n} unit${n!==1?"s":""}</span>
      <i class="fa-solid fa-chevron-right" style="color:var(--text-faint);font-size:10px;margin-left:2px"></i>
    </div>`;
  }).join("");

  const custom = state.customFactions||[];
  const customHTML = custom.length
    ? custom.map(f => {
        const n  = unitsByFac[f.id]||0;
        const nt = traitsByFac[f.id]||0;
        const ntf = tfsByFac[f.id]||0;
        const chips = [
          `<span class="fac-card-meta-chip"><i class="fa-solid fa-chess-pawn" style="font-size:9px"></i>${n} unit${n!==1?"s":""}</span>`,
          nt  ? `<span class="fac-card-meta-chip"><i class="fa-solid fa-star" style="font-size:9px"></i>${nt} trait${nt!==1?"s":""}</span>` : "",
          ntf ? `<span class="fac-card-meta-chip"><i class="fa-solid fa-shield-halved" style="font-size:9px"></i>${ntf} TF${ntf!==1?"s":""}</span>` : "",
        ].filter(Boolean).join("");
        return `<div class="fac-card" onclick="showFactionDetail('${f.id}')">
          <div class="fac-card-header">
            <div class="fac-icon-box" style="background:${f.color}1a;color:${f.color}"><i class="fa-solid fa-${f.icon}"></i></div>
            <div style="flex:1;min-width:0">
              <div class="fac-card-name" style="color:${f.color}">${esc(f.name)}</div>
              ${f.description ? `<div class="fac-card-desc">${esc(f.description)}</div>` : ""}
            </div>
            <div class="fac-card-actions" onclick="event.stopPropagation()">
              <button class="trait-edit-btn" onclick="editCustomFaction('${f.id}');openModal('modal-faction')"><i class="fa-solid fa-pencil"></i> Edit</button>
              <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteCustomFaction('${f.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
          </div>
          ${chips ? `<div class="fac-card-meta">${chips}</div>` : ""}
        </div>`;
      }).join("")
    : `<div class="empty"><div class="empty-icon"><i class="fa-solid fa-flag"></i></div>No custom factions yet<br><span style="font-size:12px;font-weight:normal">Press <strong>New Faction</strong> to create one</span></div>`;

  list.innerHTML = `
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:8px;margin-top:4px">Built-in</div>
    ${builtinHTML}
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-muted);margin-bottom:8px;margin-top:20px">Custom</div>
    ${customHTML}`;
}

function showFactionDetail(id) {
  currentFactionId = id;
  document.getElementById("fac-list-view").style.display = "none";
  document.getElementById("fac-detail-view").style.display = "";
  renderFactionDetail();
}

function showFactionList() {
  currentFactionId = null;
  document.getElementById("fac-list-view").style.display = "";
  document.getElementById("fac-detail-view").style.display = "none";
  renderFactionList();
}

function renderFactionDetail() {
  const panel = document.getElementById("fac-detail-panel");
  if(!panel) return;
  const id = currentFactionId;
  const isBuiltin = !!FACTION_COLORS[id];
  const cf = isBuiltin ? null : (state.customFactions||[]).find(f=>f.id===id);
  if(!isBuiltin && !cf) { showFactionList(); return; }

  const name  = isBuiltin ? BUILTIN_FACTION_LABELS[id]      : cf.name;
  const icon  = isBuiltin ? BUILTIN_FACTION_ICONS[id]       : (cf.icon||"shield");
  const color = isBuiltin ? FACTION_COLORS[id]              : (cf.color||"#888");
  const desc  = isBuiltin ? ""                              : (cf.description||"");

  const units  = allUnits().filter(u => u.faction === id);
  const traits = (state.customTraits||[]).filter(t =>
    t.faction === id || (t.reqs||[]).some(r=>r.type==="faction"&&r.vals.includes(id))
  );
  const tfs = (state.taskForces||[]).filter(tf => tf.faction === id);

  // Units HTML
  let unitsHTML;
  if(!units.length) {
    const createBtn = isBuiltin ? ""
      : `<div style="margin-top:10px"><button class="trait-edit-btn" onclick="goCreateUnitForFaction('${id}')"><i class="fa-solid fa-plus"></i> New Unit</button></div>`;
    unitsHTML = `<div style="color:var(--text-faint);font-size:12px;font-style:italic">No units for this faction yet.</div>${createBtn}`;
  } else {
    const cards = units.map(u => {
      const actions = u.builtIn
        ? `<button class="trait-edit-btn" onclick="libFilterFaction='${id}';showPage('library')" title="View in library">View in Library</button>
           <button class="trait-edit-btn" onclick="cloneUnit('${u.id}')"><i class="fa-solid fa-copy"></i> Clone</button>`
        : `<button class="trait-edit-btn" onclick="editUnit('${u.id}')">Edit</button>
           <button class="trait-edit-btn" onclick="cloneUnit('${u.id}')"><i class="fa-solid fa-copy"></i> Clone</button>`;
      return unitCardHTML(u, actions, "unit");
    }).join("");
    const createBtn = isBuiltin ? ""
      : `<div style="margin-top:10px"><button class="trait-edit-btn" onclick="goCreateUnitForFaction('${id}')"><i class="fa-solid fa-plus"></i> New Unit</button></div>`;
    unitsHTML = `<div class="fac-unit-grid">${cards}</div>${createBtn}`;
  }

  // Traits HTML (custom factions only)
  let traitsSection = "";
  if(!isBuiltin) {
    let traitsHTML;
    if(!traits.length) {
      traitsHTML = `<div style="color:var(--text-faint);font-size:12px;font-style:italic">No custom traits for this faction.</div>`;
    } else {
      traitsHTML = `<div class="fac-trait-cards">${traits.map(t => {
        const cost = (t.cost >= 0 ? "+" : "") + t.cost + "p";
        const typeLabel = t.type === "weapon" ? "Weapon" : "Stand";
        return `<div class="fac-trait-card">
          <div class="fac-trait-card-header">
            <span class="fac-trait-card-name">${esc(t.name)}</span>
            <div class="fac-trait-card-meta">
              <span class="fac-trait-card-type">${typeLabel}</span>
              <span class="fac-trait-card-cost">${cost}</span>
            </div>
          </div>
          ${t.description ? `<div class="fac-trait-card-desc">${esc(t.description)}</div>` : ""}
          <div class="fac-trait-card-edit">
            <button class="trait-edit-btn" onclick="editCustomTrait('${t.id}');openModal('modal-custom-trait')"><i class="fa-solid fa-pencil"></i> Edit</button>
          </div>
        </div>`;
      }).join("")}</div>`;
    }
    traitsSection = `<div class="fac-section">
      <div class="fac-section-head"><i class="fa-solid fa-star" style="font-size:9px"></i> Faction Traits <span class="fac-section-count">${traits.length}</span></div>
      ${traitsHTML}
    </div>`;
  }

  // Task Forces HTML
  let tfsSection = "";
  if(tfs.length) {
    tfsSection = `<div class="fac-section">
      <div class="fac-section-head"><i class="fa-solid fa-shield-halved" style="font-size:9px"></i> Task Forces Restricted to this Faction <span class="fac-section-count">${tfs.length}</span></div>
      ${tfs.map(tf=>`<div class="fac-tf-row" onclick="showPage('taskforces');selectTF('${tf.id}')">
        <i class="fa-solid fa-shield-halved" style="color:var(--text-faint);font-size:12px"></i>
        <span class="fac-tf-name">${esc(tf.name)}</span>
        <span class="fac-tf-slots">${(tf.units||[]).length} slot${(tf.units||[]).length!==1?"s":""}</span>
        <i class="fa-solid fa-chevron-right" style="color:var(--text-faint);font-size:10px"></i>
      </div>`).join("")}
    </div>`;
  }

  const headerBtns = isBuiltin ? "" : `<div style="display:flex;gap:6px">
    <button class="trait-edit-btn" onclick="editCustomFaction('${id}');openModal('modal-faction')"><i class="fa-solid fa-pencil"></i> Edit</button>
    <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteCustomFaction('${id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
  </div>`;

  panel.innerHTML = `
    <div class="card-title">
      <button class="trait-edit-btn" onclick="showFactionList()"><i class="fa-solid fa-chevron-left"></i> Factions</button>
      ${headerBtns}
    </div>

    <div class="fac-hero">
      <div class="fac-hero-icon" style="background:${color}1a;border:2px solid ${color}44;color:${color}">
        <i class="fa-solid fa-${icon}"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div class="fac-hero-name" style="color:${color}">${esc(name)}</div>
        ${desc ? `<div class="fac-hero-desc">${esc(desc)}</div>` : ""}
        ${isBuiltin ? `<div style="margin-top:8px"><span style="font-size:10px;font-weight:700;padding:2px 9px;border-radius:8px;background:var(--surface-raised);color:var(--text-muted);border:1px solid var(--border-subtle);letter-spacing:.5px">BUILT-IN</span></div>` : ""}
      </div>
    </div>

    ${traitsSection}

    <div class="fac-section">
      <div class="fac-section-head"><i class="fa-solid fa-chess-pawn" style="font-size:9px"></i> Units <span class="fac-section-count">${units.length}</span></div>
      ${unitsHTML}
    </div>

    ${tfsSection}`;
}

function goCreateUnitForFaction(factionId) {
  resetBuilder();
  showPage("builder");
  const el = document.getElementById("b-faction");
  if(el) { el.value = factionId; builderFactionPrev = factionId; calculateBuilder(); }
}

function _refreshFactionPage() {
  if(!document.getElementById("page-factions")?.classList.contains("active")) return;
  if(document.getElementById("fac-detail-view")?.style.display !== "none") {
    renderFactionDetail();
  } else {
    renderFactionList();
  }
}

// ============================================================
// TASK FORCES
// ============================================================
function _tfTypeLabel(typeKey) {
  if(TF_TYPES[typeKey]) return TF_TYPES[typeKey].label;
  const ct = (state.customTFTypes||[]).find(t=>t.id===typeKey);
  return ct ? ct.name : (typeKey||"");
}

function _populateTFTypeSelect(selEl, currentVal) {
  const builtIn = Object.entries(TF_TYPES).map(([k,v])=>`<option value="${k}"${currentVal===k?" selected":""}>${esc(v.label)}</option>`).join("");
  const custom = (state.customTFTypes||[]).map(t=>`<option value="${t.id}"${currentVal===t.id?" selected":""}>${esc(t.name)}</option>`).join("");
  selEl.innerHTML = builtIn + (custom ? `<optgroup label="Custom">${custom}</optgroup>` : "");
}

function _populateFactionSelect(selEl, currentVal) {
  const builtins = [
    {val:"",          label:"No Faction",  color:null},
    {val:"standard",  label:"Standard",    color:FACTION_COLORS.standard},
    {val:"precursor", label:"Precursor",   color:FACTION_COLORS.precursor},
    {val:"soulless",  label:"Soulless",    color:FACTION_COLORS.soulless},
    {val:"swarm",     label:"Swarm",       color:FACTION_COLORS.swarm},
    {val:"warrior",   label:"Warrior",     color:FACTION_COLORS.warrior},
    {val:"any",       label:"Any Faction", color:null},
  ];
  const custom = (state.customFactions||[]).map(f=>({val:f.id, label:f.name, color:f.color}));
  // Insert custom factions before "Any Faction"
  const opts = [...builtins.slice(0,-1), ...custom, builtins[builtins.length-1]];
  selEl.innerHTML = opts.map(f=>`<option value="${f.val}"${currentVal===f.val?" selected":""}>${esc(f.label)}</option>`).join("");
}

function renderTFList() {
  const list = document.getElementById("tf-list");
  if (!list) return;
  if (!state.taskForces.length) {
    list.innerHTML = `<div class="empty" style="padding:48px 0"><div class="empty-icon"><i class="fa-solid fa-users"></i></div>No task forces yet - press <strong>New Task Force</strong> to create one.</div>`;
    _updateTFTemplatesBadge();
    return;
  }
  const allAssets = allTacticalAssets();
  list.innerHTML = state.taskForces.map(tf => {
    const pts = tfPoints(tf);
    const unitCount = (tf.units||[]).reduce((s,u)=>s+u.quantity,0);
    const typeLabel = tf.tfType ? _tfTypeLabel(tf.tfType) : "";
    const asset = tf.tacAsset ? allAssets.find(a=>a.id===tf.tacAsset) : null;
    const facPill = tf.faction ? factionPill(tf.faction) : "";
    const rank = tf.commanderRank || "regular";
    const rankBadge = rank === "lord"
      ? `<span style="background:#7b1fa222;color:#ce93d8;border:1px solid #7b1fa255;padding:0 5px;border-radius:8px;font-size:9px;font-weight:bold;letter-spacing:.5px">LORD</span>`
      : rank === "senior"
      ? `<span style="background:#1a237e22;color:#90caf9;border:1px solid #1a237e55;padding:0 5px;border-radius:8px;font-size:9px;font-weight:bold;letter-spacing:.5px">SR. TFC</span>`
      : "";
    const overLimit = tf.pointsLimit && pts > tf.pointsLimit;
    const ptsColor = overLimit ? "#ef5350" : "var(--accent)";
    const ptsLabel = tf.pointsLimit ? `${pts} / ${tf.pointsLimit}` : `${pts}`;
    const deployedArmy = armyOfTF(tf.id);
    const deployBadge = deployedArmy
      ? `<span style="font-size:10px;color:#8b949e;display:inline-flex;align-items:center;gap:4px"><i class="fa-solid fa-shield-halved" style="color:#7986cb;font-size:9px"></i> ${esc(deployedArmy.name)}</span>`
      : `<span style="font-size:10px;color:#444">Undeployed</span>`;
    const barHTML = tf.pointsLimit ? (()=>{
      const pct = Math.min(pts / tf.pointsLimit, 1) * 100;
      const barColor = overLimit ? "#ef5350" : pts / tf.pointsLimit > 0.85 ? "#ffa726" : "#4caf50";
      return `<div style="height:3px;border-radius:2px;background:#1a1f2a;overflow:hidden;margin-top:6px">
        <div style="height:100%;width:${pct.toFixed(1)}%;background:${barColor};border-radius:2px"></div>
      </div>`;
    })() : "";
    const cardBorder = overLimit ? "border-color:#ef535055" : "";
    return `<div style="background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;margin-bottom:12px;overflow:hidden;cursor:pointer;transition:border-color .15s,background .15s;${cardBorder}"
      onclick="selectTF('${tf.id}')"
      onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--surface-raised)'"
      onmouseout="this.style.borderColor='${overLimit?"#ef535055":"var(--border-default)"}';this.style.background='var(--surface-card)'">
      <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-family:var(--font-display);font-size:20px;letter-spacing:.5px;color:var(--text-bright)">${esc(tf.name)}</span>
            ${typeLabel?`<span style="font-size:10px;padding:1px 7px;border-radius:8px;background:#1a2030;color:#7986cb;border:1px solid #2a3a5a;font-weight:bold;letter-spacing:.3px;white-space:nowrap">${esc(typeLabel)}</span>`:""}
            ${facPill}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px">
            ${tf.commander?`<span style="font-size:11px;color:#8b949e;display:inline-flex;align-items:center;gap:4px"><i class="fa-solid fa-person-military-pointing" style="color:#ffd54f;font-size:9px"></i>${esc(tf.commander)}</span>`:""}
            ${rankBadge}
            ${asset?`<span style="font-size:11px;color:#8b949e;display:inline-flex;align-items:center;gap:4px"><i class="fa-solid fa-chess" style="color:#ffd54f;font-size:9px"></i>${esc(asset.name)}</span>`:""}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${deployBadge}
            <span style="color:#444;font-size:10px">&bull;</span>
            <span style="font-size:11px;color:#8b949e">${unitCount} unit${unitCount!==1?"s":""}</span>
          </div>
          ${barHTML}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:8px;flex-shrink:0" onclick="event.stopPropagation()">
          <div style="text-align:right">
            <div style="font-size:22px;font-family:var(--font-display);color:${ptsColor};line-height:1">${ptsLabel}</div>
            <div style="font-size:10px;color:var(--text-faint);letter-spacing:.03em">pts</div>
            ${overLimit?`<div style="font-size:10px;color:#ef5350;font-weight:bold"><i class="fa-solid fa-triangle-exclamation"></i> over</div>`:""}
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <button class="trait-edit-btn" onclick="selectTF('${tf.id}')" style="white-space:nowrap"><i class="fa-solid fa-arrow-right"></i> Open</button>
            <button class="trait-edit-btn" onclick="exportTF('${tf.id}')" title="Export task force JSON"><i class="fa-solid fa-share-nodes"></i> Export</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join("");
  _updateTFTemplatesBadge();
}

function backToTFList() {
  currentTFId = null;
  const lv = document.getElementById("tf-list-view");
  const dv = document.getElementById("tf-detail-view");
  if(lv) lv.style.display = "";
  if(dv) dv.style.display = "none";
  renderTFList();
}

function availableTypesFor(cls, role) {
  const sectionTypes = SECTION_TYPES[role] || ["unit"];
  const pr = premiumsFor(cls);
  const premiumMap = {independent: pr.ind, hero: pr.hero, command: pr.cmd, cmdHero: pr.cmdHero};
  return sectionTypes.filter(t => t === "unit" || (premiumMap[t] !== null && premiumMap[t] !== undefined));
}

function slotPointValue(slot) {
  const u = unitById(slot.unitId);
  if(!u) return 0;
  const pts = calcPoints(u);
  const typeKey = {unit:"unitPts",independent:"indPts",hero:"heroPts",command:"cmdPts",cmdHero:"cmdHeroPts"}[slot.unitType||"unit"];
  let basePts = (pts[typeKey] != null ? pts[typeKey] : pts.unitPts) || 0;
  if (slot.transport) {
    const tu = unitById(slot.transport);
    if (tu) basePts += mechanizedCount(u, tu, slot.unitType) * calcPoints(tu).perStand;
  }
  // Support Units pay a premium on their final cost (cross-attached from
  // outside the task force's normal slots).
  if (slot.role === "support") basePts = GAME.cost.applySupportPremium(basePts);
  return basePts * slot.quantity;
}

function _getTFTypeSlots(tfType) {
  if(TF_TYPES[tfType]) return TF_TYPES[tfType].slots;
  const ct = (state.customTFTypes||[]).find(t=>t.id===tfType);
  return ct ? ct.slots : null;
}

function tfSectionLimits(tf) {
  const units = tf.units || [];
  const typeSlots = _getTFTypeSlots(tf.tfType);
  const coreSlots = units.filter(s => s.role === "core");
  const specSlots = units.filter(s => s.role === "specialist");
  const cmdSlots  = units.filter(s => s.role === "command");
  const suppSlots = units.filter(s => s.role === "support");

  // Sum quantities by class
  const qtyByClass = (slotArr) => {
    const m = {};
    slotArr.forEach(s => {
      const cls = (unitById(s.unitId)||{}).class;
      if(cls) m[cls] = (m[cls]||0) + s.quantity;
    });
    return m;
  };

  const coreQtyByClass = qtyByClass(coreSlots);
  const specQtyByClass = qtyByClass(specSlots);
  const cmdQty  = cmdSlots.reduce((s,sl)=>s+sl.quantity,0);
  const suppQty = suppSlots.reduce((s,sl)=>s+sl.quantity,0);
  const coreTotalQty = coreSlots.reduce((s,sl)=>s+sl.quantity,0);

  const coreLimitsByClass = {};
  if(typeSlots) {
    Object.entries(typeSlots).forEach(([cls, [mn, mx]]) => {
      if(mx > 0 || mn > 0) {
        coreLimitsByClass[cls] = {count: coreQtyByClass[cls]||0, min:mn, max:mx};
      }
    });
  }

  // Specialist: max per class = core quantity of same class
  const specLimitsByClass = {};
  Object.keys(coreQtyByClass).forEach(cls => {
    specLimitsByClass[cls] = {count: specQtyByClass[cls]||0, max: GAME.org.specialistMax(coreQtyByClass[cls])};
  });

  const cmdMax  = GAME.org.commandRatio(coreTotalQty);
  const suppMax = GAME.org.supportMax;

  return {coreLimitsByClass, specLimitsByClass, coreQtyByClass, cmdCount: cmdQty, cmdMax, suppCount: suppQty, suppMax};
}

function canAddToSection(tf, role, unitCls) {
  const lim = tfSectionLimits(tf);
  if(role === "core") {
    const typeSlots = _getTFTypeSlots(tf.tfType);
    if(!typeSlots) return true;
    const mx = (typeSlots[unitCls] || [0,0])[1];
    if(mx === 0) return false;
    return (lim.coreQtyByClass[unitCls]||0) < mx;
  }
  if(role === "specialist") {
    const avail = availableTypesFor(unitCls, "specialist");
    if(!avail.length) return false;
    const specLim = lim.specLimitsByClass[unitCls];
    if(!specLim) return false;
    return specLim.count < specLim.max;
  }
  if(role === "command") {
    const avail = availableTypesFor(unitCls, "command");
    if(!avail.length) return false;
    return lim.cmdCount < lim.cmdMax;
  }
  if(role === "support") {
    return lim.suppCount < lim.suppMax;
  }
  return true;
}

// Returns the maximum quantity this slot can reach given section limits
function maxQtyForSlot(tf, slot) {
  const u = unitById(slot.unitId);
  if(!u) return slot.quantity;
  const lim = tfSectionLimits(tf);
  const role = slot.role;
  if(role === "core") {
    const typeSlots = _getTFTypeSlots(tf.tfType);
    if(!typeSlots) return Infinity;
    const mx = (typeSlots[u.class] || [0,0])[1];
    if(mx === 0) return slot.quantity;
    const otherQty = (lim.coreQtyByClass[u.class]||0) - slot.quantity;
    return mx - otherQty;
  }
  if(role === "specialist") {
    const specLim = lim.specLimitsByClass[u.class];
    if(!specLim) return slot.quantity;
    const otherQty = specLim.count - slot.quantity;
    return specLim.max - otherQty;
  }
  if(role === "command") {
    const otherQty = lim.cmdCount - slot.quantity;
    return lim.cmdMax - otherQty;
  }
  if(role === "support") {
    const otherQty = lim.suppCount - slot.quantity;
    return lim.suppMax - otherQty;
  }
  return Infinity;
}

// How many more stands of this class can still be added to this section
// (Infinity when the section is uncapped). Used to bound the add-unit quantity.
function sectionRemainingQty(tf, role, unitCls) {
  if(!tf) return Infinity;
  const lim = tfSectionLimits(tf);
  if(role === "core") {
    const typeSlots = _getTFTypeSlots(tf.tfType);
    if(!typeSlots) return Infinity;
    const mx = (typeSlots[unitCls] || [0,0])[1];
    if(mx === 0) return 0;
    return Math.max(0, mx - (lim.coreQtyByClass[unitCls]||0));
  }
  if(role === "specialist") {
    const specLim = lim.specLimitsByClass[unitCls];
    if(!specLim) return 0;
    return Math.max(0, specLim.max - specLim.count);
  }
  if(role === "command") return Math.max(0, lim.cmdMax - lim.cmdCount);
  if(role === "support") return Math.max(0, lim.suppMax - lim.suppCount);
  return Infinity;
}

function tfOverLimit(tf) {
  return tf.pointsLimit && tfPoints(tf) > tf.pointsLimit;
}

function tfPoints(tf) {
  return (tf.units||[]).reduce((sum, slot) => sum + slotPointValue(slot), 0);
}

function armyOfTF(tfId) {
  return state.armies.find(a => !isFreePick(a) && (a.taskForceIds||[]).includes(tfId)) || null;
}

function tfRankSlots(tfId) {
  const army = tfId ? armyOfTF(tfId) : null;
  const tfs = army
    ? (army.taskForceIds||[]).map(id => state.taskForces.find(t=>t.id===id)).filter(Boolean)
    : state.taskForces;
  const n = tfs.length;
  return {
    n,
    army,
    scale: GAME.org.armyScale(n),
    seniorSlots: GAME.org.rankSlots.senior(n),
    lordSlots:   GAME.org.rankSlots.lord(n),
    usedSenior:  tfs.filter(t => t.commanderRank === "senior").length,
    usedLord:    tfs.filter(t => t.commanderRank === "lord").length,
  };
}

function setTFCommanderRank(tfId, rank) {
  const tf = state.taskForces.find(t => t.id === tfId);
  if(!tf) return;
  const s = tfRankSlots(tfId);
  if(rank === "senior" && tf.commanderRank !== "senior") {
    if(s.n < 5 || s.usedSenior >= s.seniorSlots) return;
  }
  if(rank === "lord" && tf.commanderRank !== "lord") {
    if(s.n < 10 || s.usedLord >= s.lordSlots) return;
  }
  tf.commanderRank = rank;
  saveState();
  renderTFList();
  renderTFDetail();
  renderArmyDetail();
}

function _tfRankPillsHTML(tf, slots) {
  const rank = tf.commanderRank || "regular";
  const canSenior = slots.scale !== "normal" && (rank === "senior" || slots.usedSenior < slots.seniorSlots);
  const canLord   = slots.scale === "epic"   && (rank === "lord"   || slots.usedLord   < slots.lordSlots);
  function pill(key, label, color, bg, border, canUpgrade) {
    const active = rank === key;
    const disabled = !active && !canUpgrade;
    const style = active
      ? `background:${bg};color:${color};border:1px solid ${border};cursor:default;`
      : disabled
      ? `background:transparent;color:#333;border:1px solid #2a2a2a;cursor:not-allowed;opacity:.4;`
      : `background:transparent;color:${color};border:1px solid ${border}55;cursor:pointer;opacity:.75;`;
    const onclick = !active && canUpgrade ? `onclick="setTFCommanderRank('${tf.id}','${key}')"` : "";
    const remove = active && key !== "regular"
      ? `<span onclick="setTFCommanderRank('${tf.id}','regular')" style="font-size:9px;color:#555;cursor:pointer;margin-left:3px;text-decoration:underline">remove</span>` : "";
    return `<span ${onclick} style="display:inline-flex;align-items:center;gap:2px;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:bold;letter-spacing:.5px;${style}">${label}${active?` <i class="fa-solid fa-check" style="font-size:7px"></i>`:""}${remove}</span>`;
  }
  const scope = slots.army ? "in this army" : "total";
  const note = slots.scale === "normal"
    ? `<span style="font-size:9px;color:#444;font-style:italic">Need 5+ TFs for Large Battle upgrades</span>`
    : slots.scale === "large"
    ? `<span style="font-size:9px;color:#666">Large (${slots.n} TFs) - Sr. ${slots.usedSenior}/${slots.seniorSlots}</span>`
    : `<span style="font-size:9px;color:#666">Epic (${slots.n} TFs) - Sr. ${slots.usedSenior}/${slots.seniorSlots} · Lord ${slots.usedLord}/${slots.lordSlots}</span>`;
  return `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:7px;padding-top:7px;border-top:1px solid #1a2020">
    ${pill("regular","Regular","#8b949e","#8b949e22","#8b949e",true)}
    ${pill("senior","Senior TFC","#90caf9","#1a237e33","#1a237e",canSenior)}
    ${pill("lord","Lord","#ce93d8","#7b1fa233","#7b1fa2",canLord)}
    ${note}
  </div>`;
}

function selectTF(id) {
  currentTFId = id;
  activeTFTab = "core";
  const lv = document.getElementById("tf-list-view");
  const dv = document.getElementById("tf-detail-view");
  if(lv) lv.style.display = "none";
  if(dv) dv.style.display = "";
  renderTFDetail();
}

function renderTFDetail() {
  const panel = document.getElementById("tf-detail-panel");
  const tf = state.taskForces.find(t=>t.id===currentTFId);
  if(!tf) { panel.innerHTML = `<div class="card"><div class="empty"><div class="empty-icon"><i class="fa-solid fa-users"></i></div>Select a ${T("taskForce")} to edit</div></div>`; return; }
  const pts = tfPoints(tf);
  const sections = [
    {role:"core",       label:"Core Units",       short:"Core",        shClass:"sh-core"},
    {role:"specialist", label:"Specialist Stands", short:"Specialists", shClass:"sh-specialist"},
    {role:"command",    label:"Command Stands",    short:"Command",     shClass:"sh-command"},
    {role:"support",    label:"Support Units",     short:"Support",     shClass:"sh-support"},
  ];
  const typeLabel = tf.tfType ? _tfTypeLabel(tf.tfType) : "";
  const allAssets = allTacticalAssets();
  const asset = tf.tacAsset ? allAssets.find(a=>a.id===tf.tacAsset) : null;
  const _rank = tf.commanderRank || "regular";
  const _rankBadge = _rank === "lord"
    ? `<span style="background:#7b1fa222;color:#ce93d8;border:1px solid #7b1fa255;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:bold;letter-spacing:.5px">LORD</span>`
    : _rank === "senior"
    ? `<span style="background:#1a237e22;color:#90caf9;border:1px solid #1a237e55;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:bold;letter-spacing:.5px">SR. TFC</span>`
    : "";
  const commanderSection = `<div style="background:#0d1118;border:1px solid #1e2a1e;border-radius:8px;padding:12px;margin-bottom:16px">
    <div class="sub-divider" style="margin-top:0;margin-bottom:10px">
      <div class="sub-divider-label"><i class="fa-solid fa-person-military-pointing" style="color:#ffd54f;font-size:9px"></i> Task Force Commander</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:17px;font-family:var(--font-display);letter-spacing:.5px;color:${tf.commander?"#fff":"#333"}">${tf.commander ? esc(tf.commander) : "No commander assigned"}</span>
      ${_rankBadge}
    </div>
    <div style="border-top:1px solid #1a2a1a;padding-top:10px">
      <div class="sub-divider" style="margin-top:0;margin-bottom:8px">
        <div class="sub-divider-label"><i class="fa-solid fa-chess" style="color:#ffd54f;font-size:9px"></i> Tactical Asset Provided</div>
        <button class="trait-edit-btn" onclick="openAssetPickerModal('${tf.id}')"><i class="fa-solid fa-${asset?'rotate':'plus'}"></i> ${asset?"Change":"Assign"}</button>
      </div>
      ${asset ? `<div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:bold;color:#fff;margin-bottom:3px">
              ${esc(asset.name)}${_assetFactionPill(asset.faction)}
            </div>
            <div style="margin-bottom:5px">${(asset.use||[]).map(u=>`<span class="use-pill use-${u.toLowerCase()}">${esc(u)}</span>`).join("")}</div>
            <div style="font-size:11px;color:#8b949e;line-height:1.5">${esc(asset.fn)}</div>
          </div>
          <button class="trait-edit-btn" onclick="confirmBtn(this,()=>removeTFAsset('${tf.id}'))">Remove</button>
        </div>
      </div>`
      : `<div style="font-size:12px;color:#444;font-style:italic">No tactical asset assigned</div>`}
    </div>
  </div>`;
  const lim = tfSectionLimits(tf);

  function _slotBadge(count, max, min) {
    if(max === 0) return "";
    const underMin = min > 0 && count < min;
    const full     = count >= max;
    const [color, bg, border] = underMin
      ? ["#ef5350","#200808","#ef535055"]
      : full
      ? ["#ffa726","#1c1000","#ffa72655"]
      : ["#66bb6a","#061406","#66bb6a55"];
    const suffix = underMin ? ` · need ${min-count} more`
                 : full     ? " · full"
                 :            ` · ${max-count} left`;
    return `<span style="font-size:10px;color:${color};background:${bg};border:1px solid ${border};border-radius:3px;padding:1px 7px;white-space:nowrap">${count}/${max}${suffix}</span>`;
  }

  // Per-section status helpers
  function _sectionStatus(role) {
    if(role === "core") {
      const entries = Object.values(lim.coreLimitsByClass).filter(li=>li.max>0);
      if(!entries.length) return {color:"#555",label:"-"};
      const total = entries.reduce((s,li)=>s+li.count,0);
      const max   = entries.reduce((s,li)=>s+li.max,0);
      const anyUnderMin = entries.some(li=>li.min>0&&li.count<li.min);
      const allFull = entries.every(li=>li.count>=li.max);
      if(anyUnderMin) return {color:"#ef5350", label:`⚠ ${total}`};
      if(allFull)     return {color:"#ffa726", label:`${total}u FULL`};
      return {color:"#66bb6a", label:`${total}u`};
    }
    if(role === "specialist") {
      const total = Object.values(lim.specLimitsByClass).reduce((s,v)=>s+v.count,0);
      const max   = Object.values(lim.specLimitsByClass).reduce((s,v)=>s+v.max,0);
      if(!max) return {color:"#555",label:"-"};
      if(total >= max) return {color:"#ffa726",label:`${total}/${max} FULL`};
      return {color:"#66bb6a",label:`${total}/${max}`};
    }
    if(role === "command") {
      if(!lim.cmdMax) return {color:"#555",label:"-"};
      if(lim.cmdCount >= lim.cmdMax) return {color:"#ffa726",label:`${lim.cmdCount}/${lim.cmdMax} FULL`};
      return {color:"#66bb6a",label:`${lim.cmdCount}/${lim.cmdMax}`};
    }
    if(role === "support") {
      if(!lim.suppMax) return {color:"#555",label:"-"};
      if(lim.suppCount >= lim.suppMax) return {color:"#ffa726",label:`${lim.suppCount}/${lim.suppMax} FULL`};
      return {color:"#66bb6a",label:`${lim.suppCount}/${lim.suppMax}`};
    }
    return {color:"#555",label:"-"};
  }

  // Ensure activeTFTab is valid for this TF
  if(!sections.find(s=>s.role===activeTFTab)) activeTFTab = "core";
  const activeSection = sections.find(s=>s.role===activeTFTab);

  // Build tab bar
  const tfTabsHTML = `<div style="display:grid;grid-template-columns:repeat(${sections.length},1fr);gap:1px;background:var(--border-subtle)">
    ${sections.map(({role, label, short}) => {
      const isActive = activeTFTab === role;
      const st = _sectionStatus(role);
      const badge = `<span style="font-size:8px;font-weight:700;color:${st.color};flex-shrink:0;letter-spacing:.3px;white-space:nowrap">${st.label}</span>`;
      const labelHTML = `<span class="tf-tab-full">${label}</span><span class="tf-tab-short">${short||label}</span>`;
      if(isActive) {
        return `<div style="padding:8px 9px;border:none;border-top:2px solid var(--accent);background:var(--surface-page);overflow:hidden;min-width:0">
          <div style="font-family:var(--font-display);font-size:11px;letter-spacing:.4px;color:var(--accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px">${labelHTML}</div>
          ${badge}
        </div>`;
      } else {
        return `<button onclick="selectTFTab('${role}')"
          style="padding:8px 9px;border:none;border-top:2px solid transparent;background:var(--surface-raised);cursor:pointer;text-align:left;overflow:hidden;min-width:0;width:100%;transition:background .12s,border-top-color .12s"
          onmouseover="this.style.background='var(--surface-page)';this.style.borderTopColor='var(--border-default)'"
          onmouseout="this.style.background='var(--surface-raised)';this.style.borderTopColor='transparent'">
          <div style="font-family:var(--font-display);font-size:11px;letter-spacing:.4px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px">${labelHTML}</div>
          ${badge}
        </button>`;
      }
    }).join("")}
  </div>`;

  // Build the body for a given section. Used by the tabbed view (active section
  // only) and the flat view (all sections stacked).
  function _tfSectionBody(section) {
    const {role, label, shClass} = section;
    const slots = (tf.units||[]).filter(u=>u.role===role||(role==="core"&&u.role==="commander"));
    // Limit badges (the detailed pills - the "screenshotted info")
    let limitBadges = "";
    if(role === "core") {
      limitBadges = Object.entries(lim.coreLimitsByClass)
        .filter(([,li]) => li.max > 0)
        .map(([cls, li]) => {
          const underMin = li.min > 0 && li.count < li.min;
          const full     = li.count >= li.max;
          const [color, bg, border] = underMin
            ? ["#ef5350","#200808","#ef535055"]
            : full
            ? ["#ffa726","#1c1000","#ffa72655"]
            : ["#66bb6a","#061406","#66bb6a55"];
          const suffix = underMin ? ` ⚠ min ${li.min}` : full ? " · FULL" : ` · ${li.max-li.count} left`;
          return `<span style="font-size:10px;color:${color};background:${bg};border:1px solid ${border};border-radius:3px;padding:1px 7px;white-space:nowrap">${classLabel(cls)} ${li.count}/${li.max}${suffix}</span>`;
        }).join("");
    } else if(role === "specialist") {
      const specTotal = Object.values(lim.specLimitsByClass).reduce((s,v)=>s+v.count,0);
      const maxTotal  = Object.values(lim.specLimitsByClass).reduce((s,v)=>s+v.max,0);
      limitBadges = _slotBadge(specTotal, maxTotal, 0);
    } else if(role === "command") {
      limitBadges = _slotBadge(lim.cmdCount, lim.cmdMax, 0);
    } else if(role === "support") {
      limitBadges = _slotBadge(lim.suppCount, lim.suppMax, 0);
    }
    let sectionFull = false;
    if(role === "specialist") {
      const specTotal = Object.values(lim.specLimitsByClass).reduce((s,v)=>s+v.count,0);
      const maxTotal  = Object.values(lim.specLimitsByClass).reduce((s,v)=>s+v.max,0);
      sectionFull = maxTotal === 0 || specTotal >= maxTotal;
    } else if(role === "command") {
      sectionFull = lim.cmdMax === 0 || lim.cmdCount >= lim.cmdMax;
    } else if(role === "support") {
      sectionFull = lim.suppCount >= lim.suppMax;
    }
    const slotsContent = slots.length === 0
      ? `<div style="font-size:11px;color:#444;padding:8px 0;font-style:italic;text-align:center">None added yet</div>`
      : slots.map(slot => {
          const u = unitById(slot.unitId);
          if(!u) return `<div class="tf-unit-row"><span style="color:#666">[Deleted Unit]</span><button class="trait-edit-btn" onclick="confirmBtn(this,()=>removeTFSlot('${tf.id}','${slot.id}'))">Remove</button></div>`;
          const typeLabel_ = TYPE_LABELS[slot.unitType||"unit"] || "Unit";
          const canMech = (u.class==="inf"||u.class==="fg");
          const tu = slot.transport ? unitById(slot.transport) : null;
          const mechBtn = canMech
            ? `<button class="trait-edit-btn" onclick="openTransportPickerTF('${tf.id}','${slot.id}')" title="Mechanized transport"${tu?` style="border-color:#66bb6a55;color:#66bb6a;background:#0e1a0e"`:""}><i class="fa-solid fa-truck"></i> ${tu?`${mechanizedCount(u,tu,slot.unitType)}&times; ${esc(tu.name)}`:"Mechanize"}</button>`
            : "";
          const slotActions = `<div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <div class="qty-ctrl">
                <button class="qty-btn" onclick="changeTFSlotQty('${tf.id}','${slot.id}',-1)">−</button>
                <span class="qty-val">${slot.quantity}</span>
                <button class="qty-btn" onclick="changeTFSlotQty('${tf.id}','${slot.id}',1)">+</button>
              </div>
              <span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#1a2030;color:#7eb3ff;border:1px solid #2a3a5a">${esc(typeLabel_)}</span>
              ${mechBtn}
            </div>
            <button class="trait-edit-btn" onclick="confirmBtn(this,()=>removeTFSlot('${tf.id}','${slot.id}'))">Remove</button>
          </div>`;
          return unitCardHTML(u, slotActions, slot.unitType||"unit");
        }).join("");
    return `<div style="padding:12px 14px;background:var(--surface-card)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:${limitBadges?"10px":"12px"}">
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">${limitBadges || `<span style="font-size:10px;color:#555;font-style:italic">No limits defined</span>`}</div>
        <button class="trait-edit-btn" style="flex-shrink:0" onclick="openAddUnitModal('${tf.id}','${role}')" ${sectionFull?`disabled style="opacity:0.4;cursor:not-allowed;flex-shrink:0"`:""}><i class="fa-solid fa-plus"></i> Add</button>
      </div>
      ${slotsContent}
    </div>`;
  }
  const activeSectionHTML = _tfSectionBody(activeSection);

  const tfViewToggleBtn = `<button class="trait-edit-btn" onclick="toggleTFViewMode()" title="${tfViewMode==="flat"?"Switch to tabbed view":"Show all sections at once"}"><i class="fa-solid fa-${tfViewMode==="flat"?"table-columns":"list"}"></i> ${tfViewMode==="flat"?"Tabbed":"Show All"}</button>`;
  // Flat view: every section stacked with its own labelled header
  const tfFlatHTML = `<div style="display:flex;flex-direction:column;gap:10px">
    ${sections.map(section => {
      const st = _sectionStatus(section.role);
      return `<div style="border:1px solid var(--border-default);border-radius:8px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--surface-raised);border-bottom:1px solid var(--border-subtle)">
          <span style="font-family:var(--font-display);font-size:13px;letter-spacing:.5px;color:var(--text-bright)">${section.label}</span>
          <span style="font-size:9px;font-weight:700;color:${st.color};letter-spacing:.3px">${st.label}</span>
        </div>
        ${_tfSectionBody(section)}
      </div>`;
    }).join("")}
  </div>`;

  const slotsHTML = `<div style="margin-bottom:8px">
    <div class="sub-divider" style="margin-top:0">
      <div class="sub-divider-label"><i class="fa-solid fa-layer-group" style="color:var(--accent);font-size:9px"></i> Force Composition</div>
      ${tfViewToggleBtn}
    </div>
    ${tfViewMode==="flat"
      ? tfFlatHTML
      : `<div style="border:1px solid var(--border-default);border-radius:8px;overflow:hidden">
          ${tfTabsHTML}
          <div style="border-top:1px solid var(--border-subtle)">${activeSectionHTML}</div>
        </div>`}
  </div>`;
  const tfOverLimitNow = tf.pointsLimit && pts > tf.pointsLimit;
  const deployedArmy = armyOfTF(tf.id);
  const deployedBadge = deployedArmy
    ? `<span style="font-size:10px;color:#8b949e;display:flex;align-items:center;gap:5px;margin-top:4px">
        <i class="fa-solid fa-shield-halved" style="color:#7986cb;font-size:9px"></i>
        Deployed in <strong style="color:#c5cae9">${esc(deployedArmy.name)}</strong>
       </span>`
    : `<span style="font-size:10px;color:#444;display:flex;align-items:center;gap:5px;margin-top:4px">
        <i class="fa-solid fa-shield-halved" style="font-size:9px"></i>
        Not deployed in any army
       </span>`;
  const breadcrumb = `<div style="margin-bottom:12px">
    <button onclick="backToTFList()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;font-size:13px;display:inline-flex;align-items:center;gap:6px;transition:color .15s" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">
      <i class="fa-solid fa-arrow-left" style="font-size:11px"></i> Task Forces
    </button>
  </div>`;
  panel.innerHTML = breadcrumb + `<div class="card">
    <div class="card-title">
      <div>
        <span>${esc(tf.name)}</span>
        ${deployedBadge}
      </div>
      <div style="display:flex;gap:6px">
        <button class="trait-edit-btn" onclick="openPrintModal('tf','${tf.id}')"><i class="fa-solid fa-print"></i> Print</button>
        <button class="trait-edit-btn" onclick="openSaveTFTemplateModal('${tf.id}')"><i class="fa-solid fa-layer-group"></i> Save as Template</button>
        <button class="trait-edit-btn" onclick="exportTF('${tf.id}')"><i class="fa-solid fa-share-nodes"></i> Export</button>
        <button class="trait-edit-btn" onclick="openEditTFModal('${tf.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteTF('${tf.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    </div>
    <div class="info-strip" style="${tfOverLimitNow?"border-color:#ef535055":""}">
      <div>
        <div class="info-strip-label">Points</div>
        <div class="info-strip-pts" style="${tfOverLimitNow?"color:#ef5350":""}">${pts}${tf.pointsLimit?` <span style="font-size:14px;color:var(--text-muted);font-family:var(--font-body);letter-spacing:0">/ ${tf.pointsLimit}</span>`:""}</div>
        ${tfOverLimitNow?`<div style="font-size:10px;color:#ef5350;font-weight:bold;margin-top:1px"><i class="fa-solid fa-triangle-exclamation"></i> Over limit - ineligible</div>`:""}
      </div>
      <div class="info-strip-sep"></div>
      ${tf.tfType?`<div><div class="info-strip-label">Type</div><div class="info-strip-val" style="color:#7986cb">${esc(_tfTypeLabel(tf.tfType))}</div></div><div class="info-strip-sep"></div>`:""}
      <div><div class="info-strip-label">Units</div><div class="info-strip-val">${(tf.units||[]).reduce((s,u)=>s+u.quantity,0)}</div></div>
      ${tf.faction?`<div class="info-strip-sep"></div><div style="display:flex;align-items:center">${factionPill(tf.faction)}</div>`:""}
    </div>
    ${tf.notes ? `<div style="background:#0d0f14;border:1px solid #1e2530;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px;color:#8b949e;line-height:1.6;font-style:italic">${esc(tf.notes).replace(/\n/g,"<br>")}</div>` : ""}
    ${commanderSection}
    ${slotsHTML}
  </div>`;
}

function openNewTFModal(fromTemplate) {
  editingTFId = null;
  // A plain "New Task Force" must not inherit the template of an earlier,
  // cancelled from-template flow.
  if(!fromTemplate) _newTFTemplateId = null;
  const tmpl = _newTFTemplateId ? (state.tfTemplates||[]).find(t=>t.id===_newTFTemplateId) : null;
  document.getElementById("tf-new-name").value = "";
  document.getElementById("tf-commander").value = "";
  document.getElementById("tf-notes").value = "";
  document.getElementById("tf-points-limit").value = tmpl?.pointsLimit || "";
  clearFieldErr("tf-new-name"); clearFieldErr("tf-commander");
  const titleEl = document.getElementById("modal-tf-title");
  if(tmpl) {
    titleEl.innerHTML = `New Task Force <span style="font-size:11px;color:var(--accent);font-family:var(--font-body);font-weight:normal;letter-spacing:0;text-transform:none;margin-left:6px"><i class="fa-solid fa-layer-group"></i> from "${esc(tmpl.name)}"</span>`;
  } else {
    titleEl.textContent = `New ${T("taskForce")}`;
  }
  document.getElementById("tf-modal-submit").textContent = "Create";
  _populateTFTypeSelect(document.getElementById("tf-type"), tmpl?.tfType || "infantry");
  _populateFactionSelect(document.getElementById("tf-faction"), tmpl?.faction || "");
  openModal("modal-tf");
}

function openEditTFModal(id) {
  const tf = state.taskForces.find(t=>t.id===id);
  if(!tf) return;
  editingTFId = id;
  document.getElementById("tf-new-name").value = tf.name || "";
  document.getElementById("tf-commander").value = tf.commander || "";
  document.getElementById("tf-notes").value = tf.notes || "";
  document.getElementById("tf-points-limit").value = tf.pointsLimit || "";
  clearFieldErr("tf-new-name"); clearFieldErr("tf-commander");
  document.getElementById("modal-tf-title").textContent = `Edit ${T("taskForce")}`;
  document.getElementById("tf-modal-submit").textContent = "Save Changes";
  _populateTFTypeSelect(document.getElementById("tf-type"), tf.tfType || "infantry");
  _populateFactionSelect(document.getElementById("tf-faction"), tf.faction || "");
  openModal("modal-tf");
}

function flashBtn(id, msg, ms=2000) {
  const btn = document.getElementById(id);
  if(!btn) return;
  const orig = btn.textContent;
  btn.textContent = msg;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, ms);
}

function clearFieldErr(id) {
  const el = document.getElementById(id);
  const err = document.getElementById(id+"-err");
  if(el) el.classList.remove("input-error");
  if(err) { err.textContent=""; err.classList.remove("visible"); }
}
function showFieldErr(id, msg) {
  const el = document.getElementById(id);
  const err = document.getElementById(id+"-err");
  if(el) { el.classList.add("input-error"); el.focus(); }
  if(err) { err.textContent=msg; err.classList.add("visible"); }
}
// Inline message strip inside a modal (replaces alert popups).
// `html` may contain markup - caller is responsible for escaping user content.
function modalMsg(id, html) {
  const el = document.getElementById(id);
  if(!el) return;
  if(!html) { el.style.display="none"; el.innerHTML=""; return; }
  el.style.display="block";
  el.innerHTML = `<div style="padding:7px 10px;border-radius:5px;background:#1a0505;border:1px solid #ef535066;color:#ef9a9a;font-size:11px;line-height:1.5;display:flex;align-items:flex-start;gap:7px"><i class="fa-solid fa-triangle-exclamation" style="margin-top:1px;flex-shrink:0;color:#ef5350"></i><div>${html}</div></div>`;
}

function createTaskForce() {
  const name = document.getElementById("tf-new-name").value.trim();
  const commander = document.getElementById("tf-commander").value.trim();
  let invalid = false;
  if(!name)      { showFieldErr("tf-new-name",`${T("taskForce")} name is required.`); invalid=true; }
  if(!commander) { showFieldErr("tf-commander",`${T("taskForce")} ${T("commander")} name is required.`); invalid=true; }
  if(invalid) { if(!name) document.getElementById("tf-new-name").focus(); return; }
  const tfType = document.getElementById("tf-type").value;
  const faction = document.getElementById("tf-faction").value;
  const notes = document.getElementById("tf-notes").value.trim();
  const pointsLimitRaw = parseInt(document.getElementById("tf-points-limit").value, 10);
  const pointsLimit = (!isNaN(pointsLimitRaw) && pointsLimitRaw > 0) ? pointsLimitRaw : null;
  if(editingTFId) {
    const tf = state.taskForces.find(t=>t.id===editingTFId);
    if(tf) { tf.name = name; tf.tfType = tfType; tf.commander = commander; tf.faction = faction; tf.notes = notes; tf.pointsLimit = pointsLimit; }
    editingTFId = null;
    saveState();
    closeModal("modal-tf");
    renderTFDetail();
  } else {
    const tf = { id:"tf_"+uid(), name, tfType, commander, faction, notes, pointsLimit, units:[] };
    if(_newTFTemplateId) {
      const tmpl = (state.tfTemplates||[]).find(t=>t.id===_newTFTemplateId);
      if(tmpl) {
        tf.units = (tmpl.units||[]).map(s=>({
          id:"slot_"+uid(),
          unitId:s.unitId, role:s.role, unitType:s.unitType,
          quantity:s.quantity,
          ...(s.transport ? {transport:s.transport} : {})
        }));
      }
      _newTFTemplateId = null;
    }
    state.taskForces.push(tf);
    saveState();
    closeModal("modal-tf");
    selectTF(tf.id);
  }
}

function deleteTF(id) {
  state.taskForces = state.taskForces.filter(t=>t.id!==id);
  state.armies.forEach(a => { a.taskForceIds = a.taskForceIds.filter(tid=>tid!==id); });
  pruneOrphanedBGEntries();
  const wasCurrent = currentTFId === id;
  if(wasCurrent) currentTFId = null;
  saveState();
  renderArmyList();
  if(currentArmyId) renderArmyDetail();
  if(wasCurrent) {
    backToTFList();
  } else {
    renderTFList();
  }
}

function openAddUnitModal(tfId, role) {
  if(tfId) addUnitTargetTFId = tfId;
  addUnitTargetRole = role || "core";
  addUnitSelectedId = null;
  addUnitSelectedType = "unit";
  addUnitQty = 1;
  const labels = {core:"Core Unit",specialist:"Specialist Stand",command:"Command Stand",support:"Support Unit"};
  document.getElementById("addunit-modal-title").textContent = "Add " + (labels[addUnitTargetRole]||"Unit");
  document.getElementById("addunit-search").value = "";
  document.getElementById("addunit-type-selector").style.display = "none";
  document.getElementById("addunit-confirm-btn").disabled = true;
  addUnitShowUnavailable = false;
  const btn = document.getElementById("addunit-show-unavail-btn");
  if(btn) { btn.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Show Unavailable`; btn.style.cssText = ""; }
  renderAddUnitList();
  openModal("modal-add-unit");
}

function toggleAddUnitShowUnavailable() {
  addUnitShowUnavailable = !addUnitShowUnavailable;
  const btn = document.getElementById("addunit-show-unavail-btn");
  if(btn) {
    btn.innerHTML = addUnitShowUnavailable
      ? `<i class="fa-solid fa-eye"></i> Hide Unavailable`
      : `<i class="fa-solid fa-eye-slash"></i> Show Unavailable`;
    btn.style.background = addUnitShowUnavailable ? "var(--accent-tint)" : "";
    btn.style.borderColor = addUnitShowUnavailable ? "var(--accent)" : "";
    btn.style.color = addUnitShowUnavailable ? "var(--accent)" : "";
  }
  renderAddUnitList();
}

let _addUnitSearchDebounce = null;
function onAddUnitSearchChange() { clearTimeout(_addUnitSearchDebounce); _addUnitSearchDebounce = setTimeout(renderAddUnitList, 150); }
function renderAddUnitList() {
  const search = (document.getElementById("addunit-search")?.value||"").toLowerCase();
  const tf = state.taskForces.find(t=>t.id===addUnitTargetTFId);
  let units = allUnits();
  if(search) units = units.filter(u=>u.name.toLowerCase().includes(search));
  // Filter out units that have no valid type for this section
  units = units.filter(u => availableTypesFor(u.class, addUnitTargetRole).length > 0);
  // Filter out units from other factions if TF has a faction set
  if(tf && tf.faction === "any") { /* no filter - all factions allowed */ }
  else if(tf && tf.faction) { units = units.filter(u => !u.faction || u.faction === tf.faction); }
  else { units = units.filter(u => u.faction === "standard" || !u.faction); }
  const list = document.getElementById("addunit-list");
  const rows = units.map(u => {
    const pts = calcPoints(u);
    const sel = addUnitSelectedId===u.id;
    const canAdd = !tf || canAddToSection(tf, addUnitTargetRole, u.class);
    if(!canAdd && !addUnitShowUnavailable) return "";
    return `<div class="list-row" style="${sel?"border-color:#007eff;background:#1a2a4a":""};${!canAdd?"opacity:0.45":""}" onclick="addUnitSelectedId='${u.id}';addUnitSelectedType='';addUnitQty=1;renderAddUnitList();renderAddUnitTypeSelector()">
      <div>
        ${classBadge(u.class)}
        <span style="font-weight:bold;margin-left:6px;color:${sel?"#007eff":"#fff"}">${esc(u.name)}</span>
        <div style="font-size:11px;color:#8b949e">${pts.unitPts} pts | ${pts.unitSize} stands${!canAdd?" &bull; <span style='color:#ef5350'>section full</span>":""}</div>
      </div>
    </div>`;
  }).join("");
  list.innerHTML = rows || `<div class="empty">No units available for this section.</div>`;
  if(addUnitSelectedId) renderAddUnitTypeSelector();
}

// Human-readable reason a unit can't be added to a section right now. The
// distinction matters most for Specialist/Command, where the block is usually
// "you have no Core units yet" rather than "the section is full".
function addUnitBlockReason(tf, role, unitCls) {
  if(!tf) return "This section is full for this unit type.";
  const lim = tfSectionLimits(tf);
  if(role === "core") {
    const typeSlots = _getTFTypeSlots(tf.tfType);
    const mx = typeSlots ? (typeSlots[unitCls]||[0,0])[1] : 0;
    if(typeSlots && mx === 0) return `${classLabel(unitCls)} units aren't allowed in this task force type.`;
    return `The ${classLabel(unitCls)} core slots are full.`;
  }
  if(role === "specialist") {
    const specLim = lim.specLimitsByClass[unitCls];
    if(!specLim) return `Add a ${classLabel(unitCls)} core unit first - specialists are capped at your core count of that class.`;
    return `Specialist slots for ${classLabel(unitCls)} are full (capped at your core count).`;
  }
  if(role === "command") {
    if(!lim.cmdMax) return `Add more core units first - command stands are limited to half your core count.`;
    return `Command stands are full (${lim.cmdCount}/${lim.cmdMax}).`;
  }
  if(role === "support") {
    return `Support slots are full (${lim.suppCount}/${lim.suppMax}).`;
  }
  return "This section is full for this unit type.";
}

function renderAddUnitTypeSelector() {
  const selectorEl = document.getElementById("addunit-type-selector");
  const optionsEl = document.getElementById("addunit-type-options");
  const warningEl = document.getElementById("addunit-type-warning");
  const confirmBtn = document.getElementById("addunit-confirm-btn");
  const tf = state.taskForces.find(t=>t.id===addUnitTargetTFId);
  if(!addUnitSelectedId) { selectorEl.style.display="none"; if(confirmBtn) confirmBtn.disabled=true; return; }
  const u = unitById(addUnitSelectedId);
  if(!u) { selectorEl.style.display="none"; if(confirmBtn) confirmBtn.disabled=true; return; }
  const types = availableTypesFor(u.class, addUnitTargetRole);
  if(!types.length) { selectorEl.style.display="none"; if(confirmBtn) confirmBtn.disabled=true; return; }
  // Default to first type if none selected or selected type no longer valid
  if(!addUnitSelectedType || !types.includes(addUnitSelectedType)) {
    addUnitSelectedType = types[0];
  }
  const canAdd = !tf || canAddToSection(tf, addUnitTargetRole, u.class);
  const pts = calcPoints(u);
  const typePtsMap = {unit:pts.unitPts, independent:pts.indPts, hero:pts.heroPts, command:pts.cmdPts, cmdHero:pts.cmdHeroPts};
  // Support slots cost +10% - show the price the slot will actually add
  const adj = v => (v != null && addUnitTargetRole === "support") ? GAME.cost.applySupportPremium(v) : v;
  optionsEl.innerHTML = types.map(t => {
    const ptsVal = adj(typePtsMap[t]);
    const sel = addUnitSelectedType === t;
    return `<button onclick="addUnitSelectedType='${t}';renderAddUnitTypeSelector()"
      style="font-family:var(--font-body);font-size:12px;padding:4px 10px;border-radius:12px;border:1px solid ${sel?"#007eff":"#333"};background:${sel?"#1a2a4a":"#111"};color:${sel?"#7eb3ff":"#aaa"};cursor:pointer">
      ${TYPE_LABELS[t]}${ptsVal!=null?` <span style="color:#8b949e;font-size:10px">${ptsVal}pts</span>`:""}
    </button>`;
  }).join("");
  warningEl.style.display = (!canAdd) ? "block" : "none";
  warningEl.textContent = (!canAdd) ? addUnitBlockReason(tf, addUnitTargetRole, u.class) : "";
  confirmBtn.disabled = !canAdd;
  // Quantity control: bound by remaining section capacity
  const remaining = sectionRemainingQty(tf, addUnitTargetRole, u.class);
  const maxQty = isFinite(remaining) ? Math.max(1, remaining) : 99;
  addUnitQty = Math.min(Math.max(1, addUnitQty), maxQty);
  const qtyRow = document.getElementById("addunit-qty-row");
  const qtyVal = document.getElementById("addunit-qty-val");
  const qtyMax = document.getElementById("addunit-qty-max");
  if(qtyRow) qtyRow.style.display = canAdd ? "flex" : "none";
  if(qtyVal) qtyVal.textContent = addUnitQty;
  if(qtyMax) qtyMax.textContent = isFinite(remaining) ? `max ${maxQty}` : "";
  selectorEl.style.display = "block";
}

function changeAddUnitQty(delta) {
  const tf = state.taskForces.find(t=>t.id===addUnitTargetTFId);
  const u = addUnitSelectedId ? unitById(addUnitSelectedId) : null;
  let maxQty = 99;
  if(tf && u) {
    const r = sectionRemainingQty(tf, addUnitTargetRole, u.class);
    maxQty = isFinite(r) ? Math.max(1, r) : 99;
  }
  addUnitQty = Math.min(Math.max(1, addUnitQty + delta), maxQty);
  const qtyVal = document.getElementById("addunit-qty-val");
  if(qtyVal) qtyVal.textContent = addUnitQty;
}

function confirmAddUnit() {
  if(!addUnitSelectedId) { return; }
  const tf = state.taskForces.find(t=>t.id===addUnitTargetTFId);
  if(!tf) { return; }
  const u = unitById(addUnitSelectedId);
  if(!u) return;
  if(!canAddToSection(tf, addUnitTargetRole, u.class)) { return; }
  const types = availableTypesFor(u.class, addUnitTargetRole);
  const unitType = types.includes(addUnitSelectedType) ? addUnitSelectedType : (types[0] || "unit");
  const remaining = sectionRemainingQty(tf, addUnitTargetRole, u.class);
  const addQty = Math.max(1, Math.min(addUnitQty, isFinite(remaining) ? remaining : addUnitQty));
  const existing = (tf.units||[]).find(s => s.unitId === addUnitSelectedId && s.role === addUnitTargetRole && s.unitType === unitType);
  if(existing) {
    existing.quantity = (existing.quantity || 1) + addQty;
  } else {
    tf.units.push({id:"slot_"+uid(), unitId:addUnitSelectedId, role:addUnitTargetRole, unitType, quantity:addQty});
  }
  saveState();
  closeModal("modal-add-unit");
  if(currentTFId===addUnitTargetTFId) renderTFDetail();
  renderTFList();
}

function removeTFSlot(tfId, slotId) {
  const tf = state.taskForces.find(t=>t.id===tfId);
  if(!tf) return;
  tf.units = tf.units.filter(u=>u.id!==slotId);
  pruneOrphanedBGEntries();
  saveState();
  renderTFList();
  renderTFDetail();
  if(currentArmyId) renderArmyDetail();
}

function changeTFSlotQty(tfId, slotId, delta) {
  const tf = state.taskForces.find(t=>t.id===tfId);
  if(!tf) return;
  const slot = tf.units.find(u=>u.id===slotId);
  if(!slot) return;
  const maxQty = maxQtyForSlot(tf, slot);
  slot.quantity = Math.max(1, Math.min(slot.quantity+delta, maxQty));
  clampArmyAssignments(slot.id, slot.quantity);
  saveState();
  renderTFList();
  renderTFDetail();
  if(currentArmyId) renderArmyDetail();
}

function changeTFSlotRole(tfId, slotId, role) {
  const tf = state.taskForces.find(t=>t.id===tfId);
  if(!tf) return;
  const slot = tf.units.find(u=>u.id===slotId);
  if(!slot) return;
  slot.role = role;
  saveState();
  renderTFList();
  renderTFDetail();
}

// ---- Custom TF Types ----
function openCustomTFTypeModal() {
  editingCustomTFTypeId = null;
  clearFieldErr("custom-tf-type-name"); clearFieldErr("custom-tf-type-slots");
  document.getElementById("custom-tf-type-name").value = "";
  document.getElementById("custom-tf-type-form-title").textContent = T("taskForceType");
  document.getElementById("custom-tf-type-submit").textContent = "Create";
  document.getElementById("custom-tf-type-cancel").style.display = "none";
  _renderCustomTFTypeSlots({});
  _renderCustomTFTypeList();
  openModal("modal-custom-tf-type");
}

function cancelEditCustomTFType() {
  editingCustomTFTypeId = null;
  clearFieldErr("custom-tf-type-name"); clearFieldErr("custom-tf-type-slots");
  document.getElementById("custom-tf-type-name").value = "";
  document.getElementById("custom-tf-type-form-title").textContent = T("taskForceType");
  document.getElementById("custom-tf-type-submit").textContent = "Create";
  document.getElementById("custom-tf-type-cancel").style.display = "none";
  _renderCustomTFTypeSlots({});
}



function _renderCustomTFTypeSlots(slots) {
  const el = document.getElementById("custom-tf-type-slots");
  const nums = [0,1,2,3,4,5];
  el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="color:#8b949e"><th style="text-align:left;padding:3px 6px">Class</th><th style="padding:3px 6px">Min</th><th style="padding:3px 6px">Max</th></tr></thead>
    <tbody>${_TF_CLASS_KEYS.map(k=>{
      const cur = slots[k]||[0,0];
      return `<tr>
        <td style="padding:3px 6px;color:#e0e0e0">${_TF_CLASS_NAMES[k]}</td>
        <td style="padding:3px 6px"><select id="ctft-min-${k}" onchange="_updateCustomTFTypeSaveBtn()" style="background:#0d1117;border:1px solid #30363d;color:#e0e0e0;border-radius:4px;padding:2px 4px">${nums.map(n=>`<option${n===cur[0]?" selected":""}>${n}</option>`).join("")}</select></td>
        <td style="padding:3px 6px"><select id="ctft-max-${k}" onchange="_updateCustomTFTypeSaveBtn()" style="background:#0d1117;border:1px solid #30363d;color:#e0e0e0;border-radius:4px;padding:2px 4px">${nums.map(n=>`<option${n===cur[1]?" selected":""}>${n}</option>`).join("")}</select></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

// Live-clears the slots requirement error as the user raises a max above 0.
function _updateCustomTFTypeSaveBtn() {
  const anySet = _TF_CLASS_KEYS.some(k => parseInt(document.getElementById(`ctft-max-${k}`)?.value||0) > 0);
  if(anySet) clearFieldErr("custom-tf-type-slots");
}

function _renderCustomTFTypeList() {
  const el = document.getElementById("custom-tf-type-list");
  if(!state.customTFTypes.length) { el.innerHTML = `<div style="color:var(--text-inactive);font-size:12px;margin-bottom:4px">No custom types yet.</div>`; return; }
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">`
    + state.customTFTypes.map(t=>{
      const slotSummary = _TF_CLASS_KEYS
        .filter(k => t.slots && t.slots[k] && t.slots[k][1] > 0)
        .map(k => `${_TF_CLASS_NAMES[k]}: ${t.slots[k][0]}–${t.slots[k][1]}`)
        .join(", ");
      return `<div class="custom-trait-item">
        <div style="flex:1;min-width:0">
          <div style="font-weight:bold;color:var(--text-primary);font-size:13px">${esc(t.name)}</div>
          ${slotSummary?`<div style="font-size:10px;color:#8b949e;margin-top:2px">${slotSummary}</div>`:""}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
          <button class="trait-edit-btn" onclick="editCustomTFType('${t.id}')"><i class="fa-solid fa-pencil"></i> Edit</button>
          <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteCustomTFType('${t.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      </div>`;
    }).join("")
    + `</div>`;
}

function editCustomTFType(id) {
  const t = state.customTFTypes.find(x=>x.id===id);
  if(!t) return;
  editingCustomTFTypeId = id;
  clearFieldErr("custom-tf-type-name"); clearFieldErr("custom-tf-type-slots");
  document.getElementById("custom-tf-type-name").value = t.name;
  document.getElementById("custom-tf-type-form-title").textContent = `Edit ${T("taskForceType")}`;
  document.getElementById("custom-tf-type-submit").textContent = "Save Changes";
  document.getElementById("custom-tf-type-cancel").style.display = "";
  _renderCustomTFTypeSlots(t.slots||{});
  document.getElementById("custom-tf-type-name").focus();
}

function saveCustomTFType() {
  const name = document.getElementById("custom-tf-type-name").value.trim();
  if(!name) { showFieldErr("custom-tf-type-name","Enter a type name."); return; }
  const slots = {};
  _TF_CLASS_KEYS.forEach(k => {
    const mn = parseInt(document.getElementById(`ctft-min-${k}`).value)||0;
    const mx = parseInt(document.getElementById(`ctft-max-${k}`).value)||0;
    slots[k] = [mn, Math.max(mn,mx)];
  });
  if(!_TF_CLASS_KEYS.some(k => slots[k][1] > 0)) { showFieldErr("custom-tf-type-slots","At least one class must have a max greater than 0."); return; }
  if(editingCustomTFTypeId) {
    const t = state.customTFTypes.find(x=>x.id===editingCustomTFTypeId);
    if(t) { t.name = name; t.slots = slots; }
    editingCustomTFTypeId = null;
    document.getElementById("custom-tf-type-form-title").textContent = T("taskForceType");
    document.getElementById("custom-tf-type-submit").textContent = "Create";
    document.getElementById("custom-tf-type-cancel").style.display = "none";
  } else {
    state.customTFTypes.push({id:"ctft_"+uid(), name, slots});
  }
  saveState();
  clearFieldErr("custom-tf-type-name"); clearFieldErr("custom-tf-type-slots");
  document.getElementById("custom-tf-type-name").value = "";
  _renderCustomTFTypeSlots({});
  _renderCustomTFTypeList();
  _populateTFTypeSelect(document.getElementById("tf-type"), document.getElementById("tf-type").value);
}

function deleteCustomTFType(id) {
  // Block deletion while task forces still use the type - a dangling tfType
  // would silently void every section limit on those TFs.
  const users = (state.taskForces||[]).filter(tf=>tf.tfType===id);
  if(users.length) {
    showToast(`This type is used by ${users.length} task force${users.length!==1?"s":""} (${users[0].name}${users.length>1?", …":""}). Change their type first.`);
    return;
  }
  state.customTFTypes = state.customTFTypes.filter(t=>t.id!==id);
  if(editingCustomTFTypeId===id) {
    editingCustomTFTypeId = null;
    clearFieldErr("custom-tf-type-name"); clearFieldErr("custom-tf-type-slots");
    document.getElementById("custom-tf-type-form-title").textContent = T("taskForceType");
    document.getElementById("custom-tf-type-submit").textContent = "Create";
    document.getElementById("custom-tf-type-cancel").style.display = "none";
    document.getElementById("custom-tf-type-name").value = "";
    _renderCustomTFTypeSlots({});
  }
  saveState();
  _renderCustomTFTypeList();
  _populateTFTypeSelect(document.getElementById("tf-type"), document.getElementById("tf-type").value);
}

// ---- Task Force templates ----

function openSaveTFTemplateModal(tfId) {
  const tf = state.taskForces.find(t=>t.id===tfId);
  if(!tf) return;
  _savingTFTemplateFromId = tfId;
  clearFieldErr("tf-template-save-name");
  document.getElementById("tf-template-save-name").value = tf.name;
  openModal("modal-tf-save-template");
  setTimeout(()=>{
    const inp = document.getElementById("tf-template-save-name");
    if(inp){ inp.focus(); inp.select(); }
  }, 80);
}

function saveTFTemplate() {
  const name = (document.getElementById("tf-template-save-name")?.value||"").trim();
  if(!name){ showFieldErr("tf-template-save-name","Template name is required."); return; }
  const tf = state.taskForces.find(t=>t.id===_savingTFTemplateFromId);
  if(!tf){ closeModal("modal-tf-save-template"); return; }
  const template = {
    id: "tft_"+uid(),
    name,
    tfType: tf.tfType||"",
    faction: tf.faction||"",
    pointsLimit: tf.pointsLimit||null,
    // Strip slot IDs - they'll be regenerated on use
    units: (tf.units||[]).map(s=>({unitId:s.unitId, role:s.role, unitType:s.unitType, quantity:s.quantity, transport:s.transport||undefined}))
  };
  state.tfTemplates = state.tfTemplates || [];
  state.tfTemplates.push(template);
  saveState();
  closeModal("modal-tf-save-template");
  _savingTFTemplateFromId = null;
  _updateTFTemplatesBadge();
  // Flash confirmation on the Save as Template button in the detail view
  const btn = document.querySelector(`#tf-detail-panel button[onclick*="openSaveTFTemplateModal"]`);
  if(btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
    btn.style.borderColor="#66bb6a55"; btn.style.color="#66bb6a";
    setTimeout(()=>{ btn.innerHTML=orig; btn.style.borderColor=""; btn.style.color=""; }, 1500);
  }
}

function _updateTFTemplatesBadge() {
  const btn = document.getElementById("btn-tf-templates");
  if(!btn) return;
  const n = (state.tfTemplates||[]).length;
  btn.innerHTML = n
    ? `<i class="fa-solid fa-layer-group"></i> Templates <span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--accent);color:#fff;font-size:9px;font-weight:bold;margin-left:2px">${n}</span>`
    : `<i class="fa-solid fa-layer-group"></i> Templates`;
}

function openTFTemplatesModal() {
  _renderTFTemplateList();
  openModal("modal-tf-templates");
}

function _renderTFTemplateList() {
  const el = document.getElementById("tf-template-list");
  if(!el) return;
  const templates = state.tfTemplates || [];
  if(!templates.length) {
    el.innerHTML = `<div class="empty" style="padding:32px 0">
      <div class="empty-icon"><i class="fa-solid fa-layer-group"></i></div>
      <p>No templates saved yet.</p>
      <p style="font-size:12px;color:var(--text-faint)">Open any task force and click <strong>Save as Template</strong> to create one.</p>
    </div>`;
    return;
  }
  el.innerHTML = templates.map(t=>{
    const typeLabel = t.tfType ? _tfTypeLabel(t.tfType) : "";
    const facPill = t.faction ? factionPill(t.faction) : "";
    const unitCount = (t.units||[]).reduce((s,u)=>s+u.quantity,0);
    const roleBreakdown = ["core","specialist","command","support"].map(role=>{
      const n = (t.units||[]).filter(u=>u.role===role).reduce((s,u)=>s+u.quantity,0);
      return n ? `${n} ${role}` : null;
    }).filter(Boolean).join(" · ") || "empty";
    // Estimated pts
    const estPts = (t.units||[]).reduce((sum,slot)=>{
      const u = unitById(slot.unitId);
      if(!u) return sum;
      const pts = calcPoints(u);
      const typeKey = {unit:"unitPts",independent:"indPts",hero:"heroPts",command:"cmdPts",cmdHero:"cmdHeroPts"}[slot.unitType||"unit"];
      return sum + ((pts[typeKey]??pts.unitPts)??0)*slot.quantity;
    },0);
    const missingUnits = (t.units||[]).filter(s=>!unitById(s.unitId)).length;
    const warnHTML = missingUnits ? `<div style="font-size:10px;color:#ffa726;margin-top:3px"><i class="fa-solid fa-triangle-exclamation"></i> ${missingUnits} unit${missingUnits!==1?"s":""} no longer in library</div>` : "";
    return `<div style="background:var(--surface-card);border:1px solid var(--border-default);border-radius:8px;padding:12px 14px;margin-bottom:10px;display:flex;align-items:flex-start;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-family:var(--font-display);font-size:17px;color:var(--text-bright)">${esc(t.name)}</span>
          ${typeLabel?`<span style="font-size:10px;padding:1px 7px;border-radius:8px;background:#1a2030;color:#7986cb;border:1px solid #2a3a5a;font-weight:bold">${esc(typeLabel)}</span>`:""}
          ${facPill}
        </div>
        <div style="font-size:11px;color:var(--text-muted)">${roleBreakdown} &bull; ~${estPts} pts</div>
        ${warnHTML}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0;align-items:flex-end">
        <button class="btn btn-primary btn-sm" onclick="useTFTemplate('${t.id}')"><i class="fa-solid fa-plus"></i> Use</button>
        <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a;font-size:10px" onclick="confirmBtn(this,()=>deleteTFTemplate('${t.id}'))"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join("");
}

function useTFTemplate(templateId) {
  _newTFTemplateId = templateId;
  closeModal("modal-tf-templates");
  openNewTFModal(true);
}

function deleteTFTemplate(id) {
  state.tfTemplates = (state.tfTemplates||[]).filter(t=>t.id!==id);
  saveState();
  _renderTFTemplateList();
  _updateTFTemplatesBadge();
}

// ---- Task Force export / import ----
function collectTFBundle(tfId) {
  const tf = (state.taskForces||[]).find(t=>t.id===tfId);
  if(!tf) return null;
  const unitIdSet = new Set();
  (tf.units||[]).forEach(slot=>{
    if(slot.unitId) unitIdSet.add(slot.unitId);
    if(slot.transport) unitIdSet.add(slot.transport);
  });
  const customUnits = (state.customUnits||[]).filter(u=>unitIdSet.has(u.id));
  const traitNames = new Set();
  customUnits.forEach(u=>{
    (u.standTraits||[]).forEach(t=>{ if(t&&t[0]!=null) traitNames.add(String(t[0]).toLowerCase()); });
    (u.weapons||[]).forEach(w=>(w.traits||[]).forEach(t=>{ if(t&&t[0]!=null) traitNames.add(String(t[0]).toLowerCase()); }));
  });
  const customTraits = (state.customTraits||[]).filter(t=>traitNames.has(String(t.name).toLowerCase()));
  const facIdSet = new Set(customUnits.map(u=>u.faction).filter(Boolean));
  if(tf.faction) facIdSet.add(tf.faction);
  customTraits.forEach(t=>{
    if(t.faction) facIdSet.add(t.faction);
    (t.reqs||[]).forEach(r=>{ if(r&&r.type==="faction") (r.vals||[]).forEach(v=>facIdSet.add(v)); });
  });
  const customFactions = (state.customFactions||[]).filter(f=>facIdSet.has(f.id));
  const customTFTypes = [];
  if(tf.tfType && (state.customTFTypes||[]).some(ct=>ct.id===tf.tfType)) {
    const ct = state.customTFTypes.find(t=>t.id===tf.tfType);
    if(ct) customTFTypes.push(ct);
  }
  const customTacticalAssets = [];
  if(tf.tacAsset && tf.tacAsset.startsWith("custom_")) {
    const bareId = tf.tacAsset.slice(7);
    const asset = (state.customTacticalAssets||[]).find(a=>a.id===bareId);
    if(asset) customTacticalAssets.push(asset);
  }
  return { taskForce:tf, customTFTypes, customTacticalAssets, customUnits, customFactions, customTraits };
}

function exportTF(tfId) {
  const bundle = collectTFBundle(tfId);
  if(!bundle) return;
  const payload = {
    app:appTag(), kind:"taskforce", version:1,
    exportedAt:new Date().toISOString(), tfName:bundle.taskForce.name,
    data:bundle
  };
  const json = JSON.stringify(payload, null, 2);
  const ta = document.getElementById("export-json-text");
  if(ta) ta.value = json;
  const ttl = document.getElementById("export-json-title");
  if(ttl) ttl.textContent = `Export - ${bundle.taskForce.name}`;
  const sum = document.getElementById("export-json-summary");
  if(sum) {
    const parts = [];
    if(bundle.customUnits.length) parts.push(`${bundle.customUnits.length} custom unit${bundle.customUnits.length!==1?"s":""}`);
    if(bundle.customFactions.length) parts.push(`${bundle.customFactions.length} custom faction${bundle.customFactions.length!==1?"s":""}`);
    if(bundle.customTraits.length) parts.push(`${bundle.customTraits.length} custom trait${bundle.customTraits.length!==1?"s":""}`);
    if(bundle.customTFTypes.length) parts.push(`${bundle.customTFTypes.length} custom task force type`);
    if(bundle.customTacticalAssets.length) parts.push(`${bundle.customTacticalAssets.length} custom asset${bundle.customTacticalAssets.length!==1?"s":""}`);
    sum.textContent = parts.length ? parts.join(", ") : "no custom dependencies";
  }
  const copyBtn = document.getElementById("export-copy-btn");
  if(copyBtn){ copyBtn.innerHTML='<i class="fa-solid fa-copy"></i> Copy to clipboard'; copyBtn.disabled=false; }
  openModal("modal-export-json");
}

function openImportTFModal() {
  const ta = document.getElementById("import-tf-text");
  if(ta) ta.value = "";
  const prev = document.getElementById("import-tf-preview");
  if(prev) prev.style.display = "none";
  _dataHideMsg("import-tf-msg");
  const btn = document.getElementById("import-tf-btn");
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-upload"></i> Import Task Force'; }
  _pendingTFImport = null;
  openModal("modal-import-tf");
}

let _pendingTFImport = null;
let _importTFDebounce = null;
function onImportTFTextChange() {
  clearTimeout(_importTFDebounce);
  _importTFDebounce = setTimeout(_parseImportTFText, 120);
}

function _parseImportTFText() {
  const ta = document.getElementById("import-tf-text");
  const btn = document.getElementById("import-tf-btn");
  const prev = document.getElementById("import-tf-preview");
  _pendingTFImport = null;
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-upload"></i> Import Task Force'; }
  _dataHideMsg("import-tf-msg");
  if(prev) prev.style.display = "none";
  const raw = ta && ta.value.trim();
  if(!raw) return;
  let payload;
  try { payload = JSON.parse(raw); }
  catch(e){ _dataMsg("import-tf-msg","error","Not valid JSON - check for missing brackets or commas."); return; }
  if(!payload||!importTagOk(payload.app)||!payload.data){
    _dataMsg("import-tf-msg","error","This doesn't look like a LaserStorm export - missing required fields."); return;
  }
  if(payload.kind!=="taskforce"){
    _dataMsg("import-tf-msg","error",`This is a <strong>${esc(payload.kind)}</strong> export, not a task force export. Use the appropriate importer.`); return;
  }
  const d = payload.data;
  const tf = d.taskForce||{};
  const parts = [
    `<strong>${esc(tf.name||`Unnamed ${T("taskForce")}`)}</strong>`,
    tf.tfType ? `type: ${esc(_tfTypeLabel(tf.tfType))}` : null,
    tf.faction ? `faction: ${esc(factionName(tf.faction)||tf.faction)}` : null,
    d.customUnits&&d.customUnits.length ? `${d.customUnits.length} custom unit${d.customUnits.length!==1?"s":""}` : null,
    d.customFactions&&d.customFactions.length ? `${d.customFactions.length} custom faction${d.customFactions.length!==1?"s":""}` : null,
    d.customTraits&&d.customTraits.length ? `${d.customTraits.length} custom trait${d.customTraits.length!==1?"s":""}` : null,
    d.customTFTypes&&d.customTFTypes.length ? `${d.customTFTypes.length} custom task force type` : null,
    d.customTacticalAssets&&d.customTacticalAssets.length ? `${d.customTacticalAssets.length} custom asset${d.customTacticalAssets.length!==1?"s":""}` : null,
  ].filter(Boolean);
  if(prev){ prev.innerHTML = parts.join(" &bull; "); prev.style.display=""; }
  if(btn) btn.disabled = false;
  _pendingTFImport = payload;
}

function doImportTF() {
  if(!_pendingTFImport||_pendingTFImport.kind!=="taskforce"){ _dataMsg("import-tf-msg","error","Paste valid task force JSON first."); return; }
  const newTF = importTF(_pendingTFImport);
  if(!newTF){ _dataMsg("import-tf-msg","error","This task force export is missing its task force data and can't be imported."); return; }
  closeModal("modal-import-tf");
  selectTF(newTF.id);
}

function importTF(payload) {
  const d = payload.data;
  if(!d || !d.taskForce) return null;
  _normalizeBundle(d);

  // 1. Merge factions (dedup by name)
  const facById = new Map((state.customFactions||[]).map(f=>[f.id,f]));
  const facByName = new Map((state.customFactions||[]).map(f=>[String(f.name).toLowerCase(),f]));
  const facIdMap = {};
  (d.customFactions||[]).forEach(f=>{
    const k = String(f.name||"").toLowerCase();
    const ex = facByName.get(k);
    if(ex){ facIdMap[f.id]=ex.id; return; }
    let newId = (!safeImportId(f.id)||facById.has(f.id)) ? "fac_"+uid() : f.id;
    const nf = Object.assign({},f,{id:newId});
    state.customFactions.push(nf); facById.set(newId,nf); facByName.set(k,nf);
    facIdMap[f.id]=newId;
  });
  const remapFac = id=>(id&&facIdMap[id])?facIdMap[id]:id;

  // 2. Merge traits (dedup by name)
  const traitByName = new Map((state.customTraits||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const traitById = new Set((state.customTraits||[]).map(t=>t.id));
  (d.customTraits||[]).forEach(t=>{
    const k = String(t.name||"").toLowerCase();
    if(traitByName.has(k)) return;
    let newId = (!safeImportId(t.id)||traitById.has(t.id)) ? uid() : t.id;
    const nt = Object.assign({},t,{id:newId});
    if(nt.faction) nt.faction=remapFac(nt.faction);
    if(Array.isArray(nt.reqs)) nt.reqs=nt.reqs.map(r=>(r&&r.type==="faction"&&Array.isArray(r.vals))?Object.assign({},r,{vals:r.vals.map(remapFac)}):r);
    state.customTraits.push(nt); traitByName.set(k,nt); traitById.add(newId);
  });

  // 3. Merge units (dedup by name+faction combo)
  const unitByIdMap = new Map((state.customUnits||[]).map(u=>[u.id,u]));
  const unitKey = u=>String(u.name||"").toLowerCase()+"||"+String(u.faction||"").toLowerCase();
  const unitKeyToId = new Map((state.customUnits||[]).map(u=>[unitKey(u),u.id]));
  const unitIdMap = {};
  (d.customUnits||[]).forEach(u=>{
    const nu = Object.assign({},u,{faction:remapFac(u.faction)});
    const k = unitKey(nu);
    if(unitKeyToId.has(k)){ unitIdMap[u.id]=unitKeyToId.get(k); return; }
    let newId = (!safeImportId(nu.id)||unitByIdMap.has(nu.id)) ? "custom_"+uid() : nu.id;
    nu.id=newId;
    if(typeof migrateCustomUnit==="function") migrateCustomUnit(nu);
    state.customUnits.push(nu); unitByIdMap.set(newId,nu); unitKeyToId.set(k,newId);
    unitIdMap[u.id]=newId;
  });
  const remapUnit = id=>(id&&unitIdMap[id])?unitIdMap[id]:id;

  // 4. Merge custom TF types (dedup by name)
  const tfTypeByName = new Map((state.customTFTypes||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const tfTypeById = new Map((state.customTFTypes||[]).map(t=>[t.id,t]));
  const tfTypeIdMap = {};
  (d.customTFTypes||[]).forEach(t=>{
    const k = String(t.name||"").toLowerCase();
    const ex = tfTypeByName.get(k);
    if(ex){ tfTypeIdMap[t.id]=ex.id; return; }
    let newId = (!safeImportId(t.id)||tfTypeById.has(t.id)) ? "ctft_"+uid() : t.id;
    const nt = Object.assign({},t,{id:newId});
    state.customTFTypes.push(nt); tfTypeByName.set(k,nt); tfTypeById.set(newId,nt);
    tfTypeIdMap[t.id]=newId;
  });
  const remapTFType = id=>(id&&tfTypeIdMap[id])?tfTypeIdMap[id]:id;

  // 5. Merge custom tactical assets (dedup by name)
  const assetByName = new Map((state.customTacticalAssets||[]).map(a=>[String(a.name).toLowerCase(),a]));
  const assetById = new Map((state.customTacticalAssets||[]).map(a=>[a.id,a]));
  const assetIdMap = {};
  (d.customTacticalAssets||[]).forEach(a=>{
    const k = String(a.name||"").toLowerCase();
    const ex = assetByName.get(k);
    if(ex){ assetIdMap[a.id]=ex.id; return; }
    let newId = (!safeImportId(a.id)||assetById.has(a.id)) ? uid() : a.id;
    const na = Object.assign({},a,{id:newId});
    state.customTacticalAssets.push(na); assetByName.set(k,na); assetById.set(newId,na);
    assetIdMap[a.id]=newId;
  });
  const remapTacAsset = raw=>{
    if(!raw) return raw;
    if(raw.startsWith("custom_")){ const bare=raw.slice(7); return "custom_"+(assetIdMap[bare]||bare); }
    return raw;
  };

  // 6. Import the task force with a fresh ID
  const orig = d.taskForce;
  const newTF = Object.assign({},orig,{
    id:"tf_"+uid(),
    tfType:remapTFType(orig.tfType),
    tacAsset:remapTacAsset(orig.tacAsset),
    faction:remapFac(orig.faction),
    units:(orig.units||[]).map(slot=>Object.assign({},slot,{
      id:"slot_"+uid(),
      unitId:remapUnit(slot.unitId),
      transport:slot.transport?remapUnit(slot.transport):slot.transport
    }))
  });
  state.taskForces.push(newTF);
  saveState();
  return newTF;
}

// ============================================================
// TACTICAL ASSETS
// ============================================================
function allTacticalAssets() {
  const custom = (state.customTacticalAssets||[]).map(a=>({...a, id:"custom_"+a.id, custom:true}));
  return [...TACTICAL_ASSETS, ...custom];
}

function _assetUsePills(useArr) {
  return (useArr||[]).map(u=>`<span class="use-pill use-${u.toLowerCase()}">${esc(u)}</span>`).join("");
}

function _assetFactionPill(faction) {
  return factionPill(faction, {marginLeft:true, small:true});
}

function openAssetPickerModal(tfId) {
  assetPickerTFId = tfId;
  const tf = state.taskForces.find(t=>t.id===tfId);
  assetPickerSelectedId = tf?.tacAsset || null;
  document.getElementById("asset-picker-search").value = "";
  renderAssetPickerList();
  openModal("modal-asset-picker");
}

function renderAssetPickerList() {
  const search = (document.getElementById("asset-picker-search")?.value||"").toLowerCase();
  const tf = state.taskForces.find(t=>t.id===assetPickerTFId);
  const tfFaction = tf?.faction || null;
  let assets = allTacticalAssets().filter(a => {
    // Filter by faction: faction-locked assets only available when the TF
    // faction matches; a TF open to "any" faction may take all of them
    if(a.faction && tfFaction !== "any" && a.faction !== tfFaction) return false;
    if(search && !a.name.toLowerCase().includes(search) && !a.fn.toLowerCase().includes(search)) return false;
    return true;
  });
  const list = document.getElementById("asset-picker-list");
  const confBtn = document.getElementById("asset-picker-confirm-btn");
  if(!assets.length) {
    list.innerHTML = `<div class="empty">No assets available for this faction.</div>`;
    if(confBtn) confBtn.disabled = true;
    return;
  }
  list.innerHTML = assets.map(a => {
    const sel = assetPickerSelectedId === a.id;
    return `<div class="list-row" style="${sel?"border-color:#007eff;background:#1a2a1a":""}" onclick="assetPickerSelectedId='${a.id}';renderAssetPickerList()">
      <div style="flex:1;min-width:0">
        <div style="font-weight:bold;color:${sel?"#4caf50":"#fff"};margin-bottom:2px">${esc(a.name)}${_assetFactionPill(a.faction)}${a.custom?`<span style="font-size:10px;color:#7986cb;margin-left:4px">Custom</span>`:""}</div>
        <div style="margin-bottom:3px">${_assetUsePills(a.use)}</div>
        <div style="font-size:11px;color:#8b949e;line-height:1.4">${esc(a.fn)}</div>
      </div>
    </div>`;
  }).join("");
  if(confBtn) confBtn.disabled = !assetPickerSelectedId;
}

function confirmAssetPick() {
  if(!assetPickerSelectedId) { return; }
  const tf = state.taskForces.find(t=>t.id===assetPickerTFId);
  if(!tf) return;
  tf.tacAsset = assetPickerSelectedId;
  saveState();
  closeModal("modal-asset-picker");
  if(currentTFId===assetPickerTFId) renderTFDetail();
}

function removeTFAsset(tfId) {
  const tf = state.taskForces.find(t=>t.id===tfId);
  if(!tf) return;
  tf.tacAsset = null;
  saveState();
  if(currentTFId===tfId) renderTFDetail();
}

// ---- Custom Tactical Assets ----
function openCustomAssetsModal() {
  editingCustomAssetId = null;
  // Rebuild faction select with custom factions
  const sel = document.getElementById("custom-asset-faction");
  const custom = (state.customFactions||[]).map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join("");
  sel.innerHTML = `<option value="">None (any faction)</option>
    <option value="standard">Standard</option>
    <option value="precursor">Precursor</option>
    <option value="soulless">Soulless</option>
    <option value="swarm">Swarm</option>
    <option value="warrior">Warrior</option>
    ${custom}`;
  _resetCustomAssetForm();
  _renderCustomAssetList();
  openModal("modal-custom-assets");
}

function _resetCustomAssetForm() {
  clearFieldErr("custom-asset-name"); clearFieldErr("custom-asset-use"); clearFieldErr("custom-asset-fn");
  document.getElementById("custom-asset-name").value = "";
  document.getElementById("custom-asset-faction").value = "";
  document.getElementById("ca-use-activation").checked = false;
  document.getElementById("ca-use-deployment").checked = false;
  document.getElementById("ca-use-reinforcements").checked = false;
  document.getElementById("custom-asset-fn").value = "";
  document.getElementById("custom-asset-form-title").textContent = "New Tactical Asset";
  document.getElementById("custom-asset-submit").textContent = "Create";
  document.getElementById("custom-asset-cancel").style.display = "none";
}

// Live-clears the use / function errors as the user fills those fields.
function _updateCustomAssetSaveBtn() {
  const hasUse = document.getElementById("ca-use-activation")?.checked
    || document.getElementById("ca-use-deployment")?.checked
    || document.getElementById("ca-use-reinforcements")?.checked;
  const hasFn = (document.getElementById("custom-asset-fn")?.value||"").trim();
  if(hasUse) clearFieldErr("custom-asset-use");
  if(hasFn) clearFieldErr("custom-asset-fn");
}

function _renderCustomAssetList() {
  const el = document.getElementById("custom-asset-list");
  const assets = state.customTacticalAssets||[];
  if(!assets.length) { el.innerHTML = `<div style="color:var(--text-inactive);font-size:12px;margin-bottom:4px">No custom assets yet.</div>`; return; }
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px">`
    + assets.map(a=>`<div class="custom-trait-item">
      <div style="flex:1;min-width:0">
        <div style="font-weight:bold;color:var(--text-primary);font-size:13px">${esc(a.name)}${_assetFactionPill(a.faction)}</div>
        <div style="margin-top:2px">${_assetUsePills(a.use)}</div>
        ${a.fn?`<div style="font-size:10px;color:#8b949e;font-style:italic;margin-top:3px">${esc(a.fn)}</div>`:""}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
        <button class="trait-edit-btn" onclick="editCustomAsset('${a.id}')"><i class="fa-solid fa-pencil"></i> Edit</button>
        <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteCustomAsset('${a.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    </div>`).join("")
    + `</div>`;
}

function editCustomAsset(id) {
  const a = (state.customTacticalAssets||[]).find(x=>x.id===id);
  if(!a) return;
  editingCustomAssetId = id;
  document.getElementById("custom-asset-name").value = a.name;
  document.getElementById("custom-asset-faction").value = a.faction||"";
  document.getElementById("ca-use-activation").checked = (a.use||[]).includes("Activation");
  document.getElementById("ca-use-deployment").checked = (a.use||[]).includes("Deployment");
  document.getElementById("ca-use-reinforcements").checked = (a.use||[]).includes("Reinforcements");
  document.getElementById("custom-asset-fn").value = a.fn||"";
  clearFieldErr("custom-asset-name"); clearFieldErr("custom-asset-use"); clearFieldErr("custom-asset-fn");
  document.getElementById("custom-asset-form-title").textContent = "Edit Tactical Asset";
  document.getElementById("custom-asset-submit").textContent = "Save Changes";
  document.getElementById("custom-asset-cancel").style.display = "";
  document.getElementById("custom-asset-name").focus();
}

function cancelEditCustomAsset() {
  editingCustomAssetId = null;
  _resetCustomAssetForm();
}

function saveCustomAsset() {
  const name = document.getElementById("custom-asset-name").value.trim();
  if(!name) { showFieldErr("custom-asset-name","Enter an asset name."); return; }
  const faction = document.getElementById("custom-asset-faction").value||null;
  const use = [];
  if(document.getElementById("ca-use-activation").checked) use.push("Activation");
  if(document.getElementById("ca-use-deployment").checked) use.push("Deployment");
  if(document.getElementById("ca-use-reinforcements").checked) use.push("Reinforcements");
  if(!use.length) { showFieldErr("custom-asset-use","Select at least one Use phase."); return; }
  const fn = document.getElementById("custom-asset-fn").value.trim();
  if(!fn) { showFieldErr("custom-asset-fn","Describe what this asset does."); return; }
  if(editingCustomAssetId) {
    const a = (state.customTacticalAssets||[]).find(x=>x.id===editingCustomAssetId);
    if(a) { a.name=name; a.faction=faction; a.use=use; a.fn=fn; }
    editingCustomAssetId = null;
  } else {
    state.customTacticalAssets.push({id:uid(), name, faction, use, fn});
  }
  saveState();
  _resetCustomAssetForm();
  _renderCustomAssetList();
  // Refresh picker list if open
  if(document.getElementById("modal-asset-picker")?.classList.contains("open")) renderAssetPickerList();
}

function deleteCustomAsset(id) {
  state.customTacticalAssets = (state.customTacticalAssets||[]).filter(a=>a.id!==id);
  // Clear from any TF that used it
  const fullId = "custom_"+id;
  state.taskForces.forEach(tf=>{ if(tf.tacAsset===fullId) tf.tacAsset=null; });
  if(editingCustomAssetId===id) { editingCustomAssetId=null; _resetCustomAssetForm(); }
  saveState();
  _renderCustomAssetList();
  if(document.getElementById("modal-asset-picker")?.classList.contains("open")) renderAssetPickerList();
  if(currentTFId) renderTFDetail();
}

// ============================================================
// ARMIES
// ============================================================
function romanNumeral(n) { return ["","I","II","III","IV","V"][n]||String(n); }

// Total cost of the task force pool (TF armies) or deployed units (free-pick).
function armyPoints(a) {
  if(isFreePick(a)) return armyDeployedPoints(a);
  return (a.taskForceIds||[]).reduce((sum,tfId) => {
    const tf = state.taskForces.find(t=>t.id===tfId);
    return sum + (tf?tfPoints(tf):0);
  },0);
}

// Cost of only the units actually placed into battle groups - this is the
// figure that counts against the army's points limit on the tabletop.
function armyDeployedPoints(a) {
  return (a.battleGroups||[]).reduce((sum,bg) => sum + bgPoints(bg), 0);
}

function bgPoints(bg) {
  return (bg.entries||[]).reduce((sum,e) => sum + entryPointValue(e), 0);
}

// Units actually placed in a battle group = sum of each entry's quantity.
// An entry holds `qty` of a TF slot's units (a slot's stack can be split
// across several battle groups).
function bgUnitCount(bg) {
  return (bg.entries||[]).reduce((sum,e) => sum + (e.qty||0), 0);
}

// Rules-adjusted unit count used only for the minimum-battle-group-size check:
// "Count every 3 Independent Stands as one Unit for this purpose." Multi-stand
// Units count their full quantity; single-stand independent/command/hero
// entries are grouped 3-to-1. (Display counts elsewhere stay raw.)
function _bgEntryUnitType(e) {
  if(e.slotId) { const s = entrySlot(e); return (s && s.unitType) || "unit"; }
  return e.unitType || "unit";
}
function bgSizingUnits(bg) {
  let regular = 0, indep = 0;
  (bg.entries||[]).forEach(e => {
    const q = e.qty||0;
    if(_bgEntryUnitType(e) === "unit") regular += q; else indep += q;
  });
  return regular + Math.round(indep/3);
}

function entrySlot(e) {
  const tf = state.taskForces.find(t=>t.id===e.tfId);
  return tf ? (tf.units||[]).find(s=>s.id===e.slotId) : null;
}
function entryPointValue(e) {
  if(e.slotId) {
    const slot = entrySlot(e);
    if(!slot) return 0;
    const u = unitById(slot.unitId);
    if(!u) return 0;
    const pts = calcPoints(u);
    const typeKey = {unit:"unitPts",independent:"indPts",hero:"heroPts",command:"cmdPts",cmdHero:"cmdHeroPts"}[slot.unitType||"unit"];
    let basePts = (pts[typeKey]!=null?pts[typeKey]:pts.unitPts)||0;
    if (slot.transport) {
      const tu = unitById(slot.transport);
      if (tu) basePts += mechanizedCount(u, tu, slot.unitType) * calcPoints(tu).perStand;
    }
    if (slot.role === "support") basePts = GAME.cost.applySupportPremium(basePts);
    return basePts * (e.qty||0);
  } else {
    const u = unitById(e.unitId);
    if(!u) return 0;
    const pts = calcPoints(u);
    const typeKey = {unit:"unitPts",independent:"indPts",hero:"heroPts",command:"cmdPts",cmdHero:"cmdHeroPts"}[e.unitType||"unit"];
    let basePts = (pts[typeKey]!=null?pts[typeKey]:pts.unitPts)||0;
    if (e.transport) {
      const tu = unitById(e.transport);
      if (tu) basePts += mechanizedCount(u, tu, e.unitType) * calcPoints(tu).perStand;
    }
    return basePts * (e.qty||1);
  }
}
// Units of a slot already placed across all of this army's battle groups.
// The map is built lazily on first call for a given army and cached until
// saveState/loadState/undoState invalidates it (same lifecycle as _unitIdCache).
let _slotAssignedMapArmyId = null;
let _slotAssignedMap = null;
function slotAssignedQty(army, slotId) {
  if (_slotAssignedMapArmyId !== army.id || !_slotAssignedMap) {
    _slotAssignedMap = new Map();
    _slotAssignedMapArmyId = army.id;
    (army.battleGroups||[]).forEach(bg =>
      (bg.entries||[]).forEach(e => {
        if (e.slotId) _slotAssignedMap.set(e.slotId, (_slotAssignedMap.get(e.slotId)||0) + (e.qty||0));
      })
    );
  }
  return _slotAssignedMap.get(slotId) || 0;
}
// Units of a slot not yet placed in any of this army's battle groups.
function slotRemainingQty(army, slot) {
  return Math.max(0, (slot.quantity||0) - slotAssignedQty(army, slot.id));
}

function mechanizedCount(infUnit, transportUnit, unitType) {
  if (!infUnit || !transportUnit) return 0;
  if (!GAME.transport.canRide(infUnit.class)) return 0;
  const cap = transportSlotsFor(transportUnit);
  if (!cap) return 0;
  return Math.ceil(transportSlotsNeeded(infUnit, unitType) / cap);
}
function availableTransports() {
  return allUnits().filter(u => GAME.transport.canCarry(u.class) && transportSlotsFor(u) > 0);
}
// ── Transport picker (per-deployment) ─────────────────────
// TF slot:  openTransportPickerTF(tfId, slotId)
// FP entry: openTransportPickerFP(armyId, bgId, entryId)
function openTransportPickerTF(tfId, slotId) {
  const tf = state.taskForces.find(t=>t.id===tfId);
  const slot = tf && (tf.units||[]).find(s=>s.id===slotId);
  const u = slot && unitById(slot.unitId);
  if(!u) return;
  _tpKind="tf"; _tpTFId=tfId; _tpSlotId=slotId;
  _tpArmyId=null; _tpBgId=null; _tpEntryId=null;
  _tpForUnit=u; _tpSelected=slot.transport||null; _tpUnitType=slot.unitType||"unit";
  _openTransportPicker(u, slot.transport||null, tf.faction);
}
function openTransportPickerFP(armyId, bgId, entryId) {
  const army = state.armies.find(a=>a.id===armyId);
  const bg = army && (army.battleGroups||[]).find(b=>b.id===bgId);
  const e = bg && (bg.entries||[]).find(x=>x.id===entryId);
  const u = e && unitById(e.unitId);
  if(!u) return;
  _tpKind="fp"; _tpArmyId=armyId; _tpBgId=bgId; _tpEntryId=entryId;
  _tpTFId=null; _tpSlotId=null;
  _tpForUnit=u; _tpSelected=e.transport||null; _tpUnitType=e.unitType||"unit";
  _openTransportPicker(u, e.transport||null, army.faction);
}
function _openTransportPicker(unit, current, faction) {
  const intro = document.getElementById("transport-intro");
  const single = (_tpUnitType||"unit") !== "unit";
  const stands = single ? 1 : calcPoints(unit).unitSize;
  const need = transportSlotsNeeded(unit, _tpUnitType);
  const noun = unit.class==="fg" ? "gun" : "infantry";
  const singleNote = single && unit.class==="fg"
    ? " (a single stand mechanizes with one slot)" : "";
  intro.innerHTML = `<strong style="color:#e0e0e0">${esc(unit.name)}</strong> - ${stands} ${noun} ${Tn(stands,"stand")} needing <strong>${need}</strong> transport slot${need!==1?"s":""}${singleNote}. Pick a transport AFV; the minimum number needed is added automatically.`;
  document.getElementById("transport-clear-btn").style.display = current ? "inline-flex" : "none";
  _tpSelected = current;
  _renderTransportList(faction);
  document.getElementById("transport-confirm-btn").disabled = !current;
  openModal("modal-transport");
}
function _renderTransportList(faction) {
  const list = document.getElementById("transport-list");
  const unit = _tpForUnit;
  // Faction-match: transports of the same faction, or no faction.
  let opts = availableTransports().filter(t => !t.faction || !faction || t.faction === faction);
  opts.sort((a,b)=>a.name.localeCompare(b.name));
  if(!opts.length){ list.innerHTML = `<div class="empty" style="padding:20px"><div class="empty-icon"><i class="fa-solid fa-truck"></i></div>No transport-capable AFVs available for this faction.</div>`; return; }
  list.innerHTML = opts.map(t => {
    const n = mechanizedCount(unit, t, _tpUnitType);
    const cap = transportSlotsFor(t);
    const addPts = n * calcPoints(t).perStand;
    const sel = _tpSelected === t.id;
    return `<div onclick="_selectTransport('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:6px;margin-bottom:5px;cursor:pointer;border:1px solid ${sel?"var(--accent)":"var(--border-subtle)"};background:${sel?"#0d1b2e":"var(--surface-card)"}">
      <div style="width:30px;height:30px;border-radius:6px;background:var(--surface-raised);display:flex;align-items:center;justify-content:center;color:#7eb3ff;flex-shrink:0"><i class="fa-solid fa-truck"></i></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:bold;color:#e0e0e0;font-size:13px">${esc(t.name)}</div>
        <div style="font-size:10px;color:#8b949e">Carries ${cap} slot${cap!==1?"s":""} · ${calcPoints(t).perStand} pts each${t.faction?"":" · no faction"}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-weight:bold;color:#66bb6a;font-size:13px">${n}&times;</div>
        <div style="font-size:10px;color:#8b949e">+${addPts} pts</div>
      </div>
    </div>`;
  }).join("");
}
function _selectTransport(id) {
  _tpSelected = id;
  const faction = _tpKind==="tf"
    ? state.taskForces.find(t=>t.id===_tpTFId)?.faction
    : state.armies.find(a=>a.id===_tpArmyId)?.faction;
  _renderTransportList(faction);
  document.getElementById("transport-confirm-btn").disabled = false;
}
function confirmTransport() {
  if(!_tpSelected) return;
  if(_tpKind==="tf"){
    const tf = state.taskForces.find(t=>t.id===_tpTFId);
    const slot = tf && (tf.units||[]).find(s=>s.id===_tpSlotId);
    if(slot) slot.transport = _tpSelected;
  } else if(_tpKind==="fp"){
    const army = state.armies.find(a=>a.id===_tpArmyId);
    const bg = army && (army.battleGroups||[]).find(b=>b.id===_tpBgId);
    const e = bg && (bg.entries||[]).find(x=>x.id===_tpEntryId);
    if(e) e.transport = _tpSelected;
  }
  saveState();
  closeModal("modal-transport");
  _refreshAfterTransport();
}
function clearTransport() {
  if(_tpKind==="tf"){
    const tf = state.taskForces.find(t=>t.id===_tpTFId);
    const slot = tf && (tf.units||[]).find(s=>s.id===_tpSlotId);
    if(slot) delete slot.transport;
  } else if(_tpKind==="fp"){
    const army = state.armies.find(a=>a.id===_tpArmyId);
    const bg = army && (army.battleGroups||[]).find(b=>b.id===_tpBgId);
    const e = bg && (bg.entries||[]).find(x=>x.id===_tpEntryId);
    if(e) delete e.transport;
  }
  saveState();
  closeModal("modal-transport");
  _refreshAfterTransport();
}
function _refreshAfterTransport() {
  if(_tpKind==="tf"){ renderTFList(); if(currentTFId===_tpTFId) renderTFDetail(); }
  if(_tpKind==="fp"){ renderArmyList(); renderArmyDetail(); }
}
// When a TF slot's quantity drops, trim this slot's BG entries (later groups
// first) so no army ever has more units placed than the slot now provides.
function clampArmyAssignments(slotId, maxQty) {
  (state.armies||[]).forEach(army => {
    let excess = slotAssignedQty(army, slotId) - maxQty;
    if(excess <= 0) return;
    const bgs = army.battleGroups||[];
    for(let i=bgs.length-1; i>=0 && excess>0; i--){
      const entries = bgs[i].entries||[];
      for(let j=entries.length-1; j>=0 && excess>0; j--){
        if(entries[j].slotId!==slotId) continue;
        const take = Math.min(excess, entries[j].qty||0);
        entries[j].qty = (entries[j].qty||0) - take;
        excess -= take;
        if(entries[j].qty<=0) entries.splice(j,1);
      }
    }
  });
}

// Remove battle-group entries pointing at a task force or slot that no
// longer exists (e.g. after deleting a unit, slot, or whole TF), so armies
// never carry dangling references. Returns how many entries were pruned.
function pruneOrphanedBGEntries() {
  let removed = 0;
  (state.armies||[]).forEach(army => {
    (army.battleGroups||[]).forEach(bg => {
      const before = (bg.entries||[]).length;
      bg.entries = (bg.entries||[]).filter(e => {
        if(e.slotId) {
          const tf = state.taskForces.find(t=>t.id===e.tfId);
          return tf && (tf.units||[]).some(s=>s.id===e.slotId);
        }
        return !!unitById(e.unitId);
      });
      removed += before - bg.entries.length;
    });
  });
  return removed;
}

function armyBGSizeViolations(army) {
  const bgs = (army.battleGroups||[]).slice(0, army.bgCount||3);
  const sizes = bgs.map(bg => bgSizingUnits(bg));
  const largest = Math.max(...sizes, 0);
  if(largest === 0) return { violatingIds: new Set(), minAllowed: 0, largest: 0, largestName: "", ok: true };
  const minAllowed = Math.ceil(largest / 2);
  const largestIdx = sizes.indexOf(largest);
  const largestName = largestIdx >= 0 ? bgs[largestIdx].name : "";
  const violatingIds = new Set(bgs.filter((_,i) => sizes[i] < minAllowed).map(bg => bg.id));
  return { violatingIds, minAllowed, largest, largestName, ok: violatingIds.size === 0 };
}

// Pooled TFs that no longer satisfy the army's faction restriction (e.g. after
// the restriction was changed). Returns a Set of TF ids; empty if unrestricted.
// Used to warn the user - armies are never blocked, just flagged non-deployable.
function armyFactionViolations(army) {
  if(!army || !army.faction) return new Set();
  return new Set((army.taskForceIds||[])
    .map(id => state.taskForces.find(t=>t.id===id))
    .filter(tf => tf && !tfMatchesArmyFaction(tf, army))
    .map(tf => tf.id));
}

function isFreePick(army) { return army && army.armyType === 'fp'; }

// For free-pick armies: a unit's faction must match the army restriction
// (or the unit/army has no faction set).
function fpUnitMatchesFaction(unit, army) {
  if(!army || !army.faction) return true;
  if(!unit.faction) return true;
  return unit.faction === army.faction;
}

// Returns a Set of BG entry IDs whose unit's faction violates the army restriction.
function fpArmyFactionViolations(army) {
  if(!army || !army.faction) return new Set();
  const violated = new Set();
  (army.battleGroups||[]).forEach(bg => (bg.entries||[]).forEach(e => {
    if(e.slotId) return; // TF entry in wrong army type - skip
    const u = unitById(e.unitId);
    if(u && !fpUnitMatchesFaction(u, army)) violated.add(e.id);
  }));
  return violated;
}

// Plain display name for a faction id (built-in or custom).
function factionName(id) {
  if(!id) return "";
  return BUILTIN_FACTION_LABELS[id] || (state.customFactions||[]).find(f=>f.id===id)?.name || id;
}

function _autoAssignBGSymbol(army, bg) {
  const used = new Set((army.battleGroups||[]).filter(b=>b.id!==bg.id).map(b=>b.symbol).filter(Boolean));
  bg.symbol = ICON_SYMBOL_KEYS.find(s=>!used.has(s)) || ICON_SYMBOL_KEYS[0];
}

function _ensureBGs(army) {
  const n = army.bgCount || 3;
  if(!army.battleGroups) army.battleGroups = [];
  while(army.battleGroups.length < n)
    army.battleGroups.push({id:"bg_"+uid(), name:`Battle Group ${romanNumeral(army.battleGroups.length+1)}`, entries:[]});
  // Backfill missing symbols only in custom mode
  if((army.bgIconMode||"custom") === "custom")
    army.battleGroups.forEach(bg => { if(!bg.symbol) _autoAssignBGSymbol(army, bg); });
}

function selectBGTab(armyId, bgId) {
  activeBGTabId = bgId;
  bgSymbolPickerBgId = null;
  editingBGId = null;
  renderArmyDetail();
}

function selectTFTab(role) {
  activeTFTab = role;
  renderTFDetail();
}

function toggleTFViewMode() {
  tfViewMode = tfViewMode === "flat" ? "tabs" : "flat";
  renderTFDetail();
}

function openBGSymbolPicker(armyId, bgId) {
  bgSymbolPickerBgId = bgSymbolPickerBgId === bgId ? null : bgId;
  renderArmyDetail();
}

function setBGSymbol(armyId, bgId, sym) {
  const army = state.armies.find(a=>a.id===armyId);
  const bg = army?.battleGroups?.find(b=>b.id===bgId);
  if(!bg) return;
  bg.symbol = sym;
  bgSymbolPickerBgId = null;
  saveState();
  renderArmyDetail();
}

function setBGIconMode(armyId, mode) {
  const army = state.armies.find(a=>a.id===armyId);
  if(!army) return;
  army.bgIconMode = mode;
  bgSymbolPickerBgId = null;
  saveState();
  renderArmyDetail();
}

function openArmyIconPicker() {
  armyIconPickerOpen = !armyIconPickerOpen;
  bgSymbolPickerBgId = null;
  renderArmyDetail();
}

function setArmyIcon(armyId, sym) {
  const army = state.armies.find(a=>a.id===armyId);
  if(!army) return;
  army.symbol = sym || null;
  armyIconPickerOpen = false;
  saveState();
  renderArmyList();
  renderArmyDetail();
}

function startBGNameEdit(bgId) {
  bgSymbolPickerBgId = null;
  editingBGId = bgId;
  renderArmyDetail();
  requestAnimationFrame(() => {
    const inp = document.getElementById("bg-name-inp-"+bgId);
    if(inp) { inp.focus(); inp.select(); }
  });
}

function saveBGName(armyId, bgId) {
  if(editingBGId !== bgId) return;
  const army = state.armies.find(a=>a.id===armyId);
  const bg = army?.battleGroups?.find(b=>b.id===bgId);
  const inp = document.getElementById("bg-name-inp-"+bgId);
  if(bg && inp) bg.name = inp.value.trim() || bg.name;
  editingBGId = null;
  saveState();
  renderArmyDetail();
}

function cancelBGNameEdit() {
  editingBGId = null;
  renderArmyDetail();
}

// ---- Army comparison ----

function openCompareArmiesModal(anchorArmyId) {
  const armies = state.armies;
  if(armies.length < 2) return;
  const selA = document.getElementById("cmp-army-a");
  const selB = document.getElementById("cmp-army-b");
  const opts = armies.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
  selA.innerHTML = opts;
  selB.innerHTML = opts;
  const anchor = anchorArmyId || currentArmyId || armies[0].id;
  selA.value = anchor;
  const other = armies.find(a=>a.id !== anchor) || armies[0];
  selB.value = other.id;
  renderArmyCompare();
  openModal("modal-compare-armies");
}

function renderArmyCompare() {
  const panel = document.getElementById("cmp-panel");
  if(!panel) return;
  const idA = document.getElementById("cmp-army-a")?.value;
  const idB = document.getElementById("cmp-army-b")?.value;
  const armyA = state.armies.find(a=>a.id===idA);
  const armyB = state.armies.find(a=>a.id===idB);
  if(!armyA || !armyB) {
    panel.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:32px">Select two armies to compare.</div>`;
    return;
  }
  if(idA === idB) {
    panel.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:32px">Select two <em>different</em> armies to compare.</div>`;
    return;
  }
  const ptsA = armyDeployedPoints(armyA);
  const ptsB = armyDeployedPoints(armyB);
  const ptsDiff = Math.abs(ptsA - ptsB);
  const diffHTML = ptsDiff === 0
    ? `<div style="text-align:center;padding:10px 0 2px;font-size:12px;color:#4caf50;border-top:1px solid var(--border-subtle);margin-top:10px"><i class="fa-solid fa-equals" style="margin-right:4px"></i>Equal deployed points (${ptsA} pts)</div>`
    : `<div style="text-align:center;padding:10px 0 2px;font-size:12px;color:var(--text-muted);border-top:1px solid var(--border-subtle);margin-top:10px">
         <span style="color:${ptsA>ptsB?"#4a7adc":"#8b949e"};font-weight:${ptsA>ptsB?"bold":"normal"}">${ptsA} pts</span>
         <span style="margin:0 8px;color:var(--text-faint)">vs</span>
         <span style="color:${ptsB>ptsA?"#4a7adc":"#8b949e"};font-weight:${ptsB>ptsA?"bold":"normal"}">${ptsB} pts</span>
         <span style="margin-left:8px;color:var(--text-faint)">(&Delta; ${ptsDiff} pts)</span>
       </div>`;
  panel.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">
    <div>${_armyCompareColumn(armyA, armyB)}</div>
    <div>${_armyCompareColumn(armyB, armyA)}</div>
  </div>${diffHTML}`;
}

function _armyCompareColumn(army, other) {
  _ensureBGs(army);
  const fp = isFreePick(army);
  const deployed = armyDeployedPoints(army);
  const otherDeployed = armyDeployedPoints(other);
  const overLimit = army.pointsLimit && deployed > army.pointsLimit;
  const ptsRatio = army.pointsLimit ? Math.min(deployed / army.pointsLimit, 1) : null;
  const barColor = ptsRatio == null ? "#4a7adc" : ptsRatio > 1 ? "#ef5350" : ptsRatio > 0.85 ? "#ffa726" : "#4caf50";
  const ptsLabel = army.pointsLimit ? `${deployed} / ${army.pointsLimit} pts` : `${deployed} pts`;
  const ptsColor = overLimit ? "#ef5350" : deployed > otherDeployed ? "#4a7adc" : deployed < otherDeployed ? "#8b949e" : "var(--text-bright)";

  const armySym = army.symbol ? _bgSymLookup(army.symbol) : null;
  const iconEl = armySym
    ? `<div style="width:38px;height:38px;border-radius:8px;background:${armySym.color}1a;border:2px solid ${armySym.color}44;color:${armySym.color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px">${_bgSymInner(armySym,16)}</div>`
    : `<div style="width:38px;height:38px;border-radius:8px;background:var(--surface-raised);border:1px dashed var(--border-default);color:var(--text-faint);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px"><i class="fa-solid fa-chess-rook"></i></div>`;

  const typeTag = fp
    ? `<span style="font-size:9px;font-weight:bold;padding:1px 5px;border-radius:6px;background:#1a2a1a;color:#66bb6a;border:1px solid #66bb6a44">FREE PICK</span>`
    : `<span style="font-size:9px;font-weight:bold;padding:1px 5px;border-radius:6px;background:#0d1a2e;color:#4a7adc;border:1px solid #4a7adc44">TASK FORCE</span>`;

  const barHTML = army.pointsLimit
    ? `<div style="height:4px;border-radius:2px;background:#1a1f2a;overflow:hidden;margin:5px 0 2px">
         <div style="height:100%;width:${((ptsRatio||0)*100).toFixed(1)}%;background:${barColor};border-radius:2px"></div>
       </div>`
    : "";

  // TF pool strip (only for TF-type armies)
  let tfPoolHTML = "";
  if(!fp) {
    const tfs = (army.taskForceIds||[]).map(id=>state.taskForces.find(t=>t.id===id)).filter(Boolean);
    if(tfs.length) {
      tfPoolHTML = `<div style="margin-bottom:10px">
        <div style="font-size:10px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Task Force Pool</div>
        ${tfs.map(tf=>{
          const tp = tfPoints(tf);
          const uc = (tf.units||[]).reduce((s,u)=>s+u.quantity,0);
          return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--border-subtle)">
            <span style="font-size:12px;font-weight:600;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(tf.name)}</span>
            <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">${uc}u &middot; ${tp}pts</span>
          </div>`;
        }).join("")}
      </div>`;
    }
  }

  // Battle groups
  const bgCount = army.bgCount || 3;
  const bgs = (army.battleGroups||[]).slice(0, bgCount);
  const bgViol = armyBGSizeViolations(army);

  const bgSectionsHTML = bgs.map(bg => {
    const sd = bgDesignation(army, bg);
    const bPts = bgPoints(bg);
    const bSize = bgUnitCount(bg);
    const undersize = bgViol.violatingIds.has(bg.id);
    const symEl = `<div style="width:18px;height:18px;border-radius:4px;background:${sd.color}18;border:1px solid ${sd.color}44;color:${sd.color};display:inline-flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">${_bgSymInner(sd,9)}</div>`;

    // Aggregate entries: unit name → total qty + total pts
    const entryMap = new Map(); // key → {name, qty, pts, role}
    (bg.entries||[]).forEach(e => {
      let name, role, pts, qty;
      if(e.slotId) {
        const tf = state.taskForces.find(t=>t.id===e.tfId);
        const slot = tf && (tf.units||[]).find(s=>s.id===e.slotId);
        if(!slot) return;
        const u = unitById(slot.unitId);
        if(!u) return;
        name = u.name; role = slot.role || "core"; qty = e.qty||0;
        pts = entryPointValue(e);
        const key = `${slot.unitId}|${role}|${slot.unitType||"unit"}`;
        const ex = entryMap.get(key);
        if(ex) { ex.qty += qty; ex.pts += pts; } else entryMap.set(key, {name, role, qty, pts});
      } else {
        const u = unitById(e.unitId);
        if(!u) return;
        name = u.name; role = e.unitType||"unit"; qty = e.qty||1;
        pts = entryPointValue(e);
        const key = `${e.unitId}|${role}`;
        const ex = entryMap.get(key);
        if(ex) { ex.qty += qty; ex.pts += pts; } else entryMap.set(key, {name, role, qty, pts});
      }
    });

    const roleColors = {core:"#4a7adc",specialist:"#ab47bc",command:"#ffd54f",support:"#4caf50",unit:"#8b949e",independent:"#ab47bc",hero:"#ffa726",cmdHero:"#ffd54f"};

    const entriesHTML = entryMap.size === 0
      ? `<div style="font-size:11px;color:var(--text-faint);font-style:italic;padding:2px 0 4px">Empty</div>`
      : [...entryMap.values()].map(({name, role, qty, pts}) => {
          const roleColor = roleColors[role] || "#8b949e";
          const roleAbbr = {core:"CORE",specialist:"SPEC",command:"CMD",support:"SUP",unit:"UNIT",independent:"IND",hero:"HERO",cmdHero:"C.HERO"}[role] || role.toUpperCase();
          return `<div style="display:flex;align-items:baseline;gap:6px;padding:2px 0">
            <span style="font-size:9px;font-weight:bold;color:${roleColor};flex-shrink:0;min-width:34px">${roleAbbr}</span>
            <span style="font-size:12px;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(name)}">${esc(name)}</span>
            <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">&times;${qty}</span>
            <span style="font-size:11px;color:var(--text-faint);white-space:nowrap;flex-shrink:0;min-width:36px;text-align:right">${pts}pts</span>
          </div>`;
        }).join("");

    const headerColor = undersize ? "#ef5350" : "var(--text-primary)";
    return `<div style="margin-bottom:8px;padding:8px 10px;border-radius:6px;background:var(--surface-raised);border:1px solid ${undersize?"#ef535044":"var(--border-subtle)"}">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px;padding-bottom:5px;border-bottom:1px solid var(--border-subtle)">
        ${symEl}
        <span style="font-size:12px;font-weight:700;color:${headerColor};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(bg.name)}</span>
        <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">${bSize}u &middot; ${bPts}pts</span>
        ${undersize?`<span title="Battle Group too small" style="color:#ef5350;font-size:11px;flex-shrink:0"><i class="fa-solid fa-triangle-exclamation"></i></span>`:""}
      </div>
      ${entriesHTML}
    </div>`;
  }).join("");

  const bgCount2 = (army.battleGroups||[]).slice(0,bgCount).reduce((s,bg)=>s+bgUnitCount(bg),0);

  return `<div style="background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:14px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      ${iconEl}
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-display);font-size:18px;letter-spacing:1px;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(army.name)}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:2px;flex-wrap:wrap">
          ${typeTag}
          ${army.faction ? factionPill(army.faction) : ""}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:18px;font-family:var(--font-display);color:${ptsColor};line-height:1.1">${ptsLabel}</div>
        <div style="font-size:10px;color:var(--text-faint)">${bgCount2} units total</div>
      </div>
    </div>
    ${barHTML}
    ${tfPoolHTML}
    <div style="font-size:10px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Battle Groups</div>
    ${bgSectionsHTML || `<div style="font-size:11px;color:var(--text-faint);font-style:italic">No battle groups</div>`}
  </div>`;
}

function renderArmyList() {
  const list = document.getElementById("army-list");
  if (!list) return;
  const cmpBtn = document.getElementById("btn-compare-armies");
  if(cmpBtn) cmpBtn.style.display = state.armies.length >= 2 ? "" : "none";
  if (!state.armies.length) {
    list.innerHTML = `<div class="empty" style="padding:48px 0"><div class="empty-icon"><i class="fa-solid fa-chess-rook"></i></div>No armies yet - press <strong>New Army</strong> to create one.</div>`;
    return;
  }
  list.innerHTML = state.armies.map(a => {
    const fp = isFreePick(a);
    const deployed = armyDeployedPoints(a);
    const overLimit = a.pointsLimit && deployed > a.pointsLimit;
    const bgCount = a.bgCount || 3;
    const bgList = (a.battleGroups || []).slice(0, bgCount);
    const viol = armyBGSizeViolations(a);
    const facViolSize = fp ? fpArmyFactionViolations(a).size : armyFactionViolations(a).size;
    const notDeployable = !viol.ok || facViolSize > 0 || overLimit;

    const ptsRatio = a.pointsLimit ? deployed / a.pointsLimit : null;
    const barPct = ptsRatio != null ? Math.min(ptsRatio, 1) * 100 : 0;
    const barColor = ptsRatio == null ? "#4a7adc" : ptsRatio > 1 ? "#ef5350" : ptsRatio > 0.85 ? "#ffa726" : "#4caf50";

    const armySym = a.symbol ? _bgSymLookup(a.symbol) : null;
    const badgeHTML = armySym
      ? `<div style="width:56px;height:56px;border-radius:12px;background:${armySym.color}1a;border:2px solid ${armySym.color}55;color:${armySym.color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px">${_bgSymInner(armySym,22)}</div>`
      : `<div style="width:56px;height:56px;border-radius:12px;background:var(--surface-raised);border:2px dashed var(--border-default);color:var(--text-faint);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px"><i class="fa-solid fa-chess-rook"></i></div>`;

    const typeTag = fp
      ? `<span style="font-size:9px;font-weight:bold;padding:1px 6px;border-radius:8px;background:#1a2a1a;color:#66bb6a;border:1px solid #66bb6a44;letter-spacing:.5px">FREE PICK</span>`
      : `<span style="font-size:9px;font-weight:bold;padding:1px 6px;border-radius:8px;background:#0d1a2e;color:#4a7adc;border:1px solid #4a7adc44;letter-spacing:.5px">TASK FORCE</span>`;

    const violBadge = notDeployable
      ? `<span title="Not deployable - has rule violations" style="font-size:12px;color:#ef5350;flex-shrink:0"><i class="fa-solid fa-triangle-exclamation"></i></span>`
      : "";

    const ptsLabel = a.pointsLimit ? `${deployed} / ${a.pointsLimit} pts` : `${deployed} pts deployed`;
    const ptsColor = overLimit ? "#ef5350" : "var(--text-bright)";
    const miniBar = a.pointsLimit
      ? `<div style="height:3px;border-radius:2px;background:#1a1f2a;overflow:hidden;margin-top:4px">
           <div style="height:100%;width:${barPct.toFixed(1)}%;background:${barColor};border-radius:2px"></div>
         </div>`
      : "";

    const bgRows = bgList.length === 0
      ? `<div style="font-size:11px;color:var(--text-faint);font-style:italic;padding:2px 0">No battle groups configured</div>`
      : bgList.map(bg => {
          const sd = bgDesignation(a, bg);
          const bgPt = bgPoints(bg);
          const bgSz = bgUnitCount(bg);
          const symEl = `<div style="width:18px;height:18px;border-radius:4px;background:${sd.color}18;border:1px solid ${sd.color}44;color:${sd.color};display:inline-flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">${_bgSymInner(sd,9)}</div>`;
          return `<div style="display:flex;align-items:center;gap:7px;padding:3px 0">
            ${symEl}
            <span style="font-size:12px;font-weight:600;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(bg.name)}</span>
            <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">${bgSz}u &middot; ${bgPt}pts</span>
          </div>`;
        }).join("");

    const cardBorder = notDeployable ? "border-color:#ef535044" : "";
    return `<div style="background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;margin-bottom:12px;overflow:hidden;cursor:pointer;transition:border-color .15s,background .15s;${cardBorder}"
      onclick="selectArmy('${a.id}')"
      onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--surface-raised)'"
      onmouseout="this.style.borderColor='${notDeployable?"#ef535044":"var(--border-default)"}';this.style.background='var(--surface-card)'">
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid var(--border-subtle)">
        ${badgeHTML}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <span style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
            ${violBadge}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">
            ${typeTag}
            ${a.faction ? factionPill(a.faction) : ""}
          </div>
          <div>
            <span style="font-size:12px;font-weight:bold;color:${ptsColor}">${ptsLabel}</span>
          </div>
          ${miniBar}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0" onclick="event.stopPropagation()">
          <button class="trait-edit-btn" onclick="openPrintArmyModal('${a.id}')" title="Print this army"><i class="fa-solid fa-print"></i> Print</button>
          <button class="trait-edit-btn" onclick="selectArmy('${a.id}')" title="Open army detail" style="white-space:nowrap"><i class="fa-solid fa-arrow-right"></i> Open</button>
          <button class="trait-edit-btn" onclick="exportArmy('${a.id}')" title="Export army JSON"><i class="fa-solid fa-share-nodes"></i> Export</button>
        </div>
      </div>
      <div style="padding:8px 16px 10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0 24px">
        ${bgRows}
      </div>
    </div>`;
  }).join("");
}

function selectArmy(id) {
  currentArmyId = id;
  tfRemoveBlockedId = null;
  bgSymbolPickerBgId = null;
  editingBGId = null;
  armyIconPickerOpen = false;
  activeBGTabId = null;
  const lv = document.getElementById("army-list-view");
  const dv = document.getElementById("army-detail-view");
  if (lv) lv.style.display = "none";
  if (dv) dv.style.display = "";
  renderArmyDetail();
}

function backToArmyList() {
  currentArmyId = null;
  tfRemoveBlockedId = null;
  bgSymbolPickerBgId = null;
  editingBGId = null;
  armyIconPickerOpen = false;
  activeBGTabId = null;
  const lv = document.getElementById("army-list-view");
  const dv = document.getElementById("army-detail-view");
  if (lv) lv.style.display = "";
  if (dv) dv.style.display = "none";
  renderArmyList();
}

function renderArmyDetail() {
  const panel = document.getElementById("army-detail-panel");
  if (!panel) return;
  const army = state.armies.find(a=>a.id===currentArmyId);
  if(!army) { panel.innerHTML=`<div class="card"><div class="empty"><div class="empty-icon"><i class="fa-solid fa-chess-rook"></i></div>Select an army to view</div></div>`; return; }
  const breadcrumb = `<div style="margin-bottom:12px">
    <button onclick="backToArmyList()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;font-size:13px;display:inline-flex;align-items:center;gap:6px;transition:color .15s" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">
      <i class="fa-solid fa-arrow-left" style="font-size:11px"></i> Armies
    </button>
  </div>`;
  _ensureBGs(army);
  const fp = isFreePick(army);
  const allAssets = allTacticalAssets();
  const poolPts = armyPoints(army);
  const deployedPts = armyDeployedPoints(army);
  const overPtsLimit = army.pointsLimit && deployedPts > army.pointsLimit;
  const bgCount = army.bgCount || 3;
  const _ptsRatio = army.pointsLimit ? deployedPts / army.pointsLimit : null;
  const _barPct   = _ptsRatio != null ? Math.min(_ptsRatio, 1) * 100 : 0;
  const _barColor = _ptsRatio == null ? "#4a7adc" : _ptsRatio > 1 ? "#ef5350" : _ptsRatio > 0.85 ? "#ffa726" : "#4caf50";
  const _remaining = army.pointsLimit ? army.pointsLimit - deployedPts : null;
  const _remainLabel = _remaining == null ? ""
    : overPtsLimit ? `<i class="fa-solid fa-triangle-exclamation" style="margin-right:3px"></i>+${-_remaining} over`
    : _remaining === 0 ? "Exactly on target"
    : `${_remaining} pts to go`;
  const budgetBarHTML = army.pointsLimit
    ? `<div style="margin-bottom:14px;padding:0 1px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:10px;color:var(--text-faint);letter-spacing:.03em">${Math.round((_ptsRatio||0)*100)}%</span>
          <span style="font-size:10px;color:${overPtsLimit?"#ef5350":_remaining===0?"#4caf50":"var(--text-faint)"};font-weight:${overPtsLimit||_remaining===0?"bold":"normal"}">${_remainLabel}</span>
        </div>
        <div style="height:5px;border-radius:3px;background:#1a1f2a;overflow:hidden">
          <div style="height:100%;width:${_barPct.toFixed(1)}%;background:${_barColor};border-radius:3px;transition:width .25s ease"></div>
        </div>
      </div>`
    : "";
  const tfs = (army.taskForceIds||[]).map(id=>state.taskForces.find(t=>t.id===id)).filter(Boolean);
  const bgViol = armyBGSizeViolations(army);
  const facViol = fp ? new Set() : armyFactionViolations(army);
  const fpViol  = fp ? fpArmyFactionViolations(army) : new Set();

  // Compact TF pool rows
  const tfPoolHTML = tfs.length === 0
    ? `<span style="font-size:11px;color:#444;font-style:italic">None added yet.</span>`
    : tfs.map(tf => {
        const tp = tfPoints(tf);
        const unitCount = (tf.units||[]).reduce((s,u)=>s+u.quantity,0);
        const overLimit = tfOverLimit(tf);
        const offFaction = facViol.has(tf.id);
        const blockedBGNames = (army.battleGroups||[]).filter(bg=>(bg.entries||[]).some(e=>e.tfId===tf.id)).map(bg=>esc(bg.name));
        // Only show the block warning if the TF was flagged AND entries actually remain
        const isBlocked = tfRemoveBlockedId === tf.id && blockedBGNames.length > 0;
        const warningHTML = isBlocked ? `<div style="margin-top:6px;padding:6px 8px;border-radius:4px;background:#3a1a00;border:1px solid #f97316aa;display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="font-size:11px;color:#fb923c;line-height:1.4">
            <i class="fa-solid fa-triangle-exclamation" style="margin-right:4px"></i>Units from this TF are still in: <strong>${blockedBGNames.join(", ")}</strong>. Remove them first.
          </div>
          <button onclick="tfRemoveBlockedId=null;renderArmyDetail()" style="background:none;border:none;color:#fb923c;cursor:pointer;padding:0;font-size:13px;flex-shrink:0;line-height:1"><i class="fa-solid fa-xmark"></i></button>
        </div>` : "";
        const offFactionHTML = (offFaction && !isBlocked) ? `<div style="margin-top:6px;padding:6px 8px;border-radius:4px;background:#1a0505;border:1px solid #ef535066;font-size:11px;color:#ef9a9a;line-height:1.4">
          <i class="fa-solid fa-triangle-exclamation" style="margin-right:4px;color:#ef5350"></i>Doesn't match this army's ${factionPill(army.faction)} restriction - remove it, or change the restriction.
        </div>` : "";
        const tfSlots = tfRankSlots(tf.id);
        const tfAsset = tf.tacAsset ? allAssets.find(a=>a.id===tf.tacAsset) : null;
        const assetLineHTML = tfAsset ? `<div style="font-size:10px;color:#8b949e;display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:3px">
          <i class="fa-solid fa-chess" style="color:#ffd54f;font-size:9px"></i>
          <span style="color:#e0e0e0;font-weight:bold">${esc(tfAsset.name)}</span>
          ${_assetUsePills(tfAsset.use)}
        </div>` : "";
        return `<div class="list-row" style="${offFaction?"border-color:#ef535066":overLimit?"border-color:#ef535055":isBlocked?"border-color:#f9731666":""}">
          <div style="min-width:0;flex:1">
            <div style="display:flex;align-items:center;gap:6px;min-width:0">
              <span style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(tf.name)}</span>
              ${tf.commander ? `<span style="font-size:10px;color:#6a7a6a;flex-shrink:0;white-space:nowrap"><i class="fa-solid fa-person-military-pointing" style="color:#ffd54f;font-size:8px;margin-right:2px"></i>${esc(tf.commander)}</span>` : ""}
            </div>
            <div style="font-size:11px;color:#8b949e;display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px">
              ${tf.faction ? factionPill(tf.faction) : `<span style="font-size:10px;color:#666">No Faction</span>`}
              <span>${unitCount} unit${unitCount!==1?"s":""} &bull; ${tp} pts${overLimit?" ⚠":""}</span>
            </div>
            ${assetLineHTML}
            ${_tfRankPillsHTML(tf, tfSlots)}
            ${warningHTML}${offFactionHTML}
          </div>
          <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a;flex-shrink:0;align-self:flex-start" onclick="removeTFFromArmy('${army.id}','${tf.id}')">Remove</button>
        </div>`;
      }).join("");

  // Unified non-deployable banner (warn, never block - invalid armies are fine here).
  const deployIssues = [];
  if(overPtsLimit) deployIssues.push(`Deployed cost <strong>${deployedPts} pts</strong> exceeds the army's <strong>${army.pointsLimit} pt</strong> limit by ${deployedPts-army.pointsLimit}.`);
  if(!bgViol.ok) {
    const offenders = (army.battleGroups||[]).slice(0,bgCount)
      .filter(bg => bgViol.violatingIds.has(bg.id))
      .map(bg => `<strong>${esc(bg.name)}</strong> (${bgSizingUnits(bg)})`);
    const offenderList = offenders.length>1
      ? offenders.slice(0,-1).join(", ") + " and " + offenders[offenders.length-1]
      : offenders[0];
    deployIssues.push(`${offenderList} ${offenders.length>1?"are":"is"} too small - each Battle Group needs at least <strong>${bgViol.minAllowed}</strong> unit${bgViol.minAllowed!==1?"s":""}, half of the largest group <strong>${esc(bgViol.largestName)}</strong> (${bgViol.largest}) rounded up.`);
  }
  if(facViol.size) deployIssues.push(`<strong>${facViol.size}</strong> task force${facViol.size>1?"s":""} in the pool ${facViol.size>1?"don't":"doesn't"} match the ${esc(factionName(army.faction))} faction restriction.`);
  if(fpViol.size) deployIssues.push(`<strong>${fpViol.size}</strong> unit entr${fpViol.size>1?"ies":"y"} in the battle groups ${fpViol.size>1?"don't":"doesn't"} match the ${factionPill(army.faction)} restriction.`);
  const deployBannerHTML = deployIssues.length ? `<div style="margin-bottom:14px;padding:8px 12px;border-radius:6px;background:#1a0505;border:1px solid #ef535066;display:flex;align-items:flex-start;gap:10px">
    <i class="fa-solid fa-triangle-exclamation" style="color:#ef5350;margin-top:1px;flex-shrink:0"></i>
    <div style="font-size:12px;color:#ef9a9a;line-height:1.5">
      <strong style="color:#ef5350">Not deployable</strong>
      <ul style="margin:3px 0 0 16px;padding:0">${deployIssues.map(i=>`<li style="margin-top:1px">${i}</li>`).join("")}</ul>
    </div>
  </div>` : "";

  // Battle group tabs + card (equal-width grid)
  const bgList = army.battleGroups.slice(0, bgCount);
  const bgIds = bgList.map(b => b.id);
  if(!activeBGTabId || !bgIds.includes(activeBGTabId)) activeBGTabId = bgIds[0] || null;

  // Compute the card body for a given BG. Used by both the tabbed view (active
  // BG only) and the flat view (every BG stacked). In flat mode a symbol button
  // is folded into the toolbar so the designation picker stays reachable.
  function _armyBGCardBody(bg) {
      const bPts = bgPoints(bg);
      const bgSize = bgUnitCount(bg);
      const bgRuleSize = bgSizingUnits(bg); // rules-adjusted count for size checks
      const bgUndersize = bgViol.violatingIds.has(bg.id);
      const bgMode = army.bgIconMode || "custom";
      const symDef = bgDesignation(army, bg);
      // Symbol picker
      const pickerOpen = bgMode === "custom" && bgSymbolPickerBgId === bg.id;
      const usedByOthers = new Set((army.battleGroups||[]).slice(0,bgCount).filter(b=>b.id!==bg.id).map(b=>b.symbol).filter(Boolean));
      const sym = bg.symbol || ICON_SYMBOL_KEYS[0];
      const pickerHTML = pickerOpen ? `<div style="margin-bottom:10px;padding:8px 10px;border-radius:6px;background:var(--surface-raised);border:1px solid var(--border-subtle)">
        ${BG_SYMBOL_GROUPS.map(grp => `
          <div style="margin-bottom:6px">
            <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">${grp.label}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${grp.keys.map(s => {
                const sd = _bgSymLookup(s);
                const isCurrent = s === sym;
                const isUsed = usedByOthers.has(s);
                return `<button onclick="${isUsed&&!isCurrent?"":"setBGSymbol('"+army.id+"','"+bg.id+"','"+s+"')"}" title="${sd.label}${isUsed&&!isCurrent?" (used by another group)":""}" style="min-width:30px;height:30px;border-radius:6px;padding:0 5px;border:${isCurrent?"2px solid "+sd.color:"1px solid "+sd.color+(isUsed&&!isCurrent?"22":"44")};background:${isCurrent?sd.color+"2a":"transparent"};color:${isUsed&&!isCurrent?"#333":sd.color};cursor:${isUsed&&!isCurrent?"default":"pointer"};display:inline-flex;align-items:center;justify-content:center">${_bgSymInner(sd)}</button>`;
              }).join("")}
            </div>
          </div>`).join("")}
      </div>` : "";
      const bgHintHTML = (()=>{
        if(bgSize === 0 && bgViol.minAllowed > 0) {
          // Empty BG while other BGs have units - soft guidance, not an alarm
          return `<div style="margin-bottom:8px;padding:6px 9px;border-radius:4px;background:var(--accent-tint);border:1px solid #007eff33;font-size:11px;color:var(--accent-light);display:flex;align-items:flex-start;gap:6px">
            <i class="fa-solid fa-circle-info" style="flex-shrink:0;margin-top:1px"></i>
            <span>Needs at least <strong>${bgViol.minAllowed}</strong> unit${bgViol.minAllowed!==1?"s":""} to deploy - half of <strong>${esc(bgViol.largestName)}</strong>'s ${bgViol.largest}, rounded up</span>
          </div>`;
        }
        if(bgSize > 0 && bgUndersize) {
          // Has units but not enough - red error (user has made an active mistake)
          return `<div style="margin-bottom:8px;padding:5px 8px;border-radius:4px;background:#1a0505;border:1px solid #ef535055;font-size:11px;color:#ef9a9a;display:flex;align-items:flex-start;gap:6px">
            <i class="fa-solid fa-triangle-exclamation" style="color:#ef5350;flex-shrink:0;margin-top:1px"></i>
            <span>Has ${bgRuleSize} unit${bgRuleSize!==1?"s":""} - needs at least <strong style="color:#ef5350">${bgViol.minAllowed}</strong> (half of ${esc(bgViol.largestName)}'s ${bgViol.largest}, rounded up)</span>
          </div>`;
        }
        return "";
      })();
      const entriesHTML = fp
        ? (bg.entries||[]).map(e => {
            const u = unitById(e.unitId);
            if(!u) return "";
            const pts = entryPointValue(e);
            const eqty = e.qty||1;
            const offFac = fpViol.has(e.id);
            const stepBtn = (lbl, d, dis) => `<button onclick="changeFPEntryQty('${army.id}','${bg.id}','${e.id}',${d})" ${dis?"disabled":""} style="width:20px;height:20px;border-radius:50%;border:none;background:var(--surface-raised);color:var(--text-bright);font-size:13px;line-height:20px;text-align:center;cursor:${dis?"default":"pointer"};opacity:${dis?".3":"1"}">${lbl}</button>`;
            const stepper = `<span style="display:inline-flex;align-items:center;gap:4px">${stepBtn("&minus;",-1,eqty<=1)}<span style="font-weight:bold;font-size:12px;min-width:18px;text-align:center">&times;${eqty}</span>${stepBtn("+",1,false)}</span>`;
            const offFacStrip = offFac ? `<div style="padding:4px 8px;border-radius:4px;background:#1a0505;border:1px solid #ef535066;font-size:10px;color:#ef9a9a;margin-bottom:4px"><i class="fa-solid fa-triangle-exclamation" style="color:#ef5350;margin-right:3px"></i>Faction doesn't match the army restriction.</div>` : "";
            const canMechFP = (u.class==="inf"||u.class==="fg");
            const fpTU = e.transport ? unitById(e.transport) : null;
            const fpMechBtn = canMechFP
              ? `<button class="trait-edit-btn" onclick="openTransportPickerFP('${army.id}','${bg.id}','${e.id}')" title="Mechanized transport"${fpTU?` style="border-color:#66bb6a55;color:#66bb6a;background:#0e1a0e"`:""}><i class="fa-solid fa-truck"></i> ${fpTU?`${mechanizedCount(u,fpTU,e.unitType)}&times; ${esc(fpTU.name)}`:"Mechanize"}</button>`
              : "";
            const actions = `${offFacStrip}<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${stepper}<span style="font-size:10px;color:var(--text-muted)">${pts} pts</span>${fpMechBtn}</span>
              <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="removeFPEntry('${army.id}','${bg.id}','${e.id}')">Remove</button>
            </div>`;
            if (fpTU) return mechPairCardHTML(u, fpTU, mechanizedCount(u, fpTU, e.unitType), actions, e.unitType||"unit");
            return unitCardHTML(u, actions, e.unitType||"unit");
          }).join("")
        : (bg.entries||[]).map(e => {
            const tf = state.taskForces.find(t=>t.id===e.tfId);
            if(!tf) return "";
            const slot = (tf.units||[]).find(s=>s.id===e.slotId);
            if(!slot) return "";
            const unit = unitById(slot.unitId);
            if(!unit) return "";
            const tfColor = FACTION_COLORS[tf.faction] || "#555";
            const bgAsset = tf.tacAsset ? allAssets.find(a=>a.id===tf.tacAsset) : null;
            const slotTU = slot.transport ? unitById(slot.transport) : null;
            const tfBadge = bgAsset
              ? `<span style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap">
                   <span style="font-size:9px;font-weight:bold;padding:1px 6px;border-radius:8px;background:${tfColor}18;color:${tfColor};border:1px solid ${tfColor}44">${esc(tf.name)}</span>
                   <span style="font-size:9px;font-weight:bold;padding:1px 6px;border-radius:8px;background:#1a1400;color:#ffd54f;border:1px solid #ffd54f44"><i class="fa-solid fa-chess" style="font-size:8px;margin-right:3px"></i>${esc(bgAsset.name)}</span>${_assetUsePills(bgAsset.use)}
                 </span>`
              : `<span style="font-size:9px;font-weight:bold;padding:1px 6px;border-radius:8px;background:${tfColor}18;color:${tfColor};border:1px solid ${tfColor}44">${esc(tf.name)}</span>`;
            const eqty = e.qty || slot.quantity;
            const canInc = slotRemainingQty(army, slot) > 0;
            const stepBtn = (lbl, d, dis) => `<button onclick="changeBGEntryQty('${army.id}','${bg.id}','${e.id}',${d})" ${dis?"disabled":""} style="width:20px;height:20px;border-radius:50%;border:none;background:var(--surface-raised);color:var(--text-bright);font-size:13px;line-height:20px;text-align:center;cursor:${dis?"default":"pointer"};opacity:${dis?".3":"1"}">${lbl}</button>`;
            const stepper = slot.quantity > 1
              ? `<span style="display:inline-flex;align-items:center;gap:4px" title="Split this stack across battle groups">${stepBtn("&minus;",-1,eqty<=1)}<span style="font-weight:bold;font-size:12px;min-width:18px;text-align:center">&times;${eqty}</span>${stepBtn("+",1,!canInc)}</span>`
              : "";
            const actions = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:10px;color:var(--text-muted);display:flex;align-items:center;gap:8px">${stepper}${entryPointValue(e)} pts</span>
              <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="removeFromBG('${army.id}','${bg.id}','${e.id}')">Remove</button>
            </div>`;
            if (slotTU) return mechPairCardHTML(unit, slotTU, mechanizedCount(unit, slotTU, slot.unitType), actions, slot.unitType||"unit", {tfBadge});
            return unitCardHTML(unit, actions, slot.unitType || "unit", {tfBadge});
          }).join("");
      // Toolbar: rename inline + action buttons
      const isEditingName = editingBGId === bg.id;
      const nameSection = isEditingName
        ? `<input id="bg-name-inp-${bg.id}" type="text" value="${esc(bg.name)}" maxlength="40"
             style="font-family:var(--font-display);font-size:14px;letter-spacing:.5px;color:var(--accent);background:transparent;border:none;border-bottom:1px solid var(--accent);outline:none;min-width:0;flex:1;padding:0"
             onblur="saveBGName('${army.id}','${bg.id}')"
             onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelBGNameEdit()">`
        : `<span style="font-family:var(--font-display);font-size:14px;letter-spacing:.6px;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(bg.name)}</span>
           <button onclick="startBGNameEdit('${bg.id}')" title="Rename battle group" style="background:none;border:none;color:#555;cursor:pointer;padding:0 4px;font-size:10px;line-height:1;flex-shrink:0;transition:color .15s" onmouseover="this.style.color='#aaa'" onmouseout="this.style.color='#555'"><i class="fa-solid fa-pencil"></i></button>`;
      const flatSymStyle = `width:24px;height:24px;border-radius:5px;background:${symDef.color}1a;border:1.5px solid ${symDef.color}99;color:${symDef.color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0`;
      const flatSymBtn = bgViewMode !== "flat" ? ""
        : bgMode === "custom"
          ? `<button onclick="openBGSymbolPicker('${army.id}','${bg.id}')" title="${symDef.label} - click to change" style="${flatSymStyle};cursor:pointer;padding:0;transition:background .15s" onmouseover="this.style.background='${symDef.color}33'" onmouseout="this.style.background='${symDef.color}1a'">${_bgSymInner(symDef,12)}</button>`
          : `<div style="${flatSymStyle}">${_bgSymInner(symDef,12)}</div>`;
      const toolbarHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)">
        ${flatSymBtn}
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="display:flex;align-items:center;gap:5px">${nameSection}</div>
          <div style="font-size:9px;color:var(--text-muted);margin-top:2px">${bPts} pts &bull; ${(()=>{
            if(bgViol.minAllowed > 0) {
              const met = bgRuleSize >= bgViol.minAllowed;
              const col = bgSize === 0 ? "var(--accent-light)" : met ? "#66bb6a" : "#ef5350";
              return `<span style="color:${col}">${bgRuleSize}/${bgViol.minAllowed}</span> unit${bgRuleSize!==1?"s":""}`;
            }
            return `${bgSize} unit${bgSize!==1?"s":""}`;
          })()}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
          ${fp
            ? `<button class="trait-edit-btn" onclick="openFPBGUnitModal('${army.id}','${bg.id}')">Add Unit</button>`
            : `<button class="trait-edit-btn" onclick="openArmyBGUnitModal('${army.id}','${bg.id}')">Add Unit</button>
               <button class="trait-edit-btn" onclick="openBGTFModal('${army.id}','${bg.id}')">Add Task Force</button>`}
          <button class="trait-edit-btn" onclick="openBGNotesModal('${army.id}','${bg.id}')"><i class="fa-solid fa-pen"></i> Description</button>
          ${(bg.entries||[]).length > 0
            ? `<button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>clearBG('${army.id}','${bg.id}'))"><i class="fa-solid fa-trash"></i> Clear</button>`
            : ""}
        </div>
      </div>`;
      const bgNotesHTML = bg.notes ? `<div style="background:#0d0f14;border:1px solid #1e2530;border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:12px;color:#8b949e;line-height:1.6;font-style:italic">${esc(bg.notes).replace(/\n/g,"<br>")}</div>` : "";
      const bgEmptyHTML = bgSize === 0 ? (()=>{
        // When minimum already established (other BGs have units), bgHintHTML covers the guidance.
        // Only show a supplemental prompt when the hint isn't already there.
        if(bgViol.minAllowed > 0) return ""; // hint already shown above entries
        if(!fp && tfs.length === 0) {
          return `<div style="padding:20px 0;text-align:center;color:var(--text-faint);font-size:12px">
            <i class="fa-solid fa-layer-group" style="font-size:18px;display:block;margin-bottom:8px;color:#333"></i>
            Add task forces to the pool above, then assign units here
          </div>`;
        }
        return `<div style="padding:20px 0;text-align:center;color:var(--text-faint);font-size:12px">
          <i class="fa-solid fa-circle-plus" style="font-size:18px;display:block;margin-bottom:8px;color:#333"></i>
          Use <strong style="color:var(--text-muted)">Add Unit</strong> above to start building this group
        </div>`;
      })() : "";
      return `${toolbarHTML}${pickerHTML}${bgHintHTML}${bgNotesHTML}${entriesHTML}${bgEmptyHTML}`;
  }
  const activeBG = bgList.find(b => b.id === activeBGTabId);
  const bgCardBodyHTML = activeBG ? _armyBGCardBody(activeBG) : "";

  // Equal-width grid tabs - each 1/N of total width
  const bgTabsHTML = `<div style="display:grid;grid-template-columns:repeat(${bgList.length},1fr);gap:1px;background:var(--border-subtle)">
    ${bgList.map(bg => {
      const isActive = activeBGTabId === bg.id;
      const bPts = bgPoints(bg);
      const bgSize = bgUnitCount(bg);
      const bgUndersize = bgViol.violatingIds.has(bg.id);
      const bgMode = army.bgIconMode || "custom";
      const symDef = bgDesignation(army, bg);
      const hasWarn = bgUndersize && bgSize > 0; // only red when has units but not enough
      const symInner = _bgSymInner(symDef, 10);
      const symStyle = `width:20px;height:20px;border-radius:4px;background:${symDef.color}${isActive?"22":"14"};border:1.5px solid ${symDef.color}${isActive?"99":"44"};color:${symDef.color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0`;
      // Status badge: reflect build progress
      const stColor = hasWarn ? "#ef5350"
        : bgSize > 0 ? "#66bb6a"
        : bgViol.minAllowed > 0 ? "#58a6ff"  // empty but min known - blue guidance
        : "#555";
      const stLabel = hasWarn ? `⚠ ${bgSize}`
        : bgSize > 0 ? `${bgSize}u`
        : bgViol.minAllowed > 0 ? `min ${bgViol.minAllowed}`  // show what's needed
        : "-";
      const statusBadge = `<span style="font-size:8px;font-weight:700;color:${stColor};flex-shrink:0;letter-spacing:.3px">${stLabel}</span>`;
      if(isActive) {
        // Active: compact single-row, accent top border
        const symEl = bgMode === "custom"
          ? `<button onclick="openBGSymbolPicker('${army.id}','${bg.id}')" title="${symDef.label} - click to change" style="${symStyle};cursor:pointer;padding:0;border:1.5px solid ${symDef.color}99;transition:background .15s" onmouseover="this.style.background='${symDef.color}33'" onmouseout="this.style.background='${symDef.color}22'">${symInner}</button>`
          : `<div style="${symStyle}">${symInner}</div>`;
        return `<div style="padding:8px 9px;border:none;border-top:2px solid var(--accent);background:var(--surface-page);overflow:hidden;min-width:0">
          <div style="display:flex;align-items:center;gap:5px;min-width:0">
            ${symEl}
            <span style="font-family:var(--font-display);font-size:11px;letter-spacing:.4px;color:var(--accent);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="${esc(bg.name)}">${esc(bg.name)}</span>
            ${statusBadge}
          </div>
        </div>`;
      } else {
        // Inactive: compact single-row, no borders
        const symEl = `<div style="${symStyle}">${symInner}</div>`;
        return `<button onclick="selectBGTab('${army.id}','${bg.id}')"
          style="padding:8px 9px;border:none;border-top:2px solid transparent;background:var(--surface-raised);cursor:pointer;text-align:left;overflow:hidden;min-width:0;width:100%;transition:background .12s,border-top-color .12s"
          onmouseover="this.style.background='var(--surface-page)';this.style.borderTopColor='var(--border-default)'"
          onmouseout="this.style.background='var(--surface-raised)';this.style.borderTopColor='transparent'">
          <div style="display:flex;align-items:center;gap:5px;min-width:0">
            ${symEl}
            <span style="font-family:var(--font-display);font-size:11px;letter-spacing:.4px;color:var(--text-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="${esc(bg.name)}">${esc(bg.name)}</span>
            ${statusBadge}
          </div>
        </button>`;
      }
    }).join("")}
  </div>`;
  const bgViolActive = bgViol.violatingIds.has(activeBGTabId||"");
  const bgCardHTML = `<div style="padding:12px 14px;background:var(--surface-card);border-top:1px solid var(--border-subtle)">
    ${bgCardBodyHTML}
  </div>`;
  // Flat view: every BG stacked vertically (full overview, no tab switching)
  const bgFlatHTML = `<div style="display:flex;flex-direction:column;gap:10px">
    ${bgList.map(bg => {
      const violThis = bgViol.violatingIds.has(bg.id);
      return `<div style="border:1px solid ${violThis?"#ef535066":"var(--border-default)"};border-radius:8px;padding:12px 14px;background:var(--surface-card)">${_armyBGCardBody(bg)}</div>`;
    }).join("")}
  </div>`;
  const bgViewToggleBtn = `<button class="trait-edit-btn" onclick="toggleBGViewMode()" title="${bgViewMode==="flat"?"Switch to tabbed view":"Show all battle groups at once"}"><i class="fa-solid fa-${bgViewMode==="flat"?"table-columns":"list"}"></i> ${bgViewMode==="flat"?"Tabbed":"Show All"}</button>`;

  const fpTag = fp ? `<span style="font-size:9px;font-weight:bold;padding:1px 6px;border-radius:8px;background:#1a2a1a;color:#66bb6a;border:1px solid #66bb6a44;letter-spacing:.5px">FREE PICK</span>` : "";
  // Army icon badge
  const armySym = army.symbol ? _bgSymLookup(army.symbol) : null;
  const armyIconBtn = armySym
    ? `<button onclick="openArmyIconPicker()" title="Army designation icon - click to change" style="width:34px;height:34px;border-radius:8px;background:${armySym.color}1a;border:1.5px solid ${armySym.color}99;color:${armySym.color};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;transition:background .15s" onmouseover="this.style.background='${armySym.color}33'" onmouseout="this.style.background='${armySym.color}1a'">${_bgSymInner(armySym,14)}</button>`
    : `<button onclick="openArmyIconPicker()" title="Set army designation icon" style="width:34px;height:34px;border-radius:8px;background:var(--surface-raised);border:1.5px dashed var(--border-default);color:var(--text-faint);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;font-size:16px;transition:border-color .15s,color .15s" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--border-default)';this.style.color='var(--text-faint)'"><i class="fa-solid fa-plus" style="font-size:11px"></i></button>`;
  // Army icon picker (inline, free icon selection)
  const armyIconPickerHTML = armyIconPickerOpen ? `<div style="margin-bottom:14px;padding:10px 12px;border-radius:8px;background:var(--surface-raised);border:1px solid var(--border-subtle)">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-faint);font-weight:700;margin-bottom:8px">Army Designation</div>
    ${ARMY_ICON_GROUPS.map(grp => `
      <div style="margin-bottom:8px">
        <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">${grp.label}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${grp.keys.map(s => {
            const sd = _bgSymLookup(s);
            const isCurrent = army.symbol === s;
            return `<button onclick="setArmyIcon('${army.id}','${isCurrent?"":s}')" title="${sd.label}" style="width:32px;height:32px;border-radius:6px;padding:0;border:${isCurrent?"2px solid "+sd.color:"1px solid "+sd.color+"44"};background:${isCurrent?sd.color+"2a":"transparent"};color:${sd.color};cursor:pointer;display:inline-flex;align-items:center;justify-content:center">${_bgSymInner(sd)}</button>`;
          }).join("")}
        </div>
      </div>`).join("")}
  </div>` : "";
  const bgMode = army.bgIconMode || "custom";
  const efDeploy = efOfArmy(army.id);
  const efDeployedBadge = efDeploy
    ? `<span style="font-size:10px;color:#8b949e;display:flex;align-items:center;gap:5px;margin-top:4px"><i class="fa-solid fa-flag" style="color:#9c27b0;font-size:9px"></i>Deployed in <strong style="color:#ce93d8">${esc(efDeploy.force.name)}</strong> <span style="color:#555">/</span> <strong style="color:#ce93d8">${esc(efDeploy.ag.name)}</strong></span>`
    : `<span style="font-size:10px;color:#444;display:flex;align-items:center;gap:5px;margin-top:4px"><i class="fa-solid fa-flag" style="font-size:9px"></i>Not deployed in any expeditionary force</span>`;
  panel.innerHTML = breadcrumb + `<div class="card">
    <div class="card-title">
      <div>
        <span style="display:flex;align-items:center;gap:10px">${armyIconBtn}${esc(army.name)} ${fpTag}</span>
        ${efDeployedBadge}
      </div>
      <div style="display:flex;gap:6px">
        <button class="trait-edit-btn" onclick="openPrintArmyModal('${army.id}')"><i class="fa-solid fa-print"></i> Print</button>
        <button class="trait-edit-btn" onclick="exportArmy('${army.id}')"><i class="fa-solid fa-share-nodes"></i> Export</button>
        ${state.armies.length >= 2 ? `<button class="trait-edit-btn" onclick="openCompareArmiesModal('${army.id}')"><i class="fa-solid fa-code-compare"></i> Compare</button>` : ""}
        <button class="trait-edit-btn" onclick="openEditArmyModal('${army.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteArmy('${army.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    </div>
    ${armyIconPickerHTML}
    ${army.notes?`<div style="background:#0d0f14;border:1px solid #1e2530;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px;color:#8b949e;line-height:1.6;font-style:italic">${esc(army.notes).replace(/\n/g,"<br>")}</div>`:""}
    <div class="info-strip" style="${overPtsLimit?"border-color:#ef535055":""}">
      <div>
        <div class="info-strip-label">Deployed</div>
        <div class="info-strip-pts" style="${overPtsLimit?"color:#ef5350":""}">${deployedPts}</div>
      </div>
      <div class="info-strip-sep"></div>
      <div>
        <div class="info-strip-label">Target</div>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="qty-btn" title="Decrease target" onclick="stepArmyPtsLimit('${army.id}',-50)">−</button>
          <input type="number" class="no-spin" min="0" step="50" value="${army.pointsLimit||""}" placeholder="-"
            title="Set a points target for this army"
            style="width:52px;background:var(--surface-raised);border:1px solid var(--border-subtle);border-radius:4px;color:${overPtsLimit?"#ef5350":"var(--text-primary)"};font-size:14px;font-weight:bold;padding:1px 5px;text-align:center;font-family:inherit"
            onchange="setArmyPtsLimit('${army.id}',this.value)"
            onkeydown="if(event.key==='Enter')this.blur()">
          <button class="qty-btn" title="Increase target" onclick="stepArmyPtsLimit('${army.id}',50)">+</button>
          <span style="font-size:11px;color:var(--text-muted)">pts</span>
        </div>
      </div>
      ${!fp&&poolPts!==deployedPts?`<div class="info-strip-sep"></div><div><div class="info-strip-label">Pool</div><div class="info-strip-val">${poolPts} pts</div></div>`:""}
      <div class="info-strip-sep"></div>
      ${!fp?`<div><div class="info-strip-label">Task Forces</div><div class="info-strip-val">${tfs.length}</div></div><div class="info-strip-sep"></div>`:""}
      <div><div class="info-strip-label">Battle Groups</div><div class="info-strip-val">${bgCount}</div></div>
      ${army.faction?`<div class="info-strip-sep"></div><div style="display:flex;align-items:center">${factionPill(army.faction)}</div>`:""}
    </div>
    ${budgetBarHTML}
    ${!fp?`<div style="margin-bottom:16px">
      <div class="sub-divider" style="margin-top:0">
        <div class="sub-divider-label"><i class="fa-solid fa-layer-group" style="color:#7986cb;font-size:9px"></i> Task Force Pool</div>
        <button class="trait-edit-btn" onclick="openAddTFModal('${army.id}')"><i class="fa-solid fa-plus"></i> Add Task Force</button>
      </div>
      ${tfPoolHTML}
    </div>`:""}
    ${deployBannerHTML}
    <div class="sub-divider">
      <div class="sub-divider-label"><i class="fa-solid fa-chess-board" style="color:var(--accent);font-size:9px"></i> Battle Groups</div>
      ${bgViewToggleBtn}
    </div>
    ${bgViewMode==="flat"
      ? bgFlatHTML
      : `<div style="border:1px solid ${bgViolActive?"#ef535066":"var(--border-default)"};border-radius:8px;overflow:hidden">
          ${bgTabsHTML}
          ${bgCardHTML}
        </div>`}
  </div>`;
}

function toggleBGViewMode() {
  bgViewMode = bgViewMode === "flat" ? "tabs" : "flat";
  renderArmyDetail();
}

// ============================================================
// PRINT
// ============================================================

// ── Modal orchestration ───────────────────────────────────
function openPrintModal(type, id) {
  document.getElementById("print-target-type").value = type;
  document.getElementById("print-target-id").value = id;
  const titles = {army:"Print Army", tf:"Print Task Force", force:"Print Expeditionary Force"};
  document.getElementById("modal-print-title").textContent = titles[type] || "Print";
  openModal("modal-print");
}
function openPrintArmyModal(armyId) { openPrintModal("army", armyId); }

function doPrint() {
  const type      = document.getElementById("print-target-type").value;
  const id        = document.getElementById("print-target-id").value;
  const paperSize = document.querySelector('input[name="print-paper"]:checked')?.value || "letter";
  const inkMode   = document.querySelector('input[name="print-ink"]:checked')?.value  || "color";
  closeModal("modal-print");
  if (type === "army")  printArmy(id, paperSize, inkMode);
  if (type === "tf")    printTF(id, paperSize, inkMode);
  if (type === "force") printForce(id, paperSize, inkMode);
}

// ── Shared palette ────────────────────────────────────────
function _printPalette(inkMode) {
  const gray = inkMode === "gray";
  const pal = gray ? {
    pageText:"#111",headBg:"#222",headText:"#fff",cardBg:"#fff",cardBorder:"#aaa",
    sectionHead:"#333",statBg:"#f0f0f0",statBorder:"#ccc",wepBg:"#f5f5f5",wepBorder:"#ddd",
    mutedText:"#666",ptsBoxBg:"#222",ptsBoxText:"#fff",accentLine:"#999",
    tfRowBg:"#f5f5f5",assetColor:"#444",symBg:"#333",symBorder:"#666",symColor:"#fff",
  } : {
    pageText:"#0f1929",headBg:"#162040",headText:"#fff",cardBg:"#fff",cardBorder:"#c0cfe8",
    sectionHead:"#162040",statBg:"#eef3fb",statBorder:"#c0cce8",wepBg:"#f5f8fd",wepBorder:"#dce4f4",
    mutedText:"#546080",ptsBoxBg:"#162040",ptsBoxText:"#fff",accentLine:"#4a7adc",
    tfRowBg:"#f3f7fd",assetColor:"#8a5a00",symBg:"#162040",symBorder:"#3060a8",symColor:"#fff",
  };
  return { pal, gray };
}

// ── Shared element renderers ──────────────────────────────
function _pSymBadge(sd, size, pal, gray) {
  if (!sd) return "";
  const c    = gray ? "#fff" : sd.color;
  const bg   = gray ? "#444" : (sd.color + "1a");
  const bord = gray ? "#666" : (sd.color + "99");
  const fs   = size * 0.55;
  const inner = sd.text
    ? `<span style="font-family:'Bebas Neue',sans-serif;font-size:${sd.text.length>2?Math.round(fs*.9):fs}px;font-weight:bold;line-height:1;letter-spacing:0">${sd.text}</span>`
    : `<i class="${sd.icon}" style="font-size:${fs}px"></i>`;
  return `<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size*.2)}px;background:${bg};border:2.5px solid ${bord};color:${c};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${inner}</div>`;
}

function _pFacPill(factionId, pal, gray) {
  if (!factionId) return "";
  const name  = BUILTIN_FACTION_LABELS[factionId] || (state.customFactions||[]).find(f=>f.id===factionId)?.name || factionId;
  const icon  = BUILTIN_FACTION_ICONS[factionId]  || (state.customFactions||[]).find(f=>f.id===factionId)?.icon;
  const label = icon ? `<i class="fa-solid fa-${icon}"></i> ${esc(name)}` : esc(name);
  if (gray) return `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:bold;background:#e0e0e0;color:#333;border:1px solid #bbb">${label}</span>`;
  const color = FACTION_COLORS[factionId] || (state.customFactions||[]).find(f=>f.id===factionId)?.color || "#888";
  return `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:bold;background:${color}22;color:${color};border:1px solid ${color}55">${label}</span>`;
}

function _pClassBadge(c, gray) {
  const label = classLabel(c);
  if (gray) return `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:bold;text-transform:uppercase;background:#e0e0e0;color:#222;border:1px solid #bbb">${label}</span>`;
  const CLASS_BG_P   = {inf:"#1a3a1a",cav:"#1a2a4a",fg:"#2a1a3a",scout:"#1a3a3a",afv:"#3a2a0a",ac:"#1a3a3a",sh:"#3a1a0a",beh:"#3a0a0a",core:"#0a2a0a",specialist:"#0a0a3a",command:"#2a1a0a",support:"#1a0a2a",commander:"#3a0a0a"};
  const CLASS_TEXT_P = {inf:"#4caf50",cav:"#64b5f6",fg:"#ba68c8",scout:"#4db6ac",afv:"#ffb74d",ac:"#26c6da",sh:"#ff7043",beh:"#ef5350",core:"#4caf50",specialist:"#64b5f6",command:"#ffb74d",support:"#ba68c8",commander:"#ef5350"};
  return `<span style="display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:bold;text-transform:uppercase;background:${CLASS_BG_P[c]||"#222"};color:${CLASS_TEXT_P[c]||"#aaa"}">${label}</span>`;
}

function _pTraitPills(traitArr, allTraits, pal, gray) {
  if (!traitArr || !traitArr.length) return `<span style="color:${pal.mutedText};font-size:10px;font-style:italic">None</span>`;
  return traitArr.map(t => {
    const name = t[0];
    const cnt  = traitCount(t);
    const disp = cnt > 1 ? `${name} ${cnt}` : name;
    const [, entry] = findTraitEntry(allTraits, name) || [];
    const fac = entry ? traitFactionKey(entry) : null;
    if (gray) return `<span style="display:inline-block;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:500;background:#e0e0e0;color:#333;border:1px solid #bbb;margin:1px 2px 1px 0">${esc(disp)}</span>`;
    const color = fac ? (FACTION_COLORS[fac] || (state.customFactions||[]).find(f=>f.id===fac)?.color || "#888") : null;
    const bg   = color ? `${color}18` : "#e8f0fb";
    const bord = color ? `${color}44` : "#b8cae8";
    const tc   = color ? color : "#1a3a6e";
    return `<span style="display:inline-block;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:500;background:${bg};color:${tc};border:1px solid ${bord};margin:1px 2px 1px 0">${esc(disp)}</span>`;
  }).join("");
}

function _pUnitCard(unit, viewType, tfBadgeHTML, opts, pal, gray) {
  opts = opts || {};
  const pts    = calcPoints(unit);
  const pKey   = VIEW_PTS_KEY[viewType] || "unitPts";
  const pVal   = opts.ptsVal != null ? opts.ptsVal : (pts[pKey] != null ? pts[pKey] : "-");
  const pLabel = opts.ptsLabel || VIEW_LABELS[viewType] || "Unit";
  const traitsHTML  = _pTraitPills(unit.standTraits||[], allStandTraits(), pal, gray);
  const weaponsHTML = (unit.weapons||[]).length === 0
    ? `<div style="padding:4px 8px;font-size:10px;color:${pal.mutedText};font-style:italic;background:${pal.wepBg};border-radius:4px;margin-top:3px">${GAME.schema.weapon.emptyText}</div>`
    : unit.weapons.map(w => {
        const wtPills = (w.traits||[]).length ? " | " + _pTraitPills(w.traits, allWeaponTraits(), pal, gray) : "";
        const wName   = w.name ? `<strong>${esc(w.name)}</strong> ` : "";
        return `<div style="padding:4px 8px;font-size:10px;background:${pal.wepBg};border:1px solid ${pal.wepBorder};border-radius:4px;margin-top:3px;line-height:1.5"><span style="color:${pal.pageText}">${wName}<span style="color:${pal.mutedText};font-weight:normal">${GAME.schema.weapon.tag(w)}</span> | ${weaponPrintLine(w)}${wtPills}</span></div>`;
      }).join("");
  const descHTML    = unit.description ? `<div style="font-size:10px;color:${pal.mutedText};font-style:italic;line-height:1.4;padding:3px 0 4px">${esc(unit.description)}</div>` : "";
  const unitSizeStr = opts.tag ? "" : (viewType === "unit" ? ` <span style="font-size:10px;color:${pal.mutedText};font-weight:normal">${pts.unitSize} ${Tn(pts.unitSize,"stand")}</span>` : "");
  const tagHTML = opts.tag ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:8px;font-weight:bold;letter-spacing:.5px;text-transform:uppercase;background:${gray?"#e0e0e0":"#e3f2fd"};color:${gray?"#333":"#1565c0"};border:1px solid ${gray?"#bbb":"#90caf9"}">${esc(opts.tag)}</span>` : "";
  return `<div style="background:${pal.cardBg};border:1.5px solid ${pal.cardBorder};border-radius:8px;padding:10px;break-inside:avoid;page-break-inside:avoid">
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">
      <div style="flex:1;min-width:0">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:.4px;color:${pal.pageText};line-height:1.15">${esc(unit.name)}${unitSizeStr}</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">${_pClassBadge(unit.class,gray)}${_pFacPill(unit.faction,pal,gray)}${tagHTML}${tfBadgeHTML||""}</div>
        ${descHTML}
      </div>
      <div style="background:${pal.ptsBoxBg};color:${pal.ptsBoxText};border-radius:6px;padding:4px 7px;text-align:center;flex-shrink:0;min-width:36px">
        <div style="font-size:13px;font-weight:bold;line-height:1.1">${pVal}</div>
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:.04em;opacity:.75">${pLabel}</div>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;background:${pal.statBg};border:1px solid ${pal.statBorder};border-radius:6px;padding:5px 6px;margin-bottom:6px;gap:2px">
      ${statPrintCells(unit, pts, pal).map(([label,val])=>`<div style="text-align:center;flex:1;min-width:34px;padding:1px 2px"><div style="font-size:7.5px;text-transform:uppercase;color:${pal.mutedText};letter-spacing:.05em;font-weight:700">${label}</div><div style="font-size:12px;font-weight:bold;color:${pal.pageText};line-height:1.15">${val}</div></div>`).join("")}
    </div>
    <div style="margin-bottom:5px">
      <div style="font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:${pal.mutedText};font-weight:700;margin-bottom:3px">${T("standTraits")}</div>
      <div style="display:flex;flex-wrap:wrap;gap:2px">${traitsHTML}</div>
    </div>
    <div>
      <div style="font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:${pal.mutedText};font-weight:700;margin-bottom:2px">Weapons</div>
      ${weaponsHTML}
    </div>
  </div>`;
}

// Printed per-unit cost for a support-role slot: deployment cost + transport,
// then the +10% support premium - the same math the battle-group and TF
// totals use (slotPointValue/entryPointValue), so cards match their headers.
function _pSupportAdjusted(u, unitType, tu) {
  const pts = calcPoints(u);
  const key = VIEW_PTS_KEY[unitType||"unit"] || "unitPts";
  let base = pts[key] != null ? pts[key] : pts.unitPts;
  const tPts = tu ? mechanizedCount(u, tu, unitType) * calcPoints(tu).perStand : 0;
  const total = GAME.cost.applySupportPremium(base + tPts);
  // For mech pairs the transport half shows its own cost - return the
  // remainder so the two point boxes still sum to the charged total.
  return total - tPts;
}

function _pMechPair(carrier, viewType, tu, n, badgeHTML, pal, gray, carrierPtsVal) {
  const connBg   = gray ? "#e8e8e8" : "#e8f5e9";
  const connFg   = gray ? "#555"    : "#2e7d32";
  const connBord = gray ? "#ccc"    : "#a5d6a7";
  function halfContent(unit, vt, extra) {
    extra = extra || {};
    const pts = calcPoints(unit);
    const pKey = VIEW_PTS_KEY[vt] || "unitPts";
    const pVal = extra.ptsVal != null ? extra.ptsVal : (pts[pKey] != null ? pts[pKey] : "-");
    const pLabel = extra.ptsLabel || VIEW_LABELS[vt] || "Unit";
    const traitsHTML = _pTraitPills(unit.standTraits||[], allStandTraits(), pal, gray);
    const weaponsHTML = (unit.weapons||[]).length === 0
      ? `<div style="padding:4px 8px;font-size:10px;color:${pal.mutedText};font-style:italic;background:${pal.wepBg};border-radius:4px;margin-top:3px">${GAME.schema.weapon.emptyText}</div>`
      : unit.weapons.map(w => {
          const wtPills = (w.traits||[]).length ? " | " + _pTraitPills(w.traits, allWeaponTraits(), pal, gray) : "";
          const wName = w.name ? `<strong>${esc(w.name)}</strong> ` : "";
          return `<div style="padding:4px 8px;font-size:10px;background:${pal.wepBg};border:1px solid ${pal.wepBorder};border-radius:4px;margin-top:3px;line-height:1.5"><span style="color:${pal.pageText}">${wName}<span style="color:${pal.mutedText};font-weight:normal">${GAME.schema.weapon.tag(w)}</span> | ${weaponPrintLine(w)}${wtPills}</span></div>`;
        }).join("");
    const descHTML = unit.description ? `<div style="font-size:10px;color:${pal.mutedText};font-style:italic;line-height:1.4;padding:3px 0 4px">${esc(unit.description)}</div>` : "";
    const tagHTML = extra.tag ? `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:8px;font-weight:bold;letter-spacing:.5px;text-transform:uppercase;background:${connBg};color:${connFg};border:1px solid ${connBord}">${esc(extra.tag)}</span>` : "";
    const countHTML = extra.countBadge != null
      ? `<div style="margin-top:5px;font-size:14px;font-weight:bold;color:${connFg}">&times;${extra.countBadge}<span style="font-size:9px;font-weight:normal;color:${pal.mutedText}"> ${T("stands").toLowerCase()}</span></div>`
      : "";
    const unitSizeStr = extra.countBadge == null && vt === "unit"
      ? ` <span style="font-size:10px;color:${pal.mutedText};font-weight:normal">${pts.unitSize} ${Tn(pts.unitSize,"stand")}</span>`
      : "";
    return `<div style="flex:1;min-width:0;padding:10px">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">
        <div style="flex:1;min-width:0">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:.4px;color:${pal.pageText};line-height:1.15">${esc(unit.name)}${unitSizeStr}</div>
          <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">${_pClassBadge(unit.class,gray)}${_pFacPill(unit.faction,pal,gray)}${tagHTML}${extra.badge||""}</div>
          ${descHTML}${countHTML}
        </div>
        <div style="background:${pal.ptsBoxBg};color:${pal.ptsBoxText};border-radius:6px;padding:4px 7px;text-align:center;flex-shrink:0;min-width:36px">
          <div style="font-size:13px;font-weight:bold;line-height:1.1">${pVal}</div>
          <div style="font-size:8px;text-transform:uppercase;letter-spacing:.04em;opacity:.75">${pLabel}</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;background:${pal.statBg};border:1px solid ${pal.statBorder};border-radius:6px;padding:5px 6px;margin-bottom:6px;gap:2px">
        ${statPrintCells(unit, pts, pal).map(([l,v])=>`<div style="text-align:center;flex:1;min-width:34px;padding:1px 2px"><div style="font-size:7.5px;text-transform:uppercase;color:${pal.mutedText};letter-spacing:.05em;font-weight:700">${l}</div><div style="font-size:12px;font-weight:bold;color:${pal.pageText};line-height:1.15">${v}</div></div>`).join("")}
      </div>
      <div style="margin-bottom:5px">
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:${pal.mutedText};font-weight:700;margin-bottom:3px">${T("standTraits")}</div>
        <div style="display:flex;flex-wrap:wrap;gap:2px">${traitsHTML}</div>
      </div>
      <div>
        <div style="font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:${pal.mutedText};font-weight:700;margin-bottom:2px">Weapons</div>
        ${weaponsHTML}
      </div>
    </div>`;
  }
  const tuPtsPerStand = calcPoints(tu).perStand;
  return `<div class="mech-pair-print" style="display:flex;background:${pal.cardBg};border:1.5px solid ${pal.cardBorder};border-radius:8px;overflow:hidden;break-inside:avoid;page-break-inside:avoid">
    ${halfContent(carrier, viewType, {badge: badgeHTML||"", ptsVal: carrierPtsVal != null ? carrierPtsVal : undefined})}
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px;background:${connBg};border-left:1px solid ${connBord};border-right:1px solid ${connBord};gap:4px;min-width:26px;flex-shrink:0">
      <i class="fa-solid fa-truck" style="color:${connFg};font-size:12px"></i>
      <span style="font-size:7px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:${connFg};writing-mode:vertical-rl;transform:rotate(180deg)">Mechanized</span>
    </div>
    ${halfContent(tu, "unit", {countBadge: n, tag: "Transport", ptsVal: tuPtsPerStand, ptsLabel: `/ ${T("stand")}`})}
  </div>`;
}

function _pCardGrid(unitCards, pal) {
  // Chunk cards into rows: full-width mech pairs get their own row, normal cards pair up two per row.
  // Block-flow fragmentation works in every engine - unlike flex/grid containers, which WebKit refuses to split across pages.
  const rows = [];
  let pending = null;
  for (const c of unitCards) {
    if (c.full) {
      if (pending) { rows.push([pending]); pending = null; }
      rows.push([c]);
    } else if (pending) {
      rows.push([pending, c]); pending = null;
    } else {
      pending = c;
    }
  }
  if (pending) rows.push([pending]);
  return unitCards.length
    ? rows.map(r => r[0].full
        ? `<div class="card-row">${r[0].html}</div>`
        : `<div class="card-row"><div class="card-cell">${r[0].html}</div><div class="card-cell">${r[1]?r[1].html:""}</div></div>`
      ).join("")
    : `<div style="padding:16px;text-align:center;color:${pal.mutedText};font-style:italic">No units</div>`;
}

function _printShell(title, bodyContent, paperSize, pal) {
  const pageSize   = paperSize === "a4" ? "210mm 297mm" : "8.5in 11in";
  const pageMargin = "0.5in";
  const PAGE_H_PX  = paperSize === "a4" ? 1123 : 1056;
  const PAGE_W_PX  = paperSize === "a4" ? 794  : 816;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} - Print</title>
<style>${document.getElementById('offline-assets')?document.getElementById('offline-assets').textContent:''}</style>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Barlow',sans-serif;background:#fff;color:${pal.pageText};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.print-page{padding:0}
.page-break{page-break-before:always;break-before:always}
.card-row{display:flex;gap:10px;align-items:stretch;margin-bottom:10px;break-inside:avoid;page-break-inside:avoid}
.card-cell{flex:1 1 0;min-width:0;display:flex;flex-direction:column}
.card-cell>div{flex:1}
.card-row>.mech-pair-print{flex:1 1 100%}
.bg-header{break-after:avoid;page-break-after:avoid}
@media print{@page{size:${pageSize};margin:0}body{margin:0}.print-page{padding:${pageMargin};-webkit-box-decoration-break:clone;box-decoration-break:clone}}
@media screen{body{max-width:${paperSize==="a4"?"794px":"860px"};margin:24px auto;padding:24px;background:#e8eaed}.print-page{background:#fff;padding:0.5in;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,.18);margin-bottom:28px}}
</style>
</head>
<body>
${bodyContent}
<script>
(function(){
  var MARGIN_PX = 48;
  var PAGE_H_PX = ${PAGE_H_PX};
  var PAGE_W_PX = ${PAGE_W_PX};
  var CONTENT_H = PAGE_H_PX - 2*MARGIN_PX - 10;

  function splitOverflowingPages(){
    var pages = Array.from(document.querySelectorAll('.print-page'));
    for(var pi=pages.length-1;pi>=0;pi--){
      var page = pages[pi];
      var children = Array.from(page.children);
      var rows = children.filter(function(el){return el.classList.contains('card-row');});
      if(!rows.length) continue;
      var header = children.find(function(el){return el.classList.contains('bg-header');});
      var headerH = header ? header.getBoundingClientRect().height+16 : 0;
      var rowItems = rows.map(function(r){return{el:r,h:Math.max(r.getBoundingClientRect().height,40)+10};});
      var groups = [[]];
      var used = headerH;
      for(var ri=0;ri<rowItems.length;ri++){
        var item=rowItems[ri];
        if(used+item.h<=CONTENT_H){groups[groups.length-1].push(item.el);used+=item.h;}
        else{groups.push([item.el]);used=item.h;}
      }
      if(groups.length<=1) continue;
      rows.forEach(function(r){page.removeChild(r);});
      groups[0].forEach(function(r){page.appendChild(r);});
      var parent=page.parentNode;
      var insertAfter=page;
      for(var gi=1;gi<groups.length;gi++){
        var np=document.createElement('div');
        np.className='print-page page-break';
        groups[gi].forEach(function(r){np.appendChild(r);});
        parent.insertBefore(np,insertAfter.nextSibling);
        insertAfter=np;
      }
    }
  }

  function doRepaginate(){
    var st=document.createElement('style');
    st.textContent='body{width:'+PAGE_W_PX+'px!important;max-width:'+PAGE_W_PX+'px!important;margin:0!important;padding:0!important}';
    document.head.appendChild(st);
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      splitOverflowingPages();
      document.head.removeChild(st);
      setTimeout(function(){window.print();},350);
    });});
  }

  (document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(doRepaginate);
})();
<\/script>
</body>
</html>`;
}

// ── Army print ────────────────────────────────────────────
function _buildArmyPrintContent(army, pal, gray) {
  _ensureBGs(army);
  const fp          = isFreePick(army);
  const bgCount     = army.bgCount || 3;
  const bgList      = army.battleGroups.slice(0, bgCount);
  const tfs         = (army.taskForceIds || []).map(id => state.taskForces.find(t => t.id === id)).filter(Boolean);
  const allAssets   = allTacticalAssets();
  const deployedPts = armyDeployedPoints(army);

  const armySym    = army.symbol ? _bgSymLookup(army.symbol) : null;
  const armySymEl  = armySym
    ? _pSymBadge(armySym, 72, pal, gray)
    : `<div style="width:72px;height:72px;border-radius:14px;background:${pal.symBg};border:2px solid ${pal.symBorder};display:inline-flex;align-items:center;justify-content:center;color:${pal.symColor};font-size:28px;flex-shrink:0"><i class="fa-solid fa-chess-rook"></i></div>`;

  const tfRows = tfs.length === 0
    ? `<div style="color:${pal.mutedText};font-style:italic;font-size:12px">No task forces</div>`
    : tfs.map(tf => {
        const asset    = tf.tacAsset ? allAssets.find(a=>a.id===tf.tacAsset) : null;
        const tfColor  = gray ? "#555" : (FACTION_COLORS[tf.faction]||"#555");
        const useColor = u => {
          if (gray) return "#555";
          return {activation:"#9c27b0",deployment:"#2196f3",end:"#4caf50",reaction:"#f44336"}[u.toLowerCase()]||"#888";
        };
        const assetPills = asset ? (asset.use||[]).map(u=>`<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;background:${useColor(u)}22;color:${useColor(u)};border:1px solid ${useColor(u)}55">${esc(u)}</span>`).join("") : "";
        return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:${pal.tfRowBg};border:1px solid ${pal.cardBorder};border-radius:6px;margin-bottom:6px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:13px;color:${pal.pageText}">${esc(tf.name)}</span>
              ${tf.faction ? _pFacPill(tf.faction, pal, gray) : ""}
              <span style="font-size:10px;color:${pal.mutedText}">${(tf.units||[]).reduce((s,u)=>s+u.quantity,0)} units</span>
            </div>
            ${asset ? `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:4px"><i class="fa-solid fa-chess" style="color:${pal.assetColor};font-size:10px"></i><span style="font-size:11px;font-weight:bold;color:${pal.assetColor}">${esc(asset.name)}</span>${assetPills}</div>` : ""}
          </div>
        </div>`;
      }).join("");

  const bgSummaryRows = bgList.map(bg => {
    const sd   = bgDesignation(army, bg);
    const bgPt = bgPoints(bg);
    const bgSz = bgUnitCount(bg);
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${pal.tfRowBg};border:1px solid ${pal.cardBorder};border-radius:6px;margin-bottom:4px">
      ${_pSymBadge(sd, 28, pal, gray)}
      <span style="font-weight:700;font-size:13px;color:${pal.pageText}">${esc(bg.name)}</span>
      <span style="font-size:10px;color:${pal.mutedText};margin-left:auto">${bgSz} unit${bgSz!==1?"s":""} · ${bgPt} pts</span>
    </div>`;
  }).join("");

  const overviewPage = `<div class="print-page">
    <div style="background:${pal.headBg};color:${pal.headText};border-radius:10px;padding:18px 22px;margin-bottom:18px;display:flex;align-items:center;gap:18px">
      ${armySymEl}
      <div style="flex:1;min-width:0">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:2px;line-height:1;margin-bottom:5px">${esc(army.name)}</div>
        <div style="font-size:10px;letter-spacing:.8px;opacity:.65;text-transform:uppercase;margin-bottom:6px">${fp?"Free Pick Army":"Task Force Army"}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:13px;font-weight:600">${deployedPts} pts deployed</span>
          ${army.faction ? _pFacPill(army.faction, pal, gray) : ""}
          ${fp?`<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:bold;background:#4caf5022;color:#4caf50;border:1px solid #4caf5055;letter-spacing:.5px">FREE PICK</span>`:""}
        </div>
      </div>
    </div>
    ${army.notes?`<div style="padding:10px 14px;background:${pal.tfRowBg};border:1px solid ${pal.cardBorder};border-radius:6px;margin-bottom:16px;font-size:12px;color:${pal.mutedText};line-height:1.6;font-style:italic">${esc(army.notes).replace(/\n/g,"<br>")}</div>`:""}
    ${!fp?`<div style="margin-bottom:16px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1px;color:${pal.sectionHead};border-bottom:2px solid ${pal.accentLine};padding-bottom:4px;margin-bottom:10px">Task Forces</div>
      ${tfRows}
    </div>`:""}
    <div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1px;color:${pal.sectionHead};border-bottom:2px solid ${pal.accentLine};padding-bottom:4px;margin-bottom:10px">Battle Groups</div>
      ${bgSummaryRows}
    </div>
  </div>`;

  const bgPages = bgList.map(bg => {
    const sd      = bgDesignation(army, bg);
    const bgPt    = bgPoints(bg);
    const bgSz    = bgUnitCount(bg);
    const hdrBg   = gray ? "#e0e0e0" : (sd?.color ? sd.color + "0e" : "#edf2fb");
    const hdrBord = gray ? "#bbb"    : (sd?.color ? sd.color + "55" : "#c0cce8");

    const withTransport = (carrier, viewType, tu, badgeHTML, role) => {
      const sup = role === "support" ? _pSupportAdjusted(carrier, viewType, tu) : null;
      if (!tu) return [{html: _pUnitCard(carrier, viewType, badgeHTML||"", sup != null ? {ptsVal: sup} : {}, pal, gray), full: false}];
      return [{html: _pMechPair(carrier, viewType, tu, mechanizedCount(carrier, tu, viewType), badgeHTML||"", pal, gray, sup != null ? sup : undefined), full: true}];
    };
    const unitCards = (bg.entries||[]).flatMap(e => {
      if (fp) {
        const u = unitById(e.unitId);
        if (!u) return [];
        const qty = e.qty || 1;
        const tu = e.transport ? unitById(e.transport) : null;
        return Array.from({length:qty}).flatMap(() => withTransport(u, e.unitType||"unit", tu, ""));
      } else {
        const tf   = state.taskForces.find(t=>t.id===e.tfId);
        const slot = tf && (tf.units||[]).find(s=>s.id===e.slotId);
        const u    = slot && unitById(slot.unitId);
        if (!u) return [];
        const qty     = e.qty || slot.quantity || 1;
        const tfColor = gray ? "#555" : (FACTION_COLORS[tf.faction]||"#555");
        const asset   = tf.tacAsset ? allAssets.find(a=>a.id===tf.tacAsset) : null;
        const tfBadge = asset
          ? `<span style="display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap"><span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:bold;background:${tfColor}18;color:${tfColor};border:1px solid ${tfColor}44">${esc(tf.name)}</span><span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:bold;background:${pal.assetColor}18;color:${pal.assetColor};border:1px solid ${pal.assetColor}44"><i class="fa-solid fa-chess" style="font-size:7px;margin-right:2px"></i>${esc(asset.name)}</span></span>`
          : `<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:bold;background:${tfColor}18;color:${tfColor};border:1px solid ${tfColor}44">${esc(tf.name)}</span>`;
        const tu = slot.transport ? unitById(slot.transport) : null;
        return Array.from({length:qty}).flatMap(() => withTransport(u, slot.unitType||"unit", tu, tfBadge, slot.role));
      }
    });

    return `<div class="print-page page-break">
      <div class="bg-header" style="display:flex;align-items:stretch;background:${hdrBg};border:2px solid ${hdrBord};border-radius:10px;overflow:hidden;margin-bottom:16px">
        <div style="flex:1;padding:14px 18px">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:1.5px;color:${pal.pageText};line-height:1.1;margin-bottom:5px">${esc(bg.name)}</div>
          ${bg.notes?`<div style="font-size:12px;color:${pal.mutedText};line-height:1.5;font-style:italic;margin-bottom:6px">${esc(bg.notes).replace(/\n/g,"<br>")}</div>`:""}
          <div style="font-size:11px;color:${pal.mutedText}">${bgSz} unit${bgSz!==1?"s":""} · ${bgPt} pts</div>
        </div>
        <div style="padding:14px 20px;display:flex;align-items:center;justify-content:center;border-left:1px solid ${hdrBord};background:${gray?"#d0d0d0":sd?.color?sd.color+"22":"#dde6f8"}">
          ${_pSymBadge(sd, 72, pal, gray)}
        </div>
      </div>
      ${_pCardGrid(unitCards, pal)}
    </div>`;
  }).join("");

  return overviewPage + bgPages;
}

function printArmy(armyId, paperSize, inkMode) {
  const army = state.armies.find(a => a.id === armyId);
  if (!army) return;
  const { pal, gray } = _printPalette(inkMode);
  const content = _buildArmyPrintContent(army, pal, gray);
  const w = window.open("", "_blank");
  if (w) { w.document.write(_printShell(army.name, content, paperSize, pal)); w.document.close(); }
  else showToast("Couldn't open the print window - allow pop-ups for this site and try again.");
}

// ── Task Force print ──────────────────────────────────────
function printTF(tfId, paperSize, inkMode) {
  const tf = state.taskForces.find(t => t.id === tfId);
  if (!tf) return;
  const { pal, gray } = _printPalette(inkMode);
  const allAssets = allTacticalAssets();
  const asset     = tf.tacAsset ? allAssets.find(a=>a.id===tf.tacAsset) : null;
  const pts       = tfPoints(tf);
  const typeLabel = tf.tfType ? _tfTypeLabel(tf.tfType) : "";
  const ROLE_COLORS = {core:"#4caf50",specialist:"#64b5f6",command:"#ffb74d",support:"#ba68c8"};

  const useColor = u => {
    if (gray) return "#555";
    return {activation:"#9c27b0",deployment:"#2196f3",end:"#4caf50",reaction:"#f44336"}[u.toLowerCase()]||"#888";
  };
  const assetBlock = asset ? `<div style="padding:10px 14px;background:${pal.tfRowBg};border:1px solid ${pal.cardBorder};border-radius:6px;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <i class="fa-solid fa-chess" style="color:${pal.assetColor}"></i>
      <span style="font-weight:700;font-size:13px;color:${pal.assetColor}">${esc(asset.name)}</span>
      ${(asset.use||[]).map(u=>`<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;background:${useColor(u)}22;color:${useColor(u)};border:1px solid ${useColor(u)}55">${esc(u)}</span>`).join("")}
    </div>
    ${asset.description?`<div style="font-size:11px;color:${pal.mutedText};margin-top:5px;line-height:1.5">${esc(asset.description)}</div>`:""}
  </div>` : "";

  const roleGroups = {};
  for (const slot of (tf.units||[])) {
    const r = slot.role || "core";
    if (!roleGroups[r]) roleGroups[r] = [];
    roleGroups[r].push(slot);
  }
  const rosterRows = Object.entries(roleGroups).map(([role, slots]) => {
    const rc = gray ? "#555" : (ROLE_COLORS[role]||"#555");
    return slots.map(slot => {
      const u = unitById(slot.unitId);
      const name = u ? esc(u.name) : `<em style="color:${pal.mutedText}">Unknown</em>`;
      return `<tr style="border-bottom:1px solid ${pal.cardBorder}">
        <td style="padding:5px 8px;font-size:11px"><span style="display:inline-block;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:bold;text-transform:uppercase;background:${rc}18;color:${rc};border:1px solid ${rc}44">${role}</span></td>
        <td style="padding:5px 8px;font-size:12px;font-weight:600;color:${pal.pageText}">${name}</td>
        <td style="padding:5px 8px;font-size:11px;color:${pal.mutedText};text-align:center">${slot.quantity}</td>
        <td style="padding:5px 8px;font-size:11px;color:${pal.mutedText};text-align:right">${VIEW_LABELS[slot.unitType]||"Unit"}</td>
      </tr>`;
    }).join("");
  }).join("");

  const overviewPage = `<div class="print-page">
    <div style="background:${pal.headBg};color:${pal.headText};border-radius:10px;padding:18px 22px;margin-bottom:18px;display:flex;align-items:center;gap:18px">
      <div style="flex:1;min-width:0">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:2px;line-height:1;margin-bottom:5px">${esc(tf.name)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${tf.faction ? _pFacPill(tf.faction, pal, gray) : ""}
          ${typeLabel ? `<span style="display:inline-block;padding:2px 8px;border-radius:8px;font-size:10px;font-weight:bold;background:${gray?"#e0e0e0":"#7986cb22"};color:${gray?"#333":"#7986cb"};border:1px solid ${gray?"#bbb":"#7986cb55"}">${esc(typeLabel)}</span>` : ""}
        </div>
      </div>
      <div style="background:${pal.ptsBoxBg};color:${pal.ptsBoxText};border-radius:8px;padding:8px 14px;text-align:center;flex-shrink:0">
        <div style="font-size:22px;font-weight:bold;line-height:1.1">${pts}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;opacity:.75">Total pts</div>
      </div>
    </div>
    ${tf.notes?`<div style="padding:10px 14px;background:${pal.tfRowBg};border:1px solid ${pal.cardBorder};border-radius:6px;margin-bottom:14px;font-size:12px;color:${pal.mutedText};line-height:1.6;font-style:italic">${esc(tf.notes).replace(/\n/g,"<br>")}</div>`:""}
    ${assetBlock}
    <div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1px;color:${pal.sectionHead};border-bottom:2px solid ${pal.accentLine};padding-bottom:4px;margin-bottom:10px">Roster</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid ${pal.cardBorder};border-radius:6px;overflow:hidden">
        <thead><tr style="background:${pal.statBg}">
          <th style="padding:5px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${pal.mutedText};font-weight:700;text-align:left">Role</th>
          <th style="padding:5px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${pal.mutedText};font-weight:700;text-align:left">Unit</th>
          <th style="padding:5px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${pal.mutedText};font-weight:700;text-align:center">Qty</th>
          <th style="padding:5px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:${pal.mutedText};font-weight:700;text-align:right">Type</th>
        </tr></thead>
        <tbody>${rosterRows}</tbody>
      </table>
    </div>
  </div>`;

  const ROLE_ORDER = ["core","specialist","command","support"];
  const unitPages = ROLE_ORDER.filter(role => roleGroups[role]).map(role => {
    const slots = roleGroups[role];
    const rc    = gray ? "#555" : (ROLE_COLORS[role]||"#555");
    const hdrBg   = gray ? "#e0e0e0" : `${rc}0e`;
    const hdrBord = gray ? "#bbb"    : `${rc}55`;
    const unitCards = slots.flatMap(slot => {
      const u = unitById(slot.unitId);
      if (!u) return [];
      const tu = slot.transport ? unitById(slot.transport) : null;
      const sup = slot.role === "support" ? _pSupportAdjusted(u, slot.unitType, tu) : null;
      if (tu) return [{html: _pMechPair(u, slot.unitType||"unit", tu, mechanizedCount(u, tu, slot.unitType), "", pal, gray, sup != null ? sup : undefined), full: true}];
      return [{html: _pUnitCard(u, slot.unitType||"unit", "", sup != null ? {ptsVal: sup} : {}, pal, gray), full: false}];
    });
    return `<div class="print-page page-break">
      <div class="bg-header" style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:${hdrBg};border:2px solid ${hdrBord};border-radius:10px;margin-bottom:16px">
        <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1.2px;color:${rc};text-transform:capitalize">${role}</span>
        <span style="font-size:11px;color:${pal.mutedText}">${slots.reduce((s,sl)=>s+sl.quantity,0)} units</span>
      </div>
      ${_pCardGrid(unitCards, pal)}
    </div>`;
  }).join("");

  const w = window.open("", "_blank");
  if (w) { w.document.write(_printShell(tf.name, overviewPage + unitPages, paperSize, pal)); w.document.close(); }
  else showToast("Couldn't open the print window - allow pop-ups for this site and try again.");
}

// ── Expeditionary Force print ─────────────────────────────
function printForce(forceId, paperSize, inkMode) {
  const force = (state.expeditionaryForces||[]).find(f => f.id === forceId);
  if (!force) return;
  _ensureAGs(force);
  const { pal, gray } = _printPalette(inkMode);
  const agCount = force.agCount || 3;
  const agList  = (force.armyGroups||[]).slice(0, agCount);

  const agSummaryRows = agList.map(ag => {
    const armyList = (ag.armyIds||[]).map(id=>state.armies.find(a=>a.id===id)).filter(Boolean);
    const agPts = armyList.reduce((s,a)=>s+armyPoints(a),0);   // pool points - matches the on-screen Forces page
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${pal.tfRowBg};border:1px solid ${pal.cardBorder};border-radius:6px;margin-bottom:4px">
      <span style="font-weight:700;font-size:13px;color:${pal.pageText}">${esc(ag.name||"Army Group")}</span>
      <span style="font-size:10px;color:${pal.mutedText};margin-left:auto">${armyList.length} arm${armyList.length!==1?"ies":"y"} · ${agPts} pts</span>
    </div>`;
  }).join("");

  const overviewPage = `<div class="print-page">
    <div style="background:${pal.headBg};color:${pal.headText};border-radius:10px;padding:18px 22px;margin-bottom:18px">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:32px;letter-spacing:2px;line-height:1;margin-bottom:5px">${esc(force.name)}</div>
      <div style="font-size:10px;letter-spacing:.8px;opacity:.65;text-transform:uppercase">Expeditionary Force</div>
    </div>
    ${force.description?`<div style="padding:10px 14px;background:${pal.tfRowBg};border:1px solid ${pal.cardBorder};border-radius:6px;margin-bottom:16px;font-size:12px;color:${pal.mutedText};line-height:1.6;font-style:italic">${esc(force.description)}</div>`:""}
    <div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1px;color:${pal.sectionHead};border-bottom:2px solid ${pal.accentLine};padding-bottom:4px;margin-bottom:10px">Army Groups</div>
      ${agSummaryRows}
    </div>
  </div>`;

  const agPages = agList.map((ag, agIdx) => {
    const armyList = (ag.armyIds||[]).map(id=>state.armies.find(a=>a.id===id)).filter(Boolean);
    if (!armyList.length) return "";
    const agBanner = `<div style="background:${gray?"#2a2a2a":"#1e2a4a"};color:#fff;border-radius:8px;padding:10px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
      <i class="fa-solid fa-layer-group" style="font-size:14px;opacity:.8"></i>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1.2px">${esc(ag.name||"Army Group")}</span>
    </div>`;
    return armyList.map((army, armyIdx) => {
      let content = _buildArmyPrintContent(army, pal, gray);
      if (armyIdx === 0) {
        // inject AG banner at start of first army's overview page
        content = content.replace('<div class="print-page">', `<div class="print-page">${agBanner}`);
      }
      if (agIdx > 0 || armyIdx > 0) {
        // every army after the very first starts on a fresh sheet
        content = content.replace('<div class="print-page">', '<div class="print-page page-break">');
      }
      return content;
    }).join("");
  }).join("");

  const w = window.open("", "_blank");
  if (w) { w.document.write(_printShell(force.name, overviewPage + agPages, paperSize, pal)); w.document.close(); }
  else showToast("Couldn't open the print window - allow pop-ups for this site and try again.");
}

// ===== FREE-PICK UNIT MODAL =====
function openFPBGUnitModal(armyId, bgId) {
  fpUnitTargetArmyId = armyId;
  fpUnitTargetBgId = bgId;
  fpUnitAddedCount = 0;
  fpAddQty = 1;
  const fpQtyEl = document.getElementById("fp-add-qty-val");
  if(fpQtyEl) fpQtyEl.textContent = "1";
  const army = state.armies.find(a=>a.id===armyId);
  const note = document.getElementById("fp-unit-faction-note");
  if(army && army.faction) {
    note.style.display = "block";
    note.innerHTML = `<i class="fa-solid fa-filter" style="margin-right:5px"></i>Showing units that match the ${factionPill(army.faction)} faction restriction. Units without a faction are also allowed.`;
  } else {
    note.style.display = "none";
  }
  document.getElementById("fp-unit-added").textContent = "";
  _renderFPUnitList();
  openModal("modal-fp-unit");
}

function closeFPUnitModal() {
  closeModal("modal-fp-unit");
  fpUnitTargetArmyId = null;
  fpUnitTargetBgId = null;
  renderArmyDetail();
}

function _renderFPUnitList() {
  const army = state.armies.find(a=>a.id===fpUnitTargetArmyId);
  const bg = army && (army.battleGroups||[]).find(b=>b.id===fpUnitTargetBgId);
  const listEl = document.getElementById("fp-unit-list");
  if(!army || !bg) { listEl.innerHTML = ""; return; }

  const filtered = allUnits().filter(u => fpUnitMatchesFaction(u, army));

  if(!filtered.length) {
    listEl.innerHTML = `<div style="font-size:12px;color:#555;font-style:italic;padding:8px 0">No units in the library${army.faction?" matching the faction restriction":""}.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(u => {
    const pts = calcPoints(u);
    const addBtn = (type, label, ptsKey) => {
      const pv = pts[ptsKey];
      if(pv == null) return "";
      return `<button class="trait-edit-btn" style="font-size:10px;line-height:1.3;text-align:center;padding:3px 7px" onclick="addFPUnit('${u.id}','${type}');event.stopPropagation()">+${label}<br><span style="font-size:9px;color:var(--text-muted);font-weight:normal">${pv} pts</span></button>`;
    };
    const btns = [
      addBtn("unit","Unit","unitPts"),
      addBtn("independent","Ind","indPts"),
      addBtn("hero","Hero","heroPts"),
      addBtn("command","Cmd","cmdPts"),
      addBtn("cmdHero","CmdHero","cmdHeroPts"),
    ].filter(Boolean).join("");
    return `<div class="list-row" style="flex-direction:column;align-items:stretch;gap:6px;cursor:default">
      <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
        <span style="font-weight:bold">${esc(u.name)}</span>
        ${classBadge(u.class,true)}${factionBadge(u)}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span style="font-size:11px;color:#8b949e">${u.speed}" ${u.mobility} &bull; Aim ${u.aim}+ &bull; Save ${u.saveNumber}+ &bull; ${pts.unitSize} ${Tn(pts.unitSize,"stand")}</span>
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${btns}</div>
      </div>
    </div>`;
  }).join("");
}

function addFPUnit(unitId, unitType) {
  const army = state.armies.find(a=>a.id===fpUnitTargetArmyId);
  const bg = army && (army.battleGroups||[]).find(b=>b.id===fpUnitTargetBgId);
  if(!army || !bg) return;
  bg.entries = bg.entries || [];
  const resolvedType = unitType || "unit";
  const addQty = Math.max(1, fpAddQty|0);
  // Never merge into a mechanized entry - the new copies have no transport
  // and would otherwise be silently charged for one.
  const existing = bg.entries.find(e => e.unitId === unitId && e.unitType === resolvedType && !e.transport);
  if(existing) {
    existing.qty = (existing.qty || 1) + addQty;
  } else {
    bg.entries.push({id:"fpe_"+uid(), unitId, unitType: resolvedType, qty:addQty});
  }
  fpUnitAddedCount += addQty;
  saveState();
  const addedEl = document.getElementById("fp-unit-added");
  if(addedEl) addedEl.textContent = `Added ${fpUnitAddedCount} unit${fpUnitAddedCount!==1?"s":""} to ${bg.name}`;
}

function changeFPAddQty(delta) {
  fpAddQty = Math.min(Math.max(1, fpAddQty + delta), 99);
  const el = document.getElementById("fp-add-qty-val");
  if(el) el.textContent = fpAddQty;
}

function changeFPEntryQty(armyId, bgId, entryId, delta) {
  const army = state.armies.find(a=>a.id===armyId);
  const bg = army && (army.battleGroups||[]).find(b=>b.id===bgId);
  if(!bg) return;
  const entry = (bg.entries||[]).find(e=>e.id===entryId);
  if(!entry) return;
  const nq = (entry.qty||1) + delta;
  if(nq < 1) return;
  entry.qty = nq;
  saveState();
  renderArmyDetail();
}

function removeFPEntry(armyId, bgId, entryId) {
  const army = state.armies.find(a=>a.id===armyId);
  const bg = army && (army.battleGroups||[]).find(b=>b.id===bgId);
  if(!bg) return;
  bg.entries = (bg.entries||[]).filter(e=>e.id!==entryId);
  saveState();
  renderArmyDetail();
}

function openNewArmyModal() {
  editingArmyId = null;
  document.getElementById("army-modal-title").childNodes[0].textContent = "New Army ";
  document.getElementById("army-modal-save-btn").textContent = "Create";
  document.getElementById("army-new-name").value = "";
  document.getElementById("army-faction").value = "";
  document.getElementById("army-bg-count").value = "3";
  document.getElementById("army-points-limit").value = "";
  document.getElementById("army-type-tf").checked = true;
  document.querySelectorAll("input[name='army-type']").forEach(r => r.disabled = false);
  document.getElementById("army-type-lock-note").style.display = "none";
  document.getElementById("army-bg-mode").value = "custom";
  document.getElementById("army-notes").value = "";
  clearFieldErr("army-new-name");
  modalMsg("army-modal-msg", "");
  _refreshArmyFactionSelect();
  openModal("modal-army");
}

function setArmyPtsLimit(armyId, rawVal) {
  const army = state.armies.find(a => a.id === armyId);
  if (!army) return;
  const n = parseInt(rawVal, 10);
  army.pointsLimit = (!isNaN(n) && n > 0) ? n : null;
  saveState();
  renderArmyList();
  renderArmyDetail();
}

function stepArmyPtsLimit(armyId, delta) {
  const army = state.armies.find(a => a.id === armyId);
  if (!army) return;
  const next = Math.max(0, (army.pointsLimit || 0) + delta);
  army.pointsLimit = next > 0 ? next : null;
  saveState();
  renderArmyList();
  renderArmyDetail();
}

function openEditArmyModal(id) {
  const army = state.armies.find(a=>a.id===id);
  if(!army) return;
  editingArmyId = id;
  document.getElementById("army-modal-title").childNodes[0].textContent = "Edit Army ";
  document.getElementById("army-modal-save-btn").textContent = "Save Changes";
  document.getElementById("army-new-name").value = army.name;
  _refreshArmyFactionSelect();
  document.getElementById("army-faction").value = army.faction || "";
  document.getElementById("army-bg-count").value = String(army.bgCount || 3);
  document.getElementById("army-points-limit").value = army.pointsLimit || "";
  const isFP = isFreePick(army);
  document.getElementById(isFP ? "army-type-fp" : "army-type-tf").checked = true;
  document.querySelectorAll("input[name='army-type']").forEach(r => r.disabled = true);
  document.getElementById("army-type-lock-note").style.display = "block";
  document.getElementById("army-bg-mode").value = army.bgIconMode || "custom";
  document.getElementById("army-notes").value = army.notes || "";
  clearFieldErr("army-new-name");
  modalMsg("army-modal-msg", "");
  openModal("modal-army");
}

function _refreshArmyFactionSelect() {
  const sel = document.getElementById("army-faction");
  const builtIn = [["","No Faction"],["standard","Standard"],["precursor","Precursor"],["soulless","Soulless"],["swarm","Swarm"],["warrior","Warrior"]];
  const custom = (state.customFactions||[]).map(cf=>[cf.id, cf.name]);
  const cur = sel.value;
  sel.innerHTML = [...builtIn,...custom,["any","Any Faction"]].map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join("");
  sel.value = cur;
}

function saveArmy() {
  modalMsg("army-modal-msg", "");
  const name = document.getElementById("army-new-name").value.trim();
  if(!name) { showFieldErr("army-new-name","Enter an army name."); return; }
  const factionRaw = document.getElementById("army-faction").value;
  const faction = (factionRaw && factionRaw !== "any") ? factionRaw : null;
  const bgCount = parseInt(document.getElementById("army-bg-count").value) || 3;
  const limitRaw = parseInt(document.getElementById("army-points-limit").value);
  const pointsLimit = (!isNaN(limitRaw) && limitRaw > 0) ? limitRaw : null;
  const armyType = document.querySelector("input[name='army-type']:checked")?.value || "tf";
  const bgIconMode = document.getElementById("army-bg-mode").value || "custom";
  const notes = document.getElementById("army-notes").value.trim();
  if(editingArmyId) {
    const army = state.armies.find(a=>a.id===editingArmyId);
    if(army) {
      const oldCount = army.bgCount || 3;
      if(bgCount < oldCount) {
        const bgsToRemove = (army.battleGroups||[]).slice(bgCount);
        const hasUnits = bgsToRemove.some(bg => (bg.entries||[]).length > 0);
        if(hasUnits) {
          const names = bgsToRemove.filter(bg=>(bg.entries||[]).length>0).map(bg=>esc(bg.name)).join(", ");
          modalMsg("army-modal-msg", `Can't reduce to ${bgCount} battle groups - <strong>${names}</strong> still ${bgsToRemove.filter(bg=>(bg.entries||[]).length>0).length>1?"have":"has"} units. Remove those first.`);
          return;
        }
        army.battleGroups = (army.battleGroups||[]).slice(0, bgCount);
      }
      army.name=name; army.faction=faction; army.bgCount=bgCount; army.pointsLimit=pointsLimit; army.bgIconMode=bgIconMode; army.notes=notes; _ensureBGs(army);
      // armyType is locked on edit - do not overwrite
    }
    editingArmyId = null;
  } else {
    const army = {id:"army_"+uid(), name, faction, bgCount, pointsLimit, armyType, bgIconMode, notes, taskForceIds:[], battleGroups:[]};
    state.armies.push(army);
    _ensureBGs(army);
    currentArmyId = army.id;
    // Jump straight into the new army's detail view
    const lv = document.getElementById("army-list-view");
    const dv = document.getElementById("army-detail-view");
    if (lv) lv.style.display = "none";
    if (dv) dv.style.display = "";
  }
  saveState();
  closeModal("modal-army");
  renderArmyList();
  renderArmyDetail();
}

function deleteArmy(id) {
  state.armies = state.armies.filter(a=>a.id!==id);
  const wasActive = currentArmyId === id;
  if(wasActive) currentArmyId = null;
  // Remove from any expeditionary force army groups
  (state.expeditionaryForces||[]).forEach(f=>(f.armyGroups||[]).forEach(ag=>{
    ag.armyIds = (ag.armyIds||[]).filter(aid=>aid!==id);
  }));
  saveState();
  if(wasActive) {
    const lv = document.getElementById("army-list-view");
    const dv = document.getElementById("army-detail-view");
    if (lv) lv.style.display = "";
    if (dv) dv.style.display = "none";
  }
  renderArmyList();
  renderArmyDetail();
  renderForceList();
  if(currentForceId) renderForceDetail();
}

function openAddTFModal(armyId) {
  addTFTargetArmyId = armyId;
  addTFSelectedId = null;
  _renderAddTFList();
  openModal("modal-add-tf");
}

// Whether a task force may join an army given its faction restriction.
// No restriction → any TF. A restricted army accepts TFs of the matching
// faction plus generic "No Faction" (unaligned) TFs; it excludes TFs locked
// to a different faction and "Any Faction" TFs (which can field off-faction units).
function tfMatchesArmyFaction(tf, army) {
  if(!army || !army.faction) return true;
  if(!tf.faction) return true;            // No Faction = unaligned, fits anywhere
  return tf.faction === army.faction;
}

function _renderAddTFList() {
  const armyId = addTFTargetArmyId;
  const army = state.armies.find(a=>a.id===armyId);
  const noteEl = document.getElementById("add-tf-faction-note");
  if(army?.faction) {
    noteEl.style.display = "block";
    noteEl.innerHTML = `<i class="fa-solid fa-filter" style="margin-right:4px"></i>Showing ${factionPill(army.faction)} and unaligned (No Faction) task forces.`;
  } else { noteEl.style.display = "none"; }
  const list = document.getElementById("add-tf-list");
  const available = state.taskForces.filter(tf => {
    if((army?.taskForceIds||[]).includes(tf.id)) return false;
    if(!tfMatchesArmyFaction(tf, army)) return false;
    return true;
  });
  if(!available.length) {
    list.innerHTML=`<div class="empty">${army?.faction?"No matching or unaligned task forces available - all are added, or locked to other factions.":"All task forces are already added, or none exist."}</div>`;
  } else {
    list.innerHTML = available.map(tf => {
      const pts = tfPoints(tf);
      const sel = addTFSelectedId===tf.id;
      const overLimit = tfOverLimit(tf);
      return `<div class="list-row" style="${sel?"border-color:#007eff;background:#0d1e36":overLimit?"border-color:#ef535055":""}" onclick="addTFSelectedId='${tf.id}';_renderAddTFList()">
        <div style="min-width:0">
          <div style="font-weight:bold;color:${sel?"#007eff":"#fff"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(tf.name)}</div>
          <div style="font-size:11px;color:#8b949e;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
            ${tf.faction?factionPill(tf.faction):""}
            <span>${(tf.units||[]).reduce((s,u)=>s+u.quantity,0)} units &bull; ${pts} pts${overLimit?" ⚠ over limit":""}</span>
          </div>
        </div>
        ${sel?`<i class="fa-solid fa-check" style="color:#007eff;flex-shrink:0"></i>`:""}
      </div>`;
    }).join("");
  }
  const b = document.getElementById("add-tf-confirm-btn");
  if(b) b.disabled = !addTFSelectedId;
}

function confirmAddTF() {
  if(!addTFSelectedId) { return; }
  const army = state.armies.find(a=>a.id===addTFTargetArmyId);
  if(!army) return;
  if(!army.taskForceIds.includes(addTFSelectedId)) army.taskForceIds.push(addTFSelectedId);
  saveState();
  closeModal("modal-add-tf");
  renderArmyList();
  renderArmyDetail();
}

function removeTFFromArmy(armyId, tfId) {
  const army = state.armies.find(a=>a.id===armyId);
  if(!army) return;
  const blockedBGs = (army.battleGroups||[]).filter(bg=>(bg.entries||[]).some(e=>e.tfId===tfId));
  if(blockedBGs.length) {
    tfRemoveBlockedId = tfId;
    renderArmyDetail();
    return;
  }
  tfRemoveBlockedId = null;
  army.taskForceIds = army.taskForceIds.filter(id=>id!==tfId);
  saveState();
  renderArmyDetail();
  renderArmyList();
}

function openArmyBGUnitModal(armyId, bgId) {
  bgUnitTargetArmyId = armyId;
  bgUnitTargetBgId = bgId;
  bgUnitSelectedItems = new Set();
  bgUnitShowUnavailable = false;
  _renderBGUnitList();
  openModal("modal-army-bg-unit");
}

function toggleBGShowUnavailable() {
  bgUnitShowUnavailable = !bgUnitShowUnavailable;
  const btn = document.getElementById("bg-unit-show-unavail-btn");
  if(btn) {
    btn.innerHTML = bgUnitShowUnavailable
      ? `<i class="fa-solid fa-eye"></i> Hide Unavailable`
      : `<i class="fa-solid fa-eye-slash"></i> Show Unavailable`;
    btn.style.background = bgUnitShowUnavailable ? "var(--accent-tint)" : "";
    btn.style.borderColor = bgUnitShowUnavailable ? "var(--accent)" : "";
    btn.style.color = bgUnitShowUnavailable ? "var(--accent)" : "";
  }
  _renderBGUnitList();
}

function _renderBGUnitList() {
  const army = state.armies.find(a=>a.id===bgUnitTargetArmyId);
  const bg = army?.battleGroups?.find(b=>b.id===bgUnitTargetBgId);
  const list = document.getElementById("bg-unit-list");
  const countEl = document.getElementById("bg-unit-count");
  if(!army||!bg) return;
  const inThisBG = new Set((bg.entries||[]).map(e=>e.slotId));
  const tfs = (army.taskForceIds||[]).map(id=>state.taskForces.find(t=>t.id===id)).filter(Boolean);
  if(!tfs.length) { list.innerHTML=`<div class="empty">No task forces in this army's pool.</div>`; if(countEl) countEl.textContent=""; return; }
  let selectable = 0, totalSlots = 0;
  const bodyHTML = tfs.map(tf => {
    const slots = (tf.units||[]).filter(s=>s.quantity>0);
    if(!slots.length) return "";
    const tfColor = FACTION_COLORS[tf.faction] || "#555";
    const rowsHTML = slots.map(slot => {
      const unit = unitById(slot.unitId);
      if(!unit) return "";
      totalSlots++;
      const inThis = inThisBG.has(slot.id);
      const remaining = slotRemainingQty(army, slot);
      const assigned = slot.quantity - remaining;
      const unavailable = inThis || remaining === 0;
      if(!unavailable) selectable++;
      if(unavailable && !bgUnitShowUnavailable) return "";
      const sel = bgUnitSelectedItems.has(slot.id);
      const note = inThis ? " &bull; already in this group"
                 : remaining === 0 ? " &bull; fully assigned"
                 : assigned > 0 ? ` &bull; <span style="color:#66bb6a">${remaining} of ${slot.quantity} left</span>`
                 : "";
      const addQtyHint = (!unavailable && remaining > 1) ? ` <span style="color:#8b949e">(adds ${remaining})</span>` : "";
      return `<div class="list-row" style="${sel?"border-color:#007eff;background:#0d1e36":unavailable?"opacity:.4;cursor:default":""}" onclick="${unavailable?"":"toggleBGUnitItem('"+slot.id+"')"}">
        <div style="min-width:0">
          <div style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(unit.name)}${addQtyHint}</div>
          <div style="font-size:11px;color:#8b949e">${slot.unitType||"unit"} &bull; ×${slot.quantity} &bull; ${slotPointValue(slot)} pts${note}</div>
        </div>
        ${sel?`<i class="fa-solid fa-check" style="color:#007eff;flex-shrink:0"></i>`:""}
      </div>`;
    }).join("");
    if(!rowsHTML.trim()) return "";
    return `<div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-weight:bold;padding:8px 0 5px;display:flex;align-items:center;gap:6px;border-top:1px solid var(--border-subtle);margin-top:4px">
        <span style="color:${tfColor}">${esc(tf.name)}</span>${tf.faction?factionPill(tf.faction):""}
      </div>
      ${rowsHTML}
    </div>`;
  }).join("");
  // Explain why nothing can be picked rather than showing a wall of dimmed rows.
  const infoHTML = (totalSlots === 0)
    ? `<div class="empty">No units in this army's task forces yet - add some to a task force first.</div>`
    : (selectable === 0)
      ? `<div style="padding:9px 11px;border-radius:5px;background:#0d1620;border:1px solid var(--border-subtle);color:#8b949e;font-size:11px;line-height:1.5;display:flex;align-items:flex-start;gap:7px;margin-bottom:4px"><i class="fa-solid fa-circle-info" style="margin-top:1px;flex-shrink:0;color:#58a6ff"></i><div>Every unit is already placed in a battle group or fully assigned elsewhere. Use the <strong>&minus;/+</strong> steppers on the battle group cards to move quantities between groups.</div></div>`
      : "";
  list.innerHTML = infoHTML + bodyHTML;
  if(countEl) countEl.textContent = bgUnitSelectedItems.size ? `${bgUnitSelectedItems.size} selected` : "";
}

function toggleBGUnitItem(slotId) {
  if(bgUnitSelectedItems.has(slotId)) bgUnitSelectedItems.delete(slotId);
  else bgUnitSelectedItems.add(slotId);
  _renderBGUnitList();
}

function confirmAddToBG() {
  if(!bgUnitSelectedItems.size) { closeModal("modal-army-bg-unit"); return; }
  const army = state.armies.find(a=>a.id===bgUnitTargetArmyId);
  const bg = army?.battleGroups?.find(b=>b.id===bgUnitTargetBgId);
  if(!army||!bg) return;
  bgUnitSelectedItems.forEach(slotId => {
    // already an entry for this slot in this group? adjust it with the +/− stepper instead
    if((bg.entries||[]).some(e=>e.slotId===slotId)) return;
    let tfId = null, slot = null;
    for(const tid of army.taskForceIds) {
      const tf = state.taskForces.find(t=>t.id===tid);
      const s = tf && (tf.units||[]).find(x=>x.id===slotId);
      if(s) { tfId=tid; slot=s; break; }
    }
    if(!tfId || !slot) return;
    const remaining = slotRemainingQty(army, slot);
    if(remaining <= 0) return;
    if(!bg.entries) bg.entries=[];
    bg.entries.push({id:"bge_"+uid(), tfId, slotId, qty:remaining});
  });
  saveState();
  closeModal("modal-army-bg-unit");
  renderArmyDetail();
}

function changeBGEntryQty(armyId, bgId, entryId, delta) {
  const army = state.armies.find(a=>a.id===armyId);
  const bg = army?.battleGroups?.find(b=>b.id===bgId);
  const e = bg?.entries?.find(x=>x.id===entryId);
  if(!army || !e) return;
  const slot = entrySlot(e);
  if(!slot) return;
  const assignedElsewhere = slotAssignedQty(army, slot.id) - (e.qty||0);
  const maxThis = Math.max(1, (slot.quantity||1) - assignedElsewhere);
  e.qty = Math.min(maxThis, Math.max(1, (e.qty||1) + delta));
  saveState();
  renderArmyDetail();
}

function removeFromBG(armyId, bgId, entryId) {
  const army = state.armies.find(a=>a.id===armyId);
  const bg = army?.battleGroups?.find(b=>b.id===bgId);
  if(!bg) return;
  bg.entries = (bg.entries||[]).filter(e=>e.id!==entryId);
  saveState();
  renderArmyDetail();
}

function clearBG(armyId, bgId) {
  const army = state.armies.find(a=>a.id===armyId);
  const bg = army?.battleGroups?.find(b=>b.id===bgId);
  if(!bg) return;
  bg.entries = [];
  saveState();
  renderArmyDetail();
}

function openBGTFModal(armyId, bgId) {
  bgTFTargetArmyId = armyId;
  bgTFTargetBgId = bgId;
  bgTFSelectedId = null;
  _renderBGTFList();
  openModal("modal-army-bg-tf");
}

function _renderBGTFList() {
  const army = state.armies.find(a=>a.id===bgTFTargetArmyId);
  const tfs = (army?.taskForceIds||[]).map(id=>state.taskForces.find(t=>t.id===id)).filter(Boolean);
  const list = document.getElementById("bg-tf-list");
  const confBtn = document.getElementById("bg-tf-confirm-btn");
  if(!tfs.length) {
    list.innerHTML=`<div class="empty">No task forces in this army's pool.</div>`;
    if(confBtn) confBtn.disabled = true;
    return;
  }
  list.innerHTML = tfs.map(tf => {
    const pts = tfPoints(tf);
    const totalQty = (tf.units||[]).reduce((s,u)=>s+u.quantity,0);
    const remainingQty = (tf.units||[]).reduce((s,slot)=>s+slotRemainingQty(army,slot),0);
    const fullyAssigned = remainingQty === 0;
    const partial = remainingQty < totalQty && !fullyAssigned;
    const sel = bgTFSelectedId===tf.id && !fullyAssigned;
    const qtyNote = fullyAssigned
      ? ` &bull; <span style="color:#666">fully assigned</span>`
      : partial
        ? ` &bull; <span style="color:#66bb6a">${remainingQty} / ${totalQty} remaining</span>`
        : ` &bull; ${totalQty} unit${totalQty!==1?"s":""}`;
    return `<div class="list-row" style="${sel?"border-color:#007eff;background:#0d1e36":fullyAssigned?"opacity:.4;cursor:default":""}" onclick="${fullyAssigned?"":"bgTFSelectedId='"+tf.id+"';_renderBGTFList()"}">
      <div style="min-width:0">
        <div style="font-weight:bold;color:${sel?"#007eff":"#fff"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(tf.name)}</div>
        <div style="font-size:11px;color:#8b949e;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          ${tf.faction?factionPill(tf.faction):""}
          <span>${pts} pts${qtyNote}</span>
        </div>
      </div>
      ${sel?`<i class="fa-solid fa-check" style="color:#007eff;flex-shrink:0"></i>`:""}
    </div>`;
  }).join("");
  // Disable confirm if nothing is selected, or the selected TF has no remaining capacity
  const selTF = bgTFSelectedId && tfs.find(t=>t.id===bgTFSelectedId);
  const selHasRemaining = selTF && (selTF.units||[]).some(slot=>slotRemainingQty(army,slot)>0);
  if(confBtn) confBtn.disabled = !selHasRemaining;
}

function confirmAddTFToBG() {
  if(!bgTFSelectedId) { return; }
  const army = state.armies.find(a=>a.id===bgTFTargetArmyId);
  const bg = army?.battleGroups?.find(b=>b.id===bgTFTargetBgId);
  const tf = state.taskForces.find(t=>t.id===bgTFSelectedId);
  if(!army||!bg||!tf) return;
  (tf.units||[]).forEach(slot => {
    if((bg.entries||[]).some(e=>e.slotId===slot.id)) return;
    const remaining = slotRemainingQty(army, slot);
    if(remaining <= 0) return;
    if(!bg.entries) bg.entries=[];
    bg.entries.push({id:"bge_"+uid(), tfId:tf.id, slotId:slot.id, qty:remaining});
  });
  saveState();
  closeModal("modal-army-bg-tf");
  renderArmyDetail();
}

function openBGNotesModal(armyId, bgId) {
  const army = state.armies.find(a=>a.id===armyId);
  const bg = (army?.battleGroups||[]).find(b=>b.id===bgId);
  if(!bg) return;
  document.getElementById("bg-notes-army-id").value = armyId;
  document.getElementById("bg-notes-bg-id").value = bgId;
  document.getElementById("bg-notes-name").textContent = bg.name;
  document.getElementById("bg-notes-textarea").value = bg.notes||"";
  openModal("modal-bg-notes");
}

function saveBGNotes() {
  const armyId = document.getElementById("bg-notes-army-id").value;
  const bgId = document.getElementById("bg-notes-bg-id").value;
  const notes = document.getElementById("bg-notes-textarea").value.trim();
  const army = state.armies.find(a=>a.id===armyId);
  const bg = (army?.battleGroups||[]).find(b=>b.id===bgId);
  if(bg) { bg.notes=notes; saveState(); }
  closeModal("modal-bg-notes");
  renderArmyDetail();
}

// ============================================================
// EXPEDITIONARY FORCES
// ============================================================
const AG_NAMES = ["Army Group I","Army Group II","Army Group III","Army Group IV","Army Group V"];

function efOfArmy(armyId) {
  for(const force of state.expeditionaryForces||[]) {
    for(const ag of force.armyGroups||[]) {
      if((ag.armyIds||[]).includes(armyId)) return {force, ag};
    }
  }
  return null;
}

function _ensureAGs(force) {
  if(!force.armyGroups) force.armyGroups = [];
  const count = force.agCount || 3;
  while(force.armyGroups.length < count) {
    const idx = force.armyGroups.length;
    const ag = {id:"ag_"+uid(), name:AG_NAMES[idx]||`Army Group ${idx+1}`, symbol:null, description:"", armyIds:[]};
    force.armyGroups.push(ag);
    _autoAssignAGSymbol(force, ag);
  }
}

function _autoAssignAGSymbol(force, ag) {
  const used = new Set((force.armyGroups||[]).map(g=>g.symbol).filter(Boolean));
  ag.symbol = ICON_SYMBOL_KEYS.find(k=>!used.has(k)) || ICON_SYMBOL_KEYS[0];
}

function efAGViolations(force) {
  const ags = (force.armyGroups||[]).slice(0, force.agCount||3);
  const sizes = ags.map(ag=>(ag.armyIds||[]).length);
  const largest = Math.max(...sizes, 0);
  if(largest === 0) return {violatingIds:new Set(), minAllowed:0, largest:0, largestName:"", ok:true};
  const minAllowed = Math.ceil(largest / 2);
  const largestAG = ags.find(ag=>(ag.armyIds||[]).length === largest);
  const violatingIds = new Set(ags.filter(ag=>(ag.armyIds||[]).length < minAllowed).map(ag=>ag.id));
  return {violatingIds, minAllowed, largest, largestName:largestAG?.name||"", ok:violatingIds.size===0};
}

function agPoolPoints(ag) {
  return (ag.armyIds||[]).reduce((sum,id)=>{
    const a = state.armies.find(ar=>ar.id===id);
    return sum + (a ? armyPoints(a) : 0);
  }, 0);
}

function forcePoolPoints(force) {
  return ((force.armyGroups||[]).flatMap(ag=>ag.armyIds||[])).reduce((sum,id)=>{
    const a = state.armies.find(ar=>ar.id===id);
    return sum + (a ? armyPoints(a) : 0);
  }, 0);
}

function renderForceList() {
  const list = document.getElementById("force-list");
  if(!list) return;
  if(!(state.expeditionaryForces||[]).length) {
    list.innerHTML = `<div class="empty" style="padding:48px 0"><div class="empty-icon"><i class="fa-solid fa-earth-americas"></i></div>No expeditionary forces yet - press <strong>New Force</strong> to create one.</div>`;
    return;
  }
  list.innerHTML = (state.expeditionaryForces||[]).map(force => {
    const agCount = force.agCount || 3;
    const agList = (force.armyGroups||[]).slice(0, agCount);
    const totalArmies = agList.reduce((s,ag)=>s+(ag.armyIds||[]).length, 0);
    const forcePts = forcePoolPoints(force);
    const viol = efAGViolations(force);
    const notDeployable = !viol.ok;

    const forceSym = force.symbol ? _bgSymLookup(force.symbol) : null;
    const badgeHTML = forceSym
      ? `<div style="width:56px;height:56px;border-radius:12px;background:${forceSym.color}1a;border:2px solid ${forceSym.color}55;color:${forceSym.color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px">${_bgSymInner(forceSym,22)}</div>`
      : `<div style="width:56px;height:56px;border-radius:12px;background:var(--surface-raised);border:2px dashed var(--border-default);color:var(--text-faint);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px"><i class="fa-solid fa-earth-americas"></i></div>`;

    const violBadge = notDeployable
      ? `<span title="Not deployable - has army group size violations" style="font-size:12px;color:#ef5350;flex-shrink:0"><i class="fa-solid fa-triangle-exclamation"></i></span>`
      : "";

    const agRows = agList.length === 0
      ? `<div style="font-size:11px;color:var(--text-faint);font-style:italic;padding:2px 0">No army groups configured</div>`
      : agList.map(ag => {
          const sd = _bgSymLookup(ag.symbol || ICON_SYMBOL_KEYS[0]);
          const agSize = (ag.armyIds||[]).length;
          const agPts = agPoolPoints(ag);
          const symEl = `<div style="width:18px;height:18px;border-radius:4px;background:${sd.color}18;border:1px solid ${sd.color}44;color:${sd.color};display:inline-flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0">${_bgSymInner(sd,9)}</div>`;
          return `<div style="display:flex;align-items:center;gap:7px;padding:3px 0">
            ${symEl}
            <span style="font-size:12px;font-weight:600;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ag.name)}</span>
            <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">${agSize} arm${agSize!==1?"ies":"y"}${agPts?" &middot; "+agPts+" pts":""}</span>
          </div>`;
        }).join("");

    const cardBorder = notDeployable ? "border-color:#ef535044" : "";
    return `<div style="background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;margin-bottom:12px;overflow:hidden;cursor:pointer;transition:border-color .15s,background .15s;${cardBorder}"
      onclick="selectForce('${force.id}')"
      onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--surface-raised)'"
      onmouseout="this.style.borderColor='${notDeployable?"#ef535044":"var(--border-default)"}';this.style.background='var(--surface-card)'">
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid var(--border-subtle)">
        ${badgeHTML}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <span style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(force.name)}</span>
            ${violBadge}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">
            <span style="font-size:9px;font-weight:bold;padding:1px 6px;border-radius:8px;background:#1a0d2e;color:#ce93d8;border:1px solid #9c27b044;letter-spacing:.5px">EXP. FORCE</span>
          </div>
          <div>
            <span style="font-size:12px;font-weight:bold;color:var(--text-bright)">${agCount} army group${agCount!==1?"s":""} &middot; ${totalArmies} arm${totalArmies!==1?"ies":"y"} &middot; ${forcePts} pts</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0" onclick="event.stopPropagation()">
          <button class="trait-edit-btn" onclick="selectForce('${force.id}')" title="Open force detail" style="white-space:nowrap"><i class="fa-solid fa-arrow-right"></i> Open</button>
          <button class="trait-edit-btn" onclick="exportForce('${force.id}')" title="Export force JSON"><i class="fa-solid fa-share-nodes"></i> Export</button>
        </div>
      </div>
      <div style="padding:8px 16px 10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0 24px">
        ${agRows}
      </div>
    </div>`;
  }).join("");
}

function selectForce(id) {
  currentForceId = id;
  agSymbolPickerAgId = null;
  editingAGId = null;
  forceIconPickerOpen = false;
  activeAGTabId = null;
  const lv = document.getElementById("force-list-view");
  const dv = document.getElementById("force-detail-view");
  if (lv) lv.style.display = "none";
  if (dv) dv.style.display = "";
  renderForceDetail();
}

function backToForceList() {
  currentForceId = null;
  agSymbolPickerAgId = null;
  editingAGId = null;
  forceIconPickerOpen = false;
  activeAGTabId = null;
  const lv = document.getElementById("force-list-view");
  const dv = document.getElementById("force-detail-view");
  if (lv) lv.style.display = "";
  if (dv) dv.style.display = "none";
  renderForceList();
}

function renderForceDetail() {
  const panel = document.getElementById("force-detail-panel");
  if(!panel) return;
  const force = (state.expeditionaryForces||[]).find(f=>f.id===currentForceId);
  if(!force) {
    panel.innerHTML = `<div class="card"><div class="empty"><div class="empty-icon"><i class="fa-solid fa-earth-americas"></i></div>Select a force to view</div></div>`;
    return;
  }
  const breadcrumb = `<div style="margin-bottom:12px">
    <button onclick="backToForceList()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;font-size:13px;display:inline-flex;align-items:center;gap:6px;transition:color .15s" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-muted)'">
      <i class="fa-solid fa-arrow-left" style="font-size:11px"></i> Expeditionary Forces
    </button>
  </div>`;
  _ensureAGs(force);
  const agCount = force.agCount || 3;
  const agList = (force.armyGroups||[]).slice(0, agCount);
  const agIds = agList.map(ag=>ag.id);
  const viol = efAGViolations(force);
  const totalArmies = agList.reduce((s,ag)=>s+(ag.armyIds||[]).length, 0);
  const forcePts = forcePoolPoints(force);
  const forceTarget = force.pointsTarget||null;
  const _fRatio = forceTarget ? forcePts / forceTarget : null;
  const _fBarPct = _fRatio != null ? Math.min(_fRatio, 1) * 100 : 0;
  const _fBarColor = _fRatio == null ? "#4a7adc" : _fRatio > 1 ? "#ef5350" : _fRatio > 0.85 ? "#ffa726" : "#4caf50";
  const _fOver = forceTarget && forcePts > forceTarget;
  const _fRemain = forceTarget ? forceTarget - forcePts : null;
  const _fRemainLabel = _fRemain == null ? ""
    : _fOver ? `<i class="fa-solid fa-triangle-exclamation" style="margin-right:3px"></i>+${-_fRemain} over`
    : _fRemain === 0 ? "Exactly on target"
    : `${_fRemain} pts remaining`;
  const forceBudgetBarHTML = forceTarget
    ? `<div style="margin-bottom:14px;padding:0 1px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:10px;color:var(--text-faint);letter-spacing:.03em">${Math.round((_fRatio||0)*100)}%</span>
          <span style="font-size:10px;color:${_fOver?"#ef5350":_fRemain===0?"#4caf50":"var(--text-faint)"};font-weight:${_fOver||_fRemain===0?"bold":"normal"}">${_fRemainLabel}</span>
        </div>
        <div style="height:5px;border-radius:3px;background:#1a1f2a;overflow:hidden">
          <div style="height:100%;width:${_fBarPct.toFixed(1)}%;background:${_fBarColor};border-radius:3px;transition:width .25s ease"></div>
        </div>
      </div>`
    : "";

  if(!activeAGTabId || !agIds.includes(activeAGTabId)) activeAGTabId = agIds[0] || null;

  // Force icon button
  const forceSym = force.symbol ? _bgSymLookup(force.symbol) : null;
  const forceIconBtn = forceSym
    ? `<button onclick="openForceIconPicker()" title="Force designation icon - click to change" style="width:34px;height:34px;border-radius:8px;background:${forceSym.color}1a;border:1.5px solid ${forceSym.color}99;color:${forceSym.color};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;transition:background .15s" onmouseover="this.style.background='${forceSym.color}33'" onmouseout="this.style.background='${forceSym.color}1a'">${_bgSymInner(forceSym,14)}</button>`
    : `<button onclick="openForceIconPicker()" title="Set force designation icon" style="width:34px;height:34px;border-radius:8px;background:var(--surface-raised);border:1.5px dashed var(--border-default);color:var(--text-faint);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;transition:border-color .15s,color .15s" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--border-default)';this.style.color='var(--text-faint)'"><i class="fa-solid fa-plus" style="font-size:11px"></i></button>`;

  // Force icon picker
  const forceIconPickerHTML = forceIconPickerOpen ? `<div style="margin-bottom:14px;padding:10px 12px;border-radius:8px;background:var(--surface-raised);border:1px solid var(--border-subtle)">
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-faint);font-weight:700;margin-bottom:8px">Force Designation</div>
    ${ARMY_ICON_GROUPS.map(grp=>`
      <div style="margin-bottom:8px">
        <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">${grp.label}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${grp.keys.map(s=>{
            const sd=_bgSymLookup(s); const ic=force.symbol===s;
            return `<button onclick="setForceIcon('${force.id}','${ic?"":s}')" title="${sd.label}" style="width:32px;height:32px;border-radius:6px;padding:0;border:${ic?"2px solid "+sd.color:"1px solid "+sd.color+"44"};background:${ic?sd.color+"2a":"transparent"};color:${sd.color};cursor:pointer;display:inline-flex;align-items:center;justify-content:center">${_bgSymInner(sd)}</button>`;
          }).join("")}
        </div>
      </div>`).join("")}
  </div>` : "";

  // Validation banner
  const deployIssues = [];
  if(!viol.ok) {
    const offenders = agList.filter(ag=>viol.violatingIds.has(ag.id)).map(ag=>`<strong>${esc(ag.name)}</strong> (${(ag.armyIds||[]).length})`);
    const offenderList = offenders.length>1 ? offenders.slice(0,-1).join(", ")+" and "+offenders[offenders.length-1] : offenders[0];
    deployIssues.push(`${offenderList} ${offenders.length>1?"are":"is"} too small - each Army Group needs at least <strong>${viol.minAllowed}</strong> arm${viol.minAllowed!==1?"ies":"y"}, half of the largest group <strong>${esc(viol.largestName)}</strong> (${viol.largest}) rounded up.`);
  }
  const deployBannerHTML = deployIssues.length ? `<div style="margin-bottom:14px;padding:8px 12px;border-radius:6px;background:#1a0505;border:1px solid #ef535066;display:flex;align-items:flex-start;gap:10px">
    <i class="fa-solid fa-triangle-exclamation" style="color:#ef5350;margin-top:1px;flex-shrink:0"></i>
    <div style="font-size:12px;color:#ef9a9a;line-height:1.5"><strong style="color:#ef5350">Not deployable</strong>
      <ul style="margin:3px 0 0 16px;padding:0">${deployIssues.map(i=>`<li style="margin-top:1px">${i}</li>`).join("")}</ul>
    </div>
  </div>` : "";

  // AG tabs (equal-width grid)
  const agTabsHTML = `<div style="display:grid;grid-template-columns:repeat(${agList.length},1fr);gap:1px;background:var(--border-subtle)">
    ${agList.map(ag=>{
      const isActive = activeAGTabId===ag.id;
      const agSize = (ag.armyIds||[]).length;
      const agUndersize = viol.violatingIds.has(ag.id);
      const symDef = _bgSymLookup(ag.symbol||ICON_SYMBOL_KEYS[0]);
      const symInner = _bgSymInner(symDef,10);
      const symStyle = `width:20px;height:20px;border-radius:4px;background:${symDef.color}${isActive?"22":"14"};border:1.5px solid ${symDef.color}${isActive?"99":"44"};color:${symDef.color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0`;
      const stColor = agUndersize?"#ef5350":agSize>0?"#66bb6a":"#555";
      const stLabel = agUndersize?`⚠ ${agSize}`:agSize>0?`${agSize}a`:"-";
      const statusBadge = `<span style="font-size:8px;font-weight:700;color:${stColor};flex-shrink:0;letter-spacing:.3px">${stLabel}</span>`;
      if(isActive) {
        const symEl = `<button onclick="openAGSymbolPicker('${force.id}','${ag.id}')" title="${symDef.label} - click to change" style="${symStyle};cursor:pointer;padding:0;border:1.5px solid ${symDef.color}99;transition:background .15s" onmouseover="this.style.background='${symDef.color}33'" onmouseout="this.style.background='${symDef.color}22'">${symInner}</button>`;
        return `<div style="padding:8px 9px;border:none;border-top:2px solid var(--accent);background:var(--surface-page);overflow:hidden;min-width:0">
          <div style="display:flex;align-items:center;gap:5px;min-width:0">
            ${symEl}
            <span style="font-family:var(--font-display);font-size:11px;letter-spacing:.4px;color:var(--accent);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="${esc(ag.name)}">${esc(ag.name)}</span>
            ${statusBadge}
          </div>
        </div>`;
      } else {
        return `<button onclick="selectAGTab('${force.id}','${ag.id}')"
          style="padding:8px 9px;border:none;border-top:2px solid transparent;background:var(--surface-raised);cursor:pointer;text-align:left;overflow:hidden;min-width:0;width:100%;transition:background .12s,border-top-color .12s"
          onmouseover="this.style.background='var(--surface-page)';this.style.borderTopColor='var(--border-default)'"
          onmouseout="this.style.background='var(--surface-raised)';this.style.borderTopColor='transparent'">
          <div style="display:flex;align-items:center;gap:5px;min-width:0">
            <div style="${symStyle}">${symInner}</div>
            <span style="font-family:var(--font-display);font-size:11px;letter-spacing:.4px;color:var(--text-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="${esc(ag.name)}">${esc(ag.name)}</span>
            ${statusBadge}
          </div>
        </button>`;
      }
    }).join("")}
  </div>`;

  // Active AG card body
  // Compute the body for a given army group. Used by the tabbed view (active AG
  // only) and the flat view (all AGs stacked). In flat mode a symbol button is
  // folded into the toolbar so the designation picker stays reachable.
  function _agCardBody(ag) {
      const agSize = (ag.armyIds||[]).length;
      const agPts = agPoolPoints(ag);
      const agUndersize = viol.violatingIds.has(ag.id);
      const pickerOpen = agSymbolPickerAgId===ag.id;
      const usedByOthers = new Set(agList.filter(g=>g.id!==ag.id).map(g=>g.symbol).filter(Boolean));
      const sym = ag.symbol||ICON_SYMBOL_KEYS[0];

      const pickerHTML = pickerOpen ? `<div style="margin-bottom:10px;padding:8px 10px;border-radius:6px;background:var(--surface-raised);border:1px solid var(--border-subtle)">
        ${ARMY_ICON_GROUPS.map(grp=>`
          <div style="margin-bottom:6px">
            <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">${grp.label}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${grp.keys.map(s=>{
                const sd=_bgSymLookup(s); const ic=s===sym; const iu=usedByOthers.has(s);
                return `<button onclick="${iu&&!ic?"":"setAGSymbol('"+force.id+"','"+ag.id+"','"+s+"')"}" title="${sd.label}${iu&&!ic?" (used by another group)":""}" style="min-width:30px;height:30px;border-radius:6px;padding:0 5px;border:${ic?"2px solid "+sd.color:"1px solid "+sd.color+(iu&&!ic?"22":"44")};background:${ic?sd.color+"2a":"transparent"};color:${iu&&!ic?"#333":sd.color};cursor:${iu&&!ic?"default":"pointer"};display:inline-flex;align-items:center;justify-content:center">${_bgSymInner(sd)}</button>`;
              }).join("")}
            </div>
          </div>`).join("")}
      </div>` : "";

      const agWarnStripHTML = agUndersize ? `<div style="margin-bottom:8px;padding:5px 8px;border-radius:4px;background:#1a0505;border:1px solid #ef535055;font-size:11px;color:#ef9a9a;display:flex;align-items:flex-start;gap:6px">
        <i class="fa-solid fa-triangle-exclamation" style="color:#ef5350;flex-shrink:0;margin-top:1px"></i>
        <span>Has ${agSize} arm${agSize!==1?"ies":"y"} - needs at least <strong style="color:#ef5350">${viol.minAllowed}</strong> (half of ${esc(viol.largestName)}'s ${viol.largest}, rounded up)</span>
      </div>` : "";

      const descHTML = ag.description ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;padding:6px 8px;background:var(--surface-raised);border-radius:4px;border:1px solid var(--border-subtle)">${esc(ag.description)}</div>` : "";

      const armyRowsHTML = (ag.armyIds||[]).length===0
        ? `<div style="font-size:11px;color:#555;font-style:italic;padding:10px 0;text-align:center"><i class="fa-solid fa-circle-plus" style="color:#333;margin-right:5px"></i>No armies assigned</div>`
        : (ag.armyIds||[]).map(armyId=>{
            const army = state.armies.find(a=>a.id===armyId);
            if(!army) return "";
            const fp = isFreePick(army);
            const poolPts = armyPoints(army);
            const tfCount = (army.taskForceIds||[]).length;
            const armySym = army.symbol ? _bgSymLookup(army.symbol) : null;
            const armyIconEl = armySym
              ? `<span style="display:inline-flex;width:24px;height:24px;border-radius:5px;background:${armySym.color}18;border:1px solid ${armySym.color}55;color:${armySym.color};align-items:center;justify-content:center;flex-shrink:0;font-size:11px">${_bgSymInner(armySym,11)}</span>`
              : `<span style="display:inline-flex;width:24px;height:24px;border-radius:5px;background:var(--surface-raised);border:1px solid var(--border-subtle);align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:var(--text-faint)"><i class="fa-solid fa-chess-rook"></i></span>`;
            const fpTag = fp ? `<span style="font-size:9px;font-weight:bold;padding:1px 5px;border-radius:8px;background:#1a2a1a;color:#66bb6a;border:1px solid #66bb6a44">FP</span>` : "";
            const meta = fp ? `${poolPts} pts` : `${tfCount} TF${tfCount!==1?"s":""} &bull; ${poolPts} pts`;
            return `<div class="list-row">
              <div style="min-width:0;flex:1;display:flex;align-items:center;gap:8px">
                ${armyIconEl}
                <div style="min-width:0;flex:1">
                  <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
                    <span style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(army.name)}</span>
                    ${fpTag}${army.faction?factionPill(army.faction):""}
                  </div>
                  <div style="font-size:11px;color:#8b949e;margin-top:2px">${meta}</div>
                </div>
              </div>
              <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a;flex-shrink:0;align-self:flex-start" onclick="removeArmyFromAG('${force.id}','${ag.id}','${armyId}')">Remove</button>
            </div>`;
          }).join("");

      // Toolbar
      const isEditingName = editingAGId===ag.id;
      const nameSection = isEditingName
        ? `<input id="ag-name-inp-${ag.id}" type="text" value="${esc(ag.name)}" maxlength="40"
             style="font-family:var(--font-display);font-size:14px;letter-spacing:.5px;color:var(--accent);background:transparent;border:none;border-bottom:1px solid var(--accent);outline:none;min-width:0;flex:1;padding:0"
             onblur="saveAGName('${force.id}','${ag.id}')"
             onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')cancelAGNameEdit()">`
        : `<span style="font-family:var(--font-display);font-size:14px;letter-spacing:.6px;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ag.name)}</span>
           <button onclick="startAGNameEdit('${ag.id}')" title="Rename army group" style="background:none;border:none;color:#555;cursor:pointer;padding:0 4px;font-size:10px;line-height:1;flex-shrink:0;transition:color .15s" onmouseover="this.style.color='#aaa'" onmouseout="this.style.color='#555'"><i class="fa-solid fa-pencil"></i></button>`;
      const symDefAG = _bgSymLookup(ag.symbol||ICON_SYMBOL_KEYS[0]);
      const flatSymStyle = `width:24px;height:24px;border-radius:5px;background:${symDefAG.color}1a;border:1.5px solid ${symDefAG.color}99;color:${symDefAG.color};display:inline-flex;align-items:center;justify-content:center;flex-shrink:0`;
      const flatSymBtn = agViewMode !== "flat" ? ""
        : `<button onclick="openAGSymbolPicker('${force.id}','${ag.id}')" title="${symDefAG.label} - click to change" style="${flatSymStyle};cursor:pointer;padding:0;transition:background .15s" onmouseover="this.style.background='${symDefAG.color}33'" onmouseout="this.style.background='${symDefAG.color}1a'">${_bgSymInner(symDefAG,12)}</button>`;
      const toolbarHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)">
        ${flatSymBtn}
        <div style="flex:1;min-width:0;overflow:hidden">
          <div style="display:flex;align-items:center;gap:5px">${nameSection}</div>
          <div style="font-size:9px;color:var(--text-muted);margin-top:2px">${agSize} arm${agSize!==1?"ies":"y"}${agPts?" &middot; "+agPts+" pts":""}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
          <button class="trait-edit-btn" onclick="openAddArmyEFModal('${force.id}','${ag.id}')"><i class="fa-solid fa-plus"></i> Add Army</button>
          <button class="trait-edit-btn" onclick="openEditAGDescModal('${force.id}','${ag.id}')"><i class="fa-solid fa-pen"></i> Description</button>
        </div>
      </div>`;
      return `${toolbarHTML}${pickerHTML}${agWarnStripHTML}${descHTML}${armyRowsHTML}`;
  }
  const activeAG = agList.find(ag=>ag.id===activeAGTabId);
  const agCardBodyHTML = activeAG ? _agCardBody(activeAG) : "";

  const agViewToggleBtn = `<button class="trait-edit-btn" onclick="toggleAGViewMode()" title="${agViewMode==="flat"?"Switch to tabbed view":"Show all army groups at once"}"><i class="fa-solid fa-${agViewMode==="flat"?"table-columns":"list"}"></i> ${agViewMode==="flat"?"Tabbed":"Show All"}</button>`;
  const agFlatHTML = `<div style="display:flex;flex-direction:column;gap:10px">
    ${agList.map(ag => {
      const violThis = viol.violatingIds.has(ag.id);
      return `<div style="border:1px solid ${violThis?"#ef535066":"var(--border-default)"};border-radius:8px;padding:12px 14px;background:var(--surface-card)">${_agCardBody(ag)}</div>`;
    }).join("")}
  </div>`;

  const agViolActive = viol.violatingIds.has(activeAGTabId||"");
  panel.innerHTML = breadcrumb + `<div class="card">
    <div class="card-title">
      <span style="display:flex;align-items:center;gap:10px">${forceIconBtn}${esc(force.name)}</span>
      <div style="display:flex;gap:6px">
        <button class="trait-edit-btn" onclick="openPrintModal('force','${force.id}')"><i class="fa-solid fa-print"></i> Print</button>
        <button class="trait-edit-btn" onclick="exportForce('${force.id}')"><i class="fa-solid fa-share-nodes"></i> Export</button>
        <button class="trait-edit-btn" onclick="openEditForceModal('${force.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="trait-edit-btn" style="border-color:#8b000066;color:#ef5350;background:#2a0a0a" onclick="confirmBtn(this,()=>deleteForce('${force.id}'))"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    </div>
    ${forceIconPickerHTML}
    ${force.description?`<div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:14px;padding:8px 10px;background:var(--surface-raised);border-radius:6px;border:1px solid var(--border-subtle)">${esc(force.description)}</div>`:""}
    <div class="info-strip">
      <div><div class="info-strip-label">Army Groups</div><div class="info-strip-val">${agCount}</div></div>
      <div class="info-strip-sep"></div>
      <div><div class="info-strip-label">Total Armies</div><div class="info-strip-val">${totalArmies}</div></div>
      <div class="info-strip-sep"></div>
      <div><div class="info-strip-label">Total Points</div><div class="info-strip-val" style="color:${_fOver?"#ef5350":_fRemain===0?"#4caf50":"var(--text-bright)"}">${forcePts}</div></div>
      ${forceTarget?`<div class="info-strip-sep"></div><div><div class="info-strip-label">Budget</div><div class="info-strip-val">${forceTarget}</div></div>`:""}
    </div>
    ${forceBudgetBarHTML}
    ${deployBannerHTML}
    <div class="sub-divider">
      <div class="sub-divider-label"><i class="fa-solid fa-layer-group" style="color:#9c27b0;font-size:9px"></i> Army Groups</div>
      ${agViewToggleBtn}
    </div>
    ${agViewMode==="flat"
      ? agFlatHTML
      : `<div style="border:1px solid ${agViolActive?"#ef535066":"var(--border-default)"};border-radius:8px;overflow:hidden">
          ${agTabsHTML}
          <div style="padding:12px 14px;background:var(--surface-card);border-top:1px solid var(--border-subtle)">${agCardBodyHTML}</div>
        </div>`}
  </div>`;
}

function openForceIconPicker() {
  forceIconPickerOpen = !forceIconPickerOpen;
  agSymbolPickerAgId = null;
  renderForceDetail();
}

function setForceIcon(forceId, sym) {
  const force = (state.expeditionaryForces||[]).find(f=>f.id===forceId);
  if(force) { force.symbol = sym||null; saveState(); }
  forceIconPickerOpen = false;
  renderForceList();
  renderForceDetail();
}

function selectAGTab(forceId, agId) {
  activeAGTabId = agId;
  agSymbolPickerAgId = null;
  editingAGId = null;
  renderForceDetail();
}

function toggleAGViewMode() {
  agViewMode = agViewMode === "flat" ? "tabs" : "flat";
  renderForceDetail();
}

function openAGSymbolPicker(forceId, agId) {
  agSymbolPickerAgId = agSymbolPickerAgId===agId ? null : agId;
  renderForceDetail();
}

function setAGSymbol(forceId, agId, sym) {
  const force = (state.expeditionaryForces||[]).find(f=>f.id===forceId);
  const ag = (force?.armyGroups||[]).find(g=>g.id===agId);
  if(ag) { ag.symbol=sym; saveState(); }
  agSymbolPickerAgId = null;
  renderForceDetail();
}

function startAGNameEdit(agId) {
  editingAGId = agId;
  agSymbolPickerAgId = null;
  forceIconPickerOpen = false;
  renderForceDetail();
  setTimeout(()=>document.getElementById("ag-name-inp-"+agId)?.focus(), 0);
}

function cancelAGNameEdit() {
  editingAGId = null;
  renderForceDetail();
}

function saveAGName(forceId, agId) {
  const force = (state.expeditionaryForces||[]).find(f=>f.id===forceId);
  const ag = (force?.armyGroups||[]).find(g=>g.id===agId);
  if(ag) {
    const inp = document.getElementById("ag-name-inp-"+agId);
    const val = inp ? inp.value.trim() : "";
    if(val) ag.name = val;
  }
  editingAGId = null;
  saveState();
  renderForceDetail();
}

function openAddArmyEFModal(forceId, agId) {
  addArmyTargetForceId = forceId;
  addArmyTargetAgId = agId;
  _renderAddArmyEFList();
  openModal("modal-add-army-ef");
}

function _renderAddArmyEFList() {
  const listEl = document.getElementById("add-army-ef-list");
  if(!listEl) return;
  const globalAssigned = new Set((state.expeditionaryForces||[]).flatMap(f=>(f.armyGroups||[]).flatMap(g=>g.armyIds||[])));
  const available = state.armies.filter(a=>!globalAssigned.has(a.id));
  if(!available.length) {
    listEl.innerHTML = `<div style="font-size:12px;color:#555;font-style:italic;padding:8px 0">No available armies - all armies are already assigned to an expeditionary force.</div>`;
    return;
  }
  listEl.innerHTML = available.map(army=>{
    const fp = isFreePick(army);
    const deployedPts = armyPoints(army);   // pool points - matches the AG rows on this page
    const tfCount = (army.taskForceIds||[]).length;
    const armySym = army.symbol ? _bgSymLookup(army.symbol) : null;
    const armyIconEl = armySym
      ? `<span style="display:inline-flex;width:22px;height:22px;border-radius:5px;background:${armySym.color}18;border:1px solid ${armySym.color}55;color:${armySym.color};align-items:center;justify-content:center;flex-shrink:0;font-size:11px">${_bgSymInner(armySym,11)}</span>`
      : `<span style="display:inline-flex;width:22px;height:22px;border-radius:5px;background:var(--surface-raised);border:1px solid var(--border-subtle);align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:var(--text-faint)"><i class="fa-solid fa-chess-rook"></i></span>`;
    const fpTag = fp ? `<span style="font-size:9px;font-weight:bold;padding:1px 5px;border-radius:8px;background:#1a2a1a;color:#66bb6a;border:1px solid #66bb6a44">FP</span>` : "";
    return `<div class="list-row" style="cursor:default">
      <div style="min-width:0;flex:1;display:flex;align-items:center;gap:8px">
        ${armyIconEl}
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-weight:bold">${esc(army.name)}</span>${fpTag}${army.faction?factionPill(army.faction):""}
          </div>
          <div style="font-size:11px;color:#8b949e;margin-top:2px">${fp?"":`${tfCount} TF${tfCount!==1?"s":""} &bull; `}${deployedPts} pts</div>
        </div>
      </div>
      <button class="trait-edit-btn" onclick="addArmyToAG('${addArmyTargetForceId}','${addArmyTargetAgId}','${army.id}')">Add</button>
    </div>`;
  }).join("");
}

function addArmyToAG(forceId, agId, armyId) {
  const force = (state.expeditionaryForces||[]).find(f=>f.id===forceId);
  const ag = (force?.armyGroups||[]).find(g=>g.id===agId);
  if(!ag) return;
  if(!(ag.armyIds||[]).includes(armyId)) { ag.armyIds=ag.armyIds||[]; ag.armyIds.push(armyId); }
  saveState();
  _renderAddArmyEFList();
  renderForceDetail();
  renderForceList();
  // Update army detail to show deployment badge if that army is selected
  if(currentArmyId===armyId) renderArmyDetail();
}

function removeArmyFromAG(forceId, agId, armyId) {
  const force = (state.expeditionaryForces||[]).find(f=>f.id===forceId);
  const ag = (force?.armyGroups||[]).find(g=>g.id===agId);
  if(!ag) return;
  ag.armyIds=(ag.armyIds||[]).filter(id=>id!==armyId);
  saveState();
  renderForceDetail();
  renderForceList();
  if(currentArmyId===armyId) renderArmyDetail();
}

function openEditAGDescModal(forceId, agId) {
  const force = (state.expeditionaryForces||[]).find(f=>f.id===forceId);
  const ag = (force?.armyGroups||[]).find(g=>g.id===agId);
  if(!ag) return;
  document.getElementById("ag-desc-force-id").value = forceId;
  document.getElementById("ag-desc-ag-id").value = agId;
  document.getElementById("ag-desc-name").textContent = ag.name;
  document.getElementById("ag-desc-textarea").value = ag.description||"";
  openModal("modal-ag-desc");
}

function saveAGDesc() {
  const forceId = document.getElementById("ag-desc-force-id").value;
  const agId = document.getElementById("ag-desc-ag-id").value;
  const desc = document.getElementById("ag-desc-textarea").value.trim();
  const force = (state.expeditionaryForces||[]).find(f=>f.id===forceId);
  const ag = (force?.armyGroups||[]).find(g=>g.id===agId);
  if(ag) { ag.description=desc; saveState(); }
  closeModal("modal-ag-desc");
  renderForceDetail();
}

function openNewForceModal() {
  editingForceId = null;
  document.getElementById("force-modal-title").textContent = "New Expeditionary Force";
  document.getElementById("force-modal-submit").textContent = "Create";
  document.getElementById("force-new-name").value = "";
  document.getElementById("force-ag-count").value = "3";
  document.getElementById("force-points-target").value = "";
  document.getElementById("force-description").value = "";
  clearFieldErr("force-new-name");
  modalMsg("force-modal-msg","");
  openModal("modal-force");
}

function openEditForceModal(id) {
  const force = (state.expeditionaryForces||[]).find(f=>f.id===id);
  if(!force) return;
  editingForceId = id;
  document.getElementById("force-modal-title").textContent = "Edit Expeditionary Force";
  document.getElementById("force-modal-submit").textContent = "Save Changes";
  document.getElementById("force-new-name").value = force.name;
  document.getElementById("force-ag-count").value = String(force.agCount||3);
  document.getElementById("force-points-target").value = force.pointsTarget||"";
  document.getElementById("force-description").value = force.description||"";
  clearFieldErr("force-new-name");
  modalMsg("force-modal-msg","");
  openModal("modal-force");
}

function saveForce() {
  modalMsg("force-modal-msg","");
  const name = document.getElementById("force-new-name").value.trim();
  if(!name) { showFieldErr("force-new-name","Enter a force name."); return; }
  const agCount = parseInt(document.getElementById("force-ag-count").value)||3;
  const pointsTarget = parseInt(document.getElementById("force-points-target").value)||null;
  const description = document.getElementById("force-description").value.trim();
  if(editingForceId) {
    const force = (state.expeditionaryForces||[]).find(f=>f.id===editingForceId);
    if(force) {
      if(agCount < (force.agCount||3)) {
        const agsToRemove = (force.armyGroups||[]).slice(agCount);
        const hasArmies = agsToRemove.some(ag=>(ag.armyIds||[]).length>0);
        if(hasArmies) {
          const names = agsToRemove.filter(ag=>(ag.armyIds||[]).length>0).map(ag=>esc(ag.name)).join(", ");
          modalMsg("force-modal-msg",`Can't reduce to ${agCount} army groups - <strong>${names}</strong> still ${agsToRemove.filter(ag=>(ag.armyIds||[]).length>0).length>1?"have":"has"} armies. Remove those first.`);
          return;
        }
        force.armyGroups=(force.armyGroups||[]).slice(0,agCount);
      }
      force.name=name; force.agCount=agCount; force.pointsTarget=pointsTarget; force.description=description;
      _ensureAGs(force);
    }
    editingForceId = null;
  } else {
    const force = {id:"ef_"+uid(), name, agCount, pointsTarget, description, symbol:null, armyGroups:[]};
    if(!state.expeditionaryForces) state.expeditionaryForces=[];
    state.expeditionaryForces.push(force);
    _ensureAGs(force);
    currentForceId = force.id;
    // Jump straight into the new force's detail view
    const lv = document.getElementById("force-list-view");
    const dv = document.getElementById("force-detail-view");
    if (lv) lv.style.display = "none";
    if (dv) dv.style.display = "";
  }
  saveState();
  closeModal("modal-force");
  renderForceList();
  renderForceDetail();
}

function deleteForce(id) {
  state.expeditionaryForces=(state.expeditionaryForces||[]).filter(f=>f.id!==id);
  const wasActive = currentForceId===id;
  if(wasActive) currentForceId=null;
  saveState();
  if(wasActive) {
    const lv = document.getElementById("force-list-view");
    const dv = document.getElementById("force-detail-view");
    if (lv) lv.style.display = "";
    if (dv) dv.style.display = "none";
  }
  renderForceList();
  renderForceDetail();
}

// ── Per-force export / import ─────────────────────────────────────────────────

function collectForceBundle(forceId) {
  const force = (state.expeditionaryForces||[]).find(f=>f.id===forceId);
  if(!force) return null;

  // All army IDs from all army groups
  const armyIdSet = new Set((force.armyGroups||[]).flatMap(ag=>ag.armyIds||[]));
  const armies = (state.armies||[]).filter(a=>armyIdSet.has(a.id));

  // TFs from TF-type armies
  const tfIdSet = new Set(armies.flatMap(a=>a.taskForceIds||[]));
  const taskForces = (state.taskForces||[]).filter(tf=>tfIdSet.has(tf.id));

  // Unit IDs from TFs and FP battle groups
  const unitIdSet = new Set();
  armies.forEach(a=>{
    if(isFreePick(a)) {
      (a.battleGroups||[]).forEach(bg=>(bg.entries||[]).forEach(e=>{
        if(e.unitId) unitIdSet.add(e.unitId);
        if(e.transport) unitIdSet.add(e.transport);
      }));
    }
  });
  taskForces.forEach(tf=>(tf.units||[]).forEach(slot=>{
    if(slot.unitId) unitIdSet.add(slot.unitId);
    if(slot.transport) unitIdSet.add(slot.transport);
  }));

  const customUnits = (state.customUnits||[]).filter(u=>unitIdSet.has(u.id));

  const traitNames = new Set();
  customUnits.forEach(u=>{
    (u.standTraits||[]).forEach(t=>{ if(t&&t[0]!=null) traitNames.add(String(t[0]).toLowerCase()); });
    (u.weapons||[]).forEach(w=>(w.traits||[]).forEach(t=>{ if(t&&t[0]!=null) traitNames.add(String(t[0]).toLowerCase()); }));
  });
  const customTraits = (state.customTraits||[]).filter(t=>traitNames.has(String(t.name).toLowerCase()));

  const facIdSet = new Set(customUnits.map(u=>u.faction).filter(Boolean));
  armies.forEach(a=>{ if(a.faction) facIdSet.add(a.faction); });
  taskForces.forEach(tf=>{ if(tf.faction) facIdSet.add(tf.faction); });
  customTraits.forEach(t=>{
    if(t.faction) facIdSet.add(t.faction);
    (t.reqs||[]).forEach(r=>{ if(r&&r.type==="faction") (r.vals||[]).forEach(v=>facIdSet.add(v)); });
  });
  const customFactions = (state.customFactions||[]).filter(f=>facIdSet.has(f.id));

  const tfTypeIds = new Set();
  taskForces.forEach(tf=>{ if(tf.tfType&&(state.customTFTypes||[]).some(ct=>ct.id===tf.tfType)) tfTypeIds.add(tf.tfType); });
  const customTFTypes = (state.customTFTypes||[]).filter(t=>tfTypeIds.has(t.id));

  const assetIds = new Set();
  taskForces.forEach(tf=>{ if(tf.tacAsset&&tf.tacAsset.startsWith("custom_")) assetIds.add(tf.tacAsset.slice(7)); });
  const customTacticalAssets = (state.customTacticalAssets||[]).filter(a=>assetIds.has(a.id));

  return { force, armies, taskForces, customTFTypes, customTacticalAssets, customUnits, customFactions, customTraits };
}

function exportForce(forceId) {
  const bundle = collectForceBundle(forceId);
  if(!bundle) return;
  const payload = {
    app:appTag(), kind:"force", version:1,
    exportedAt:new Date().toISOString(), forceName:bundle.force.name,
    data:bundle
  };
  const json = JSON.stringify(payload, null, 2);
  const ta = document.getElementById("export-json-text");
  if(ta) ta.value = json;
  const ttl = document.getElementById("export-json-title");
  if(ttl) ttl.textContent = `Export - ${bundle.force.name}`;
  const sum = document.getElementById("export-json-summary");
  if(sum) {
    const parts = [];
    if(bundle.armies.length) parts.push(`${bundle.armies.length} arm${bundle.armies.length!==1?"ies":"y"}`);
    if(bundle.taskForces.length) parts.push(`${bundle.taskForces.length} task force${bundle.taskForces.length!==1?"s":""}`);
    if(bundle.customUnits.length) parts.push(`${bundle.customUnits.length} custom unit${bundle.customUnits.length!==1?"s":""}`);
    if(bundle.customFactions.length) parts.push(`${bundle.customFactions.length} custom faction${bundle.customFactions.length!==1?"s":""}`);
    if(bundle.customTraits.length) parts.push(`${bundle.customTraits.length} custom trait${bundle.customTraits.length!==1?"s":""}`);
    sum.textContent = parts.length ? parts.join(", ") : "no custom dependencies";
  }
  const copyBtn = document.getElementById("export-copy-btn");
  if(copyBtn){ copyBtn.innerHTML='<i class="fa-solid fa-copy"></i> Copy to clipboard'; copyBtn.disabled=false; }
  openModal("modal-export-json");
}

function openImportForceModal() {
  const ta = document.getElementById("import-force-text");
  if(ta) ta.value = "";
  const prev = document.getElementById("import-force-preview");
  if(prev) prev.style.display = "none";
  _dataHideMsg("import-force-msg");
  const btn = document.getElementById("import-force-btn");
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-upload"></i> Import Force'; }
  _pendingForceImport = null;
  openModal("modal-import-force");
}

let _pendingForceImport = null;
let _importForceDebounce = null;
function onImportForceTextChange() {
  clearTimeout(_importForceDebounce);
  _importForceDebounce = setTimeout(_parseImportForceText, 120);
}

function _parseImportForceText() {
  const ta = document.getElementById("import-force-text");
  const btn = document.getElementById("import-force-btn");
  const prev = document.getElementById("import-force-preview");
  _pendingForceImport = null;
  if(btn){ btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-upload"></i> Import Force'; }
  _dataHideMsg("import-force-msg");
  if(prev) prev.style.display = "none";
  const raw = ta && ta.value.trim();
  if(!raw) return;
  let payload;
  try { payload = JSON.parse(raw); }
  catch(e){ _dataMsg("import-force-msg","error","Not valid JSON - check for missing brackets or commas."); return; }
  if(!payload||!importTagOk(payload.app)||!payload.data){
    _dataMsg("import-force-msg","error","This doesn't look like a LaserStorm export - missing required fields."); return;
  }
  if(payload.kind!=="force"){
    _dataMsg("import-force-msg","error",`This is a <strong>${esc(payload.kind)}</strong> export, not a force export. Use the appropriate importer.`); return;
  }
  const d = payload.data;
  const f = d.force||{};
  const parts = [
    `<strong>${esc(f.name||"Unnamed Force")}</strong>`,
    `${f.agCount||3} army group${(f.agCount||3)!==1?"s":""}`,
    d.armies&&d.armies.length ? `${d.armies.length} arm${d.armies.length!==1?"ies":"y"}` : null,
    d.taskForces&&d.taskForces.length ? `${d.taskForces.length} task force${d.taskForces.length!==1?"s":""}` : null,
    d.customUnits&&d.customUnits.length ? `${d.customUnits.length} custom unit${d.customUnits.length!==1?"s":""}` : null,
    d.customFactions&&d.customFactions.length ? `${d.customFactions.length} custom faction${d.customFactions.length!==1?"s":""}` : null,
    d.customTraits&&d.customTraits.length ? `${d.customTraits.length} custom trait${d.customTraits.length!==1?"s":""}` : null,
  ].filter(Boolean);
  if(prev){ prev.innerHTML = parts.join(" &bull; "); prev.style.display=""; }
  if(btn) btn.disabled = false;
  _pendingForceImport = payload;
}

function doImportForce() {
  if(!_pendingForceImport||_pendingForceImport.kind!=="force"){ _dataMsg("import-force-msg","error","Paste valid force JSON first."); return; }
  const newForce = importForce(_pendingForceImport);
  if(!newForce){ _dataMsg("import-force-msg","error","This force export is missing its force data and can't be imported."); return; }
  closeModal("modal-import-force");
  const lv = document.getElementById("force-list-view");
  const dv = document.getElementById("force-detail-view");
  if(lv) lv.style.display="none";
  if(dv) dv.style.display="";
  currentForceId = newForce.id;
  renderForceDetail();
  renderForceList();
}

function importForce(payload) {
  const d = payload.data;
  if(!d || !d.force) return null;
  _normalizeBundle(d);

  // 1. Merge factions (dedup by name)
  const facById = new Map((state.customFactions||[]).map(f=>[f.id,f]));
  const facByName = new Map((state.customFactions||[]).map(f=>[String(f.name).toLowerCase(),f]));
  const facIdMap = {};
  (d.customFactions||[]).forEach(f=>{
    const k = String(f.name||"").toLowerCase();
    const ex = facByName.get(k);
    if(ex){ facIdMap[f.id]=ex.id; return; }
    let newId = (!safeImportId(f.id)||facById.has(f.id)) ? "fac_"+uid() : f.id;
    const nf = Object.assign({},f,{id:newId});
    state.customFactions.push(nf); facById.set(newId,nf); facByName.set(k,nf);
    facIdMap[f.id]=newId;
  });
  const remapFac = id=>(id&&facIdMap[id])?facIdMap[id]:id;

  // 2. Merge traits (dedup by name)
  const traitByName = new Map((state.customTraits||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const traitById = new Set((state.customTraits||[]).map(t=>t.id));
  (d.customTraits||[]).forEach(t=>{
    const k = String(t.name||"").toLowerCase();
    if(traitByName.has(k)) return;
    let newId = (!safeImportId(t.id)||traitById.has(t.id)) ? uid() : t.id;
    const nt = Object.assign({},t,{id:newId});
    if(nt.faction) nt.faction=remapFac(nt.faction);
    if(Array.isArray(nt.reqs)) nt.reqs=nt.reqs.map(r=>(r&&r.type==="faction"&&Array.isArray(r.vals))?Object.assign({},r,{vals:r.vals.map(remapFac)}):r);
    state.customTraits.push(nt); traitByName.set(k,nt); traitById.add(newId);
  });

  // 3. Merge units (dedup by name+faction combo)
  const unitMap = new Map((state.customUnits||[]).map(u=>[u.id,u]));
  const unitKey = u=>String(u.name||"").toLowerCase()+"||"+String(u.faction||"").toLowerCase();
  const unitKeyToId = new Map((state.customUnits||[]).map(u=>[unitKey(u),u.id]));
  const unitIdMap = {};
  (d.customUnits||[]).forEach(u=>{
    const nu = Object.assign({},u,{faction:remapFac(u.faction)});
    const k = unitKey(nu);
    if(unitKeyToId.has(k)){ unitIdMap[u.id]=unitKeyToId.get(k); return; }
    let newId = (!nu.id||unitMap.has(nu.id)) ? "custom_"+uid() : nu.id;
    nu.id=newId;
    if(typeof migrateCustomUnit==="function") migrateCustomUnit(nu);
    state.customUnits.push(nu); unitMap.set(newId,nu); unitKeyToId.set(k,newId);
    unitIdMap[u.id]=newId;
  });
  const remapUnit = id=>(id&&unitIdMap[id])?unitIdMap[id]:id;

  // 4. Merge custom TF types (dedup by name)
  const tfTypeByName = new Map((state.customTFTypes||[]).map(t=>[String(t.name).toLowerCase(),t]));
  const tfTypeById = new Map((state.customTFTypes||[]).map(t=>[t.id,t]));
  const tfTypeIdMap = {};
  (d.customTFTypes||[]).forEach(t=>{
    const k = String(t.name||"").toLowerCase();
    const ex = tfTypeByName.get(k);
    if(ex){ tfTypeIdMap[t.id]=ex.id; return; }
    let newId = (!safeImportId(t.id)||tfTypeById.has(t.id)) ? "ctft_"+uid() : t.id;
    const nt = Object.assign({},t,{id:newId});
    state.customTFTypes.push(nt); tfTypeByName.set(k,nt); tfTypeById.set(newId,nt);
    tfTypeIdMap[t.id]=newId;
  });
  const remapTFType = id=>(id&&tfTypeIdMap[id])?tfTypeIdMap[id]:id;

  // 5. Merge custom tactical assets (dedup by name)
  const assetByName = new Map((state.customTacticalAssets||[]).map(a=>[String(a.name).toLowerCase(),a]));
  const assetById = new Map((state.customTacticalAssets||[]).map(a=>[a.id,a]));
  const assetIdMap = {};
  (d.customTacticalAssets||[]).forEach(a=>{
    const k = String(a.name||"").toLowerCase();
    const ex = assetByName.get(k);
    if(ex){ assetIdMap[a.id]=ex.id; return; }
    let newId = (!safeImportId(a.id)||assetById.has(a.id)) ? uid() : a.id;
    const na = Object.assign({},a,{id:newId});
    state.customTacticalAssets.push(na); assetByName.set(k,na); assetById.set(newId,na);
    assetIdMap[a.id]=newId;
  });
  const remapTacAsset = raw=>{
    if(!raw) return raw;
    if(raw.startsWith("custom_")){ const bare=raw.slice(7); return "custom_"+(assetIdMap[bare]||bare); }
    return raw;
  };

  // 6. Import task forces with fresh IDs (always new)
  const tfIdMap = {};
  const slotIdMap = {};   // keyed "<oldTfId>|<oldSlotId>" - slot ids repeat across exports
  (d.taskForces||[]).forEach(tf=>{
    const newTFId = "tf_"+uid();
    tfIdMap[tf.id]=newTFId;
    const newTF = Object.assign({},tf,{
      id:newTFId,
      tfType:remapTFType(tf.tfType),
      tacAsset:remapTacAsset(tf.tacAsset),
      faction:remapFac(tf.faction),
      units:(tf.units||[]).map(slot=>{
        const sid = "slot_"+uid(); slotIdMap[tf.id+"|"+slot.id]=sid;
        return Object.assign({},slot,{
          id:sid,
          unitId:remapUnit(slot.unitId),
          transport:slot.transport?remapUnit(slot.transport):slot.transport
        });
      })
    });
    state.taskForces.push(newTF);
  });
  const remapTF = id=>(id&&tfIdMap[id])?tfIdMap[id]:id;

  // 7. Import armies with fresh IDs, remapping all internal references
  const armyIdMap = {};
  (d.armies||[]).forEach(orig=>{
    const newArmyId = "army_"+uid();
    armyIdMap[orig.id]=newArmyId;
    const newArmy = Object.assign({},orig,{
      id:newArmyId,
      faction:remapFac(orig.faction),
      taskForceIds:(orig.taskForceIds||[]).map(remapTF),
      battleGroups:(orig.battleGroups||[]).map(bg=>Object.assign({},bg,{
        id:"bg_"+uid(),
        entries:(bg.entries||[]).map(e=>{
          const ne = Object.assign({},e,{id:"e_"+uid()});
          if(ne.tfId){ if(ne.slotId) ne.slotId=slotIdMap[ne.tfId+"|"+ne.slotId]||ne.slotId; ne.tfId=remapTF(ne.tfId); }
          if(ne.unitId) ne.unitId=remapUnit(ne.unitId);
          if(ne.transport) ne.transport=remapUnit(ne.transport);
          return ne;
        })
      }))
    });
    state.armies.push(newArmy);
  });
  const remapArmy = id=>(id&&armyIdMap[id])?armyIdMap[id]:id;

  // 8. Import the force with a fresh ID, remapping army references
  const orig = d.force;
  const newForce = Object.assign({},orig,{
    id:"ef_"+uid(),
    armyGroups:(orig.armyGroups||[]).map(ag=>Object.assign({},ag,{
      id:"ag_"+uid(),
      armyIds:(ag.armyIds||[]).map(remapArmy)
    }))
  });
  if(!state.expeditionaryForces) state.expeditionaryForces=[];
  state.expeditionaryForces.push(newForce);
  saveState();
  return newForce;
}

// ============================================================
// INIT
// ============================================================
function renderAll() {
  renderLibrary();
  renderTFList();
  if(currentTFId) renderTFDetail();
  renderArmyList();
  if(currentArmyId) renderArmyDetail();
  renderForceList();
  if(currentForceId) renderForceDetail();
}

loadState();
applyBranding();             // title / nav-brand / Buy link from GAME.meta
applyTerms();                // rewrite static shell terminology from GAME.terms
renderBuilderStatInputs();   // build the stat inputs from GAME.schema before anything touches them
rebuildClassSelect();        // populate Class <select> from GAME.classes before resetBuilder reads it
resetBuilder();
rebuildFactionSelect();

// Default-collapse lib filter panel on mobile
_libFilterCollapsed = window.innerWidth <= 640;

showPage("builder");

// Close modals on background click. The free-pick add-units modal has its
// own close path that re-renders the army detail behind it - route through
// it so background-dismissal doesn't leave a stale view.
document.querySelectorAll(".modal-bg").forEach(mb=>{
  mb.addEventListener("click",function(e){
    if(e.target!==mb) return;
    if(mb.id==="modal-fp-unit") { closeFPUnitModal(); return; }
    mb.classList.remove("open");
  });
});

// Close library quick-add popover on outside click
document.addEventListener("mousedown", function(e) {
  const pop = document.getElementById("lib-quick-add-popover");
  if(pop && pop.style.display !== "none" && !pop.contains(e.target)) closeLibQuickAddPopover();
});

// Keyboard shortcuts
document.addEventListener("keydown", function(e) {
  // ESC closes quick-add popover
  if(e.key === "Escape") closeLibQuickAddPopover();
  // Undo (Ctrl+Z / Cmd+Z)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    e.preventDefault();
    undoState();
  }
});

