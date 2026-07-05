// Skirmish — a MINIMAL second game pack, written to prove the Rally engine is
// game-agnostic. Deliberately NOT LaserStorm: a different stat line
// (Move/Toughness/Skill/Nerve instead of Speed/Mobility/Aim/Assault/Save/
// Morale) and a fixed-points cost model (units carry hand-entered `pts`;
// cost.unitCost just reads them — the simple tier, versus LaserStorm's
// calculator). The value of this pack is the honest inventory of what still
// renders LaserStorm-shaped, NOT a polished game. See SKIRMISH_NOTES below.
//
// Contract: every `const X = GAME.foo` the engine reads must exist, because
// those aliases run at pack top-level and would throw if a member is missing.
// This pack provides the whole surface the laserstorm pack does, minimally.

const GAME = {
  meta: { id: "skirmish", name: "Skirmish", edition: "Proof of Concept",
    title: "Skirmish Force Builder",
    brand: "Skirmish Force Builder",
    // Own storage identity, isolated from LaserStorm's saves.
    storageKey: "ls_skirmish", appTag: "skirmish-army-builder", filePrefix: "skirmish" },
    // no buyUrl: a pack without a storefront hides the Buy link entirely.

  // Skirmish's own vocabulary — proves GAME.terms flows through the engine.
  terms: {
    stand: "Model", stands: "Models",
    standTraits: "Model Rules",
    taskForce: "Squad", taskForces: "Squads",
    taskForceType: "Squad Type", taskForceTypes: "Squad Types",
    commander: "Sergeant",
    battleGroup: "Detachment", battleGroups: "Detachments",
    army: "Warband", armies: "Warbands",
    force: "Campaign Roster", forces: "Campaign Rosters",
    classRules: "read-only unit rules",
    profileCols: [
      { key: "save", label: "Save" },
      { key: "dtime", label: "Advance" },
      { key: "assault", label: "Melee" },
      { key: "vuln", label: "Weak vs" },
      { key: "snap", label: "Overwatch" },
      { key: "transport", label: "Transport" },
    ],
  },
  traits: {}, classes: null, classProfiles: null, factions: {}, units: null,
  tacticalAssets: null, orgCharts: null, deployment: {}, org: {}, cost: {}, transport: {},
};

// ── TRAITS ────────────────────────────────────────────────
// [key, cost, description, opts?]. Cost is ignored by the fixed-points model
// but the trait pool + reqs must exist for the traits UI to render.
GAME.traits.stand = {
  tough:  ["Tough", 0, "Ignore the first wound each turn."],
  fast:   ["Fast", 0, "May move an extra 2\"."],
  leader: ["Leader", 0, "[Hero] Friendly models within 6\" reroll Nerve.", { unitTrait: true }],
};
const STAND_TRAITS = GAME.traits.stand;
GAME.traits.weapon = {
  ap:    ["AP", 0, "Ignores armour."],
  blast: ["Blast", 0, "Hits all models in base contact."],
};
const WEAPON_TRAITS = GAME.traits.weapon;
GAME.traits.reqs = {
  leader: [{ type: "role", vals: ["hero"] }],
};
const TRAIT_REQS = GAME.traits.reqs;

// ── CLASSES ───────────────────────────────────────────────
// Two model classes. size = default models per unit; mult/save fields are read
// by the engine's cost card even under fixed points, so keep them sane.
GAME.classes = {
  troop: { label: "Troop", size: 5, mult: 1, baseSave: 6, saveDice: 1, baseSpeed: 5, minSave: 2 },
  elite: { label: "Elite", size: 3, mult: 1, baseSave: 5, saveDice: 1, baseSpeed: 6, minSave: 2 },
};
const CLASS_INFO = GAME.classes;
GAME.cost.premiumsFor = function () {
  // Fixed-points model: no per-role premium multipliers. Every deployment
  // allowed, no upcharge. (Return zero premiums so any premium-driven UI is inert.)
  return { ind: 0.00, cmd: 0.00, hero: 0.00, cmdHero: 0.00 };
};
const premiumsFor = GAME.cost.premiumsFor;
GAME.classProfiles = {
  troop: { cat: "Infantry", represents: "5 rank-and-file", dtime: "Yes", assault: "Yes", vuln: "All", snap: "Move or Fire", transport: "No", save: "6+" },
  elite: { cat: "Infantry", represents: "3 specialists", dtime: "Yes", assault: "Yes", vuln: "All", snap: "Move or Fire", transport: "No", save: "5+" },
};
const CLASS_PROFILE = GAME.classProfiles;
GAME.weapons = {};
GAME.weapons.rangeOpts = [
  { label: "6\"", val: 6 }, { label: "12\"", val: 12 }, { label: "24\"", val: 24 }, { label: "Melee", val: 0 },
];
const RANGE_OPTS = GAME.weapons.rangeOpts;

