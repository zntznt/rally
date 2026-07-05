# Rally

A single-page army-list builder **engine** for tabletop wargames. The whole
application is one self-contained HTML file that runs in any browser, online or
off — but unlike a normal single-file app, it's assembled at build time from a
game-agnostic **engine** plus one swappable **game pack**. Ship a different pack
and the same engine becomes a different game's army builder.

**LaserStorm (2nd Edition)** is the first pack. This repo began life as the
standalone LaserStorm Force Builder; the engine/pack boundary was carved out of
it incrementally (every step proven behavior-identical by golden-master tests),
and this is where the multi-game engine now lives.

## Layout

```
engine/app.js       The game-agnostic shell: state, persistence, containers
                    (units → task forces → armies → battle groups → forces),
                    import/export, print, undo, and the UI. Reaches game rules
                    only through the GAME object the pack defines.
packs/<name>.js     One game pack: the GAME namespace — data (traits, units,
                    classes, factions, org charts), the cost engine, transport
                    rules, force-org ratios, and the unit schema (stat line +
                    weapon line, both display and builder-input descriptors).
src/shell.html      The HTML skeleton (head, inlined offline fonts/icons, page
                    markup) with a /*__RALLY_APP__*/ placeholder for the script.
build.mjs           Concatenates the chosen pack + engine into the shell →
                    dist/index.html (one offline file).
dist/index.html     The built app. This is what a user opens.
tools/              golden_master.cjs + render_master.cjs (behavior guards),
                    functional.cjs (stateful-flow assertions: persistence,
                    undo, delete cascades, import validation, XSS),
                    build_check.mjs (fast parse + build smoke test).
```

## Build

```bash
node build.mjs                # build with the default pack (laserstorm)
node build.mjs <packName>     # build with a different pack
npm run check                 # parse the combined source + build (fast, no browser)
```

Then open `dist/index.html`, or serve it: `npm run serve` (port 3001).

### Why concatenation instead of a bundler

The engine uses inline `on*` handlers that both call global functions **and**
assign to module-scope variables (`assetPickerSelectedId=…`, `libSort=…`, the
weapon-editor writes, etc.). A closure-bundler (esbuild/rollup IIFE) would
silently break every one of these. Concatenation keeps the whole app in one
shared global scope — exactly the runtime model the code was written for — so
the build is behavior-identical to the pre-split monolith. Moving to a real
module bundler is a deliberate future step, gated on first migrating those
inline handlers to `addEventListener`/event-delegation. Until then, the pack and
engine are separate **source files** combined in order (`pack` first so its
`GAME` object and alias consts exist before the engine's top-level code reads
them); one scope after concatenation, so the engine's hoisted function
declarations remain reachable from pack closures at render time.

## Verifying a change

Both golden masters compare observable behavior before/after a change; an empty
diff means nothing changed. Run them against a served `dist`:

```bash
python3 -m http.server 3001 --directory dist &
node tools/golden_master.cjs /tmp/before.json    # points engine: every unit,
#   ... make your change, rebuild ...            #   transport matrix, section
node tools/golden_master.cjs /tmp/after.json      #   limits, premiums
node tools/render_master.cjs  /tmp/rbefore.json   # card rendering (screen+print)
#   ... rebuild ...                              #   + builder-form DOM, gathered
node tools/render_master.cjs  /tmp/rafter.json    #   units, weapon editor, editUnit
```

Compare structurally (key order in gathered-unit objects is not significant):

```bash
python3 -c "import json,sys; a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2])); d=[k for k in set(a)|set(b) if a.get(k)!=b.get(k)]; print(d or 'IDENTICAL')" /tmp/before.json /tmp/after.json
```

Touching `packs/<name>.cost`/`.org`/`.transport` should move the points golden
master (that's the point); touching rendering or the schema should move the
render master. Neither should change from an engine refactor that's meant to be
behavior-preserving.

### Functional suite

The golden masters snapshot *math* and *rendering*. The functional suite guards
*stateful UI flows* the masters can't see — the paths where a bug loses or
corrupts a user's data. It is pass/fail (no baseline file): 12 assertions
covering save/reload persistence, undo, `deleteTF`/`deleteArmy` cascades (no
dangling references left behind), army export→import round-trip, import
validation (`_parseImportArmyText` accepts only correctly-tagged army exports),
crafted-import XSS sanitization (faction `icon`/`color` are interpolated into
attributes unescaped and rely on `_migrateState` to neutralize them),
corrupt-`localStorage` recovery, and the pack-overridable storage identity
(storage key + app tag resolve, legacy app-tag still imports, and the
migration read adopts data left under the legacy `ls_army_builder` key).

```bash
python3 -m http.server 3001 --directory dist &
npm run functional            # -> "functional: 12/12 passed", exit 0 on pass
```

Run it after any change that touches state, persistence, delete/import logic, or
the escaping helpers.

## Adding a game pack

A pack is a JavaScript file that populates a `GAME` object (see
`packs/laserstorm.js` for the complete reference). At minimum it declares
`GAME.meta`, the stat/weapon **schema** (`GAME.schema`), the unit **classes**,
the **cost** model (`GAME.cost.unitCost` — fixed points is the simple case; a
formula is the escape hatch), and the force-organization rules (`GAME.org`,
`GAME.orgCharts`, `GAME.deployment`). Build with `node build.mjs <yourpack>` and
run the golden masters to see it render.

> The engine still contains a thin layer of LaserStorm-shaped assumptions
> outside the pack (the class/faction/name/size header controls, the traits
> system, and terminology strings like "Stand" / "Task Force"). Fully
> generalizing those — and the inline-handler migration that unlocks real module
> bundling — are the next milestones.
