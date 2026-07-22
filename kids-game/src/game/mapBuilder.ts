import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapes } from './carShapes';
import { loadBuiltHouses, loadDemolished, loadExtraExits, loadExtraRoads, loadExtraSites, loadPlayerName, loadUnlockedTowns, loadVisitedHouses, saveBuiltHouses, saveDemolished, saveExtraRoads, saveExtraSite, saveExtraSites } from './storage';

export const TILE = 200;

//  Every map keeps at least this many plots available to build on
const MIN_SITES = 3;

export const MAP_IDS = [ 'home-town', 'hill-town', 'beach-town', 'cove-town' ];

//  Bonus towns, invisible until a player-built road reaches their unlock
//  stub — see Stage 5 of the roads/bridges/tunnels plan
export const EXTRA_TOWN_IDS = [ 'orchard-town' ];

export const DEFAULT_MAP = 'home-town';

export function mapCacheKey (id: string): string
{
    return `map-${id}`;
}

//  Every map currently in play: the fixed set plus whichever bonus towns
//  have been unlocked, each with its exits overlaid by any a road has since
//  earned. The one shared source Driving/MiniMap/DeliveryBoard all read
//  instead of each keeping its own near-identical MAP_IDS loop.
export function loadActiveMaps (scene: Scene): Record<string, MapData>
{
    const unlocked = new Set(loadUnlockedTowns());
    const ids = [ ...MAP_IDS, ...EXTRA_TOWN_IDS.filter(id => unlocked.has(id)) ];
    const extraExits = loadExtraExits();

    const maps: Record<string, MapData> = {};

    for (const id of ids)
    {
        const data = scene.cache.json.get(mapCacheKey(id)) as MapData | undefined;

        if (!data)
        {
            continue; //  Not loaded yet — same silent skip the old per-scene loops used
        }

        maps[id] = { ...data, exits: { ...data.exits, ...extraExits[id] } };
    }

    return maps;
}

export type Edge = 'north' | 'south' | 'east' | 'west';

export const EDGE_DELTA: Record<Edge, [number, number]> = {
    north: [ 0, -1 ], south: [ 0, 1 ], east: [ 1, 0 ], west: [ -1, 0 ]
};

export const EDGE_ROTATION: Record<Edge, number> = {
    north: 0, south: Math.PI, east: Math.PI / 2, west: -Math.PI / 2
};

export const OPPOSITE_EDGE: Record<Edge, Edge> = {
    north: 'south', south: 'north', east: 'west', west: 'east'
};

//  Custom characters a map can define for its tile grid
export interface LegendEntry
{
    type: 'house';
    colour?: string;
    facing?: Edge;
    sign?: string;
}

//  Free-standing things with properties, placed on top of the tile grid.
//  A 'site' is an empty plot the player can build a house on.
export interface MapObject
{
    id?: string;
    type: 'house' | 'site' | 'yard' | 'landmark';
    col: number;
    row: number;
    w?: number;
    h?: number;
    colour?: string;
    facing?: Edge;
    sign?: string;

    //  A signed building with a sells list is a shop. 'grocery' sells
    //  cooking ingredients; 'treat' is an eat-it-now shop like ice cream.
    sells?: string[];
    shopType?: 'grocery' | 'treat' | 'cafe' | 'petrol' | 'chippy';

    //  The player's own home: painted his car colour, name over the door,
    //  and never demolished.
    player?: boolean;

    //  Which landmark to draw, when type is 'landmark' — one distinctive,
    //  solid, non-interactive structure per town
    kind?: 'clock-tower' | 'windmill' | 'pier' | 'lighthouse';
}

//  Parked cars: obstacles the player weaves around, drawn with the same
//  builder as the player's own car
export interface CarPlacement
{
    col: number;
    row: number;
    colour?: string;
    model?: string;
    facing?: Edge;
}

//  An edge tile that, once the player paves a road onto it in build mode,
//  reveals a whole new town (see the road-building feature). `edge` is which
//  map boundary it sits on; `unlocksMap` is the town it opens up.
export interface RoadStub
{
    id: string;
    col: number;
    row: number;
    edge: Edge;
    unlocksMap: string;
}

export interface MapData
{
    id: string;
    name: string;
    tiles: string[];
    legend?: Record<string, LegendEntry>;
    objects?: MapObject[];
    cars?: CarPlacement[];
    exits?: Partial<Record<Edge, string>>;
    start?: { col: number; row: number };
    roadStubs?: RoadStub[];
}

export interface PlacedHouse
{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    colour: number;
    sign?: string;
    sells?: string[];
    shopType?: 'grocery' | 'treat' | 'cafe' | 'petrol' | 'chippy';
}

//  A construction site that hasn't been built on yet
export interface PlacedSite
{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

//  An edge tile the player can pave a road onto to unlock a new town —
//  col/row is the tile itself, edge is the boundary it sits on
export interface PlacedUnlockMarker
{
    col: number;
    row: number;
    edge: Edge;
    unlocksMap: string;
}

//  The builders' yard: where the fleet parks. `spawn*` is the road tile the
//  player drives out from; `slots` are the parking spots for home vehicles.
export interface PlacedYard
{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    spawnX: number;
    spawnY: number;
    spawnHeading: number;
    slots: { x: number; y: number }[];
}

//  A car that drives itself around the roads once the scene is running.
//  col/row is its starting tile; heading is which way it's initially facing
//  (see the CarPlacement.facing it came from).
export interface PlacedNpcCar
{
    container: Phaser.GameObjects.Container;
    col: number;
    row: number;
    heading: number;
}

//  A distinctive, solid, non-interactive per-town structure (clock tower,
//  windmill, pier, lighthouse) — see mapBuilder's placeLandmark
export interface PlacedLandmark
{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    kind: 'clock-tower' | 'windmill' | 'pier' | 'lighthouse';
}

export interface BuiltMap
{
    obstacles: Phaser.Physics.Arcade.StaticGroup;
    width: number;
    height: number;
    start: { x: number; y: number };
    houses: PlacedHouse[];
    sites: PlacedSite[];
    npcCars: PlacedNpcCar[];
    yard: PlacedYard | null;
    landmarks: PlacedLandmark[];