// ── UNITS ─────────────────────────────────────────────────
// Fixed points: each unit carries `pts` (per-model) which cost.unitCost reads.
// Stat keys are the NEW schema's keys: move / toughness / skill / nerve.
GAME.units = [
  { id: "sk_militia", name: "Militia", class: "troop", faction: "red", role: "core", builtIn: true,
    move: 5, toughness: 3, skill: 4, nerve: 5, standTraits: [], pts: 8,
    weapons: [{ name: "Rifle", range: 24, attacks: 1, damage: 1, traits: [] }] },
  { id: "sk_veterans", name: "Veterans", class: "troop", faction: "red", role: "core", builtIn: true,
    move: 5, toughness: 4, skill: 3, nerve: 4, standTraits: [["Tough", 0]], pts: 14,
    weapons: [{ name: "Rifle", range: 24, attacks: 1, damage: 1, traits: [] }] },
  { id: "sk_commandos", name: "Commandos", class: "elite", faction: "blue", role: "core", builtIn: true,
    move: 6, toughness: 4, skill: 2, nerve: 3, standTraits: [["Fast", 0]], pts: 22,
    weapons: [{ name: "Carbine", range: 12, attacks: 2, damage: 1, traits: [["AP", 0]] }] },
  { id: "sk_heavy", name: "Heavy Weapon Team", class: "elite", faction: "blue", role: "support", builtIn: true,
    move: 4, toughness: 4, skill: 3, nerve: 4, standTraits: [], pts: 30,
    weapons: [{ name: "Autocannon", range: 24, attacks: 3, damage: 2, traits: [["Blast", 0]] }] },
];
const BUILTIN_UNITS = GAME.units;

// ── COST ENGINE (fixed points) ────────────────────────────
// The simple tier: return hand-entered points. `perStand` = unit.pts; unit
// total = pts × models. Every deployment costs the same per-model (no premium),
// which is the fixed-points contract. Shape must match what the engine's card
// renderer + cost card read: perStand, unitSize, {unit,ind,cmd,hero,cmdHero}Pts,
// saveDice, breakdown.
GAME.cost.unitCost = function (unit) {
  const ci = CLASS_INFO[unit.class] || CLASS_INFO.troop;
  const pts = Number.isFinite(+unit.pts) ? +unit.pts : 0;
  const size = unit.customSize ? Math.max(1, unit.customSize) : ci.size;
  return {
    perStand: pts,
    unitSize: size,
    defaultSize: ci.size,
    belowDefault: size < ci.size,
    unitPts: pts * size,
    indPts: pts,          // one model deployed alone
    cmdPts: pts,
    heroPts: pts,
    cmdHeroPts: pts,
    saveDice: ci.saveDice,
    allowedRoles: unit.allowedRoles || null,
    breakdown: { standPts: pts, standComps: [{ label: "Base cost", val: pts }], weaponPts: 0, weaponComps: [], mult: ci.mult },
  };
};

// ── FACTIONS ──────────────────────────────────────────────
GAME.factions.colors = { red: "#e53935", blue: "#1e88e5" };
const FACTION_COLORS = GAME.factions.colors;
GAME.factions.icons = { red: "fire", blue: "snowflake" };
const BUILTIN_FACTION_ICONS = GAME.factions.icons;
GAME.factions.labels = { red: "Red Coalition", blue: "Blue Federation" };
const BUILTIN_FACTION_LABELS = GAME.factions.labels;
const FACTION_LABEL_MAP = GAME.factions.labels;
GAME.factions.keySet = new Set(["red", "blue"]);
const TRAIT_FACTION_NAMES = GAME.factions.keySet;

GAME.tacticalAssets = [
  { id: "ambush", name: "Ambush", faction: null, use: ["Deployment"], fn: "One unit deploys after all others, anywhere 9\" from the enemy." },
];
const TACTICAL_ASSETS = GAME.tacticalAssets;

