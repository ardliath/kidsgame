# Kids Driving Game

A top-down 2D driving game for the user's young son (Phaser 4 + Vite +
TypeScript). He drives around a small connected world of towns, builds and
visits houses, cooks, and shops. Built for iPad landscape, touch-first;
keyboard is a secondary desktop-testing input.

## Where things live

- The game is in `kids-game/` — run `npm run dev` there, not the repo root.
- Game code: `kids-game/src/game/`. Scenes: `kids-game/src/game/scenes/`.
- Content is JSON, not hardcoded: town maps (`public/assets/maps/*.json`),
  cooking (`recipes.json`), ice cream (`icecream.json`). Check the relevant
  skill before hand-editing these.
- Persistence goes through `storage.ts` helpers, never raw `localStorage`
  calls elsewhere.

## How the game is put together

- `Driving` is the main scene (car, town, camera); `Dashboard` runs
  alongside it (wheel, pedal, gear stick, HUD, cog, map button).
- Everything else is a **paused-parent mini-game scene**: launches on top
  of Driving/Dashboard, pauses them, resumes+stops itself on exit. See the
  mini-game-scenes skill before adding a new one.
- Towns connect via matching exits/roads at their edges; the world loops
  rather than being one giant map.

## Working conventions

- Verify changes in the browser preview before calling anything done.
- The user handles git himself — never commit or push unless he explicitly
  asks in that message.
- No comments explaining *what* code does; only the occasional *why*.
- Don't add features he hasn't asked for — match his scope exactly.

## Known Phaser gotcha

`add.triangle(x, y, x1, y1, x2, y2, x3, y3)` miscentres if any point is
negative (has bitten a car nose, an ice cream cone, a builder's roof). Fix:
shift all three points so the minimum is ≥ 0; leave `(x, y)` alone.

## Skills

Use project skills for the areas they cover rather than re-deriving the
pattern from scratch.