    //  Edge tiles that unlock a new town once paved (only those whose town
    //  isn't unlocked yet), so build mode knows which placements to reward
    unlockMarkers: PlacedUnlockMarker[];

    //  Tiles taken by something the player can't pave over — house/site/yard/
    //  landmark footprints — so build mode can reject a tap there
    blockedTiles: Set<string>;

    //  "col,row" keys the player has paved since — the same overlay tileAt()
    //  consults, exposed so traffic routing can see player-built road too
    //  instead of only ever reading the static tile grid
    extraRoads: Set<string>;
}

const HOUSE_COLOURS = [0xef9a9a, 0x90caf9, 0xffcc80, 0xa5d6a7, 0xce93d8, 0xfff59d, 0x80cbc4, 0xffab91];

//  A house that's just a tile-grid character ('H' or a legend entry) rather
//  than an authored object — shared between buildMap()'s data pass and
//  anything else that needs to know where these are (e.g. delivery targets)
export interface GridHouseSpec
{
    id: string;
    col: number;
    row: number;
    colour?: string;
    facing?: Edge;
    sign?: string;
}

export function scanGridHouses (map: MapData): GridHouseSpec[]
{
    const rows = map.tiles.length;
    const cols = map.tiles[0].length;
    const found: GridHouseSpec[] = [];

    for (let r = 0; r < rows; r++)
    {
        for (let c = 0; c < cols; c++)
        {
            const t = map.tiles[r][c];

            if (t === 'H')
            {
                found.push({ id: `${map.id}-house-${c}x${r}`, col: c, row: r });
            }
            else if (t !== '.' && map.legend?.[t]?.type === 'house')
            {
                const entry = map.legend[t];
                found.push({ id: `${map.id}-house-${c}x${r}`, col: c, row: r, colour: entry.colour, facing: entry.facing, sign: entry.sign });
            }
        }
    }

    return found;
}

export const NAMED_COLOURS: Record<string, number> = {
    red: 0xe53935,
    orange: 0xfb8c00,
    yellow: 0xfdd835,
    green: 0x43a047,
    blue: 0x1e88e5,
    purple: 0x8e24aa,
    pink: 0xf06292,
    teal: 0x26a69a,
    brown: 0x8d6e63,
    grey: 0x90a4ae
};

export function parseColour (name: string | undefined, fallback: number): number
{
    if (!name)
    {
        return fallback;
    }

    if (name.startsWith('#'))
    {
        return parseInt(name.slice(1), 16);
    }

    return NAMED_COLOURS[name.toLowerCase()] ?? fallback;
}

export function buildMap (scene: Scene, map: MapData): BuiltMap
{
    const rows = map.tiles.length;
    const cols = map.tiles[0].length;
    const width = cols * TILE;
    const height = rows * TILE;

    //  Tiles the player has paved since — populated below, before tileAt is
    //  ever actually called, but declared here so the closure can see it
    const extraRoads = new Set<string>();

    const tileAt = (c: number, r: number): string | null =>
        (c < 0 || r < 0 || c >= cols || r >= rows) ? null : (extraRoads.has(`${c},${r}`) ? 'R' : map.tiles[r][c]);

    //  Off the map counts as road, so roads at exits keep their markings
    const isRoad = (c: number, r: number): boolean => {
        const t = tileAt(c, r);
        return t === null ? true : t === 'R';
    };

    //  Grass everywhere first
    scene.add.rectangle(width / 2, height / 2, width, height, 0x7cb342);

    const obstacles = scene.physics.add.staticGroup();

    const solid = (obj: Phaser.GameObjects.GameObject) => {
        scene.physics.add.existing(obj, true);
        obstacles.add(obj);
    };

    const houses: PlacedHouse[] = [];
    const sites: PlacedSite[] = [];
    const usedIds = new Set<string>();

    //  ---- Data pass: decide what stands where before drawing anything ----

    interface HouseSpec { id: string; col: number; row: number; w: number; h: number; colour?: string; facing?: Edge; sign?: string; sells?: string[]; shopType?: 'grocery' | 'treat' | 'cafe' | 'petrol' | 'chippy'; player?: boolean }
    interface SiteSpec { id: string; col: number; row: number; w: number; h: number }
    interface LandmarkSpec { id: string; col: number; row: number; w: number; h: number; kind: 'clock-tower' | 'windmill' | 'pier' | 'lighthouse' }

    const builtHouses = loadBuiltHouses();
    const demolished = new Set(loadDemolished());
    const visited = new Set(loadVisitedHouses());

    const houseSpecs: HouseSpec[] = [];
    const siteSpecs: SiteSpec[] = [];
    const landmarkSpecs: LandmarkSpec[] = [];

    for (const spec of scanGridHouses(map))
    {
        houseSpecs.push({ ...spec, w: 1, h: 1 });
    }

    let yardObj: MapObject | null = null;

    map.objects?.forEach((obj, index) => {

        if (obj.type === 'house')
        {
            houseSpecs.push({ id: obj.id ?? `${map.id}-object-${index}`, col: obj.col, row: obj.row, w: obj.w ?? 1, h: obj.h ?? 1, colour: obj.colour, facing: obj.facing, sign: obj.sign, sells: obj.sells, shopType: obj.shopType, player: obj.player });
        }
        else if (obj.type === 'site')
        {
            siteSpecs.push({ id: obj.id ?? `${map.id}-site-${index}`, col: obj.col, row: obj.row, w: obj.w ?? 1, h: obj.h ?? 1 });
        }
        else if (obj.type === 'yard')
        {
            yardObj = obj;
        }
        else if (obj.type === 'landmark' && obj.kind)
        {
            landmarkSpecs.push({ id: obj.id ?? `${map.id}-landmark-${index}`, col: obj.col, row: obj.row, w: obj.w ?? 1, h: obj.h ?? 1, kind: obj.kind });
        }

    });

    //  Tiles now covered by something authored in the JSON (houses, shops,
    //  sites, the yard). Anything the auto-site system saved here in an
    //  earlier session — including houses the player built on it — is stale
    //  now that we've placed our own thing on the spot, so purge it.
    const objectTiles = new Set<string>();

    map.objects?.forEach(obj => {

        const ow = obj.w ?? (obj.type === 'yard' ? 3 : 1);
        const oh = obj.h ?? (obj.type === 'yard' ? 2 : 1);

        for (let c = obj.col; c < obj.col + ow; c++)
        {
            for (let r = obj.row; r < obj.row + oh; r++)
            {
                objectTiles.add(`${c},${r}`);
            }
        }

    });

    const allExtras = loadExtraSites();
    const mapExtras = allExtras[map.id] ?? [];
    const keptExtras = mapExtras.filter(e => !objectTiles.has(`${e.col},${e.row}`));

    if (keptExtras.length !== mapExtras.length)
    {
        //  Remove any built house that sat on a now-purged plot, then persist
        const built = loadBuiltHouses();
        let builtChanged = false;

        for (const e of mapExtras)
        {
            if (objectTiles.has(`${e.col},${e.row}`) && built[e.id])
            {
                delete built[e.id];
                builtChanged = true;
            }
        }

        if (builtChanged)
        {
            saveBuiltHouses(built);
        }

        allExtras[map.id] = keptExtras;
        saveExtraSites(allExtras);
    }

    //  Sites this map gained in earlier sessions (skip any tile no longer grass)
    for (const extra of keptExtras)
    {
        if (tileAt(extra.col, extra.row) === '.')
        {
            siteSpecs.push({ id: extra.id, col: extra.col, row: extra.row, w: 1, h: 1 });
        }
    }

    //  Tiles the player has paved onto this map's road network — same
    //  purge-then-reapply pattern as extra sites, populating `extraRoads`
    //  so tileAt/isRoad (and everything drawn from them) see it as real road
    const allExtraRoads = loadExtraRoads();
    const mapExtraRoads = allExtraRoads[map.id] ?? [];
    const keptExtraRoads = mapExtraRoads.filter(t => !objectTiles.has(`${t.col},${t.row}`));

    if (keptExtraRoads.length !== mapExtraRoads.length)
    {
        allExtraRoads[map.id] = keptExtraRoads;
        saveExtraRoads(allExtraRoads);
    }

    //  Tiles where two roads cross — resolved once (bridge or tunnel) and
    //  then just a drawing detail forever after, same overlay entry either
    //  way whether the tile itself is a player-paved one or an original
    //  part of the map
    const crossingByTile = new Map<string, 'ns-over' | 'ew-over'>();

    for (const tile of keptExtraRoads)
    {
        if (tile.crossing)
        {
            crossingByTile.set(`${tile.col},${tile.row}`, tile.crossing);
        }

        if (map.tiles[tile.row]?.[tile.col] === '.')
        {
            extraRoads.add(`${tile.col},${tile.row}`);
        }
    }

    //  Demolished houses stand as building sites now (a rebuilt one is drawn
    //  as a house again by the site loop below, because it's in builtHouses)
    for (let i = houseSpecs.length - 1; i >= 0; i--)
    {
        const spec = houseSpecs[i];

        if (demolished.has(spec.id))
        {
            houseSpecs.splice(i, 1);
            siteSpecs.push({ id: spec.id, col: spec.col, row: spec.row, w: spec.w, h: spec.h });
        }
    }

    //  ---- Keep enough plots available to build on ----
    //  Prefer empty grass (never sand or water); as a last resort, demolish
    //  a house the player hasn't visited and didn't build himself.

    const occupied = new Set<string>();

    const markFootprint = (col: number, row: number, w: number, h: number) => {
        for (let c = col; c < col + w; c++)
        {
            for (let r = row; r < row + h; r++)
            {
                occupied.add(`${c},${r}`);
            }
        }
    };

    for (const spec of houseSpecs) markFootprint(spec.col, spec.row, spec.w, spec.h);
    for (const spec of siteSpecs) markFootprint(spec.col, spec.row, spec.w, spec.h);
    for (const spec of landmarkSpecs) markFootprint(spec.col, spec.row, spec.w, spec.h);

    //  Keep the auto-site system away from the yard's footprint
    if (yardObj)
    {
        const y = yardObj as MapObject;
        markFootprint(y.col, y.row, y.w ?? 3, y.h ?? 2);
    }

    //  Player-paved road tiles are off-limits to the auto-site system, or a
    //  top-up could drop a house straight onto a road he just built
    for (const key of extraRoads)
    {
        occupied.add(key);
    }

    //  Edge tiles that still unlock a town (once paved). Reserve the whole
    //  grass corridor from each edge tile inward to the nearest road from the
    //  auto-site system, so nothing can block the route out — but keep those
    //  tiles player-buildable (see unlockPathTiles / blockedTiles below).
    const unlockedTowns = new Set(loadUnlockedTowns());
    const unlockPathTiles = new Set<string>();

    const unlockMarkers: PlacedUnlockMarker[] = (map.roadStubs ?? [])
        .filter(stub => !unlockedTowns.has(stub.unlocksMap) && tileAt(stub.col, stub.row) !== 'R')
        .map(stub => {
            //  Walk from the edge tile inward (away from the boundary) over
            //  grass until we meet a road, reserving each tile on the way
            const [ idx, idy ] = EDGE_DELTA[OPPOSITE_EDGE[stub.edge]];
            let c = stub.col;
            let r = stub.row;

            while (r >= 0 && r < rows && c >= 0 && c < cols && tileAt(c, r) === '.')
            {
                unlockPathTiles.add(`${c},${r}`);
                markFootprint(c, r, 1, 1);
                c += idx;
                r += idy;
            }

            return { col: stub.col, row: stub.row, edge: stub.edge, unlocksMap: stub.unlocksMap };
        });

    const pickEmptyGrass = (): { col: number; row: number } | null => {

        const nearRoad: { col: number; row: number }[] = [];
        const anywhere: { col: number; row: number }[] = [];

        for (let r = 0; r < rows; r++)
        {
            for (let c = 0; c < cols; c++)
            {
                if (map.tiles[r][c] !== '.' || occupied.has(`${c},${r}`))
                {
                    continue;
                }

                const byRoad = tileAt(c - 1, r) === 'R' || tileAt(c + 1, r) === 'R' || tileAt(c, r - 1) === 'R' || tileAt(c, r + 1) === 'R';

                (byRoad ? nearRoad : anywhere).push({ col: c, row: r });
            }
        }

        const pool = nearRoad.length > 0 ? nearRoad : anywhere;

        return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
    };

    let available = siteSpecs.filter(s => !builtHouses[s.id]).length;
    let guard = 0;

    while (available < MIN_SITES && guard++ < 10)
    {
        const cell = pickEmptyGrass();

        if (cell)
        {
            const site: SiteSpec = { id: `${map.id}-extra-${cell.col}x${cell.row}`, col: cell.col, row: cell.row, w: 1, h: 1 };

            siteSpecs.push(site);
            saveExtraSite(map.id, { id: site.id, col: site.col, row: site.row });
            markFootprint(site.col, site.row, 1, 1);
        }
        else
        {
            const index = houseSpecs.findIndex(h => !h.sign && !h.player && !visited.has(h.id) && !builtHouses[h.id]);

            if (index === -1)
            {
                console.warn(`Map ${map.id}: no space for new building sites and nothing left to demolish`);
                break;
            }

            const victim = houseSpecs.splice(index, 1)[0];

            siteSpecs.push({ id: victim.id, col: victim.col, row: victim.row, w: victim.w, h: victim.h });
            demolished.add(victim.id);
            saveDemolished([ ...demolished ]);
        }

        available++;
    }

    //  Shared by plain H tiles, legend characters and map objects.
    //  Every house gets a unique, stable id.
    const placeHouse = (id: string, col: number, row: number, w: number, h: number, colourName?: string, facing?: Edge, sign?: string, sells?: string[], shopType?: 'grocery' | 'treat' | 'cafe' | 'petrol' | 'chippy', player?: boolean) => {

        if (usedIds.has(id))
        {
            console.warn(`Map ${map.id}: duplicate house id "${id}"`);
        }

        usedIds.add(id);

        const hx = (col + w / 2) * TILE;
        const hy = (row + h / 2) * TILE;
        const hw = w * TILE - 32;
        const hh = h * TILE - 32;

        const fallback = HOUSE_COLOURS[(col * 7 + row * 13) % HOUSE_COLOURS.length];

        //  The player's own home takes his chosen car colour
        const colour = player ? ((scene.registry.get('carColour') as number) ?? fallback) : parseColour(colourName, fallback);
        const darker = Phaser.Display.Color.IntegerToColor(colour).darken(35).color;

        const rect = scene.add.rectangle(hx, hy, hw, hh, colour);
        rect.setStrokeStyle(8, darker);
        rect.setName(id);
        rect.setData('houseId', id);

        if (sign)
        {
            scene.add.text(hx, hy, sign, {
                fontFamily: 'Arial Black', fontSize: 20, color: '#ffffff',
                stroke: '#000000', strokeThickness: 4, align: 'center'
            }).setOrigin(0.5);
        }
        else if (!player)
        {
            //  Roof ridge along the long axis
            if (hw >= hh)
            {
                scene.add.rectangle(hx, hy, hw - 16, 12, darker);
            }
            else
            {
                scene.add.rectangle(hx, hy, 12, hh - 16, darker);
            }
        }

        //  Front door on the facing side
        if (facing)
        {
            const veryDark = Phaser.Display.Color.IntegerToColor(colour).darken(60).color;

            if (facing === 'north') scene.add.rectangle(hx, hy - hh / 2 + 13, 44, 18, veryDark);
            if (facing === 'south') scene.add.rectangle(hx, hy + hh / 2 - 13, 44, 18, veryDark);
            if (facing === 'west') scene.add.rectangle(hx - hw / 2 + 13, hy, 18, 44, veryDark);
            if (facing === 'east') scene.add.rectangle(hx + hw / 2 - 13, hy, 18, 44, veryDark);
        }

        //  Name across the roof of his own home, shrunk to fit the house
        if (player)
        {
            const name = loadPlayerName().trim();

            const plate = scene.add.text(hx, hy, name.length > 0 ? `${name}'s` : 'Home', {
                fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff', stroke: '#000000', strokeThickness: 5
            }).setOrigin(0.5);

            if (plate.width > hw - 12)
            {
                plate.setScale((hw - 12) / plate.width);
            }
        }

        solid(rect);

        houses.push({ id, x: hx, y: hy, width: hw, height: hh, colour, sign, sells, shopType });
    };

    for (let r = 0; r < rows; r++)
    {
        for (let c = 0; c < cols; c++)
        {
            const t = extraRoads.has(`${c},${r}`) ? 'R' : map.tiles[r][c];
            const cx = c * TILE + TILE / 2;
            const cy = r * TILE + TILE / 2;

            if (t === 'R')
            {
                scene.add.rectangle(cx, cy, TILE, TILE, 0x555555);

                //  Kerbs along edges that meet grass
                if (tileAt(c, r - 1) !== null && !isRoad(c, r - 1) && tileAt(c, r - 1) !== 'W')
                {
                    scene.add.rectangle(cx, r * TILE + 6, TILE, 12, 0x9e9e9e);
                }

                if (tileAt(c, r + 1) !== null && !isRoad(c, r + 1) && tileAt(c, r + 1) !== 'W')
                {
                    scene.add.rectangle(cx, (r + 1) * TILE - 6, TILE, 12, 0x9e9e9e);
                }

                if (tileAt(c - 1, r) !== null && !isRoad(c - 1, r) && tileAt(c - 1, r) !== 'W')
                {
                    scene.add.rectangle(c * TILE + 6, cy, 12, TILE, 0x9e9e9e);
                }

                if (tileAt(c + 1, r) !== null && !isRoad(c + 1, r) && tileAt(c + 1, r) !== 'W')
                {
                    scene.add.rectangle((c + 1) * TILE - 6, cy, 12, TILE, 0x9e9e9e);
                }

                //  Centre-line dashes on straight stretches only
                const n = isRoad(c, r - 1);
                const s = isRoad(c, r + 1);
                const e = isRoad(c + 1, r);
                const w = isRoad(c - 1, r);

                if (n && s && !e && !w)
                {
                    scene.add.rectangle(cx, cy, 8, 60, 0xffffff);
                }
                else if (e && w && !n && !s)
                {
                    scene.add.rectangle(cx, cy, 60, 8, 0xffffff);
                }

                //  Two roads crossing — visual only, never a solid() call,
                //  so both directions stay fully drivable exactly as if
                //  they'd never actually met
                const crossing = crossingByTile.get(`${c},${r}`);

                if (crossing === 'ns-over')
                {
                    //  East-west traffic disappears under the deck
                    scene.add.rectangle(c * TILE + 6, cy, 46, 60, 0x263238);
                    scene.add.rectangle((c + 1) * TILE - 6, cy, 46, 60, 0x263238);

                    //  The north-south deck, raised over the top
                    scene.add.rectangle(cx + 8, cy + 8, 74, TILE, 0x000000, 0.18);
                    scene.add.rectangle(cx, cy, 74, TILE, 0xa1887f).setStrokeStyle(4, 0x6d4c41);
                }
                else if (crossing === 'ew-over')
                {
                    //  North-south traffic disappears under the deck
                    scene.add.rectangle(cx, r * TILE + 6, 60, 46, 0x263238);
                    scene.add.rectangle(cx, (r + 1) * TILE - 6, 60, 46, 0x263238);

                    //  The east-west deck, raised over the top
                    scene.add.rectangle(cx + 8, cy + 8, TILE, 74, 0x000000, 0.18);
                    scene.add.rectangle(cx, cy, TILE, 74, 0xa1887f).setStrokeStyle(4, 0x6d4c41);
                }
            }
            else if (t === 'T')
            {
                const tree = scene.add.circle(cx, cy, 34, 0x2e7d32);
                scene.add.circle(cx, cy, 20, 0x43a047);

                scene.physics.add.existing(tree, true);
                (tree.body as Phaser.Physics.Arcade.StaticBody).setCircle(34);
                obstacles.add(tree);
            }
            else if (t === 'S')
            {
                scene.add.rectangle(cx, cy, TILE, TILE, 0xffe082);
            }
            else if (t === 'W')
            {
                scene.add.rectangle(cx, cy, TILE, TILE, 0x29b6f6);

                //  A little wave line for texture
                scene.add.rectangle(cx - 40 + ((c * 13 + r * 7) % 80), cy - 30 + ((c * 31 + r * 17) % 60), 44, 6, 0x81d4fa);

                const water = scene.add.rectangle(cx, cy, TILE, TILE);
                solid(water);
            }
        }
    }

    //  An empty plot: dirt, corner stakes and a construction sign
    const placeSite = (id: string, col: number, row: number, w: number, h: number) => {

        const sx = (col + w / 2) * TILE;
        const sy = (row + h / 2) * TILE;
        const sw = w * TILE - 40;
        const sh = h * TILE - 40;

        const dirt = scene.add.rectangle(sx, sy, sw, sh, 0xa1887f);
        dirt.setStrokeStyle(6, 0x795548);

        for (const dx of [ -1, 1 ])
        {
            for (const dy of [ -1, 1 ])
            {
                scene.add.rectangle(sx + dx * (sw / 2 - 10), sy + dy * (sh / 2 - 10), 16, 16, 0x6d4c41);
            }
        }

        scene.add.text(sx, sy, '🚧', { fontSize: 44 }).setOrigin(0.5);

        sites.push({ id, x: sx, y: sy, width: sw, height: sh });
    };

    //  One distinctive, solid, non-interactive structure per town. Each
    //  kind's main body becomes the physics obstacle (same one-shape-solid
    //  pattern as trees); everything else layered on top is purely visual.
    const placeLandmark = (col: number, row: number, w: number, h: number, kind: LandmarkSpec['kind']) => {

        const cx = (col + w / 2) * TILE;
        const cy = (row + h / 2) * TILE;

        if (kind === 'clock-tower')
        {
            const body = scene.add.rectangle(cx, cy + 20, 70, 130, 0x90a4ae);
            body.setStrokeStyle(4, 0x546e7a);
            solid(body);

            //  Roof: local points non-negative, so the shape's origin is its
            //  own bounding-box centre — offsetting y here lands its flat
            //  bottom edge exactly on the body's top edge
            const roof = scene.add.triangle(cx, cy - 70, 0, 50, 90, 50, 45, 0, 0x795548);
            roof.setStrokeStyle(3, 0x4e342e);

            scene.add.circle(cx, cy - 35, 26, 0xffffff).setStrokeStyle(4, 0x263238);
            scene.add.rectangle(cx, cy - 44, 4, 14, 0x263238);
            scene.add.rectangle(cx + 6, cy - 35, 14, 4, 0x263238);
        }
        else if (kind === 'windmill')
        {
            const body = scene.add.rectangle(cx, cy + 40, 56, 120, 0xefebe9);
            body.setStrokeStyle(4, 0xbcaaa4);
            solid(body);

            const hub = scene.add.circle(0, 0, 11, 0x5d4037);
            const parts: Phaser.GameObjects.GameObject[] = [ hub ];

            for (const angle of [ 0, 90 ])
            {
                const blade = scene.add.rectangle(0, 0, 16, 100, 0xd84315);
                blade.setStrokeStyle(2, 0x8d2f0f);
                blade.setRotation(Phaser.Math.DegToRad(angle));
                parts.push(blade);
            }

            //  A slow continuous spin, matching the game's small delight
            //  touches (bouncing labels, wobbling gauges)
            const spinner = scene.add.container(cx, cy - 60, parts);
            scene.tweens.add({ targets: spinner, angle: 360, duration: 8000, repeat: -1, ease: 'Linear' });
        }
        else if (kind === 'pier')
        {
            const pw = w * TILE - 40;
            const ph = h * TILE - 20;

            const deck = scene.add.rectangle(cx, cy, pw, ph, 0x8d6e63);
            deck.setStrokeStyle(4, 0x5d4037);
            solid(deck);

            for (let i = 1; i < h; i++)
            {
                scene.add.rectangle(cx, row * TILE + i * TILE, pw - 10, 6, 0x5d4037);
            }

            scene.add.rectangle(cx - pw / 2 + 8, cy, 6, ph, 0x6d4c41);
            scene.add.rectangle(cx + pw / 2 - 8, cy, 6, ph, 0x6d4c41);
        }
        else if (kind === 'lighthouse')
        {
            const stripeH = 26;
            const stripeColours = [ 0xef5350, 0xffffff, 0xef5350, 0xffffff ];

            stripeColours.forEach((colour, i) => {

                const sy = cy + 50 - i * stripeH;
                const stripe = scene.add.rectangle(cx, sy, 50 - i * 4, stripeH, colour);
                stripe.setStrokeStyle(2, 0x263238);

                if (i === stripeColours.length - 1)
                {
                    solid(stripe);
                }

            });

            const lanternY = cy + 50 - stripeColours.length * stripeH - 14;
            scene.add.rectangle(cx, lanternY, 30, 24, 0x37474f);

            //  A slow blinking beacon
            const light = scene.add.circle(cx, lanternY - 4, 10, 0xffeb3b);
            scene.tweens.add({ targets: light, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });

            scene.add.ellipse(cx, lanternY - 20, 34, 14, 0x37474f);
        }
    };

    //  Draw everything the data pass decided on
    for (const spec of houseSpecs)
    {
        placeHouse(spec.id, spec.col, spec.row, spec.w, spec.h, spec.colour, spec.facing, spec.sign, spec.sells, spec.shopType, spec.player);
    }

    for (const spec of siteSpecs)
    {
        const built = builtHouses[spec.id];

        if (built)
        {
            //  The player built here: a real house stands on the plot now
            placeHouse(spec.id, spec.col, spec.row, spec.w, spec.h, built.colour, 'south');
        }
        else
        {
            placeSite(spec.id, spec.col, spec.row, spec.w, spec.h);
        }
    }

    //  ---- Unlock hints: a signpost on each still-locked edge tile so the
    //  player can see where a new town is waiting to be reached by road ----

    for (const marker of unlockMarkers)
    {
        const x = (marker.col + 0.5) * TILE;
        const y = (marker.row + 0.5) * TILE;
        const targetData = scene.cache.json.get(mapCacheKey(marker.unlocksMap)) as MapData | undefined;
        const label = targetData?.name ?? marker.unlocksMap;

        //  A faint green highlight marking the tile as buildable
        scene.add.rectangle(x, y, TILE - 16, TILE - 16, 0x9ccc65, 0.45).setStrokeStyle(4, 0x558b2f).setDepth(4);

        //  A little signpost above it naming the town
        scene.add.rectangle(x, y, 10, TILE * 0.42, 0x795548).setStrokeStyle(2, 0x4e342e).setDepth(5);
        scene.add.rectangle(x, y - TILE * 0.28, 168, 44, 0xfff3e0).setStrokeStyle(4, 0x5d4037).setDepth(5);
        scene.add.text(x, y - TILE * 0.28, `→ ${label}`, {
            fontFamily: 'Arial Black', fontSize: 18, color: '#3e2723'
        }).setOrigin(0.5).setDepth(5);
    }

    const landmarks: PlacedLandmark[] = [];

    for (const spec of landmarkSpecs)
    {
        placeLandmark(spec.col, spec.row, spec.w, spec.h, spec.kind);

        landmarks.push({
            id: spec.id,
            x: (spec.col + spec.w / 2) * TILE,
            y: (spec.row + spec.h / 2) * TILE,
            width: spec.w * TILE,
            height: spec.h * TILE,
            kind: spec.kind
        });
    }

    //  Cars scattered along the roads. They drive themselves once the scene
    //  is running (see Driving.ts) — here we just draw them and hand back a
    //  dynamic (movable) body each, sized as a circle like the player's own
    //  car since they need to freely turn through all four headings.
    const facingRotation: Record<Edge, number> = {
        north: 0,
        south: Math.PI,
        east: Math.PI / 2,
        west: -Math.PI / 2
    };

    const npcCars: PlacedNpcCar[] = [];

    map.cars?.forEach(car => {

        const cx = (car.col + 0.5) * TILE;
        const cy = (car.row + 0.5) * TILE;
        const facing = car.facing ?? 'north';
        const colour = parseColour(car.colour, 0xbdbdbd);

        const npc = scene.add.container(cx, cy, buildCarShapes(scene, car.model ?? 'hatch', colour));
        const heading = facingRotation[facing];
        npc.setRotation(heading);

        scene.physics.add.existing(npc);
        (npc.body as Phaser.Physics.Arcade.Body).setCircle(34);

        npcCars.push({ container: npc, col: car.col, row: car.row, heading });

    });

    const yard = yardObj ? drawYard(scene, yardObj, tileAt) : null;

    //  A road built out to the edge earns a real exit here — merged in
    //  fresh each time rather than ever rewriting the static map JSON
    const effectiveExits: Partial<Record<Edge, string>> = { ...map.exits, ...loadExtraExits()[map.id] };

    buildEdgeWalls(scene, map, obstacles, cols, rows, extraRoads, effectiveExits);
    drawSignposts(scene, map, cols, rows, extraRoads, effectiveExits);

    const start = map.start
        ? { x: (map.start.col + 0.5) * TILE, y: (map.start.row + 0.5) * TILE }
        : { x: width / 2, y: height / 2 };

    //  Everything build mode must not let the player pave over — the auto-site
    //  system's `occupied` set, minus the unlock tiles (which he's meant to
    //  build on) and minus player roads (already road, rejected separately)
    const blockedTiles = new Set(occupied);

    for (const key of unlockPathTiles)
    {
        blockedTiles.delete(key);
    }

    for (const key of extraRoads)
    {
        blockedTiles.delete(key);
    }

    return { obstacles, width, height, start, houses, sites, npcCars, yard, landmarks, unlockMarkers, blockedTiles, extraRoads };
}

//  The builders' yard: a fenced gravel plot the fleet parks in. The player
//  drives in/out via the road tile alongside it (the spawn point).
function drawYard (scene: Scene, obj: MapObject, tileAt: (c: number, r: number) => string | null): PlacedYard
{
    const w = obj.w ?? 3;
    const h = obj.h ?? 2;
    const x = (obj.col + w / 2) * TILE;
    const y = (obj.row + h / 2) * TILE;
    const pw = w * TILE - 16;
    const ph = h * TILE - 16;

    //  Gravel surface with a fence border
    scene.add.rectangle(x, y, pw, ph, 0xbcaaa4).setStrokeStyle(6, 0x6d4c41);

    for (let px = x - pw / 2 + 20; px < x + pw / 2; px += 60)
    {
        scene.add.rectangle(px, y - ph / 2 + 4, 10, 14, 0x8d6e63);
        scene.add.rectangle(px, y + ph / 2 - 4, 10, 14, 0x8d6e63);
    }

    scene.add.text(x, y - ph / 2 - 24, '🏗️ YARD', {
        fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff', stroke: '#5d4037', strokeThickness: 6
    }).setOrigin(0.5);

    //  Find a road tile touching the yard to drive out onto, and face away
    //  from the yard so he pulls onto the road rather than back into it
    const edges: { tiles: [number, number][]; heading: number }[] = [
        { tiles: range(obj.col, w).map(c => [ c, obj.row - 1 ] as [number, number]), heading: 0 },
        { tiles: range(obj.col, w).map(c => [ c, obj.row + h ] as [number, number]), heading: Math.PI },
        { tiles: range(obj.row, h).map(r => [ obj.col - 1, r ] as [number, number]), heading: -Math.PI / 2 },
        { tiles: range(obj.row, h).map(r => [ obj.col + w, r ] as [number, number]), heading: Math.PI / 2 }
    ];

    let spawnX = x;
    let spawnY = y;
    let spawnHeading = 0;

    for (const edge of edges)
    {
        const road = edge.tiles.find(([ c, r ]) => tileAt(c, r) === 'R');

        if (road)
        {
            spawnX = (road[0] + 0.5) * TILE;
            spawnY = (road[1] + 0.5) * TILE;
            spawnHeading = edge.heading;
            break;
        }
    }

    //  Parking slots in a 4x2 grid inside the yard (first 7 used by the fleet)
    const slots: { x: number; y: number }[] = [];
    const slotCols = 4;
    const slotRows = 2;

    for (let sr = 0; sr < slotRows; sr++)
    {
        for (let sc = 0; sc < slotCols; sc++)
        {
            slots.push({
                x: x - pw / 2 + pw * (sc + 0.5) / slotCols,
                y: y - ph / 2 + ph * (sr + 0.5) / slotRows
            });
        }
    }

    return { id: obj.id ?? 'yard', x, y, width: pw, height: ph, spawnX, spawnY, spawnHeading, slots };
}

function range (start: number, count: number): number[]
{
    return Array.from({ length: count }, (_, i) => start + i);
}

//  Invisible walls along each map edge, with openings only where a road
//  meets an edge that connects to another map
function buildEdgeWalls (scene: Scene, map: MapData, obstacles: Phaser.Physics.Arcade.StaticGroup, cols: number, rows: number, extraRoads: Set<string>, exits: Partial<Record<Edge, string>>)
{
    const isRoadTile = (c: number, r: number) => extraRoads.has(`${c},${r}`) || map.tiles[r][c] === 'R';

    const width = cols * TILE;
    const height = rows * TILE;

    const addWall = (x: number, y: number, w: number, h: number) => {
        const wall = scene.add.rectangle(x, y, w, h);
        scene.physics.add.existing(wall, true);
        obstacles.add(wall);
    };

    const buildEdge = (count: number, isOpen: (i: number) => boolean, place: (center: number, length: number) => void) => {

        let runStart = -1;

        for (let i = 0; i <= count; i++)
        {
            const open = i < count ? isOpen(i) : true;

            if (!open && runStart === -1)
            {
                runStart = i;
            }
            else if (open && runStart !== -1)
            {
                const length = (i - runStart) * TILE;
                place(runStart * TILE + length / 2, length);
                runStart = -1;
            }
        }
    };

    buildEdge(cols, c => isRoadTile(c, 0) && !!exits.north, (center, length) => addWall(center, 0, length, 60));
    buildEdge(cols, c => isRoadTile(c, rows - 1) && !!exits.south, (center, length) => addWall(center, height, length, 60));
    buildEdge(rows, r => isRoadTile(0, r) && !!exits.west, (center, length) => addWall(0, center, 60, length));
    buildEdge(rows, r => isRoadTile(cols - 1, r) && !!exits.east, (center, length) => addWall(width, center, 60, length));
}

//  A small sign naming the town on the other side of each exit, derived
//  entirely from map.exits and the road gap in the edge wall — no JSON
//  authoring needed. Purely decorative, never added to obstacles, so it
//  can never block the exit it's labelling.
function drawSignposts (scene: Scene, map: MapData, cols: number, rows: number, extraRoads: Set<string>, exits: Partial<Record<Edge, string>>)
{
    const isRoadTile = (c: number, r: number) => extraRoads.has(`${c},${r}`) || map.tiles[r][c] === 'R';

    const placeSignpost = (x: number, y: number, targetId: string) => {

        const targetData = scene.cache.json.get(mapCacheKey(targetId)) as MapData | undefined;
        const label = targetData?.name ?? targetId;

        scene.add.rectangle(x, y, 10, 56, 0x795548).setStrokeStyle(2, 0x4e342e);

        const board = scene.add.rectangle(x, y - 46, 150, 42, 0xfff3e0);
        board.setStrokeStyle(4, 0x5d4037);

        scene.add.text(x, y - 46, `→ ${label}`, {
            fontFamily: 'Arial Black', fontSize: 18, color: '#3e2723'
        }).setOrigin(0.5);
    };

    //  The single tile index along an edge where a road actually crosses it
    const findGapIndex = (length: number, isRoad: (i: number) => boolean): number | null => {

        for (let i = 0; i < length; i++)
        {
            if (isRoad(i))
            {
                return i;
            }
        }

        return null;
    };

    if (exits.north)
    {
        const gap = findGapIndex(cols, c => isRoadTile(c, 0));

        if (gap !== null)
        {
            placeSignpost((gap + 1.6) * TILE, TILE * 0.55, exits.north);
        }
    }

    if (exits.south)
    {
        const gap = findGapIndex(cols, c => isRoadTile(c, rows - 1));

        if (gap !== null)
        {
            placeSignpost((gap + 1.6) * TILE, (rows - 1) * TILE + TILE * 0.45, exits.south);
        }
    }

    if (exits.west)
    {
        const gap = findGapIndex(rows, r => isRoadTile(0, r));

        if (gap !== null)
        {
            placeSignpost(TILE * 0.55, (gap + 1.6) * TILE, exits.west);
        }
    }

    if (exits.east)
    {
        const gap = findGapIndex(rows, r => isRoadTile(cols - 1, r));

        if (gap !== null)
        {
            placeSignpost((cols - 1) * TILE + TILE * 0.45, (gap + 1.6) * TILE, exits.east);
        }
    }
}
