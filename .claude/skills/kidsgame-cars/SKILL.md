---
name: kidsgame-cars
description: How to add a new car model (drivable or parked) in the kids driving game (kids-game/src/game/carShapes.ts). Use this whenever asked to add a new vehicle type — a bus, tractor, sports car, etc. — either as something the player can drive or as scenery parked along the roads.
---

# Adding a new car model

All cars — the player's and the parked ones scattered around towns — are
drawn by one function, `buildCarShapes()` in `carShapes.ts`, and share the
same physics body. A new model is a new drawing function plus a couple of
one-line registrations; you should not need to touch `Driving.ts` or
`mapBuilder.ts`'s actual car logic, only add to it.

## 1. Draw the shapes

Add a function following the existing ones (`hatchShapes`, `racerShapes`,
`truckShapes`, `lorryShapes`, `forkliftShapes`, `diggerShapes`,
`mixerShapes`):

```ts
function busShapes (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheels(scene, [ [ -24, -30 ], [ 24, -30 ], [ -24, 10 ], [ 24, 10 ], [ -24, 40 ], [ 24, 40 ] ]),
        scene.add.rectangle(0, 0, 48, 100, colour).setStrokeStyle(4, dark),
        // windows, stripe, etc.
    ];
}
```

Rules that keep a new model consistent with the rest:
- **Draw it pointing up** (nose towards negative y) — every model shares
  this convention so rotation maths in `Driving.ts` doesn't need to know
  which model is on screen.
- **Use the `wheels()` helper** for the dark wheel rectangles rather than
  drawing them by hand — pass whatever `[x, y]` positions suit the body
  shape, plus optional width/height for bigger wheels.
- **Take `colour` and `dark` as params, don't hardcode a body colour** —
  `dark` is already computed for you (`darken(35)`) and used for outlines/
  trim so any car recolours cleanly in the options screen.
- **Roughly 90 units long is the sweet spot** — long enough to read clearly
  at the driving camera's zoom, short enough that the shared 34px physics
  circle radius doesn't look wildly wrong for it. If your model is
  meaningfully longer (like the lorry), see step 3 for the parked-car
  collision box.

## 2. Register it

In `buildCarShapes()`'s switch statement:
```ts
case 'bus': return busShapes(scene, colour, dark);
```

If it should be **drivable**, add it to `CAR_MODELS` (also in
`carShapes.ts`):
```ts
{ key: 'bus', name: 'Bus' }
```
This alone adds it to the player's fleet — it shows up as a card in the
**builders' yard** (`Yard.ts`), which is where the player chooses which
vehicle to drive. There is no model picker in Options any more (that was
removed when the yard became the source of truth for which vehicle is
current). The yard grid is 4 cards across and wraps, so a new model just
appears in the next slot; check `Yard.ts` only if you add so many that the
grid overflows the panel. Colour is still chosen in Options and applies to
the whole fleet.

The fleet persists in `kids-game-fleet` localStorage (see the
kidsgame-persistence skill and `loadFleet`/`saveFleet`). A brand-new model
is simply "at the yard" for any existing save — the fleet loader treats any
model not marked current-or-parked as home, so you don't need to migrate
old saves.

If a model should appear as **anonymous road traffic** rather than (or as
well as) being drivable, place it by `model` string in a map's `cars` list
(see the kidsgame-maps skill). Those NPC cars are separate from the
player's fleet.

## 3. Collision box for parked cars

The player's parked fleet vehicles are static physics bodies, and static
bodies can't rotate with the sprite — so both `Driving.ts` (parked fleet)
and `mapBuilder.ts` (older code path) size each box from its facing using a
hardcoded length. In `Driving.setupParkedFleet`:
```ts
const long = ({ lorry: 108, mixer: 108, digger: 140 } as Record<string, number>)[model] ?? 88;
```
If your new model is noticeably longer than the ~88-unit default, add it to
that map (and the matching one in `mapBuilder.ts`) so its collision box
matches its picture, the same way the lorry/mixer/digger do.

## Verify

Add the model, open the yard, pick it, and check it turns/reverses looking
right at speed. Then leave it parked (pick a different vehicle) and confirm
the parked one is a solid obstacle you can drive up to and swap back into.
