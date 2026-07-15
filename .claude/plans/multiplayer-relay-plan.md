# LAN multiplayer: see each other's car live

**Status: deferred — designed and approved in principle, not yet built.
Revisit when ready to pick this up.**

## Context

He's convinced he can already see his dad on screen while driving. The idea:
when parent and son are both playing on their own iPad, on the same home
wifi, each sees the other's actual car (their chosen model/colour) driving
live in the same town. Everything else in the game stays exactly as it is —
this is purely "see a live ghost of the other player," not shared world state.

The game is currently 100% offline (Phaser + Vite + TypeScript, everything in
`localStorage`, deployed as a static site to GitHub Pages via
`.github/workflows/deploy.yml`, which only builds/deploys `kids-game/dist`).
This is the first networked feature in the project, so the plan deliberately
keeps the surface area small: a dumb LAN relay, position/appearance
broadcasting only, no server-side game logic, no collision between players,
no cross-town sync, no accounts/rooms/auth. Multiplayer must be fully
optional — solo play must work identically whether or not a relay is
running, with no blocking, no errors, no slowdown.

Confirmed during exploration: no `ws`/networking code exists anywhere in the
repo today; `kids-game/tsconfig.json` is browser/bundler-only (`noEmit`,
`moduleResolution: bundler`, scoped to `include: ["src"]`) so a Node server
script can't live inside `src/` — it needs to be a separate, plain script.
The GitHub Actions deploy workflow only runs `npm ci` + `npm run build-nolog`
inside `kids-game/` and uploads `dist/` — adding a new devDependency and an
unused-by-the-build server script has zero effect on it.

## 1. Server: `kids-game/server/relay.mjs`

A tiny standalone Node script, not part of the Vite/TS app:

- Add `ws` as a devDependency (small, well-known, never ships in the client
  bundle — CI installing one extra devDependency is a non-issue).
- New npm script in `kids-game/package.json`: `"relay": "node server/relay.mjs"`.
- On startup, print the LAN IP(s) via `node:os` `networkInterfaces()` plus the
  port (fixed at `8787`), e.g. `Multiplayer relay running at ws://192.168.1.42:8787`
  — so the parent can read it straight off the terminal instead of hunting
  for it.
- Behavior: accept connections, on any JSON message from a client, broadcast
  it verbatim to every **other** connected client (sender excluded). No
  rooms, no auth, no server-side validation or state — a dumb relay. This is
  a deliberate simplification for single-household use, not an oversight.
- No graceful-disconnect messaging needed — client-side stale-peer pruning
  (see §3) handles a peer disappearing without a clean close (wifi drop,
  app backgrounded), which is the common case anyway.

## 2. Persistence: `storage.ts`

Follow the existing `loadX`/`saveX` + private `_KEY` constant + try/catch
convention (e.g. `loadMuted`/`saveMuted`):

- `MULTIPLAYER_ENABLED_KEY` → `loadMultiplayerEnabled(): boolean` (default
  `false`) / `saveMultiplayerEnabled(enabled: boolean)`.
- `MULTIPLAYER_HOST_KEY` → `loadMultiplayerHost(): string` (default `''`) /
  `saveMultiplayerHost(host: string)` — just the IP, no port (port is fixed
  at `8787` on both ends, so the entry UI only ever needs digits and dots).

## 3. Client networking: new `kids-game/src/game/net.ts`

Structured like `sfx.ts` — module-level singleton state (a WebSocket, a
peers map), not a class, so it **survives Driving scene restarts** (every
map transition restarts the Driving scene; the connection must not be torn
down and reopened on every town change).

Exports:
- `connectMultiplayer(host: string)` — no-ops if already connected/connecting
  to that host. Opens `ws://${host}:8787`, generates a random per-session
  `myId`.
- `disconnectMultiplayer()` — closes the socket, stops retrying, clears peers.
- `sendState(state: PeerState)` — JSON.stringify + send, silently no-ops if
  not connected (never throws).
- `getPeers(): Map<string, PeerState & { lastSeen: number }>` — read-only
  view Driving.ts polls each frame.
- `isMultiplayerConnected(): boolean`.

```ts
interface PeerState
{
    id: string;
    name: string;
    mapId: string;
    x: number;
    y: number;
    heading: number;
    model: string;
    colour: number;
}
```

Internals:
- On message: parse JSON, upsert into the peers map keyed by `id`, with
  `lastSeen = Date.now()`.
