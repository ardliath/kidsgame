---
name: kidsgame-recipes
description: How to add cooking recipes/ingredients (kids-game/public/assets/recipes.json) and ice cream flavours (kids-game/public/assets/icecream.json) in the kids driving game. Use this whenever asked to add a new dish, ingredient, cooking step, or ice cream flavour/topping.
---

# Adding food content

Both cooking and ice cream are pure JSON config, loaded by `Preloader.ts` and
read by `kids-game/src/game/recipes.ts` plus the `Cooking.ts` / `IceCream.ts`
scenes. You should almost never need to touch those scene files just to add
a dish or flavour — only the JSON.

## Cooking: `recipes.json`

### Ingredients

```json
"pasta": { "name": "Pasta", "colour": "#ffd54f", "icon": "pasta", "price": 2 }
```
`price` is optional — omit it for things that are never bought at a shop
(like `water`, which the pasta recipe pours from a jug rather than fetching
from the fridge). `colour` accepts a `"#hex"` string or a name from
`NAMED_COLOURS` in `mapBuilder.ts` (red, orange, yellow, green, blue, purple,
pink, teal, brown, grey).

`icon` picks the little glyph drawn for this ingredient. The built-in set
(see `drawFoodIcon` in `recipes.ts`) is: `bread`, `toast`, `pasta`, `carton`,
`jug`, `bowl`, `glass`. **Any other string just falls back to a plain
coloured blob** — that's a safe default, not an error, so don't feel you
need to add a new icon shape for every ingredient; only add one to
`drawFoodIcon` if a generic blob genuinely looks wrong for it.

### Recipes: a list of steps

A recipe is a sequence the child performs in order. Each step is one of:

| Step | Fields | What happens |
|---|---|---|
| `fetch` | `ingredient` | Find it among decoys in the fridge; uses fridge stock first, then the shopping bag; blocks with a "buy some at the shop" hint if both are empty |
| `pour` | `ingredient`, `into: "pan"｜"glass"` | Hold the jug/carton to pour into the pan or a glass |
| `add` | `ingredient` | Tap a fetched ingredient to tip it into the pan (used after a `pour` has put something in the pan already, e.g. pasta into boiling water) |
| `stir` | `stirs` (number) | Tap the pan that many times; the contents visibly cook towards the result colour |
| `toast` | — | Push the toaster lever; waits, then dings |

Example — a two-ingredient, four-step recipe:
```json
{
    "id": "pasta",
    "name": "Pasta",
    "result": { "colour": "#ffca28", "icon": "bowl" },
    "steps": [
        { "type": "fetch", "ingredient": "pasta", "instruction": "Find the pasta!" },
        { "type": "pour", "ingredient": "water", "into": "pan", "instruction": "Pour in the water!" },
        { "type": "add", "ingredient": "pasta", "instruction": "Add the pasta!" },
        { "type": "stir", "stirs": 5, "instruction": "Now give it a stir!" }
    ]
}
```
`instruction` is the line shown at the top of the screen for that step —
always include one, it's the only guidance the child gets.

A single-ingredient, single-method recipe is just a shorter `steps` list:
```json
{
    "id": "toast",
    "name": "Toast",
    "result": { "colour": "#c68642", "icon": "toast" },
    "steps": [
        { "type": "fetch", "ingredient": "bread", "instruction": "Find the bread!" },
        { "type": "toast", "instruction": "Push the lever!" }
    ]
}
```

There's also a legacy shorthand (`ingredients` + `method` + `stirs` at the
recipe's top level, no `steps` array) that `recipeSteps()` in `recipes.ts`
expands automatically — it still works, but write new recipes with an
explicit `steps` list, it's much easier to read and to make multi-step.

### Fridge stock

Every house gets 2 of each known ingredient in its fridge the first time
someone cooks there (`Cooking.ts`'s `create()`). If you add a brand new
ingredient, existing saved houses will pick it up automatically next time
they cook (the stocking-up code fills in anything missing, it doesn't
reset houses that already have a fridge). You don't need to do anything
extra for this.

## Ice cream: `icecream.json`

Much simpler — no steps, just a flat list the cone-building mini-game reads
directly:
```json
{
    "maxScoops": 3,
    "flavours": [
        { "id": "mint", "name": "Mint", "colour": "#a5d6a7", "price": 2 }
    ]
}
```
Add a flavour by adding one entry here — `IceCream.ts` picks it up with no
code changes. If a shop's `sells` list (in its map JSON, see the
kidsgame-maps skill) names specific flavour ids, only those show on that
shop's counter; an empty or missing `sells` shows all of them.

## After editing either file

Reload the browser preview (Preloader loads these as static JSON, so a full
reload is needed, not hot-swap) and actually cook the new dish or build the
new flavour of cone before calling it done — a typo'd ingredient id fails
silently as a locked/greyed-out fetch step rather than throwing an error.
