---
name: kidsgame-maps
description: How to add or edit a town/map in the kids driving game (kids-game/public/assets/maps/*.json and src/game/mapBuilder.ts) — tile grid, houses, sites, shops, parked cars, exits between towns, and the auto building-site system. Use this whenever asked to add a new town, add a building/house/shop to an existing town, connect two towns with a road, or change what a map contains.
---

# Adding or editing a town

A town is a JSON file in `kids-game/public/assets/maps/` plus one line in
`MAP_IDS` in `kids-game/src/game/mapBuilder.ts`. Everything about a town —
terrain, buildings, cars, exits — is data. `mapBuilder.ts` reads it and draws
it; you should almost never need to touch the drawing code itself.

Read one existing map fully before writing a new one — `home-town.json` is
the richest example (houses, a shop, sites, cars, an object house).

## The tile grid

`tiles` is an array of equal-length strings, one row each. Each character is
one 200×200 tile:

| Char | Meaning |
|---|---|
| `.` | grass |
| `R` | road (auto-draws kerbs and centre-line dashes based on neighbours) |
| `H` | a plain house (colour picked automatically from its position) |
| `T` | a tree (solid obstacle) |
| `S` | sand |
| `W` | water (solid — cars can't drive into it) |

A map can also define custom single-character `legend` entries for tinted
houses without listing every one as an object:

```json
"legend": { "B": { "type": "house", "colour": "blue", "facing": "west" } }
```

## Objects: houses, shops, and building sites

The `objects` array places things with real properties on top of the grid.
Each needs `type`, `col`, `row`, and optionally `w`/`h` (tile span, default
1×1), `colour` (a name from `NAMED_COLOURS` in mapBuilder.ts, or a `"#hex"`
string), `facing` (draws a front door on that edge), `sign` (text on the
roof instead of a ridge — this is what makes a building a shop candidate),
and `sells`.

**A house:**
```json
{ "id": "big-green-house", "type": "house", "col": 7, "row": 1, "w": 2, "h": 2, "colour": "green", "facing": "south" }
```

**A shop** — needs *both* `sign` and a non-empty `sells` list, or the player
never gets a bubble to enter it:
```json
{
  "id": "corner-shop", "type": "house", "col": 3, "row": 6, "w": 2, "h": 1,
  "colour": "orange", "facing": "west", "sign": "SHOP",
  "sells": [ "bread", "pasta", "apple-juice" ],
  "shopType": "grocery"
}
```
`sells` references ingredient ids from `recipes.json` for a grocery shop, or
flavour ids from `icecream.json` for a treat shop (see the kidsgame-recipes
skill). `shopType` picks which scene opens: omit it or set `"grocery"` to
open `Shop.ts` (browse shelves, fill a basket, ingredients go into the
player's pantry for cooking); set `"treat"` to open `IceCream.ts` instead
(an eat-it-now cone-building mini-game, nothing is stocked). Don't invent a
third `shopType` without also adding the scene and the routing for it in
`Driving.ts`'s `openAction`.

**The player's own house** — at most one per map, flagged `player: true`.
It always takes his currently-chosen car colour, shows his name on the
roof, and is exempt from the auto-demolition system below (it's never a
site-backfill candidate):
```json
{ "id": "players-house", "type": "house", "col": 4, "row": 10, "player": true, "facing": "north" }
```

**The builders' yard** — where the player picks which vehicle from his
fleet to drive (see the kidsgame-cars skill):
```json
{ "id": "builders-yard", "type": "yard", "col": 1, "row": 10, "w": 3, "h": 2 }
```
Nothing stops a second one technically, but by convention there's only one
in the whole world, in `home-town`; `MiniMap.ts` marks it same as a shop.

**A building site** — an empty plot the player can build a house on with the
Builder mini-game:
```json
{ "id": "home-plot-1", "type": "site", "col": 3, "row": 4 }
```
IDs must be unique across the whole map (houses and sites share one
namespace) — `mapBuilder.ts` warns to the console on a collision.

## Parked cars

`cars` scatters obstacle vehicles along the roads, drawn with the same
builder as the player's car:
```json
{ "col": 4, "row": 3, "facing": "east", "colour": "blue", "model": "hatch" }
```
`model` is any key from `CAR_MODELS` in `carShapes.ts` (currently `hatch`,
`racer`, `truck`, `lorry`, `forklift`, `digger`, `mixer` — see the
kidsgame-cars skill for adding more). These aren't just static obstacles —
Driving.ts drives them around the road network on their own (random turns
at junctions, no reversing except at dead ends) — so keep them clear of the
`start` tile and of exit roads so the player never spawns boxed in, and
don't assume a parked car will still be exactly where the JSON put it.

## Connecting towns with `exits`

```json
"exits": { "east": "hill-town", "south": "beach-town" }
```
Driving through a gap in the edge wall on that side loads the named map,
keeping the player's speed and heading. The edge wall only has a gap where
the JSON says a road crosses that edge — **the edge tile at that row/column
must be `R` on both maps**, or the player will either hit an invisible wall
on one side or fall off the edge of the world on the other. When adding a
new town, sketch both maps' edges on paper (or just eyeball the row/column
index) before wiring the exit.

Never leave a road running to an edge with no exit — that's a dead end into
a wall, confusing for a small child. Every edge-touching road should have a
matching `exits` entry, and vice versa.

`start: { "col": 6, "row": 10 }` is where the player spawns when booting
directly into this map (fresh game, or after Options → New). Put it on a
road tile, clear of any parked car.

## The auto building-site system — don't fight it

Every map is topped up to at least `MIN_SITES` (currently 3) available
building plots every time it loads, in `buildMap()`:

1. **First choice: free grass**, preferring tiles next to a road. A new
   site is added and remembered forever in `kids-game-extra-sites`
   localStorage, so it doesn't jump around between visits.
2. **Only if there's no grass left**, it demolishes a house into a site
   instead — but never one that's a shop (has a `sign`), never one the
   player has already visited, and never one he built himself.

Implications for map design: if you want a town to feel "full" and never
auto-demolish anything, just make sure it has 3+ spare grass tiles. If you
deliberately want a very tight town where demolition can kick in, that's
fine too — it's designed to be safe (protected houses are skipped).
You don't need to place a fixed number of `site` objects yourself; the
system fills the gap. Placing a couple by hand (like `home-town` does) is
just for guaranteeing specific plots exist in specific, memorable spots.

## Registering a new town

1. Write `kids-game/public/assets/maps/your-town.json`.
2. Add `'your-town'` to `MAP_IDS` in `mapBuilder.ts` — this is what makes
   `Preloader.ts` load it and the MiniMap draw it.
3. Wire at least one `exits` connection to an existing town (see above).
4. Verify in the browser preview: drive to the new exit and confirm the
   transition lands you facing the right way on a road, not inside a house.