- A `setInterval` (every ~1s) prunes any peer not heard from in 5s (~33
  missed broadcasts at the 150ms send rate below — generous, avoids
  premature removal from a brief hiccup).
- On close/error: reconnect with capped backoff (2s → 4s → 8s → cap 15s),
  **stopping** if `disconnectMultiplayer()` was called in the meantime
  (toggled off in Options mid-backoff). Never throw out of this module —
  worst case, multiplayer just silently stays disconnected and solo play is
  unaffected.

## 4. Options UI

Add a "Multiplayer" section to `Options.ts`, following existing patterns:

- An On/Off toggle, visually identical to the Sound toggle (rectangle + text
  flipping state, calling `saveMultiplayerEnabled` and connecting/
  disconnecting immediately via `net.ts`).
- A "Host address" button that opens an overlay adapted from
  `openNameEditor()`'s pattern (dim background, panel, `parts` array,
  container) — but with a **numeric + dot keypad** (`0`-`9`, `.`,
  backspace, OK) instead of letters, since IPs are digits and dots only.
  Saves via `saveMultiplayerHost` on OK.
- A small status line ("Connected — 1 other player" / "Not connected"),
  read from `net.ts` when Options opens and refreshed on toggle-tap (doesn't
  need to be live-ticking every frame).

## 5. `Driving.ts` integration

- In `create()`: if `loadMultiplayerEnabled()`, call
  `connectMultiplayer(loadMultiplayerHost())` (no-ops harmlessly if already
  connected, or if the host is empty).
- Add instance field `remotePlayers: Map<string, { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text }>`,
  reset (cleared, no sprites destroyed — there are none yet) at the top of
  `create()` per the mini-game-scene reset convention. Note: this field
  resets every map transition; the underlying `net.ts` connection does not.
- In `update()`: accumulate a timer (same pattern as `brakeCooldown` etc.)
  and every ~150ms, if connected, call `sendState({ id: myId, name: loadPlayerName(), mapId: current map id, x: this.car.x, y: this.car.y, heading: this.heading, model: carModel, colour: carColour })`.
- Each frame, reconcile `this.remotePlayers` against `getPeers()`:
  - New peer whose `mapId` matches the current map → build a car via the
    existing `buildCarShapes(this, peer.model, peer.colour)` (same helper
    already used for the player's own car and NPC traffic) plus a small
    name-label text above it; add to the map. **No physics body / no
    collider** — remote cars are purely visual, never solid, sidestepping
    any simultaneous-authority collision questions for this first version.
  - Existing peer, same map → lerp the container's position/rotation toward
    the peer's latest x/y/heading each frame (e.g.
    `container.x += (peer.x - container.x) * 0.2`) so it reads as smooth
    driving rather than teleporting between 150ms updates.
  - Existing peer whose `mapId` no longer matches (they drove to another
    town) → destroy the sprite, drop from the map. No cross-map rendering
    in v1.
  - Any id present in `this.remotePlayers` but no longer in `getPeers()`
    (net.ts pruned it as stale) → destroy the sprite, drop from the map.
- On scene `SHUTDOWN`: destroy any remaining remote sprites (recreated next
  `create()` if still connected). **Do not** call `disconnectMultiplayer()`
  here — the socket is a cross-scene-restart singleton by design.

## Verification

No physical second device is available in this tooling, so:

1. Start the relay locally (`npm run relay`), confirm it prints a
   `ws://<lan-ip>:8787` line.
2. Open two Browser-pane tabs against the same local dev server
   (`tabs_create`, both navigate to `localhost:8080`).
3. In each tab's console, set a distinct name/colour, enable multiplayer,
   and set host to `localhost` (both tabs are independent Phaser instances
   with independent module state, so this is a legitimate two-peer test of
   the real sync logic even without real iPads).
4. Confirm: both tabs' cars appear in each other's world on the same map,
   positions update smoothly, a remote car disappears when that tab drives
   to a different `mapId`, and stale-peer pruning removes it a few seconds
   after killing that tab.
5. Kill the relay process mid-session, confirm no console errors and the
   game keeps running normally; restart the relay, confirm reconnection.
6. Confirm solo play (relay not running, or multiplayer disabled) shows zero
   console errors and no perceptible change in frame behavior.

Caveat to flag to the user explicitly once built: this validates the sync
logic, rendering, and resilience thoroughly, but the actual "type the Mac's
LAN IP into an iPad and it finds it over real wifi" experience can only be
confirmed on the real devices.
