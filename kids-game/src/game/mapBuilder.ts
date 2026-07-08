import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapes } from './carShapes';
import { loadBuiltHouses, loadDemolished, loadExtraSites, loadVisitedHouses, saveDemolished, saveExtraSite } from './storage';

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
    type: 'house' | 'site';
    col: number;
    row: number;
    w?: number;
    h?: number;
    colour?: string;
    facing?: Edge;
    sign?: string;
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

export interface BuiltMap
{
    obstacles: Phaser.Physics.Arcade.StaticGroup;
    width: number;
    height: number;
    start: { x: number; y: number };
    houses: PlacedHouse[];
    sites: PlacedSite[];
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

function parseColour (name: string | undefined, fallback: number): number
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

    interface HouseSpec { id: string; col: number; row: number; w: number; h: number; colour?: string; facing?: Edge; sign?: string }
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

    map.objects?.forEach((obj, index) => {

        if (obj.type === 'house')
        {
            houseSpecs.push({ id: obj.id ?? `${map.id}-object-${index}`, col: obj.col, row: obj.row, w: obj.w ?? 1, h: obj.h ?? 1, colour: obj.colour, facing: obj.facing, sign: obj.sign });
        }
        else if (obj.type === 'site')
        {
            siteSpecs.push({ id: obj.id ?? `${map.id}-site-${index}`, col: obj.col, row: obj.row, w: obj.w ?? 1, h: obj.h ?? 1 });
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
            const index = houseSpecs.findIndex(h => !h.sign && !visited.has(h.id) && !builtHouses[h.id]);

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
    const placeHouse = (id: string, col: number, row: number, w: number, h: number, colourName?: string, facing?: Edge, sign?: string) => {

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
        const colour = parseColour(colourName, fallback);
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
        else
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

        solid(rect);

        houses.push({ id, x: hx, y: hy, width: hw, height: hh, colour, sign });
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
        placeHouse(spec.id, spec.col, spec.row, spec.w, spec.h, spec.colour, spec.facing, spec.sign);
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

    //  Parked cars scattered along the roads, as obstacles to steer around
    const facingRotation: Record<Edge, number> = {
        north: 0,
        south: Math.PI,
        east: Math.PI / 2,
        west: -Math.PI / 2
    };

    map.cars?.forEach(car => {

        const cx = (car.col + 0.5) * TILE;
        const cy = (car.row + 0.5) * TILE;
        const facing = car.facing ?? 'north';
        const colour = parseColour(car.colour, 0xbdbdbd);

        const parked = scene.add.container(cx, cy, buildCarShapes(scene, car.model ?? 'hatch', colour));
        parked.setRotation(facingRotation[facing]);

        //  Static bodies stay axis-aligned, so size the box to the parked orientation
        const length = car.model === 'lorry' ? 108 : 88;
        const horizontal = facing === 'east' || facing === 'west';
        parked.setSize(horizontal ? length : 56, horizontal ? 56 : length);

        scene.physics.add.existing(parked, true);
        obstacles.add(parked);

    });

    buildEdgeWalls(scene, map, obstacles, cols, rows);

    const start = map.start
        ? { x: (map.start.col + 0.5) * TILE, y: (map.start.row + 0.5) * TILE }
        : { x: width / 2, y: height / 2 };

    return { obstacles, width, height, start, houses, sites };
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
