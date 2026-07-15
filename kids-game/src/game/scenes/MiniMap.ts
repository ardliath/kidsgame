import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { DEFAULT_MAP, Edge, MAP_IDS, MapData, mapCacheKey, TILE } from '../mapBuilder';
import { listKnownDestinations } from '../navigation';
import { loadFleet } from '../storage';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;
const TILE_PX = 24;
const GAP = 26;

const EDGE_DELTA: Record<Edge, [number, number]> = {
    north: [ 0, -1 ],
    south: [ 0, 1 ],
    east: [ 1, 0 ],
    west: [ -1, 0 ]
};

export class MiniMap extends Scene
{
    constructor ()
    {
        super('MiniMap');
    }

    create ()
    {
        //  Dim the game behind and swallow stray taps
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive();

        const maps: Record<string, MapData> = {};

        for (const id of MAP_IDS)
        {
            const data = this.cache.json.get(mapCacheKey(id)) as MapData | undefined;

            if (data)
            {
                maps[id] = data;
            }
        }

        //  Place the towns on a grid by following their exits, so the map
        //  reflects however the JSON connects them
        const pos = this.layoutTowns(maps);

        let minGx = Infinity, minGy = Infinity, maxGx = -Infinity, maxGy = -Infinity;

        for (const p of Object.values(pos))
        {
            minGx = Math.min(minGx, p.gx);
            minGy = Math.min(minGy, p.gy);
            maxGx = Math.max(maxGx, p.gx);
            maxGy = Math.max(maxGy, p.gy);
        }

        const maxCols = Math.max(...Object.values(maps).map(m => m.tiles[0].length));
        const maxRows = Math.max(...Object.values(maps).map(m => m.tiles.length));
        const cellW = maxCols * TILE_PX;
        const cellH = maxRows * TILE_PX;

        const gridCols = maxGx - minGx + 1;
        const gridRows = maxGy - minGy + 1;

        const totalW = gridCols * cellW + (gridCols - 1) * GAP;
        const totalH = gridRows * cellH + (gridRows - 1) * GAP;

        const originX = CX - totalW / 2;
        const originY = 210;

        //  Panel behind the whole thing
        const panel = this.add.graphics();
        panel.fillStyle(0x263238, 1);
        panel.fillRoundedRect(originX - 40, 120, totalW + 80, totalH + 230, 24);
        panel.lineStyle(6, 0x102027, 1);
        panel.strokeRoundedRect(originX - 40, 120, totalW + 80, totalH + 230, 24);

        this.add.text(CX, 168, 'Map', {
            fontFamily: 'Arial Black', fontSize: 40, color: '#ffffff'
        }).setOrigin(0.5);

        //  Close button
        this.add.circle(originX + totalW + 20, 168, 26, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(originX + totalW + 20, 168, 'X', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(originX + totalW + 20, 168, 80, 80).setInteractive().on('pointerdown', () => this.close());

        const cellOf = (id: string) => ({
            x: originX + (pos[id].gx - minGx) * (cellW + GAP),
            y: originY + (pos[id].gy - minGy) * (cellH + GAP)
        });

        //  Road bridges between neighbouring towns
        this.drawConnectors(maps, cellOf);

        const currentMap = this.registry.get('mapId') as string;

        for (const id of Object.keys(maps))
        {
            this.drawTown(maps[id], cellOf(id), id === currentMap);
        }

        //  His parked vehicles, then the you-are-here marker on top
        this.drawFleet(maps, cellOf);
        this.drawPlayer(maps, cellOf, currentMap);

        //  Legend, over three rows
        const legendY = originY + totalH + 46;
        this.legendItem(CX - 250, legendY, '🚗', 'You');
        this.legendItem(CX - 90, legendY, '🚙', 'Your cars');
        this.legendItem(CX + 130, legendY, '🏗️', 'Yard');
        this.legendItem(CX - 250, legendY + 34, '🏪', 'Shop');
        this.legendItem(CX - 90, legendY + 34, '🍦', 'Ice cream');
        this.legendItem(CX + 130, legendY + 34, '☕', 'Café');
        this.legendItem(CX - 250, legendY + 68, '🗼', 'Landmark');

        this.input.keyboard?.on('keydown-ESC', () => this.close());
    }

    layoutTowns (maps: Record<string, MapData>): Record<string, { gx: number; gy: number }>
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

    drawTown (map: MapData, cell: { x: number; y: number }, current: boolean)
    {
        const cols = map.tiles[0].length;
        const rows = map.tiles.length;

        //  Terrain
        for (let r = 0; r < rows; r++)
        {
            for (let c = 0; c < cols; c++)
            {
                const t = map.tiles[r][c];
                const colour = this.tileColour(t);
                const x = cell.x + c * TILE_PX + TILE_PX / 2;
                const y = cell.y + r * TILE_PX + TILE_PX / 2;

                this.add.rectangle(x, y, TILE_PX, TILE_PX, colour);
            }
        }

        //  Every known nav destination in this town, keyed by its world
        //  position, so tappable markers below can look up the right name
        const destinations = listKnownDestinations({ [map.id]: map });
        const destinationAt = (x: number, y: number) => destinations.find(d => d.x === x && d.y === y);

        //  Object houses and shops on top
        map.objects?.forEach(obj => {

            const cx = cell.x + (obj.col + (obj.w ?? 1) / 2) * TILE_PX;
            const cy = cell.y + (obj.row + (obj.h ?? 1) / 2) * TILE_PX;
            const worldX = (obj.col + (obj.w ?? (obj.type === 'yard' ? 3 : 1)) / 2) * TILE;
            const worldY = (obj.row + (obj.h ?? (obj.type === 'yard' ? 2 : 1)) / 2) * TILE;

            if (obj.sign)
            {
                //  A shop: emoji marker
                const emoji = obj.shopType === 'cafe' ? '☕' : obj.shopType === 'treat' ? '🍦' : '🏪';
                this.add.text(cx, cy, emoji, { fontSize: 26 }).setOrigin(0.5);
                this.makeNavZone(cx, cy, (obj.w ?? 1) * TILE_PX, (obj.h ?? 1) * TILE_PX, destinationAt(worldX, worldY));
            }
            else if (obj.type === 'yard')
            {
                this.add.rectangle(cx, cy, (obj.w ?? 3) * TILE_PX - 2, (obj.h ?? 2) * TILE_PX - 2, 0xbcaaa4).setStrokeStyle(2, 0x6d4c41);
                this.add.text(cx, cy, '🏗️', { fontSize: 24 }).setOrigin(0.5);
                this.makeNavZone(cx, cy, (obj.w ?? 3) * TILE_PX, (obj.h ?? 2) * TILE_PX, destinationAt(worldX, worldY));
            }
            else if (obj.type === 'house')
            {
                this.add.rectangle(cx, cy, (obj.w ?? 1) * TILE_PX - 4, (obj.h ?? 1) * TILE_PX - 4, 0xc8a878);
            }
            else if (obj.type === 'landmark')
            {
                const emoji = obj.kind === 'clock-tower' ? '🕰️'
                    : obj.kind === 'windmill' ? '🎡'
                    : obj.kind === 'pier' ? '⚓'
                    : '🗼';

                this.add.text(cx, cy, emoji, { fontSize: 22 }).setOrigin(0.5);
                this.makeNavZone(cx, cy, (obj.w ?? 1) * TILE_PX, (obj.h ?? 1) * TILE_PX, destinationAt(worldX, worldY));
            }
        });

        //  Border, highlighted for the town he's in
        const border = this.add.rectangle(cell.x + cols * TILE_PX / 2, cell.y + rows * TILE_PX / 2, cols * TILE_PX, rows * TILE_PX);
        border.setStrokeStyle(current ? 6 : 3, current ? 0xffeb3b : 0x102027);
        border.setFillStyle();

        this.add.text(cell.x + cols * TILE_PX / 2, cell.y + rows * TILE_PX + 18, map.name, {
            fontFamily: 'Arial Black', fontSize: 22, color: current ? '#ffeb3b' : '#ffffff'
        }).setOrigin(0.5);
    }

    //  Tapping a known destination's marker sets it as the compass target
    //  and closes the map — this is the whole "GPS" selection UI
    makeNavZone (cx: number, cy: number, w: number, h: number, dest: { id: string; name: string; mapId: string; x: number; y: number } | undefined)
    {
        if (!dest)
        {
            return;
        }

        const zone = this.add.zone(cx, cy, w, h).setInteractive();
        zone.on('pointerdown', () => {

            const driving = this.scene.get('Driving') as Driving;
            driving.setNavTarget(dest);
            this.close();

        });
    }

    tileColour (t: string): number
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

    drawConnectors (maps: Record<string, MapData>, cellOf: (id: string) => { x: number; y: number })
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
                        this.add.rectangle(cell.x + cols * TILE_PX + GAP / 2, y, GAP + 4, TILE_PX, 0x6d6d6d);
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
                        this.add.rectangle(x, cell.y + rows * TILE_PX + GAP / 2, TILE_PX, GAP + 4, 0x6d6d6d);
                    }
                }
            }
        }
    }

    drawPlayer (maps: Record<string, MapData>, cellOf: (id: string) => { x: number; y: number }, currentMap: string)
    {
        const driving = this.scene.get('Driving') as Driving;

        if (!driving?.car || !maps[currentMap])
        {
            return;
        }

        const cell = cellOf(currentMap);
        const col = Phaser.Math.Clamp(Math.floor(driving.car.x / TILE), 0, maps[currentMap].tiles[0].length - 1);
        const row = Phaser.Math.Clamp(Math.floor(driving.car.y / TILE), 0, maps[currentMap].tiles.length - 1);

        const x = cell.x + col * TILE_PX + TILE_PX / 2;
        const y = cell.y + row * TILE_PX + TILE_PX / 2;

        const marker = this.add.text(x, y, '🚗', { fontSize: 30 }).setOrigin(0.5);

        this.tweens.add({ targets: marker, scale: 1.3, duration: 500, yoyo: true, repeat: -1 });
    }

    //  Vehicles he's left parked out in the world (home ones live in the yard)
    drawFleet (maps: Record<string, MapData>, cellOf: (id: string) => { x: number; y: number })
    {
        const fleet = loadFleet();

        for (const [ , spot ] of Object.entries(fleet.parked))
        {
            const map = maps[spot.mapId];

            if (!map)
            {
                continue;
            }

            const cell = cellOf(spot.mapId);
            const col = Phaser.Math.Clamp(Math.floor(spot.x / TILE), 0, map.tiles[0].length - 1);
            const row = Phaser.Math.Clamp(Math.floor(spot.y / TILE), 0, map.tiles.length - 1);

            this.add.text(cell.x + col * TILE_PX + TILE_PX / 2, cell.y + row * TILE_PX + TILE_PX / 2, '🚙', { fontSize: 22 }).setOrigin(0.5);
        }
    }

    legendItem (x: number, y: number, emoji: string, label: string)
    {
        this.add.text(x, y, emoji, { fontSize: 30 }).setOrigin(0.5);
        this.add.text(x + 26, y, label, {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff'
        }).setOrigin(0, 0.5);
    }

    close ()
    {
        this.scene.resume('Driving');
        this.scene.resume('Dashboard');
        this.scene.stop();
    }
}
