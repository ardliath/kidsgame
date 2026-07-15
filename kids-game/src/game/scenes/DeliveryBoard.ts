import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { DeliveriesConfig, DeliveryJob, generateJob } from '../deliveries';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { MAP_IDS, MapData, mapCacheKey, parseColour } from '../mapBuilder';
import { drawConnectors, drawTownGrid, GAP, layoutTowns, TILE_PX } from '../townGrid';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;

//  A graphical job board: no reading required to understand it — the pickup
//  and drop-off are highlighted with pulsing rings on the same town-grid
//  view as the MiniMap, and he taps ACCEPT or REJECT.
export class DeliveryBoard extends Scene
{
    job: DeliveryJob | null = null;

    constructor ()
    {
        super('DeliveryBoard');
    }

    create ()
    {
        this.job = null;

        //  Dim the game behind and swallow stray taps
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setInteractive();

        const driving = this.scene.get('Driving') as Driving;

        const maps: Record<string, MapData> = {};

        for (const id of MAP_IDS)
        {
            const data = this.cache.json.get(mapCacheKey(id)) as MapData | undefined;

            if (data)
            {
                maps[id] = data;
            }
        }

        //  No job waiting? Offer a fresh one now.
        let job = driving.deliveryJob;

        if (!job)
        {
            const config = this.cache.json.get('deliveries') as DeliveriesConfig;
            job = generateJob(maps, config.parcels);

            if (job)
            {
                driving.setDeliveryJob(job);
            }
        }

        this.job = job;

        //  Same town-grid layout as the MiniMap, so it reads as "the map,
        //  with today's job marked on it" rather than a different screen
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
        const originY = 190;

        const panel = this.add.graphics();
        panel.fillStyle(0x263238, 1);
        panel.fillRoundedRect(originX - 40, 100, totalW + 80, totalH + 260, 24);
        panel.lineStyle(6, 0x102027, 1);
        panel.strokeRoundedRect(originX - 40, 100, totalW + 80, totalH + 260, 24);

        this.add.text(CX, 148, 'Delivery Job!', {
            fontFamily: 'Arial Black', fontSize: 40, color: '#ffffff'
        }).setOrigin(0.5);

        //  Close button — dismisses without deciding, the job stays offered
        this.add.circle(originX + totalW + 20, 148, 26, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(originX + totalW + 20, 148, 'X', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(originX + totalW + 20, 148, 80, 80).setInteractive().on('pointerdown', () => this.close());

        if (!job)
        {
            //  Nothing to offer (shouldn't happen with the shipped maps)
            this.add.text(CX, originY + totalH / 2, 'No deliveries to offer right now!', {
                fontFamily: 'Arial Black', fontSize: 24, color: '#ffffff'
            }).setOrigin(0.5);

            return;
        }

        const cellOf = (id: string) => ({
            x: originX + (pos[id].gx - minGx) * (cellW + GAP),
            y: originY + (pos[id].gy - minGy) * (cellH + GAP)
        });

        drawConnectors(this, maps, cellOf);

        const currentMap = this.registry.get('mapId') as string;

        for (const id of Object.keys(maps))
        {
            const markers = drawTownGrid(this, maps[id], cellOf(id), id === currentMap);

            for (const marker of markers)
            {
                if (marker.obj.id === job.pickupId)
                {
                    this.pulseMarker(marker.cx, marker.cy, 0xff7043);
                }
                else if (marker.obj.id === job.dropoffId)
                {
                    this.pulseMarker(marker.cx, marker.cy, 0x66bb6a);
                }
            }
        }

        //  Caption row: the parcel, and what to do with it — plain colour
        //  blobs rather than reading the names is the point, the names are
        //  just there for whichever adult is watching over his shoulder
        const config = this.cache.json.get('deliveries') as DeliveriesConfig;
        const parcel = config.parcels.find(p => p.id === job.parcelId);
        const captionY = originY + totalH + 50;

        this.add.circle(CX - 250, captionY, 18, parseColour(parcel?.colour, 0x8d6e63)).setStrokeStyle(3, 0x263238);
        this.add.text(CX - 210, captionY - 12, `Pick up: ${job.pickupName}`, {
            fontFamily: 'Arial Black', fontSize: 20, color: '#ff8a65'
        }).setOrigin(0, 0.5);
        this.add.text(CX - 210, captionY + 16, `Deliver to: ${job.dropoffName}`, {
            fontFamily: 'Arial Black', fontSize: 20, color: '#aed581'
        }).setOrigin(0, 0.5);

        if (job.state === 'offered')
        {
            this.makeButton(CX + 190, captionY - 20, 'ACCEPT', 0x43a047, () => this.accept());
            this.makeButton(CX + 190, captionY + 34, 'REJECT', 0xef5350, () => this.reject());
        }

        this.input.keyboard?.on('keydown-ESC', () => this.close());
    }

    pulseMarker (cx: number, cy: number, colour: number)
    {
        const ring = this.add.circle(cx, cy, 18);
        ring.setStrokeStyle(4, colour);

        this.tweens.add({ targets: ring, scale: 1.5, alpha: 0.2, duration: 550, yoyo: true, repeat: -1 });
    }

    makeButton (x: number, y: number, label: string, colour: number, onTap: () => void)
    {
        const dark = Phaser.Display.Color.IntegerToColor(colour).darken(35).color;

        const g = this.add.graphics();
        g.fillStyle(colour, 1);
        g.fillRoundedRect(x - 85, y - 24, 170, 48, 14);
        g.lineStyle(4, dark, 1);
        g.strokeRoundedRect(x - 85, y - 24, 170, 48, 14);

        this.add.text(x, y, label, {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff'
        }).setOrigin(0.5);

        this.add.zone(x, y, 180, 58).setInteractive().on('pointerdown', onTap);
    }

    accept ()
    {
        if (!this.job)
        {
            return;
        }

        const driving = this.scene.get('Driving') as Driving;
        driving.setDeliveryJob({ ...this.job, state: 'accepted' });
        this.close();
    }

    reject ()
    {
        const driving = this.scene.get('Driving') as Driving;
        driving.setDeliveryJob(null);
        this.close();
    }

    close ()
    {
        this.scene.resume('Driving');
        this.scene.resume('Dashboard');
        this.scene.stop();
    }
}