// ── ORG CHARTS ────────────────────────────────────────────
// Task-force slot ranges per class. Two classes only.
GAME.orgCharts = {
  patrol: { label: "Patrol", slots: { troop: [1, 4], elite: [0, 2] } },
  strike: { label: "Strike Team", slots: { troop: [0, 2], elite: [1, 3] } },
};
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
GAME.org.classKeys = ["troop", "elite"];
GAME.org.classNames = { troop: "Troop", elite: "Elite" };
const _TF_CLASS_KEYS = GAME.org.classKeys;
const _TF_CLASS_NAMES = GAME.org.classNames;
GAME.org.troopClasses = ["troop"];
const TROOP_CLASSES = GAME.org.troopClasses;
GAME.org.supportPremium = 0;
GAME.org.supportMax = 2;
GAME.org.commandRatio = core => Math.floor(core / 2);
GAME.org.specialistMax = coreOfClass => coreOfClass;
GAME.org.rankSlots = { senior: n => Math.floor(n / 4), lord: n => Math.floor(n / 8) };
GAME.org.armyScale = n => n >= 10 ? "epic" : n >= 5 ? "large" : "normal";
GAME.cost.applySupportPremium = base => base;   // fixed points: no premium

// ── TRANSPORT (none in this game) ─────────────────────────
GAME.transport.slotsFor = () => 0;
GAME.transport.slotsNeeded = () => 1;
GAME.transport.canRide = () => false;
GAME.transport.canCarry = () => false;
const transportSlotsFor = GAME.transport.slotsFor;
const transportSlotsNeeded = GAME.transport.slotsNeeded;

// ── SCHEMA (the different stat line) ──────────────────────
// Four stats, not six. Different keys entirely. This is the real test: the
// engine's card renderers and builder iterate GAME.schema.stats — if they
// render Move/Toughness/Skill/Nerve without any LaserStorm-specific code,
// the schema seam holds.
GAME.schema = {
  stats: [
    { key: "move", label: "Mv", formLabel: "Move", format: u => `${u.move}"`,
      edit: { id: "b-move", kind: "number", value: 5, min: 1, max: 12, fallback: 5,
        applyClass: (el, ci) => { el.value = ci.baseSpeed; } } },
    { key: "toughness", label: "Tuf", formLabel: "Toughness", format: u => `${u.toughness}`,
      edit: { id: "b-toughness", kind: "number", value: 3, min: 1, max: 8, fallback: 3,
        applyClass: el => { el.value = 3; } } },
    { key: "skill", label: "Skl", formLabel: "Skill", format: u => `${u.skill}+`,
      edit: { id: "b-skill", kind: "number", value: 4, min: 2, max: 6, fallback: 4,
        after: `<span class="stat-sfx">+</span>`, applyClass: el => { el.value = 4; } } },
    { key: "nerve", label: "Nrv", formLabel: "Nerve", format: u => `${u.nerve}+`,
      edit: { id: "b-nerve", kind: "number", value: 5, min: 2, max: 6, fallback: 5,
        after: `<span class="stat-sfx">+</span>`, applyClass: el => { el.value = 5; } } },
  ],
  weapon: {
    tag: w => `${w.range === 0 ? "Melee" : "Ranged"}`,
    fields: [
      { key: "range", label: "Range", printLabel: "Rng", format: w => w.range === 0 ? "Melee" : `${w.range}"` },
      { key: "attacks", label: "Attacks", format: w => `${w.attacks}` },
      { key: "damage", label: "Damage", format: w => `${w.damage}` },
    ],
    emptyText: "No weapons",
    edit: [
      { key: "range", label: "Range", kind: "select", numeric: true, options: () => RANGE_OPTS.map(r => ({ v: r.val, l: r.label })) },
      { key: "attacks", label: "Attacks", kind: "number", min: 1, max: 10, fallback: 1 },
      { key: "damage", label: "Damage", kind: "number", min: 0, max: 10, fallback: 1 },
    ],
    initialWeapon: () => ({ name: "", range: 24, attacks: 1, damage: 1, traits: [] }),
    newWeapon: () => ({ name: "", range: 12, attacks: 1, damage: 1, traits: [] }),
  },
};

