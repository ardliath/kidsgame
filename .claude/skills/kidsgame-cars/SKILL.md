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
`truckShapes`, `lorryShapes`):

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
This alone makes it show up as a fourth-and-beyond choice in the Options
screen's model picker — no other code needed. Be aware the picker's panel
was sized for exactly 4 models (`x = CX - 225 + i * 150` against a 760px-
wide panel); a 5th model will sit right at the panel's edge. Check it in
the preview and widen the panel in `Options.ts` if it looks cramped.

If it should only appear as **parked scenery**, skip `CAR_MODELS` — parked
cars are placed by `model` string directly in a map's `cars` list (see the
kidsgame-maps skill), independent of the drivable roster.

## 3. Collision box for parked cars

Parked cars are static physics bodies, and static bodies can't rotate with
the sprite — so `mapBuilder.ts` sizes each one's box from its facing
direction using a hardcoded length:
```ts
const length = car.model === 'lorry' ? 108 : 88;
```
If your new model is noticeably longer or shorter than the ~88-unit
default (most cars), add it to this check the same way the lorry is,
rather than leaving it with a box that doesn't match its picture.

## Verify

Drive the new model (pick it in Options) and check it turns/reverses
looking right at speed, then place one as a parked obstacle on a map and
confirm the player can't drive through it and the collision box roughly
matches what's drawn.
