// LaserStorm (2nd Edition) game pack for the Rally engine.
// Extracted verbatim from the monolith's GAME namespace: data, cost
// engine, transport rules, org ratios, and the unit schema. Concatenated
// before the engine at build time (see build.mjs), so its GAME object and
// alias consts exist before the engine's top-level code reads them.

// ============================================================
// GAME PACK: LASERSTORM (2nd Edition)
// ============================================================
// Everything game-specific is registered under this one namespace: the
// data (traits, units, classes, factions, assets, org charts), the cost
// engine, the transport rules, and the force-organization constants.
// The rest of the file - persistence, containers, import/export, print,
// UI - is game-agnostic shell that reaches game rules through GAME
// (today via the compat aliases declared next to each member; the alias
// names are the legacy identifiers). This boundary is the seed of a
// multi-game engine: a different game would ship a different GAME object.
const GAME = {
  meta: { id: "laserstorm", name: "LaserStorm", edition: "2nd Edition",
    title: "LaserStorm Force Builder",
    brand: "LaserStorm Force Builder",
    buyUrl: "https://www.wargamevault.com/product/476399/laserstorm-2nd-edition?affiliate_id=564654",
    buyLabel: "Buy LaserStorm" },
  traits: {},       // stand/weapon trait pools + structured requirements
  classes: null,    // stand-class costing profiles (size, mult, saves...)
  classProfiles: null, // tactical reference table shown on the cost card
  factions: {},     // built-in faction identities (colors, icons, labels)
  units: null,      // representative stock units
  tacticalAssets: null,
  orgCharts: null,  // built-in task-force compositions (slot min/max per class)
  deployment: {},   // deployment types: labels + cost-column mapping
  org: {},          // force-organization ratios & taxonomy constants
  cost: {},         // points engine
  transport: {},    // mechanized transport rules
};
// ============================================================
// DATA: TRAITS
// ============================================================
GAME.traits.stand = {
  ad:       ["Active Defenses",3,    "Always counts as in Cover when fired upon. Does not apply to Assault combat."],
  aggLoop:  ["Aggression Loop",1,   "[Soulless][Unit] When subject to Push Back, may choose to advance 3\" toward the attacker instead.",{unitTrait:true}],
  av:       ["Assault Vehicle",1,   "This AFV may initiate Assaults. No Damage Save dice penalty in Assaults."],
  bCry:     ["Battle Cry",2,        "[Warrior][Unit][Troop] If this Unit destroys an enemy Stand in close combat, treat that enemy's Morale as 6+ for the subsequent Morale test.",{unitTrait:true}],
  bTide:    ["BattleTide",1,        "[Precursor] +1 to shoot and +2 Impact while the total Victory Points are an odd number, but -1 to shoot while the total is even. No effect if total VP is 0."],
  bNet:     ["Bot-Net",1,           "[Soulless][Unit] Stands that are out of coherency may still fire, but all fire is Inaccurate.",{unitTrait:true}],
  charge:   ["Charge",0.5,          "+1 to Assault rolls if the Unit initiated the combat."],
  dFighter: ["Dogfighter",1,        "[Aircraft] Minimum movement is half of maximum Speed (instead of 3/4)."],
  emplace:  ["Emplacement",0,       "Gains the Emplacement mobility type. Cannot move or be moved under any circumstances. Does not test Morale."],
  feroc:    ["Ferocious",1,         "[Swarm] If this Unit initiated the Assault, the target Stands retreat 3\" after the combat, even if the target wins."],
  frenzy:   ["Frenzy",1,            "[Swarm] This Stand can Follow On 3\" after close combat, but it must be toward the nearest enemy, and into contact if possible."],
  glory:    ["Glory",1,             "[Warrior][Unit][Infantry] When this Unit wins a close combat it initiated against a higher Assault target, the target makes a Damage Save with one fewer dice.",{unitTrait:true}],
  guard:    ["Guard",1,             "When attacked in Assault, may fire one weapon system at the attacker. All Shots must be directed at Stands in contact. All Shots are Inaccurate."],
  horde:    ["Horde",0,             "[Unit] This Unit is subject to Horde Morale.",{unitTrait:true}],
  hover:    ["Hover",1,             "[Aircraft] Can change facings freely when moving. Has no minimum movement. Can be targeted by AT or GP with Snap fire."],
  inWalls:  ["In the Walls",2,      "[Swarm][Unit] If the roll to Regroup this Unit is a Natural 6, it may be placed in or in contact with any building terrain on the table.",{unitTrait:true}],
  infest:   ["Infest",1,            "+1 to Assault rolls and immune to Push Back while in a terrain feature. Has no effect outside of terrain features."],
  infil:    ["Infiltrate",1,        "[Unit] This Unit may move up to 6\" after Armies have been deployed.",{unitTrait:true}],
  inspir:   ["Inspiration",3,       "When Units within 2\" fail a Morale test, this Stand may issue a 'Follow Me' order as if it was a Command Stand. Does not confer any other Command abilities."],
  jTroop:   ["Jump Troops",0.5,     "Ignore terrain while moving if all movement is in a straight line."],
  mWeap:    ["Melee Weapons",0.5,   "Reroll 1s in Assaults."],
  minSpeed: ["Minimum Speed",-1,    "[Grav] This Stand must always move at least half of its maximum Speed if it uses its Activation to move."],
  moveOut:  ["Move Out",1,          "+3\" to movement if the Stand does not fire or enter Assault."],
  oClock:   ["Overclocked",1,       "[Soulless][Unit][Infantry] May move and shoot as a Snap Action.",{unitTrait:true}],
  pFire:    ["Precise Fire",1,      "Aim reduced by 1 if the Stand does not move when Activated."],
  relic:    ["Relic Bearer",1,      "[Precursor][Hero][Troop] May reroll any one die during Activation. On a 6, roll again and add results (repeat until non-6). If any reroll is a 1, send this Stand to Reserves."],
  spawn:    ["Spawn",2,             "[Swarm][Unit] Instead of shooting or Assaulting, roll 1D6. On 4+, add a destroyed Stand of the same Class to this Unit.",{unitTrait:true}],
  stealth:  ["Stealth",2,           "[Unit] When fired upon, roll 1D6 (−1 in Concealment) and multiply by 10. If the result is less than the range to this target, all Shots from that attack are ignored.",{unitTrait:true}],
  stub:     ["Stubborn",1,          "Ignores Push Back."],
  tDep:     ["Tactical Deployment",1,"+1 to Regrouping rolls when in Reserve."],
  tHunt:    ["Tank Hunter",1,       "+1 to hit when firing at AFVs or Super Heavies. +1 to Assault against AFVs and Super Heavies."],
  terror:   ["Terror",1,            "[Unit] This Unit inflicts 2 Terror dice per stack. Can be taken multiple times.",{stackable:true,unitTrait:true}],
  tFate:    ["Third Fate",3,        "[Precursor][Hero][Infantry] If this Stand hits an enemy Hero, that Hero makes a Damage Save with one fewer dice. If no dice remain, roll twice and keep the lower value."],
  trans:    ["Transport",1.5,       "This Unit can carry Infantry or Cavalry Stands. Each stack adds 1 transport slot.",{stackable:true,max:6}],
  vSworn:   ["Vowsworn",1,          "[Warrior][Unit] The Stand & Die Morale option automatically succeeds without a die roll.",{unitTrait:true}],
  vtol:     ["VTOL",1,              "[Aircraft] Can land in open terrain. Can be targeted with AT and GP weapons while Landed."]
};
const STAND_TRAITS = GAME.traits.stand;
GAME.traits.weapon = {
  aiGuide:  ["A.I. Guided",0,  "[Soulless][Indirect] Reroll 1s on to hit rolls."],
  aa:       ["Anti-Aircraft",1,"This weapon may attack Aircraft."],
  burst:    ["Burst",0,        "A successful attack inflicts 3 hits instead of one. No single Stand can take more than one hit from one Burst."],
  flame:    ["Flame",0,        "Hits on a 3+. Continue rolling for additional hits until each Stand in the Unit has been hit or a roll misses. Does not apply to Inaccurate fire."],
  frag:     ["Frag",0,         "Impact is only +1 versus Troops."],
  heavy:    ["Heavy",-1,       "Cannot fire if this Stand moved during this Activation."],
  indir:    ["Indirect",3,     "May fire over terrain and Units. Target must be in LoS of a friendly Unit and 10\"+ away. Indirect fire is always Inaccurate."],
  rFire:    ["Rapid Fire",0,   "+1 Shot if this Stand did not move during this Activation."],
  repFire:  ["Repeating Fire",0,"Every 6 rolled to hit allows an additional Shot to be fired."],
  tgt:      ["Targeting",0,    "+1 to hit rolls."]
};
const WEAPON_TRAITS = GAME.traits.weapon;
// Structured requirements for built-in traits.
// Each entry is an array of requirement objects (all ANDed together).
// Within one object, vals[] items are ORed ("afv" or "sh" → vals:["afv","sh"]).
//   type "faction"  → must belong to this faction
//   type "class"    → must be this class key, or "troop" (inf/cav/fg)
//   type "mobility" → must use this mobility key
//   type "role"     → "hero", "independent", "troop"=non-vehicle (unit role removed - Unit Traits are unrestricted)
//   type "traitr"   → weapon must also carry this weapon-trait key
GAME.traits.reqs = {
  // Stand traits
  aggLoop:  [{type:"faction",vals:["soulless"]}],
  av:       [{type:"class",vals:["afv"]}],
  bCry:     [{type:"faction",vals:["warrior"]},  {type:"role",vals:["troop"]}],
  bNet:     [{type:"faction",vals:["soulless"]}],
  bTide:    [{type:"faction",vals:["precursor"]}],
  dFighter: [{type:"class",vals:["ac"]}],
  emplace:  [{type:"role",vals:["independent"]}, {type:"class",vals:["afv","sh"]}],
  feroc:    [{type:"faction",vals:["swarm"]}],
  frenzy:   [{type:"faction",vals:["swarm"]}],
  glory:    [{type:"faction",vals:["warrior"]},  {type:"class",vals:["inf"]}],
  hover:    [{type:"class",vals:["ac"]}],
  inWalls:  [{type:"faction",vals:["swarm"]}],
  minSpeed: [{type:"mobility",vals:["grav"]}],
  oClock:   [{type:"faction",vals:["soulless"]}, {type:"class",vals:["inf"]}],
  relic:    [{type:"faction",vals:["precursor"]},{type:"role",vals:["hero"]},  {type:"role",vals:["troop"]}],
  spawn:    [{type:"faction",vals:["swarm"]}],
  tFate:    [{type:"faction",vals:["precursor"]},{type:"role",vals:["hero"]},  {type:"class",vals:["inf"]}],
  trans:    [{type:"class",vals:["afv","ac"]}],
  vSworn:   [{type:"faction",vals:["warrior"]}],
  vtol:     [{type:"class",vals:["ac"]}],
  // Weapon traits
  aiGuide:  [{type:"faction",vals:["soulless"]}, {type:"traitr",vals:["indir"]}],
};
const TRAIT_REQS = GAME.traits.reqs;
GAME.classes = {
  inf:  {label:"Infantry",    size:6, mult:1, baseSave:6,  saveDice:1, baseSpeed:4, minSave:3},
  cav:  {label:"Cavalry",     size:4, mult:1, baseSave:6,  saveDice:1, baseSpeed:8, minSave:3},
  fg:   {label:"Field Gun",   size:3, mult:1, baseSave:6,  saveDice:1, baseSpeed:4, minSave:3},
  scout:{label:"Scout",       size:4, mult:1, baseSave:6,  saveDice:1, baseSpeed:4, minSave:3},
  afv:  {label:"AFV",         size:3, mult:2, baseSave:10, saveDice:2, baseSpeed:4, minSave:2},
  ac:   {label:"Aircraft",    size:2, mult:2, baseSave:10, saveDice:1, baseSpeed:8, minSave:2},
  sh:   {label:"Super Heavy", size:1, mult:3, baseSave:18, saveDice:3, baseSpeed:4, minSave:1},
  beh:  {label:"Behemoth",    size:1, mult:4, baseSave:24, saveDice:4, baseSpeed:4, minSave:0}
};
const CLASS_INFO = GAME.classes;
// Independent / Command / Hero premiums by Stand Class (Workshop ch.)
// null = not allowed (e.g. Field Gun & Behemoth cannot be Command Stands)
GAME.cost.premiumsFor = function(cls) {
  if(cls==="beh") return {ind:0.00, cmd:null, hero:0.25, cmdHero:null};
  if(cls==="sh")  return {ind:0.00, cmd:0.20, hero:0.25, cmdHero:0.45};
  if(cls==="fg")  return {ind:0.30, cmd:null, hero:0.55, cmdHero:null};
  return                 {ind:0.30, cmd:0.50, hero:0.55, cmdHero:0.75};
};
const premiumsFor = GAME.cost.premiumsFor;
// Tactical class profiles (Unit Classes - CLASSES table)
GAME.classProfiles = {
  inf:  {cat:"Troops",  represents:"4-6 infantry", dtime:"Yes", assault:"Yes", vuln:"AI, GP",     snap:"Move or Fire", transport:"Fills 1 slot",  save:"1D6"},
  cav:  {cat:"Troops",  represents:"3-5 cavalry",  dtime:"Yes", assault:"Yes", vuln:"AI, GP",     snap:"Move",         transport:"No",            save:"1D6"},
  scout:{cat:"Troops",  represents:"2-3 scouts",   dtime:"Yes", assault:"No",  vuln:"AI, AT, GP", snap:"Move",         transport:"No",            save:"1D6"},
  fg:   {cat:"Troops",  represents:"1-3 guns & crew", dtime:"No", assault:"No", vuln:"AI, GP",    snap:"Fire",         transport:"Fills 2 slots", save:"1D6"},
  afv:  {cat:"Vehicle", represents:"single AFV",   dtime:"Yes", assault:"With Assault Vehicle trait", vuln:"AT, GP", snap:"Move or Fire", transport:"No", save:"2D6 (1D6 vs AI/GP)"},
  ac:   {cat:"Vehicle", represents:"single aircraft", dtime:"No", assault:"No", vuln:"AT (AA), GP (AA)", snap:"Move",   transport:"No",            save:"1D6"},
  sh:   {cat:"Vehicle", represents:"single Super Heavy", dtime:"No", assault:"Crush", vuln:"AT, GP", snap:"Move or Fire (1 Stand)", transport:"No", save:"3D6"},
  beh:  {cat:"Vehicle", represents:"single Behemoth", dtime:"No", assault:"Crush / Titanic Brawl", vuln:"AT, GP", snap:"No", transport:"No",       save:"4D6"}
};
const CLASS_PROFILE = GAME.classProfiles;
GAME.weapons = {};
GAME.weapons.rangeOpts = [
  {label:"10\"", val:0}, {label:"20\"", val:2}, {label:"30\"", val:5},
  {label:"40\"", val:10}, {label:"50\"", val:20}
];
const RANGE_OPTS = GAME.weapons.rangeOpts;
// ============================================================
// DATA: BUILT-IN UNITS (representative Laserstorm units)
// ============================================================
GAME.units = [
// ── STANDARD (HUMAN) ─────────────────────────────────────────
{id:"std_reg_inf",   name:"Regular Infantry",       class:"inf",   speed:4,  mobility:"troop", aim:5, assault:0, saveNumber:5, morale:4, standTraits:[], weapons:[{name:"Small Arms",mode:"ai",type:"s",range:2,shots:1,impact:0,traits:[]},{name:"Buzzbomb",mode:"at",type:"s",range:0,shots:1,impact:3,traits:[]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:10,  unitPts:60,  indPts:15,  cmdPts:15,  heroPts:20,  cmdHeroPts:20}},
{id:"std_sup_sec",   name:"Support Section",        class:"inf",   speed:4,  mobility:"troop", aim:5, assault:0, saveNumber:5, morale:4, standTraits:[], weapons:[{name:"MG",mode:"ai",type:"p",range:2,shots:2,impact:0,traits:[]},{name:"Heavy Laser",mode:"at",type:"p",range:10,shots:1,impact:3,traits:[["Heavy",-1],["Targeting",0]]}], role:"support",   faction:"standard", builtIn:true, officialPts:{perStand:22,  unitPts:135, indPts:30,  cmdPts:35,  heroPts:35,  cmdHeroPts:40}},
{id:"std_star_mar",  name:"Star Marines",            class:"inf",   speed:4,  mobility:"troop", aim:4, assault:2, saveNumber:4, morale:3, standTraits:[], weapons:[{name:"Gauss Rifles",mode:"gp",type:"p",range:2,shots:1,impact:1,traits:[]},{name:"Plasma Rifles",mode:"gp",type:"p",range:0,shots:1,impact:2,traits:[]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:21,  unitPts:130, indPts:30,  cmdPts:35,  heroPts:35,  cmdHeroPts:40}},
{id:"std_mar_cmd",   name:"Marine Commandos",        class:"inf",   speed:5,  mobility:"troop", aim:3, assault:3, saveNumber:4, morale:3, standTraits:[], weapons:[{name:"Storm Rifles",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[["Rapid Fire",0]]},{name:"Fusion Rifles",mode:"at",type:"p",range:0,shots:1,impact:4,traits:[]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:23,  unitPts:140, indPts:30,  cmdPts:35,  heroPts:40,  cmdHeroPts:45}},
{id:"std_mar_storm", name:"Marine Storm Suits",      class:"inf",   speed:4,  mobility:"troop", aim:4, assault:3, saveNumber:3, morale:3, standTraits:[], weapons:[{name:"Storm Rifles",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[["Rapid Fire",0]]},{name:"Chain Gun",mode:"ai",type:"p",range:2,shots:2,impact:1,traits:[["Rapid Fire",0]]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:20,  unitPts:120, indPts:30,  cmdPts:30,  heroPts:35,  cmdHeroPts:35}},
{id:"std_col_mil",   name:"Colonial Militia",        class:"inf",   speed:5,  mobility:"troop", aim:5, assault:0, saveNumber:6, morale:5, standTraits:[], weapons:[{name:"Small Arms",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:4,   unitPts:25,  indPts:10,  cmdPts:10,  heroPts:10,  cmdHeroPts:10}},
{id:"std_rabble",    name:"Rabble",                  class:"inf",   speed:4,  mobility:"troop", aim:5, assault:0, saveNumber:6, morale:6, standTraits:[["Horde",0]], weapons:[{name:"Scrap Arms",mode:"ai",type:"p",range:0,shots:1,impact:0,traits:[]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:2,   unitPts:15,  indPts:5,   cmdPts:5,   heroPts:5,   cmdHeroPts:5}},
{id:"std_infiltr",   name:"Infiltrators",            class:"inf",   speed:6,  mobility:"troop", aim:3, assault:0, saveNumber:5, morale:3, standTraits:[["Infiltrate",1]], weapons:[{name:"Precision Arms",mode:"ai",type:"p",range:5,shots:1,impact:1,traits:[]}], role:"specialist",faction:"standard", builtIn:true, officialPts:{perStand:16,  unitPts:100, indPts:25,  cmdPts:25,  heroPts:25,  cmdHeroPts:30}},
{id:"std_ac_mnt",    name:"Autocannon Mounts",       class:"fg",    speed:4,  mobility:"troop", aim:4, assault:0, saveNumber:4, morale:4, standTraits:[], weapons:[{name:"Autocannon",mode:"gp",type:"p",range:5,shots:3,impact:2,traits:[["Heavy",-1]]}], role:"support",   faction:"standard", builtIn:true, officialPts:{perStand:31,  unitPts:95,  indPts:45,  cmdPts:null,heroPts:50,  cmdHeroPts:null}},
{id:"std_mortar",    name:"Mortar Teams",            class:"fg",    speed:4,  mobility:"troop", aim:5, assault:0, saveNumber:5, morale:4, standTraits:[], weapons:[{name:"Mortar",mode:"ai",type:"p",range:5,shots:2,impact:1,traits:[["Heavy",-1],["Indirect",3]]}], role:"support",   faction:"standard", builtIn:true, officialPts:{perStand:15,  unitPts:45,  indPts:20,  cmdPts:null,heroPts:25,  cmdHeroPts:null}},
{id:"std_speedbike", name:"Speeder Bikes",           class:"scout", speed:15, mobility:"grav",  aim:5, assault:1, saveNumber:5, morale:5, standTraits:[], weapons:[{name:"Vehicle MG",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]}], role:"specialist",faction:"standard", builtIn:true, officialPts:{perStand:12,  unitPts:50,  indPts:20,  cmdPts:20,  heroPts:20,  cmdHeroPts:25}},
{id:"std_hunt_dr",   name:"Hunter Drones",           class:"scout", speed:10, mobility:"grav",  aim:3, assault:0, saveNumber:6, morale:1, standTraits:[], weapons:[{name:"Light Laser",mode:"at",type:"p",range:10,shots:1,impact:4,traits:[]}], role:"specialist",faction:"standard", builtIn:true, officialPts:{perStand:34,  unitPts:140, indPts:45,  cmdPts:55,  heroPts:55,  cmdHeroPts:60}},
{id:"std_scout_jeep",name:"Scout Jeeps",             class:"scout", speed:12, mobility:"wheel", aim:5, assault:0, saveNumber:5, morale:5, standTraits:[], weapons:[{name:"Vehicle MG",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]}], role:"specialist",faction:"standard", builtIn:true, officialPts:{perStand:6,   unitPts:25,  indPts:10,  cmdPts:10,  heroPts:10,  cmdHeroPts:15}},
{id:"std_apc",       name:"APCs",                    class:"afv",   speed:12, mobility:"track", aim:5, assault:0, saveNumber:6, morale:4, standTraits:[["Transport",1.5,"This unit can carry Infantry or Cavalry stands. Each stack adds 1 transport slot.",2]], weapons:[{name:"Tank MG",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]}], role:"support",   faction:"standard", builtIn:true, officialPts:{perStand:26,  unitPts:80,  indPts:35,  cmdPts:40,  heroPts:45,  cmdHeroPts:50}},
{id:"std_scout_wlk", name:"Scout Walkers",           class:"afv",   speed:8,  mobility:"walk",  aim:5, assault:2, saveNumber:4, morale:6, standTraits:[["Infiltrate",1]], weapons:[{name:"Tank MG",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]},{name:"Autocannon",mode:"gp",type:"p",range:5,shots:2,impact:2,traits:[]}], role:"specialist",faction:"standard", builtIn:true, officialPts:{perStand:68,  unitPts:205, indPts:90,  cmdPts:105, heroPts:110, cmdHeroPts:120}},
{id:"std_assault_wlk",name:"Assault Walkers",        class:"afv",   speed:6,  mobility:"walk",  aim:5, assault:4, saveNumber:4, morale:4, standTraits:[["Assault Vehicle",1]], weapons:[{name:"Chain Gun",mode:"ai",type:"s",range:2,shots:2,impact:1,traits:[]},{name:"Light Laser",mode:"at",type:"s",range:10,shots:1,impact:4,traits:[["Targeting",0]]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:70,  unitPts:210, indPts:95,  cmdPts:105, heroPts:110, cmdHeroPts:125}},
{id:"std_lt_tank",   name:"Light Tanks",             class:"afv",   speed:12, mobility:"track", aim:5, assault:0, saveNumber:4, morale:4, standTraits:[], weapons:[{name:"Tank MG",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]},{name:"Light AT Gun",mode:"gp",type:"p",range:5,shots:1,impact:3,traits:[["Frag",0]]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:54,  unitPts:165, indPts:75,  cmdPts:85,  heroPts:85,  cmdHeroPts:95}},
{id:"std_med_tank",  name:"Medium Tanks",            class:"afv",   speed:10, mobility:"track", aim:4, assault:1, saveNumber:3, morale:3, standTraits:[], weapons:[{name:"2x Tank MG",mode:"ai",type:"p",range:2,shots:2,impact:0,traits:[]},{name:"Med. AT Gun",mode:"gp",type:"p",range:10,shots:1,impact:5,traits:[["Frag",0]]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:94,  unitPts:285, indPts:125, cmdPts:145, heroPts:150, cmdHeroPts:165}},
{id:"std_mbt",       name:"Main Battle Tanks",       class:"afv",   speed:8,  mobility:"track", aim:4, assault:2, saveNumber:2, morale:3, standTraits:[], weapons:[{name:"2x Tank MG",mode:"ai",type:"p",range:2,shots:2,impact:0,traits:[]},{name:"Hvy. AT Gun",mode:"gp",type:"p",range:10,shots:1,impact:6,traits:[["Frag",0]]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:100, unitPts:300, indPts:130, cmdPts:150, heroPts:155, cmdHeroPts:175}},
{id:"std_spg",       name:"Self-Propelled Guns",     class:"afv",   speed:8,  mobility:"track", aim:5, assault:0, saveNumber:6, morale:4, standTraits:[], weapons:[{name:"Howitzer",mode:"gp",type:"p",range:20,shots:2,impact:2,traits:[["Frag",0],["Indirect",3]]}], role:"support",   faction:"standard", builtIn:true, officialPts:{perStand:128, unitPts:385, indPts:170, cmdPts:195, heroPts:200, cmdHeroPts:225}},
{id:"std_air_stk",   name:"Air Striker",             class:"ac",    speed:10, mobility:"air",   aim:4, assault:1, saveNumber:3, morale:4, standTraits:[], weapons:[{name:"AC Autocannon",mode:"gp",type:"s",range:5,shots:2,impact:2,traits:[]},{name:"AC Rockets",mode:"gp",type:"s",range:10,shots:1,impact:5,traits:[["Anti-Aircraft",1],["Burst",0],["Frag",0]]}], role:"support",   faction:"standard", builtIn:true, officialPts:{perStand:174, unitPts:350, indPts:230, cmdPts:265, heroPts:270, cmdHeroPts:305}},
{id:"std_sh_tank",   name:"Super Heavy Tank",        class:"sh",    speed:6,  mobility:"track", aim:4, assault:2, saveNumber:3, morale:2, standTraits:[], weapons:[{name:"4x Tank MG",mode:"ai",type:"p",range:2,shots:4,impact:0,traits:[]},{name:"Siege Cannon",mode:"gp",type:"s",range:5,shots:1,impact:8,traits:[]},{name:"Pulse Laser",mode:"gp",type:"p",range:5,shots:2,impact:6,traits:[["Burst",0]]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:351, unitPts:355, indPts:355, cmdPts:425, heroPts:440, cmdHeroPts:510}},
{id:"std_paladin",   name:"Paladin Warstrider",      class:"beh",   speed:6,  mobility:"walk",  aim:4, assault:8, saveNumber:4, morale:2, standTraits:[], weapons:[{name:"Plasma Cannon",mode:"gp",type:"p",range:5,shots:2,impact:3,traits:[]},{name:"Pulse Laser",mode:"gp",type:"p",range:5,shots:2,impact:3,traits:[]},{name:"Hailstorm Gun",mode:"gp",type:"p",range:2,shots:5,impact:1,traits:[]},{name:"Rail Cannon",mode:"at",type:"p",range:10,shots:1,impact:8,traits:[["Repeating Fire",0]]}], role:"core",      faction:"standard", builtIn:true, officialPts:{perStand:668, unitPts:670, indPts:670, cmdPts:null,heroPts:835, cmdHeroPts:null}},
// ── PRECURSOR ────────────────────────────────────────────────
{id:"pre_inf",       name:"Precursor Infantry",      class:"inf",   speed:6,  mobility:"troop", aim:4, assault:0, saveNumber:4, morale:4, standTraits:[["Melee Weapons",0.5],["Active Defenses",3]], weapons:[{name:"Shard Rifle",mode:"ai",type:"p",range:2,shots:4,impact:2,traits:[]},{name:"Vorpal Grenade",mode:"gp",type:"p",range:0,shots:1,impact:5,traits:[]}], role:"core",      faction:"precursor",builtIn:true, officialPts:{perStand:40,  unitPts:240, indPts:55,  cmdPts:60,  heroPts:65,  cmdHeroPts:70}},
{id:"pre_sniper",    name:"Ghoststep Snipers",       class:"inf",   speed:6,  mobility:"troop", aim:3, assault:0, saveNumber:5, morale:6, standTraits:[["Precise Fire",1],["Melee Weapons",0.5],["Active Defenses",3]], weapons:[{name:"Void Rifle",mode:"at",type:"p",range:10,shots:1,impact:8,traits:[["Heavy",-1]]}], role:"specialist",faction:"precursor",builtIn:true, officialPts:{perStand:37,  unitPts:225, indPts:50,  cmdPts:60,  heroPts:60,  cmdHeroPts:65}},
{id:"pre_leafblade", name:"Leafblade Grav Bikes",    class:"scout", speed:8,  mobility:"grav",  aim:5, assault:0, saveNumber:4, morale:5, standTraits:[["Infiltrate",1],["Precise Fire",1],["Active Defenses",3]], weapons:[{name:"Hvy Shard Rifle",mode:"ai",type:"p",range:2,shots:4,impact:4,traits:[]}], role:"specialist",faction:"precursor",builtIn:true, officialPts:{perStand:38,  unitPts:155, indPts:50,  cmdPts:60,  heroPts:60,  cmdHeroPts:70}},
{id:"pre_stardrop",  name:"Stardrop Artillery",      class:"afv",   speed:6,  mobility:"grav",  aim:4, assault:0, saveNumber:6, morale:4, standTraits:[["Active Defenses",3]], weapons:[{name:"Hvy Shard Rifle",mode:"ai",type:"p",range:2,shots:4,impact:4,traits:[]},{name:"Star Launcher",mode:"gp",type:"p",range:10,shots:1,impact:5,traits:[["Heavy",-1],["Indirect",3],["Burst",0],["Repeating Fire",0]]}], role:"support",   faction:"precursor",builtIn:true, officialPts:{perStand:236, unitPts:710, indPts:310, cmdPts:355, heroPts:370, cmdHeroPts:415}},
{id:"pre_swift_apc", name:"Swiftshell APC",          class:"afv",   speed:6,  mobility:"wheel", aim:4, assault:0, saveNumber:6, morale:4, standTraits:[["Transport",1.5,"This unit can carry Infantry or Cavalry stands. Each stack adds 1 transport slot.",2]], weapons:[{name:"Hvy Shard Rifle",mode:"ai",type:"p",range:2,shots:4,impact:4,traits:[]},{name:"Hvy Shard Rifle",mode:"ai",type:"p",range:2,shots:4,impact:4,traits:[]}], role:"support",   faction:"precursor",builtIn:true, officialPts:{perStand:134, unitPts:405, indPts:175, cmdPts:205, heroPts:210, cmdHeroPts:235}},
{id:"pre_suncrest",  name:"Suncrest Hovertank",      class:"afv",   speed:6,  mobility:"grav",  aim:4, assault:0, saveNumber:5, morale:3, standTraits:[["Active Defenses",3]], weapons:[{name:"Hvy Shard Rifle",mode:"ai",type:"p",range:2,shots:4,impact:4,traits:[]},{name:"Sunbeam",mode:"at",type:"p",range:5,shots:1,impact:10,traits:[]}], role:"core",      faction:"precursor",builtIn:true, officialPts:{perStand:146, unitPts:440, indPts:190, cmdPts:220, heroPts:230, cmdHeroPts:260}},
{id:"pre_dusklight", name:"Dusklight Battlespire",   class:"beh",   speed:10, mobility:"walk",  aim:4, assault:5, saveNumber:10,morale:3, standTraits:[["Active Defenses",3]], weapons:[{name:"Firepetal Battery",mode:"gp",type:"p",range:2,shots:4,impact:5,traits:[]},{name:"Firepetal Battery",mode:"gp",type:"p",range:2,shots:4,impact:5,traits:[]},{name:"Void Cannon",mode:"at",type:"p",range:10,shots:1,impact:15,traits:[["Indirect",3],["Heavy",-1]]}], role:"core",      faction:"precursor",builtIn:true, officialPts:{perStand:712, unitPts:715, indPts:715, cmdPts:null,heroPts:890, cmdHeroPts:null}},
// ── SOULLESS ─────────────────────────────────────────────────
{id:"sl_drones",     name:"Soulless Drones",         class:"inf",   speed:4,  mobility:"troop", aim:5, assault:0, saveNumber:6, morale:1, standTraits:[["Stubborn",1]], weapons:[{name:"Laser Rifles",mode:"ai",type:"s",range:5,shots:1,impact:0,traits:[["Targeting",0]]},{name:"Buzzbomb",mode:"at",type:"s",range:2,shots:1,impact:3,traits:[]}], role:"core",      faction:"soulless", builtIn:true, officialPts:{perStand:19,  unitPts:115, indPts:25,  cmdPts:30,  heroPts:30,  cmdHeroPts:35}},
{id:"sl_hvy_drones", name:"Soulless Heavy Drones",   class:"inf",   speed:4,  mobility:"troop", aim:5, assault:0, saveNumber:3, morale:1, standTraits:[["Stubborn",1]], weapons:[{name:"Laser Rifles",mode:"ai",type:"s",range:5,shots:1,impact:0,traits:[["Targeting",0]]},{name:"Infantry Laser",mode:"at",type:"s",range:10,shots:1,impact:3,traits:[["Heavy",-1]]}], role:"core",      faction:"soulless", builtIn:true, officialPts:{perStand:28,  unitPts:170, indPts:40,  cmdPts:45,  heroPts:45,  cmdHeroPts:50}},
{id:"sl_crasher",    name:"Crasher MAUs",             class:"afv",   speed:6,  mobility:"track", aim:5, assault:0, saveNumber:3, morale:1, standTraits:[["Stubborn",1]], weapons:[{name:"Def. Lasers",mode:"ai",type:"p",range:0,shots:3,impact:0,traits:[["Repeating Fire",0]]},{name:"Al EMP Rockets",mode:"at",type:"p",range:10,shots:2,impact:2,traits:[["Indirect",3],["A.I. Guided",0]]}], role:"core",      faction:"soulless", builtIn:true, officialPts:{perStand:84,  unitPts:255, indPts:110, cmdPts:130, heroPts:135, cmdHeroPts:150}},
{id:"sl_surger",     name:"Surger AFUs",              class:"afv",   speed:6,  mobility:"track", aim:5, assault:0, saveNumber:3, morale:1, standTraits:[["Stubborn",1]], weapons:[{name:"Def. Lasers",mode:"ai",type:"p",range:0,shots:3,impact:0,traits:[["Repeating Fire",0]]},{name:"Heavy Laser",mode:"at",type:"p",range:10,shots:1,impact:7,traits:[["Targeting",0]]}], role:"core",      faction:"soulless", builtIn:true, officialPts:{perStand:88,  unitPts:265, indPts:115, cmdPts:135, heroPts:140, cmdHeroPts:155}},
{id:"sl_mainframe",  name:"Mainframe CBU",            class:"sh",    speed:6,  mobility:"track", aim:5, assault:6, saveNumber:3, morale:1, standTraits:[], weapons:[{name:"Def. Lasers",mode:"ai",type:"p",range:0,shots:4,impact:0,traits:[["Repeating Fire",0]]},{name:"Arc Lash",mode:"gp",type:"p",range:2,shots:4,impact:7,traits:[["Repeating Fire",0]]},{name:"Al Multi-Missiles",mode:"gp",type:"p",range:10,shots:1,impact:5,traits:[["Indirect",3],["A.I. Guided",0],["Burst",0]]}], role:"core",      faction:"soulless", builtIn:true, officialPts:{perStand:525, unitPts:525, indPts:525, cmdPts:630, heroPts:660, cmdHeroPts:765}},
{id:"sl_gridwalk",   name:"Gridwalker MTU",           class:"beh",   speed:6,  mobility:"walk",  aim:5, assault:7, saveNumber:3, morale:1, standTraits:[], weapons:[{name:"Arc Lash",mode:"gp",type:"p",range:0,shots:3,impact:2,traits:[]},{name:"Al Multi-Missiles",mode:"gp",type:"p",range:10,shots:1,impact:5,traits:[["Indirect",3],["A.I. Guided",0],["Burst",0]]},{name:"Particle Beam",mode:"at",type:"p",range:10,shots:1,impact:10,traits:[["Heavy",-1]]}], role:"core",      faction:"soulless", builtIn:true, officialPts:{perStand:840, unitPts:840, indPts:840, cmdPts:null,heroPts:1050,cmdHeroPts:null}},
// ── SWARM ────────────────────────────────────────────────────
{id:"sw_hunters",    name:"Hunters",                  class:"inf",   speed:6,  mobility:"troop", aim:5, assault:3, saveNumber:5, morale:3, standTraits:[["Melee Weapons",0.5],["Horde",0],["Infest",1],["Ferocious",1]], weapons:[], role:"core",      faction:"swarm",    builtIn:true, officialPts:{perStand:14,  unitPts:85,  indPts:20,  cmdPts:25,  heroPts:25,  cmdHeroPts:25}},
{id:"sw_lurkers",    name:"Lurkers",                  class:"inf",   speed:4,  mobility:"troop", aim:5, assault:3, saveNumber:5, morale:5, standTraits:[["Melee Weapons",0.5],["Horde",0],["Ferocious",1],["Stealth",2],["Infiltrate",1]], weapons:[], role:"specialist",faction:"swarm",    builtIn:true, officialPts:{perStand:11,  unitPts:70,  indPts:15,  cmdPts:20,  heroPts:20,  cmdHeroPts:20}},
{id:"sw_alphas",     name:"Alphas",                   class:"inf",   speed:6,  mobility:"troop", aim:5, assault:4, saveNumber:3, morale:3, standTraits:[["Melee Weapons",0.5],["Horde",0],["Infest",1],["Ferocious",1]], weapons:[], role:"core",      faction:"swarm",    builtIn:true, officialPts:{perStand:17,  unitPts:105, indPts:25,  cmdPts:30,  heroPts:30,  cmdHeroPts:30}},
{id:"sw_buzzers",    name:"Buzzers",                  class:"scout", speed:6,  mobility:"grav",  aim:5, assault:0, saveNumber:5, morale:5, standTraits:[], weapons:[{name:"Spore Bombs",mode:"ai",type:"p",range:0,shots:4,impact:1,traits:[]}], role:"core",      faction:"swarm",    builtIn:true, officialPts:{perStand:12,  unitPts:50,  indPts:20,  cmdPts:20,  heroPts:20,  cmdHeroPts:25}},
{id:"sw_spitter",    name:"Spitter Carapace",         class:"afv",   speed:4,  mobility:"walk",  aim:5, assault:0, saveNumber:7, morale:6, standTraits:[], weapons:[{name:"Spore Bombs",mode:"ai",type:"s",range:0,shots:4,impact:1,traits:[]},{name:"Plasma Blob",mode:"gp",type:"s",range:10,shots:1,impact:4,traits:[["Indirect",3],["Burst",0],["Heavy",-1]]}], role:"core",      faction:"swarm",    builtIn:true, officialPts:{perStand:92,  unitPts:280, indPts:120, cmdPts:140, heroPts:145, cmdHeroPts:165}},
{id:"sw_slasher",    name:"Slasher Carapace",         class:"afv",   speed:4,  mobility:"walk",  aim:4, assault:6, saveNumber:5, morale:3, standTraits:[["Assault Vehicle",1]], weapons:[{name:"Acid Spray",mode:"gp",type:"s",range:0,shots:1,impact:7,traits:[["Flame",0]]},{name:"Spine Thrower",mode:"at",type:"s",range:5,shots:1,impact:3,traits:[]}], role:"core",      faction:"swarm",    builtIn:true, officialPts:{perStand:148, unitPts:445, indPts:195, cmdPts:225, heroPts:230, cmdHeroPts:260}},
{id:"sw_ravager",    name:"Ravager Queen",            class:"sh",    speed:6,  mobility:"walk",  aim:4, assault:6, saveNumber:8, morale:3, standTraits:[["Terror",1,"[Unit] This Unit inflicts 2 Terror dice per stack. Can be taken multiple times.",2]], weapons:[{name:"Acid Spray",mode:"gp",type:"s",range:0,shots:1,impact:7,traits:[["Flame",0]]},{name:"Spine Launcher",mode:"at",type:"s",range:5,shots:3,impact:3,traits:[]}], role:"core",      faction:"swarm",    builtIn:true, officialPts:{perStand:285, unitPts:285, indPts:285, cmdPts:345, heroPts:360, cmdHeroPts:415}},
// ── WARRIOR ──────────────────────────────────────────────────
{id:"war_inf",       name:"Warrior Infantry",         class:"inf",   speed:4,  mobility:"troop", aim:5, assault:2, saveNumber:5, morale:2, standTraits:[["Charge",0.5]], weapons:[{name:"Assault Rifle",mode:"ai",type:"s",range:2,shots:1,impact:0,traits:[]},{name:"Buzzbomb",mode:"at",type:"s",range:2,shots:1,impact:3,traits:[]}], role:"core",      faction:"warrior",  builtIn:true, officialPts:{perStand:17,  unitPts:105, indPts:25,  cmdPts:30,  heroPts:30,  cmdHeroPts:30}},
{id:"war_chosen",    name:"Chosen Commandos",         class:"inf",   speed:6,  mobility:"troop", aim:5, assault:4, saveNumber:4, morale:2, standTraits:[["Charge",0.5],["Melee Weapons",0.5],["Battle Cry",2]], weapons:[{name:"Storm Rifle",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]},{name:"Charge Blaster",mode:"at",type:"p",range:2,shots:1,impact:5,traits:[["Rapid Fire",0],["Heavy",-1]]}], role:"core",      faction:"warrior",  builtIn:true, officialPts:{perStand:31,  unitPts:190, indPts:45,  cmdPts:50,  heroPts:50,  cmdHeroPts:55}},
{id:"war_chariot",   name:"Chariot Battle Bikes",     class:"scout", speed:8,  mobility:"wheel", aim:5, assault:2, saveNumber:4, morale:2, standTraits:[], weapons:[{name:"Vehicle MG",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]}], role:"core",      faction:"warrior",  builtIn:true, officialPts:{perStand:11,  unitPts:45,  indPts:15,  cmdPts:20,  heroPts:20,  cmdHeroPts:20}},
{id:"war_warbeast",  name:"Warbeast Riders",          class:"cav",   speed:8,  mobility:"troop", aim:5, assault:4, saveNumber:5, morale:2, standTraits:[["Charge",0.5],["Melee Weapons",0.5]], weapons:[], role:"core",      faction:"warrior",  builtIn:true, officialPts:{perStand:11,  unitPts:45,  indPts:15,  cmdPts:20,  heroPts:20,  cmdHeroPts:20}},
{id:"war_longship",  name:"Longship APCs",            class:"afv",   speed:6,  mobility:"track", aim:5, assault:2, saveNumber:6, morale:2, standTraits:[["Transport",1.5,"This unit can carry Infantry or Cavalry stands. Each stack adds 1 transport slot.",3]], weapons:[{name:"Vehicle MG",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]}], role:"support",   faction:"warrior",  builtIn:true, officialPts:{perStand:34,  unitPts:105, indPts:45,  cmdPts:55,  heroPts:55,  cmdHeroPts:60}},
{id:"war_vanguard",  name:"Vanguard Assault Tank",    class:"afv",   speed:6,  mobility:"track", aim:5, assault:4, saveNumber:4, morale:2, standTraits:[["Assault Vehicle",1]], weapons:[{name:"Vehicle MG",mode:"ai",type:"p",range:2,shots:1,impact:0,traits:[]},{name:"Blast Cannon",mode:"at",type:"p",range:5,shots:1,impact:7,traits:[]}], role:"core",      faction:"warrior",  builtIn:true, officialPts:{perStand:78,  unitPts:235, indPts:105, cmdPts:120, heroPts:125, cmdHeroPts:140}},
{id:"war_paragon",   name:"Paragon Super Heavy Tank", class:"sh",    speed:6,  mobility:"track", aim:5, assault:6, saveNumber:3, morale:2, standTraits:[], weapons:[{name:"4x Vehicle MG",mode:"ai",type:"p",range:2,shots:4,impact:0,traits:[]},{name:"Dual BC",mode:"at",type:"p",range:5,shots:2,impact:7,traits:[]},{name:"Dual BC",mode:"at",type:"p",range:5,shots:2,impact:7,traits:[]}], role:"core",      faction:"warrior",  builtIn:true, officialPts:{perStand:282, unitPts:285, indPts:285, cmdPts:340, heroPts:355, cmdHeroPts:410}},
{id:"war_predator",  name:"Predator War God",         class:"beh",   speed:4,  mobility:"walk",  aim:5, assault:7, saveNumber:8, morale:2, standTraits:[], weapons:[{name:"Dual BC",mode:"at",type:"p",range:5,shots:2,impact:7,traits:[]},{name:"Missile Pod",mode:"gp",type:"p",range:2,shots:3,impact:5,traits:[]},{name:"Gauss Cannon",mode:"at",type:"p",range:10,shots:1,impact:10,traits:[["Indirect",3],["Targeting",0]]}], role:"core",      faction:"warrior",  builtIn:true, officialPts:{perStand:528, unitPts:530, indPts:530, cmdPts:null,heroPts:660, cmdHeroPts:null}},
];
const BUILTIN_UNITS = GAME.units;
// ── GAME PACK: points engine (LaserStorm Workshop chapter) ──
// Returns per-deployment costs for a unit; null = deployment not allowed.
GAME.cost.unitCost = function(unit) {
  if (unit.officialPts) {
    const ci = CLASS_INFO[unit.class] || CLASS_INFO.inf;
    const op = unit.officialPts;
    return { perStand:op.perStand, unitSize:ci.size, unitPts:op.unitPts, indPts:op.indPts,
             cmdPts:op.cmdPts, heroPts:op.heroPts, cmdHeroPts:op.cmdHeroPts, saveDice:ci.saveDice };
  }
  const ci = CLASS_INFO[unit.class] || CLASS_INFO.inf;
  // Coerce numeric inputs defensively: a corrupt/legacy/hand-edited import with
  // a missing or non-numeric stat/cost should degrade to a sane value rather
  // than poison the whole calc with NaN (which then renders as "NaN" badges).
  const num = (v, d=0) => { const n = +v; return Number.isFinite(n) ? n : d; };
  const speed = num(unit.speed), aim = num(unit.aim), assault = num(unit.assault),
        saveNumber = num(unit.saveNumber), morale = num(unit.morale);
  const ptsSpeedBase = (speed - ci.baseSpeed) * 0.25;
  const ptsMobSurcharge = (unit.class==="scout"||unit.class==="afv")
    ? (unit.mobility==="walk" ? 2 : unit.mobility==="grav" ? 4 : 0) : 0;
  let ptsSpeed = ptsSpeedBase + ptsMobSurcharge;
  const aimFactor = unit.class==="inf" ? 1 : 2;
  const wSlots = (unit.weapons||[]).length;
  const ptsAim = Math.max(0, 5 - aim) * aimFactor * wSlots;
  const ptsAssault = assault * 0.5 + Math.max(0, assault - 2);
  const ptsSave = ci.baseSave - saveNumber;
  let ptsMorale = 6 - morale;
  if (morale < 4) ptsMorale += 1;
  let ptsTraits = 0;
  const standTraitComps = [];
  (unit.standTraits||[]).forEach(t => {
    const cnt = traitCount(t);
    const cost = num(t[1]);
    let tc = cost===0 ? (t[0]==="Horde" ? (morale<=3?3:1) : 0) : cost * cnt;
    ptsTraits += tc;
    if(tc !== 0) standTraitComps.push({label: cnt > 1 ? `${t[0]} ×${cnt}` : t[0], val: tc});
  });
  let standPts = Math.max(1, Math.ceil(ptsSpeed+ptsAim+ptsAssault+ptsSave+ptsMorale+ptsTraits));
  // Build stand component list (only non-zero entries)
  const standComps = [];
  if(ptsSpeedBase > 0) standComps.push({label:`Speed (${speed}")`, val: ptsSpeedBase});
  if(ptsMobSurcharge > 0) standComps.push({label:`${unit.mobility==="walk"?"Walker":"Grav"} mobility`, val: ptsMobSurcharge});
  if(ptsAim > 0) standComps.push({label:`Aim ${aim}+`, val: ptsAim});
  if(ptsAssault > 0) standComps.push({label:`Assault ${assault}+`, val: ptsAssault});
  if(ptsSave > 0) standComps.push({label:`Save ${saveNumber}+`, val: ptsSave});
  if(ptsMorale > 0) standComps.push({label:`Morale ${morale}+`, val: ptsMorale});
  standComps.push(...standTraitComps);
  let weaponPts = 0;
  const weaponComps = [];
  (unit.weapons||[]).forEach((w,i) => {
    const impact = num(w.impact), range = num(w.range), shots = num(w.shots, 1);
    let wCost = 0;
    let impCost = impact * 2;
    if (impact>6) impCost+=2;
    if (impact>10) impCost+=5;
    const rangeCost = range;
    wCost += rangeCost + impCost;
    let tCost=0, impTCost=0;
    const traitComps = [];
    (w.traits||[]).forEach(t => {
      const cnt = traitCount(t);
      const cost = num(t[1]);
      let tc = 0;
      if (cost===0) {
        if(t[0]==="Burst"){tc=(impCost+range+7);impTCost+=tc;}
        else if(t[0]==="Frag"&&impact>1){tc=-(impCost*0.25);impTCost+=tc;}
        else if(t[0]==="A.I. Guided"){tc=(shots*0.5);}
        else if(t[0]==="Repeating Fire"){tc=(shots*0.5);}
        else if(t[0]==="Rapid Fire"){tc=((range+impCost+impTCost)/4);}
        else if(t[0]==="Targeting"&&wSlots>1){tc=0.5;}
        else if(t[0]==="Flame"){tc=(impCost+range+5);impTCost+=tc;}
        tc *= cnt;
        tCost+=tc;
      } else {
        tc=cost*cnt; tCost+=tc;
      }
      if(tc!==0) traitComps.push({label: cnt>1 ? `${t[0]} ×${cnt}` : t[0], val:tc});
    });
    const extraShotsCost = (shots-1)*((range+impCost+impTCost)/2);
    wCost += tCost + extraShotsCost;
    const mults = [];
    if(w.mode==="gp"){ wCost*=1.5; mults.push("GP ×1.5"); }
    if(w.type==="s"){ wCost*=0.8; mults.push("Selective ×0.8"); }
    wCost = Math.ceil(wCost);
    if(unit.class==="fg"&&wSlots===1) wCost-=1;
    if(wCost<1) wCost=shots;
    if(!Number.isFinite(wCost)) wCost=0;
    const wComps = [];
    if(rangeCost>0) wComps.push({label:`Range (${range}")`, val:rangeCost});
    if(impCost>0) wComps.push({label:`Impact ${impact}`, val:impCost});
    wComps.push(...traitComps);
    if(extraShotsCost>0) wComps.push({label:`+${shots-1} extra shot${shots-1>1?"s":""}`, val:extraShotsCost});
    weaponPts += wCost;
    weaponComps.push({label: w.name || `Weapon ${i+1}`, cost: wCost, comps: wComps, mults});
  });
  let total = Math.ceil((standPts+weaponPts)*ci.mult);
  if(!Number.isFinite(total)) total = 1; // backstop: never let a NaN reach the UI
  const pr = premiumsFor(unit.class);
  const prem = p => p==null ? null : roundToFive(total*(1+p));
  const allowedRoles = unit.allowedRoles || null;
  const costOk = key => !allowedRoles || allowedRoles.some(r => ROLE_COST_MAP[r] === key);
  const defaultSize = ci.size;
  const minSize = (unit.class==="sh"||unit.class==="beh") ? 1 : 2;
  const effectiveSize = unit.customSize ? Math.max(minSize, unit.customSize) : defaultSize;
  const belowDefault = effectiveSize < defaultSize;
  const sizeFactor = belowDefault ? 1.10 : 1.0;
  return {
    perStand: total,
    unitSize: effectiveSize,
    defaultSize,
    belowDefault,
    unitPts:    costOk("unit")    ? roundToFive(total*effectiveSize*sizeFactor) : null,
    indPts:     costOk("ind")     ? prem(pr.ind)               : null,
    cmdPts:     costOk("cmd")     ? prem(pr.cmd)               : null,
    heroPts:    costOk("hero")    ? prem(pr.hero)              : null,
    cmdHeroPts: costOk("cmdHero") ? prem(pr.cmdHero)           : null,
    saveDice: ci.saveDice,
    allowedRoles,
    breakdown: {standPts, standComps, weaponPts, weaponComps, mult: ci.mult}
  };
};
GAME.factions.icons = {standard:"shield",precursor:"gem",soulless:"robot",swarm:"virus",warrior:"hand-fist"};
const BUILTIN_FACTION_ICONS = GAME.factions.icons;
GAME.factions.labels = {standard:"Standard",precursor:"Precursor",soulless:"Soulless",swarm:"Swarm",warrior:"Warrior"};
const BUILTIN_FACTION_LABELS = GAME.factions.labels;
GAME.factions.keySet = new Set(["soulless","precursor","swarm","warrior","standard"]);
const TRAIT_FACTION_NAMES = GAME.factions.keySet;
// "Troop" = non-vehicle stand classes. Appears as the class-req val "troop"
// (custom traits) and as the role-req val "troop" (built-ins) - both mean
// "only infantry / cavalry / field guns may take this trait".
GAME.org.troopClasses = ["inf","cav","fg"];
const TROOP_CLASSES = GAME.org.troopClasses;
// ── GAME PACK: unit stat schema ───────────────────────────
// Declares the stat line shown on every unit card, as an ordered list of
// fields. Each field knows how to format its own value (and optional
// sub-value) from a unit + its calcPoints() result. The card renderers
// (on-screen and print) iterate this list rather than hardcoding the six
// LaserStorm stats - a different game ships a different GAME.schema.stats
// and the same renderers draw it. `format`/`sub` return display strings
// only; the renderer owns the surrounding markup.
GAME.schema = {
  // Each stat field: card display (label/format/sub) + builder input
  // descriptor (edit). edit.kind is "number" or "select"; edit.applyClass
  // resets the input to the class's defaults when the class changes;
  // edit.fallback is the value gathered when the input is empty/invalid.
  // before/after are optional HTML fragments around the input (prefix "+"
  // signs, the save-dice tag, etc.).
  stats: [
    { key:"speed",      label:"Spd", formLabel:"Speed", format:u=>`${u.speed}"`,
      sub:u=>{ const m=minSpeedFor(u); return m!==null?`min ${m}"`:null; },
      edit:{ id:"b-speed", kind:"number", value:4, min:1, max:20, fallback:4,
        applyClass:(el,ci)=>{ el.value = ci.baseSpeed; } } },
    { key:"mobility",   label:"Mob", formLabel:"Mobility", format:u=>`${u.mobility}`,
      edit:{ id:"b-mobility", kind:"select", changeExpr:"onMobilityChange()",
        applyClass:(el,ci,cls)=>{
          const MOB_OPTIONS = {
            inf:   [{v:"troop",l:"Troop"}],
            cav:   [{v:"troop",l:"Troop"}],
            fg:    [{v:"troop",l:"Troop"}],
            ac:    [{v:"air",  l:"Air"}],
            scout: [{v:"wheel",l:"Wheeled"},{v:"track",l:"Tracked"},{v:"walk",l:"Walker"},{v:"grav",l:"Grav"}],
            afv:   [{v:"wheel",l:"Wheeled"},{v:"track",l:"Tracked"},{v:"walk",l:"Walker"},{v:"grav",l:"Grav"}],
            sh:    [{v:"wheel",l:"Wheeled"},{v:"track",l:"Tracked"},{v:"walk",l:"Walker"},{v:"grav",l:"Grav"}],
            beh:   [{v:"wheel",l:"Wheeled"},{v:"track",l:"Tracked"},{v:"walk",l:"Walker"},{v:"grav",l:"Grav"}]
          };
          const opts = MOB_OPTIONS[cls] || [{v:"track",l:"Tracked"}];
          el.innerHTML = opts.map(o=>`<option value="${o.v}">${o.l}</option>`).join("");
          el.disabled = opts.length === 1;
          const defaultMob = {inf:"troop",cav:"troop",fg:"troop",ac:"air",scout:"wheel",afv:"track",sh:"track",beh:"walk"};
          el.value = defaultMob[cls] || opts[0].v;
        } } },
    { key:"aim",        label:"Aim", formLabel:"Aim", format:u=>`${u.aim}+`,
      edit:{ id:"b-aim", kind:"number", value:5, min:2, max:5, fallback:5,
        after:`<span class="stat-sfx">+</span>`,
        applyClass:el=>{ el.value = 5; } } },
    { key:"assault",    label:"Assault", formLabel:"Assault", format:u=>`+${u.assault}`,
      edit:{ id:"b-assault", kind:"number", value:0, min:0, max:10, fallback:0,
        before:`<span class="stat-sfx">+</span>`,
        applyClass:el=>{ el.value = 0; } } },
    { key:"saveNumber", label:"Save", formLabel:"Save", format:(u,pts)=>`${pts.saveDice}D6/${u.saveNumber}+`,
      edit:{ id:"b-savenumber", kind:"number", value:6, min:1, max:24, fallback:6,
        before:`<span id="b-savedice" class="stat-dice">1</span><span class="stat-sfx">D6/</span>`,
        after:`<span class="stat-sfx">+</span>`,
        applyClass:(el,ci)=>{
          el.value = ci.baseSave; el.min = ci.minSave; el.max = ci.baseSave;
          const dice = document.getElementById("b-savedice");
          if(dice) dice.textContent = ci.saveDice;
        } } },
    { key:"morale",     label:"Morale", formLabel:"Morale", format:u=>`${u.morale}+`,
      edit:{ id:"b-morale", kind:"number", value:6, min:1, max:6, fallback:6,
        after:`<span class="stat-sfx">+</span>`,
        applyClass:el=>{ el.value = 6; } } },
  ],
  // The weapon line shown under each unit: a mode tag (e.g. "AI/P")
  // followed by the ordered fields. printLabel (optional) is the shorter
  // label used on print cards. `edit` describes the weapon editor's
  // controls, one per entry; `numeric` selects parse as integers.
  weapon: {
    tag: w => `${(w.mode||'').toUpperCase()}/${(w.type||'').toUpperCase()}`,
    fields: [
      { key:"range",  label:"Range", printLabel:"Rng", format:w=>`${rangeLabel(w.range)}` },
      { key:"shots",  label:"Shots",                   format:w=>`${w.shots}` },
      { key:"impact", label:"Impact",                  format:w=>`+${w.impact}` },
    ],
    emptyText: "No ranged weapons - assault only",
    edit: [
      { key:"mode",   label:"Mode",   kind:"select", options:[{v:"ai",l:"AI"},{v:"at",l:"AT"},{v:"gp",l:"GP"}] },
      { key:"type",   label:"Type",   kind:"select", options:[{v:"p",l:"Primary"},{v:"s",l:"Selective"}] },
      { key:"range",  label:"Range",  kind:"select", numeric:true, options:()=>RANGE_OPTS.map(r=>({v:r.val,l:r.label})) },
      { key:"shots",  label:"Shots",  kind:"number", min:1, max:20, fallback:1 },
      { key:"impact", label:"Impact", kind:"number", min:0, max:20, fallback:0, before:`<span class="stat-sfx">+</span>` },
    ],
    // Fresh weapon rows: initialWeapon seeds a brand-new unit's first
    // weapon; newWeapon is what the "Add Weapon" button appends.
    initialWeapon: () => ({name:"",mode:"gp",type:"p",range:0,shots:1,impact:0,traits:[]}),
    newWeapon:     () => ({name:"",mode:"at",type:"p",range:0,shots:1,impact:0,traits:[]}),
  },
};
const FACTION_LABEL_MAP  = GAME.factions.labels;
// Maps role requirement vals to the cost-column key they gate
GAME.deployment.roleCostMap = {unit:"unit", troop:"unit", independent:"ind", command:"cmd", hero:"hero", cmdHero:"cmdHero"};
const ROLE_COST_MAP = GAME.deployment.roleCostMap;
// ============================================================
// FACTIONS
// ============================================================
GAME.factions.colors = {standard:"#007eff",precursor:"#9c27b0",soulless:"#607d8b",swarm:"#4caf50",warrior:"#f44336"};
const FACTION_COLORS = GAME.factions.colors;
GAME.tacticalAssets = [
  {id:"area_denial",     name:"Area Denial",        faction:null,       use:["Activation"],                              fn:`Select an objective. All enemy Stands within 8" must retreat 3" toward their own table edge.`},
  {id:"camouflage",      name:"Camouflage",          faction:null,       use:["Deployment"],                              fn:`The Unit may not be targeted by pre-game bombardment fire. It is not considered to be the nearest target for any enemy Command Stand during the bombardment phase.`},
  {id:"deception",       name:"Deception",           faction:null,       use:["Deployment"],                              fn:`After all forces have been deployed, the Unit may be redeployed anywhere that would be a valid deployment location.`},
  {id:"drop_troops",     name:"Drop Troops",         faction:null,       use:["Reinforcements"],                          fn:`The Unit may drop anywhere on the table that is at least 8" from enemy forces, but may not take any actions this turn.`},
  {id:"entrenchments",   name:"Entrenchments",       faction:null,       use:["Deployment"],                              fn:`The Unit may set up in Entrenchments. These do not block line of sight but provide Cover from fire. Each Entrenchment is exactly the size of the Stand placed in it. Entrenchments may be abandoned and occupied by other Units.`},
  {id:"fire_support",    name:"Fire Support",        faction:null,       use:["Activation"],                              fn:`One Stand in the Unit may target any enemy Unit in sight. Roll 8 attack dice, hitting on a 4+, with a -2 saving throw modifier or 3 shots with a -6 saving throw modifier.`},
  {id:"flank_attack",    name:"Flank Attack",        faction:null,       use:["Reinforcements"],                          fn:`The Unit may arrive from either of the "neutral" table edges, from any point up to halfway across the table.`},
  {id:"follow_on_forces",name:"Follow-on Forces",    faction:null,       use:["Activation"],                              fn:`One Unit that was Regrouped may be placed within 4" of any objective currently controlled. No Stands may be placed within 8" of enemy forces.`},
  {id:"forward_deploy",  name:"Forward Deployment",  faction:null,       use:["Deployment"],                              fn:`The Unit may be deployed up to 6" forward of the normal deployment area.`},
  {id:"good_day_to_die", name:"Good Day to Die",     faction:"warrior",  use:["Activation"],                              fn:`This Battle Group counts as Morale 1+ for the remainder of the round.`},
  {id:"heuristic_plan",  name:"Heuristic Planning",  faction:"soulless", use:["Activation","Deployment","Reinforcements"],fn:`When used, select any other valid Tactical Asset that Soulless can use from the list and roll 1D6. If the result is 1, this Asset is lost and there is no effect.`},
  {id:"infiltration",    name:"Infiltration",        faction:null,       use:["Deployment"],                              fn:`The Unit may set up in any terrain feature within 10" of the deployment area.`},
  {id:"prophecy",        name:"Prophecy",            faction:"precursor",use:["Activation"],                              fn:`Look through the Initiative Deck and remove a card. Shuffle the remainder and then place the chosen card on the top or bottom of the Deck.`},
  {id:"rallying_point",  name:"Rallying Point",      faction:null,       use:["Activation"],                              fn:`One Unit may be Regrouped automatically.`},
  {id:"reserves",        name:"Reserves",            faction:null,       use:["Deployment"],                              fn:`The Unit may arrive from the friendly table edge during the Battle Group's first activation or may be placed in Reserve at that time.`},
  {id:"wave_attack",     name:"Wave Attack",         faction:null,       use:["Activation"],                              fn:`After finishing the Unit movement, for every Stand that reached close combat, all remaining Stands may move an additional 1".`},
];
const TACTICAL_ASSETS = GAME.tacticalAssets;
GAME.orgCharts = {
  infantry:     {label:"Infantry",      slots:{inf:[3,5],scout:[0,1],cav:[0,1],fg:[0,1],afv:[0,1],sh:[0,0],beh:[0,0],ac:[0,0]}},
  armour:       {label:"Armour",        slots:{inf:[0,1],scout:[0,2],cav:[0,0],fg:[0,0],afv:[3,5],sh:[0,1],beh:[0,0],ac:[0,0]}},
  combined_arms:{label:"Combined Arms", slots:{inf:[1,3],scout:[0,1],cav:[0,0],fg:[0,0],afv:[1,3],sh:[0,1],beh:[0,0],ac:[0,0]}},
  line_breaker: {label:"Line Breaker",  slots:{inf:[0,1],scout:[0,0],cav:[0,0],fg:[0,0],afv:[0,1],sh:[1,3],beh:[0,2],ac:[0,0]}},
  recon:        {label:"Recon",         slots:{inf:[0,1],scout:[2,3],cav:[0,3],fg:[0,0],afv:[0,0],sh:[0,0],beh:[0,0],ac:[0,2]}},
  heavy:        {label:"Heavy",         slots:{inf:[0,1],scout:[0,0],cav:[0,0],fg:[1,3],afv:[0,0],sh:[0,3],beh:[0,3],ac:[0,0]}},
};
const TF_TYPES = GAME.orgCharts;
GAME.org.sectionTypes = {
  core:       ["unit","independent","hero"],
  specialist: ["independent","hero"],
  command:    ["command","cmdHero"],
  support:    ["unit","independent","hero"],
};
const SECTION_TYPES = GAME.org.sectionTypes;
GAME.deployment.typeLabels  = {unit:"Unit", independent:"Independent", hero:"Hero", command:"Command Stand", cmdHero:"Cmd Hero"};
GAME.deployment.ptsKey      = {unit:"unitPts", independent:"indPts", hero:"heroPts", command:"cmdPts", cmdHero:"cmdHeroPts"};
GAME.deployment.shortLabels = {unit:"Unit", independent:"Ind", hero:"Hero", command:"Cmd", cmdHero:"H.Cmd"};
const TYPE_LABELS = GAME.deployment.typeLabels;
const VIEW_PTS_KEY = GAME.deployment.ptsKey;
const VIEW_LABELS  = GAME.deployment.shortLabels;
GAME.org.classKeys  = ["inf","scout","cav","fg","afv","sh","beh","ac"];
GAME.org.classNames = {inf:"Infantry",scout:"Scout",cav:"Cavalry",fg:"Field Gun",afv:"AFV",sh:"Super Heavy",beh:"Behemoth",ac:"Aircraft"};
const _TF_CLASS_KEYS = GAME.org.classKeys;
const _TF_CLASS_NAMES = GAME.org.classNames;
// Force-organization ratios (LaserStorm Task Force rules).
GAME.org.supportPremium = 0.10;          // support-role stands cost +10%
GAME.org.supportMax     = 3;             // max support stands per task force
GAME.org.commandRatio   = core => Math.floor(core / 2);   // command stands allowed
GAME.org.specialistMax  = coreOfClass => coreOfClass;     // specialists per class capped by core of same class
GAME.org.rankSlots = { senior: n => Math.floor(n/4), lord: n => Math.floor(n/8) };
GAME.org.armyScale = n => n >= 10 ? "epic" : n >= 5 ? "large" : "normal";
// Applies the support premium to a base cost (rounded to 5).
GAME.cost.applySupportPremium = base => roundToFive(base * (1 + GAME.org.supportPremium));
// ── Mechanized transport helpers (GAME PACK rules) ────────
// Capacity a carrier offers: one slot per stack of its Transport trait.
GAME.transport.slotsFor = function(unit) {
  const t = (unit.standTraits||[]).find(tr => tr[0] === "Transport");
  return t ? traitCount(t) : 0;
};
// Transport slots a deployment needs. A single stand (any deployment that
// isn't a full multi-stand "Unit") rides with exactly 1 slot, even a field
// gun that would normally need 2. Once there's more than one stand, normal
// math applies: each infantry stand fills 1 slot, each field gun fills 2.
GAME.transport.slotsNeeded = function(infUnit, unitType) {
  if ((unitType||"unit") !== "unit") return 1;
  return calcPoints(infUnit).unitSize * (infUnit.class === "fg" ? 2 : 1);
};
GAME.transport.canRide  = cls => cls === "inf" || cls === "fg";
GAME.transport.canCarry = cls => cls === "afv";
const transportSlotsFor = GAME.transport.slotsFor;
const transportSlotsNeeded = GAME.transport.slotsNeeded;
