import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { MAP_IDS, MapData, mapCacheKey, TILE } from '../mapBuilder';
import { listKnownDestinations, NavDestination } from '../navigation';
import { loadFleet } from '../storage';
import { drawConnectors, drawTownGrid, GAP, layoutTowns, TILE_PX } from '../townGrid';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;

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
        const pos = layoutTowns(maps);

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
        drawConnectors(this, maps, cellOf);

        const currentMap = this.registry.get('mapId') as string;

        for (const id of Object.keys(maps))
        {
            const markers = drawTownGrid(this, maps[id], cellOf(id), id === currentMap);
            const destinations = listKnownDestinations({ [id]: maps[id] });

            //  Tapping a known destination's marker sets it as the compass
            //  target and closes the map — this is the whole "GPS" UI
            for (const marker of markers)
            {
                const obj = marker.obj;
                const w = obj.w ?? (obj.type === 'yard' ? 3 : 1);
                const h = obj.h ?? (obj.type === 'yard' ? 2 : 1);
                const worldX = (obj.col + w / 2) * TILE;
                const worldY = (obj.row + h / 2) * TILE;
                const dest = destinations.find(d => d.x === worldX && d.y === worldY);

                this.makeNavZone(marker.cx, marker.cy, w * TILE_PX, h * TILE_PX, dest);
            }
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

    //  Tapping a known destination's marker sets it as the compass target
    //  and closes the map — this is the whole "GPS" selection UI
    makeNavZone (cx: number, cy: number, w: number, h: number, dest: NavDestination | undefined)
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