/* SKIRMISH_NOTES — inventory from building `node build.mjs skirmish` and
   opening the app in a browser. This pack is the probe; the findings below are
   the generalization punch-list.

   WHAT WORKS (the schema seam holds):
   - GAME.schema.stats drives the whole stat line. The builder + card renderers
     rendered Move/Toughness/Skill/Nerve (4 stats) instead of LaserStorm's 6,
     with NO engine change. b-move/b-toughness/b-skill/b-nerve inputs appeared;
     b-speed/b-aim (LaserStorm ids) were absent. This is the core proof.
   - GAME.schema.weapon likewise drove the weapon editor (Range/Attacks/Damage).
   - cost.unitCost fixed-points model loaded without error.
   - GAME.meta.name is read (=="Skirmish"), so the engine does see the pack id.

   FIXED in this pass (the builder-blocking hardcodes):
   1. [WAS BLOCKER — FIXED] The Class <select> options were hardcoded in
      shell.html and the builder defaulted to "inf", so a pack without an "inf"
      class threw "Cannot read properties of undefined (reading 'baseSpeed')"
      and BLANKED the builder. Now: rebuildClassSelect() populates b-class from
      GAME.classes at boot, resetBuilder() defaults to the first class key, and
      the shell <select> ships empty. Skirmish now shows Troop/Elite and renders.
   2. [ALSO FIXED] rebuildFactionSelect() had a hardcoded 5-faction array
      (standard/precursor/...); now it reads GAME.factions.labels. Skirmish shows
      Red Coalition / Blue Federation. (Both proven behavior-identical for
      LaserStorm by the golden masters: points + render IDENTICAL.)

   FIXED (branding seam):
   3. [FIXED] <title>, .nav-brand, and the Buy link were hardcoded LaserStorm.
      Now applyBranding() reads GAME.meta.{title,brand,buyUrl,buyLabel} at boot;
      the shell ships those slots empty. Skirmish shows "Skirmish Force Builder"
      and hides the Buy link (no buyUrl). LaserStorm unchanged (masters IDENTICAL).

   FIXED (terminology seam — GAME.terms + T() helper):
   4. [FIXED] The class-rules strip column headers are now pack-driven via
      GAME.terms.profileCols; skirmish shows Advance / Melee / Weak vs /
      Overwatch instead of LaserStorm's Double-Time / Assault / Vulnerable / Snap.
   5. [PARTLY FIXED] Engine-rendered "Task Force"/"Army"/etc terminology now
      reads GAME.terms via T() (skirmish: Squad / Warband / Detachment / Model).
      This covers the DYNAMIC UI (JS-rendered lists, modals, empty states,
      export category labels). Both masters stay IDENTICAL for LaserStorm
      because its terms ARE the original words.

   STILL LEAKING (deferred to later slices):
   6. STATIC shell.html scaffolding labels (~34 strings: nav tab labels, modal
      titles, section headers) are still literal "Task Force"/"Stand" - they're
      static HTML with no T() access. Making them pack-driven needs element ids +
      a boot-time textContent sweep. Follow-up slice.
   7. [FIXED] The card-renderer "Stand"/"stands"/"Stand Traits" strings are now
      T()-driven (skirmish cards show "5 models" and "Model Rules"). These render
      inside the card HTML the render master captures, but the change is
      behavior-PRESERVING for LaserStorm: term values equal the original words
      and inline counts lowercase (via Tn() / .toLowerCase()), so LaserStorm's
      cards render byte-identically and render_master stayed IDENTICAL - no
      baseline update needed.
   8. [FIXED] The import/export app-tag, localStorage key, and download
      filenames are now pack-overridable via GAME.meta.{storageKey,appTag,
      filePrefix}. LaserStorm PINS them to the legacy values (ls_army_builder /
      laserstorm-army-builder / laserstorm) so existing saves and exports carry
      ZERO migration risk. Skirmish declares its own (ls_skirmish /
      skirmish-army-builder / skirmish). Safety nets, all test-covered:
      - loadState() falls back to the legacy "ls_army_builder" key when a pack's
        own key is empty, so a renamed-key pack adopts existing data instead of
        orphaning it (and leaves the legacy key intact as a rollback path).
      - import validators accept BOTH the pack's tag AND the legacy literal, so
        old export files still import into any build.
      Verified on a skirmish build: adopts legacy data, writes forward under
      ls_skirmish, legacy key preserved, both legacy and own-tag imports accepted.

   ALL EIGHT identified leaks are now addressed EXCEPT #6 (static shell.html
   scaffolding labels), which is purely cosmetic and needs element-ids + a boot
   textContent sweep. */
