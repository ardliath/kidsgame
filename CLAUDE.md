# Kids Driving Game

A top-down 2D driving game built for the user's young son, using Phaser 4 + Vite + TypeScript.
He drives a car around a small connected world of towns, builds houses, visits
them, cooks in their kitchens, and shops. Designed for iPad landscape and
touch-first, with keyboard as a secondary input for desktop testing.

## Where things live

- The actual game is in `kids-game/` (a standard Phaser Vite-TS template) — that's
  where you run `npm run dev`, not the repo root.
- Game code: `kids-game/src/game/`. Scenes: `kids-game/src/game/scenes/`.
- Content is JSON, not hardcoded: town maps (`public/assets/maps/*.json`),
  cooking (`public/assets/recipes.json`), ice cream (`public/assets/icecream.json`).
  See the relevant skill before hand-editing these — each has a schema.
- Persistence: everything the player does (built houses, coins, shopping bag,
  fridge stock, car choice, name, current map, visited houses) is saved through
  helpers in `storage.ts`, not raw `localStorage` calls elsewhere.

## How the game is put together

- `Driving` is the main scene: the car, the town, the camera. `Dashboard` runs
  alongside it (wheel, pedal, gear stick, coin HUD, cog, map button).
- Everything else — Builder, Cooking, Shop, IceCream, Interior, Options,
  MiniMap — is a **paused-parent mini-game scene**: it launches on top of
  Driving/Dashboard, pauses them, and resumes+stops itself on exit. See the
  mini-game-scenes skill before adding a new one — the pattern is consistent
  and worth reusing rather than reinventing.
- Towns connect to each other via matching exits/roads at their edges; the
  world loops rather than being one giant map.

## Working conventions

- Verify changes in the browser preview before calling anything done — this is
  a real, played game, not just code that type-checks. Use the preview tools,
  not curl/Bash, for anything visual.
- The user handles git himself — never commit or push unless he explicitly
  asks in that message.
- No comments explaining *what* code does; only the occasional one for a
  non-obvious *why* (matches the rest of the codebase's style).
- Don't add features he hasn't asked for. He drives this project one small
  ask at a time — match that scope, don't anticipate.

## Skills

Look for and use project skills for the areas they cover (adding maps/towns,
recipes, mini-game scenes, etc.) rather than re-deriving the pattern from
scratch each time.
