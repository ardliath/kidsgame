import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapes } from './carShapes';
import { loadBuiltHouses, loadDemolished, loadExtraSites, loadPlayerName, loadVisitedHouses, saveDemolished, saveExtraSite } from './storage';

export const TILE = 200;

//  Every map keeps at least this many plots available to build on
const MIN_SITES = 3;

export const MAP_IDS = [ 'home-town', 'hill-town', 'beach-town', 'cove-town' ];
export const DEFAULT_MAP = 'home-town';

export function mapCacheKey (id: string): string
{
    return `map-${id}`;
}

export type Edge = 'north' | 'south' | 'east' | 'west';

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
    type: 'house' | 'site' | 'yard';
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
    shopType?: 'grocery' | 'treat';

    //  The player's own home: painted his car colour, name over the door,
    //  and never demolished.
    player?: boolean;
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
    shopType?: 'grocery' | 'treat';
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
}

const HOUSE_COLOURS = [0xef9a9a, 0x90caf9, 0xffcc80, 0xa5d6a7, 0xce93d8, 0xfff59d, 0x80cbc4, 0xffab91];

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

    const tileAt = (c: number, r: number): string | null =>
        (c < 0 || r < 0 || c >= cols || r >= rows) ? null : map.tiles[r][c];

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

    interface HouseSpec { id: string; col: number; row: number; w: number; h: number; colour?: string; facing?: Edge; sign?: string; sells?: string[]; shopType?: 'grocery' | 'treat'; player?: boolean }
    interface SiteSpec { id: string; col: number; row: number; w: number; h: number }

    const builtHouses = loadBuiltHouses();
    const demolished = new Set(loadDemolished());
    const visited = new Set(loadVisitedHouses());

    const houseSpecs: HouseSpec[] = [];
    const siteSpecs: SiteSpec[] = [];

    for (let r = 0; r < rows; r++)
    {
        for (let c = 0; c < cols; c++)
        {
            const t = map.tiles[r][c];

            if (t === 'H')
            {
                houseSpecs.push({ id: `${map.id}-house-${c}x${r}`, col: c, row: r, w: 1, h: 1 });
            }
            else if (t !== '.' && map.legend?.[t]?.type === 'house')
            {
                const entry = map.legend[t];
                houseSpecs.push({ id: `${map.id}-house-${c}x${r}`, col: c, row: r, w: 1, h: 1, colour: entry.colour, facing: entry.facing, sign: entry.sign });
            }
        }
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

    });

    //  Sites this map gained in earlier sessions (skip any the JSON has since built over)
    for (const extra of loadExtraSites()[map.id] ?? [])
    {
        if (tileAt(extra.col, extra.row) === '.')
        {
            siteSpecs.push({ id: extra.id, col: extra.col, row: extra.row, w: 1, h: 1 });
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

    //  Keep the auto-site system away from the yard's footprint
    if (yardObj)
    {
        const y = yardObj as MapObject;
        markFootprint(y.col, y.row, y.w ?? 3, y.h ?? 2);
    }

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
    const placeHouse = (id: string, col: number, row: number, w: number, h: number, colourName?: string, facing?: Edge, sign?: string, sells?: string[], shopType?: 'grocery' | 'treat', player?: boolean) => {

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
            const t = map.tiles[r][c];
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

    buildEdgeWalls(scene, map, obstacles, cols, rows);

    const start = map.start
        ? { x: (map.start.col + 0.5) * TILE, y: (map.start.row + 0.5) * TILE }
        : { x: width / 2, y: height / 2 };

    return { obstacles, width, height, start, houses, sites, npcCars, yard };
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
function buildEdgeWalls (scene: Scene, map: MapData, obstacles: Phaser.Physics.Arcade.StaticGroup, cols: number, rows: number)
{
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

    buildEdge(cols, c => map.tiles[0][c] === 'R' && !!map.exits?.north, (center, length) => addWall(center, 0, length, 60));
    buildEdge(cols, c => map.tiles[rows - 1][c] === 'R' && !!map.exits?.south, (center, length) => addWall(center, height, length, 60));
    buildEdge(rows, r => map.tiles[r][0] === 'R' && !!map.exits?.west, (center, length) => addWall(0, center, 60, length));
    buildEdge(rows, r => map.tiles[r][cols - 1] === 'R' && !!map.exits?.east, (center, length) => addWall(width, center, 60, length));
}
