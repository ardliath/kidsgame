---
name: kidsgame-persistence
description: The storage.ts conventions for saving player progress in the kids driving game (coins, built houses, fridge stock, shopping bag, car choice, name, visited houses, current map). Use this whenever asked to make something persist across reloads/sessions, or when changing the shape of something already saved.
---

# Saving player progress

Every bit of progress the player keeps between sessions — coins, built
houses, house interiors and fridges, the shopping bag, car choice, name,
current map, visited houses — goes through a typed `loadX`/`saveX` pair in
`kids-game/src/game/storage.ts`. **Never call `localStorage` directly from
a scene.** This isn't just tidiness: every real save in this game has
needed a default value and a migration path at some point (see below), and
that logic belongs in one place, not copy-pasted at every call site.

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
the old shape**, and it must keep working. The pattern used every time this
has come up so far is "lazily patch it in when it's next touched," not a
one-off migration step:

```ts
// storage.ts — the field is optional, so old saved specs parse fine without it
export interface InteriorSpec
{
    // ...
    fridge?: Record<string, number>;
}
```
```ts
// Cooking.ts create() — fill it in the first time it's needed
if (this.houseSpec && !this.houseSpec.fridge)
{
    this.houseSpec.fridge = {};

    for (const id of Object.keys(this.config.ingredients))
    {
        this.houseSpec.fridge[id] = 2;
    }

    saveInterior(this.houseId, this.houseSpec);
}
```

Do this whenever you add a field to something already being saved: make
the field optional in the type, and backfill a sensible default the next
time that record is loaded and used — not eagerly for every save on boot,
just lazily, right where it's about to matter. This is exactly how new
ingredients silently appear in old houses' fridges, and how you'd add
anything else new to an existing save shape.

## Don't reset data the player already made

Notice `saveDemolished`, `saveExtraSite`, `saveVisitedHouse`, `saveBuiltHouse`
all *merge into* what's already stored (read-modify-write), never overwrite
the whole key. If you're adding a value that accumulates (a list, a set of
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
