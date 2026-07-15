---
name: kidsgame-persistence
description: The storage.ts conventions for saving player progress in the kids driving game (coins, built houses, pantry, fleet, car colour, name, visited houses, current map, completed recipes). Use this whenever asked to make something persist across reloads/sessions, or when changing the shape of something already saved.
---

# Saving player progress

Every bit of progress the player keeps between sessions — coins, built
houses, house interiors, his pantry, his fleet of vehicles, car colour,
name, current map, visited houses, which recipes he's cooked — goes
through a typed `loadX`/`saveX` pair in `kids-game/src/game/storage.ts`.
**Never call `localStorage` directly from a scene.** This isn't just
tidiness: every real save in this game has needed a default value and a
migration path at some point (see below), and that logic belongs in one
place, not copy-pasted at every call site.

## Adding a new saved value

Follow the shape of the existing simple ones, e.g. `loadPlayerName` /
`savePlayerName`:

```ts
export function loadPlayerName (): string
{
    try
    {
        return localStorage.getItem(NAME_KEY) ?? '';
    }
    catch
    {
        return '';
    }
}

export function savePlayerName (name: string)
{
    try
    {
        localStorage.setItem(NAME_KEY, name);
    }
    catch
    {
        //  Ignore
    }
}
```

Three things every pair does, that a new one should too:

1. **A private `const X_KEY = 'kids-game-x'` string constant** at the top
   of the file, never a raw string literal used elsewhere.
2. **Wrap both read and write in `try/catch`.** `localStorage` can throw —
   private browsing mode, quota exceeded, disabled storage — and the game
   must never crash because of it. A failed *save* should just mean the
   thing doesn't persist this time (fine, not the end of the world); a
   failed *load* should return a sane default so the caller never has to
   null-check defensively.
3. **A sensible default when nothing's saved yet.** Empty string, `[]`,
   `{}`, or a real starting value (`loadCoins()` returns `5` the first time,
   not `0` — a deliberate design choice, not an accident).

For a structured value, define its interface right above the pair (see
`ExtraSite`, `Bag`, `InteriorSpec`) and `JSON.parse`/`stringify` it, same
try/catch shape.

## Evolving a value that's already saved somewhere

This is the part that's easy to get wrong: **players already have data in
the old shape**, and it must keep working. Make the new field optional in
the type, and have the reader fall back to a sane default rather than
assuming it's there — not a one-off migration step:

```ts
// storage.ts — old saves predate multi-town, so this is optional
export interface SaveData
{
    mapId?: string;
    // ...
}
```
```ts
// Driving.ts create() — an old save without a mapId just lands in the
// default town, rather than the load crashing or the car ending up nowhere
let mapId = this.sceneData.mapId ?? loadCurrentMap() ?? DEFAULT_MAP;
```

The next time the game saves — which happens constantly during normal play
(`saveCurrentMap`, `saveGame`, etc.) — the field gets written back in the
new shape, so the fallback is really only ever exercised once per old save.
Do this whenever you add a field to something already being saved: make it
optional, and have every reader fall back to a sane default, rather than
writing a one-off migration step that has to run before anything else can
touch the data.

Note this is deliberately different from "new content just works": adding
a brand new *ingredient* to `recipes.json`, for instance, does **not**
auto-stock it into existing players' pantries — it only gets seeded once,
for a pantry that doesn't exist yet (see `pantryExists()` in `Driving.ts`).
An old save simply has to buy it at the shop like anything else. Don't
assume every new piece of content needs a backfill; only saved *shapes*
(the fields a record has) need the fallback treatment above.

## Don't reset data the player already made

Notice `saveDemolished`, `saveExtraSite`, `saveVisitedHouse`, `saveBuiltHouse`,
`saveCompletedRecipe` all *merge into* what's already stored (read-modify-write),
never overwrite the whole key. If you're adding a value that accumulates (a list, a set of
flags, per-item counts), follow that shape — read the existing record,
merge your change in, write the whole thing back. A plain overwrite is only
correct for values that are genuinely single global state, like the coin
count or the player's name.

## Verify

After adding or changing a saved shape: save some state, reload the page
(a real reload, not just `location.reload()` mid-test — actually do that
too), and confirm it comes back. Then specifically test the *old* shape if
you changed one — clear only the new field (or use data saved before your
change) and confirm the lazy-fill kicks in rather than the record just
being treated as broken.
