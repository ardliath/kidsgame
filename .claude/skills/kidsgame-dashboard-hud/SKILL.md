---
name: kidsgame-dashboard-hud
description: How to add a new button or live indicator (like the settings cog, map button, or coin counter) to the kids driving game's dashboard/HUD. Use this whenever asked to add a new icon button, gauge, counter, or on-screen indicator to the driving view or dashboard.
---

# Adding a dashboard button or HUD indicator

There are two different UI layers in this game, and which one you add to
depends on what you're building:

- **`Dashboard.ts`** — the physical dashboard panel at the bottom of the
  screen (wheel, pedals, gear stick, cog, map button). Always visible,
  never scrolls, belongs to its own scene running alongside `Driving`.
- **`Driving.ts`** — the road view at the top. HUD elements added here
  (like the coin counter) sit over the world but must be pinned to the
  camera with `setScrollFactor(0)` or they'll drift as the car drives.

If what you're adding is a **control or a button that opens something**,
it almost certainly belongs in `Dashboard.ts`, following the cog/map
pattern. If it's a **live readout of game state that should be visible
while driving** (like coins), it belongs in `Driving.ts`'s HUD, following
the coin-counter pattern. Either is fine to duplicate into the other scene
if you genuinely want it in both places — nothing stops that, it's just
not been needed yet.

## Pattern A: an icon button (cog, map)

Both existing buttons are a small circular badge plus a simple icon built
from primitives, with an interactive zone on top:

```ts
createMapButton ()
{
    const parts: Phaser.GameObjects.GameObject[] = [
        this.add.circle(0, 0, 36, 0x102027, 0.45)
    ];

    parts.push(this.add.rectangle(0, 0, 44, 34, 0xcfd8dc).setStrokeStyle(3, 0x455a64));
    // ...more shapes for the icon...

    this.add.container(GAME_WIDTH - 140, 50, parts);

    this.add.zone(GAME_WIDTH - 140, 50, 90, 90).setInteractive().on('pointerdown', () => this.openMap());
}
```

**Buttons stack right-to-left in 90px steps** — the cog is at
`GAME_WIDTH - 50`, the map button (added after it) is at
`GAME_WIDTH - 140`. A third button goes at `GAME_WIDTH - 230`, and so on.
Keep the badge radius (36), zone size (90×90), and background style
(`0x102027, 0.45` circle) consistent so new buttons look like they belong.

The button's action method should follow the launch pattern in the
kidsgame-minigame-scene skill: `releaseControls()`, pause `Driving`, launch
the new scene, pause self. Copy `openMap()` almost verbatim for a new
"opens a full-screen scene" button.

## Pattern B: a live counter (coins)

```ts
createCoinHud ()
{
    const bg = this.add.rectangle(0, 0, 130, 48, 0x102027, 0.65);
    bg.setStrokeStyle(3, 0xffd54f);
    const coin = this.add.circle(-38, 0, 15, 0xffd54f).setStrokeStyle(3, 0xf9a825);

    const count = this.add.text(10, 0, String(this.registry.get('coins') ?? 0), {
        fontFamily: 'Arial Black', fontSize: 26, color: '#ffd54f'
    }).setOrigin(0.5);

    const hud = this.add.container(90, 40, [ bg, coin, count ]);
    hud.setScrollFactor(0);
    hud.setDepth(200);

    const onCoins = (_parent: unknown, value: number) => count.setText(String(value));
    this.registry.events.on('changedata-coins', onCoins);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.registry.events.off('changedata-coins', onCoins);
    });
}
```

The important bits, in order of "easy to get wrong":

1. **`setScrollFactor(0)`** — without it, the HUD is a normal world object
   and will scroll away with the camera as the car drives. Only needed in
   `Driving.ts`; `Dashboard.ts` never scrolls so its buttons don't need it.
2. **Listen on `this.registry.events`, not the object directly** — the
   value lives in the Phaser registry (shared game-wide state, e.g.
   `this.registry.set('coins', n)`), and `changedata-<key>` fires whenever
   *any* scene changes it. This is how the coin HUD updates instantly when
   the Builder or a Shop scene pays out or spends coins, without either of
   them needing a reference to the HUD.
3. **Always remove the listener on `SHUTDOWN`.** Phaser reuses scene
   instances (see the kidsgame-minigame-scene skill) — if `Driving`
   restarts (every map transition does this) without removing the old
   listener, you get a second listener stacking on top of the first, and
   the count updates get called multiple times. The `events.once(...
   SHUTDOWN...)` cleanup is not optional boilerplate, it's the fix for a
   real bug class.

## Verify

Trigger whatever changes the underlying registry value from a different
scene (spend/earn coins, or whatever your new value is) and confirm the
HUD updates live without needing to reopen the scene — that's the point of
wiring it through registry events rather than just reading the value once.
