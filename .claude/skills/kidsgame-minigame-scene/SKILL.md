---
name: kidsgame-minigame-scene
description: The shared pattern for a paused-parent mini-game scene in the kids driving game (Builder, Cooking, Shop, IceCream, Interior, Options, MiniMap all follow it). Use this whenever asked to add a brand new mini-game, activity, or full-screen popup scene to the game — not for editing the content of an existing one.
---

# Adding a new mini-game scene

Every activity that takes over the screen — building a house, cooking,
shopping, the map, options — is a Phaser Scene that **launches on top of**
whatever scene(s) were running, pausing them, and hands control back
cleanly when it's done. This skill is the checklist for wiring a *new* one
up correctly; it's not about what goes inside the scene (that's just Phaser
`add.*` calls like anywhere else).

## The launch side

Whichever scene triggers your new mini-game (usually `Driving.ts` or
`Dashboard.ts`) needs to, in order:

1. **Release dashboard controls first**, so the wheel/pedal don't stay
   "held" while paused: `(this.scene.get('Dashboard') as Dashboard).releaseControls()`.
2. **Launch the new scene** with whatever data it needs, e.g.
   `this.scene.launch('YourScene', { houseId, colour })`.
3. **Pause every scene that shouldn't keep running underneath** —
   normally both `Driving` and `Dashboard`. Look at `openAction` in
   `Driving.ts` for the real sequencing (launch, then
   `this.scene.pause('Dashboard')`, then `this.scene.pause()` to pause
   itself) versus `openOptions`/`openMap` in `Dashboard.ts` (which pause
   `Driving` first, launch, then pause themselves). Either order is fine as
   long as everything ends up paused except your new scene.

**If your mini-game launches from *inside* another mini-game** (like
`Cooking` launching from `Interior`'s kitchen), you only need to pause the
immediate parent, not the whole chain — see `Interior.openCooking()`:
```ts
openCooking ()
{
    this.scene.launch('Cooking', { houseId: this.houseId });
    this.scene.pause();
}
```
`Driving`/`Dashboard` are already paused from when `Interior` itself opened,
so they don't need touching again.

## Inside the new scene

- **`init(data)`** receives whatever was passed to `scene.launch()`. Store it
  on instance fields.
- **`create()` must reset every mutable instance field to its initial
  value** at the top, even ones you initialised at declaration. Phaser
  reuses the same scene instance across every `launch`/`restart` — it does
  not construct a fresh object each time — so a field left over from last
  time will silently leak into this run if you don't reset it. Every
  existing mini-game scene does this (see the top of `Builder.create()` or
  `Cooking.create()` for the pattern).
- **Coordinate space is always `GAME_WIDTH` × `GAME_HEIGHT`** (1280×960,
  from `layout.ts`), regardless of what's visible underneath — import those
  constants rather than hardcoding.
- **Quit button, top-right, always the same shape** (copy this exactly
  unless there's a reason not to):
  ```ts
  this.add.circle(GAME_WIDTH - 60, 60, 30, 0xef5350).setStrokeStyle(4, 0x8e0000);
  this.add.text(GAME_WIDTH - 60, 60, 'X', {
      fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
  }).setOrigin(0.5);
  this.add.zone(GAME_WIDTH - 60, 60, 90, 90).setInteractive().on('pointerdown', () => this.close());
  ```
- **A bouncing text label** ("COOK", "UP", "OUT", etc.) is the standard way
  to mark an interactive hotspot a child needs to notice — a
  `this.tweens.add({ targets: label, y: label.y - 8, duration: 600, yoyo:
  true, repeat: -1 })` on a text object sitting over an interactive zone.

## Closing the scene

Name the method `close()` (or `leave()`/`cancel()` for a quit-without-saving
action — they all do the same thing). It must:

```ts
close ()
{
    this.scene.resume('Driving');
    this.scene.resume('Dashboard');
    this.scene.stop();
}
```

**Resume whatever you actually paused, not always Driving+Dashboard** — a
scene launched from another mini-game (like `Cooking` from `Interior`) only
resumes its immediate parent:
```ts
close ()
{
    this.scene.resume('Interior');
    this.scene.stop();
}
```
Getting this wrong leaves the game permanently stuck paused underneath, or
double-resumes something that was never paused (harmless but sloppy).

## Persistence

Never call `localStorage` directly from a scene. Everything the player
does — coins, built houses, fridge stock, the shopping bag, car choice,
name, current map, visited houses — goes through a typed helper in
`storage.ts` (`loadX`/`saveX` pairs). Add a new pair there if your mini-game
needs to remember something new; keep the read/write shape consistent with
the existing ones (plain objects, defensive try/catch, sane defaults).

## Registering the scene

Import it and add it to the `scene: [...]` array in `main.ts` — order
mostly doesn't matter, but keep `Driving`/`Dashboard` first since they're
the ones that boot immediately.

## Verify it for real

Type-checking passing doesn't mean it plays right. Drive to wherever it's
triggered from, open it, exercise the actual interaction, and close it back
out — confirm the parent scene(s) are unpaused and controls work again
afterwards. This is a played game, not just compiled code.
