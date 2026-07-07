import * as Phaser from 'phaser';
import { Scene } from 'phaser';

export const TILE = 200;

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

//  Free-standing things with properties, placed on top of the tile grid
export interface MapObject
{
    id?: string;
    type: 'house';
    col: number;
    row: number;
    w?: number;
    h?: number;
    colour?: string;
    facing?: Edge;
    sign?: string;
}

export interface MapData
{
    id: string;
    name: string;
    tiles: string[];
    legend?: Record<string, LegendEntry>;
    objects?: MapObject[];
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
}

export interface BuiltMap
{
    obstacles: Phaser.Physics.Arcade.StaticGroup;
    width: number;
    height: number;
    start: { x: number; y: number };
    houses: PlacedHouse[];
}

const HOUSE_COLOURS = [0xef9a9a, 0x90caf9, 0xffcc80, 0xa5d6a7, 0xce93d8, 0xfff59d, 0x80cbc4, 0xffab91];

const NAMED_COLOURS: Record<string, number> = {
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
    const usedIds = new Set<string>();

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

        houses.push({ id, x: hx, y: hy, width: hw, height: hh, colour });
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
            else if (t === 'H')
            {
                placeHouse(`${map.id}-house-${c}x${r}`, c, r, 1, 1);
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
            else if (t !== '.' && map.legend?.[t])
            {
                const entry = map.legend[t];

                if (entry.type === 'house')
                {
                    placeHouse(`${map.id}-house-${c}x${r}`, c, r, 1, 1, entry.colour, entry.facing, entry.sign);
                }
            }
        }
    }

    //  Free-standing objects, on top of the grid
    map.objects?.forEach((obj, index) => {

        if (obj.type === 'house')
        {
            placeHouse(obj.id ?? `${map.id}-object-${index}`, obj.col, obj.row, obj.w ?? 1, obj.h ?? 1, obj.colour, obj.facing, obj.sign);
        }

    });

    buildEdgeWalls(scene, map, obstacles, cols, rows);

    const start = map.start
        ? { x: (map.start.col + 0.5) * TILE, y: (map.start.row + 0.5) * TILE }
        : { x: width / 2, y: height / 2 };

    return { obstacles, width, height, start, houses };
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
