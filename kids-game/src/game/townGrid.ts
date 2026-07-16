import { Scene } from 'phaser';
import { DEFAULT_MAP, Edge, MapData, MapObject, scanGridHouses } from './mapBuilder';

//  Shared by MiniMap.ts and DeliveryBoard.ts — both show the same little
//  town-grid view of the world, just with different things tappable on top

export const TILE_PX = 24;
export const GAP = 26;

const EDGE_DELTA: Record<Edge, [number, number]> = {
    north: [ 0, -1 ],
    south: [ 0, 1 ],
    east: [ 1, 0 ],
    west: [ -1, 0 ]
};

//  Places the towns on a grid by following their exits, so the layout
//  reflects however the JSON connects them
export function layoutTowns (maps: Record<string, MapData>): Record<string, { gx: number; gy: number }>
{
    const pos: Record<string, { gx: number; gy: number }> = {};
    const start = maps[DEFAULT_MAP] ? DEFAULT_MAP : Object.keys(maps)[0];

    pos[start] = { gx: 0, gy: 0 };

    const queue = [ start ];

    while (queue.length > 0)
    {
        const id = queue.shift()!;
        const exits = maps[id].exits ?? {};

        for (const edge of Object.keys(exits) as Edge[])
        {
            const target = exits[edge];

            if (target && maps[target] && !pos[target])
            {
                const [ dx, dy ] = EDGE_DELTA[edge];
                pos[target] = { gx: pos[id].gx + dx, gy: pos[id].gy + dy };
                queue.push(target);
            }
        }
    }

    //  Any unreachable maps get parked in a spare row
    let spare = 0;

    for (const mapId of Object.keys(maps))
    {
        if (!pos[mapId])
        {
            pos[mapId] = { gx: spare++, gy: 99 };
        }
    }

    return pos;
}

export function tileColour (t: string): number
{
    switch (t)
    {
        case 'R': return 0x6d6d6d;
        case 'W': return 0x4fc3f7;
        case 'S': return 0xffe082;
        case 'H': return 0xc8a878;
        default:
            //  Legend houses count as houses; everything else is grass
            return t !== '.' && t !== 'T' ? 0xc8a878 : 0x8bc34a;
    }
}

//  A shop/yard/landmark marker drawn by drawTownGrid, handed back so the
//  caller can attach its own tap behaviour (MiniMap: set as nav target;
//  DeliveryBoard: highlight if it's this job's pickup/drop-off)
export interface TownMarker
{
    obj: MapObject;
    cx: number;
    cy: number;
}

//  Draws one town's terrain, houses/shops/yard/landmarks, border and name
//  label at `cell` (top-left, in TILE_PX units). Returns the shop/yard/
//  landmark markers — not plain houses, which have nothing to tap.
export function drawTownGrid (scene: Scene, map: MapData, cell: { x: number; y: number }, current: boolean): TownMarker[]
{
    const cols = map.tiles[0].length;
    const rows = map.tiles.length;
    const markers: TownMarker[] = [];

    //  Terrain
    for (let r = 0; r < rows; r++)
    {
        for (let c = 0; c < cols; c++)
        {
            const t = map.tiles[r][c];
            const colour = tileColour(t);
            const x = cell.x + c * TILE_PX + TILE_PX / 2;
            const y = cell.y + r * TILE_PX + TILE_PX / 2;

            scene.add.rectangle(x, y, TILE_PX, TILE_PX, colour);
        }
    }

    //  Object houses and shops on top
    map.objects?.forEach(obj => {

        const cx = cell.x + (obj.col + (obj.w ?? 1) / 2) * TILE_PX;
        const cy = cell.y + (obj.row + (obj.h ?? 1) / 2) * TILE_PX;

        if (obj.sign)
        {
            //  A shop: emoji marker
            const emoji = obj.shopType === 'cafe' ? '☕' : obj.shopType === 'treat' ? '🍦' : obj.shopType === 'petrol' ? '⛽' : obj.shopType === 'chippy' ? '🐟' : '🏪';
            scene.add.text(cx, cy, emoji, { fontSize: 26 }).setOrigin(0.5);
            markers.push({ obj, cx, cy });
        }
        else if (obj.type === 'yard')
        {
            scene.add.rectangle(cx, cy, (obj.w ?? 3) * TILE_PX - 2, (obj.h ?? 2) * TILE_PX - 2, 0xbcaaa4).setStrokeStyle(2, 0x6d4c41);
            scene.add.text(cx, cy, '🏗️', { fontSize: 24 }).setOrigin(0.5);
            markers.push({ obj, cx, cy });
        }
        else if (obj.type === 'house')
        {
            scene.add.rectangle(cx, cy, (obj.w ?? 1) * TILE_PX - 4, (obj.h ?? 1) * TILE_PX - 4, 0xc8a878);
            markers.push({ obj, cx, cy });
        }
        else if (obj.type === 'landmark')
        {
            const emoji = obj.kind === 'clock-tower' ? '🕰️'
                : obj.kind === 'windmill' ? '🎡'
                : obj.kind === 'pier' ? '⚓'
                : '🗼';

            scene.add.text(cx, cy, emoji, { fontSize: 22 }).setOrigin(0.5);
            markers.push({ obj, cx, cy });
        }

    });

    //  Plain grid houses ('H' tiles and legend houses) aren't in
    //  map.objects, but delivery drop-offs can still target them — give
    //  them a marker too, matching by the same id scanGridHouses() uses
    for (const grid of scanGridHouses(map))
    {
        const cx = cell.x + (grid.col + 0.5) * TILE_PX;
        const cy = cell.y + (grid.row + 0.5) * TILE_PX;

        markers.push({ obj: { id: grid.id, type: 'house', col: grid.col, row: grid.row }, cx, cy });
    }

    //  Border, highlighted for the town he's in
    const border = scene.add.rectangle(cell.x + cols * TILE_PX / 2, cell.y + rows * TILE_PX / 2, cols * TILE_PX, rows * TILE_PX);
    border.setStrokeStyle(current ? 6 : 3, current ? 0xffeb3b : 0x102027);
    border.setFillStyle();

    scene.add.text(cell.x + cols * TILE_PX / 2, cell.y + rows * TILE_PX + 18, map.name, {
        fontFamily: 'Arial Black', fontSize: 22, color: current ? '#ffeb3b' : '#ffffff'
    }).setOrigin(0.5);

    return markers;
}

//  Road bridges between neighbouring towns, drawn once per connected pair
export function drawConnectors (scene: Scene, maps: Record<string, MapData>, cellOf: (id: string) => { x: number; y: number })
{
    for (const id of Object.keys(maps))
    {
        const map = maps[id];
        const cols = map.tiles[0].length;
        const rows = map.tiles.length;
        const cell = cellOf(id);

        //  Only draw east and south so each bridge is drawn once
        if (map.exits?.east)
        {
            for (let r = 0; r < rows; r++)
            {
                if (map.tiles[r][cols - 1] === 'R')
                {
                    const y = cell.y + r * TILE_PX + TILE_PX / 2;
                    scene.add.rectangle(cell.x + cols * TILE_PX + GAP / 2, y, GAP + 4, TILE_PX, 0x6d6d6d);
                }
            }
        }

        if (map.exits?.south)
        {
            for (let c = 0; c < cols; c++)
            {
                if (map.tiles[rows - 1][c] === 'R')
                {
                    const x = cell.x + c * TILE_PX + TILE_PX / 2;
                    scene.add.rectangle(x, cell.y + rows * TILE_PX + GAP / 2, TILE_PX, GAP + 4, 0x6d6d6d);
                }
            }
        }
    }
}
