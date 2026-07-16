import { Scene } from 'phaser';
import { buildCarShapes, CAR_MODELS } from '../carShapes';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { MapData, mapCacheKey, TILE } from '../mapBuilder';
import { loadFleet, loadPlayerName, saveFleet } from '../storage';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;
const YARD_MAP = 'home-town';

export class Yard extends Scene
{
    constructor ()
    {
        super('Yard');
    }

    create ()
    {
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();

        const panel = this.add.graphics();
        panel.fillStyle(0x37474f, 1);
        panel.fillRoundedRect(CX - 520, 150, 1040, 660, 24);
        panel.lineStyle(6, 0x102027, 1);
        panel.strokeRoundedRect(CX - 520, 150, 1040, 660, 24);

        const name = loadPlayerName().trim();
        const title = name.length > 0 ? `${name}'s Yard` : 'Builders\' Yard';

        this.add.text(CX, 200, `🏗️ ${title}`, {
            fontFamily: 'Arial Black', fontSize: 40, color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(CX, 250, 'Pick a vehicle to drive', {
            fontFamily: 'Arial Black', fontSize: 24, color: '#b0bec5'
        }).setOrigin(0.5);

        //  Close button
        this.add.circle(CX + 490, 200, 26, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(CX + 490, 200, 'X', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(CX + 490, 200, 80, 80).setInteractive().on('pointerdown', () => this.close());

        const fleet = loadFleet();
        const colour = this.registry.get('carColour') as number;

        //  Friendly town names for the "out at …" caption
        const townNames: Record<string, string> = {};

        for (const id of [ 'home-town', 'hill-town', 'beach-town', 'cove-town' ])
        {
            const m = this.cache.json.get(mapCacheKey(id)) as MapData | undefined;

            if (m)
            {
                townNames[id] = m.name;
            }
        }

        //  A card per vehicle, 4 across
        CAR_MODELS.forEach((model, i) => {

            const col = i % 4;
            const row = Math.floor(i / 4);
            const x = CX - 3 * 125 + col * 250;
            const y = 380 + row * 210;

            const isCurrent = model.key === fleet.current;
            const parked = fleet.parked[model.key];

            const card = this.add.rectangle(x, y, 220, 180, isCurrent ? 0x1b5e20 : 0x455a64);
            card.setStrokeStyle(6, isCurrent ? 0xffeb3b : 0x263238);

            const preview = this.add.container(x, y - 20, buildCarShapes(this, model.key, colour));
            preview.setScale(1.1);

            this.add.text(x, y + 52, model.name, {
                fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff'
            }).setOrigin(0.5);

            const status = isCurrent ? 'Driving now'
                : parked ? `Out at ${townNames[parked.mapId] ?? 'town'}`
                    : 'At the yard';

            this.add.text(x, y + 78, status, {
                fontFamily: 'Arial Black', fontSize: 15, color: isCurrent ? '#fff59d' : parked ? '#ffcc80' : '#b0bec5'
            }).setOrigin(0.5);

            this.add.zone(x, y, 230, 190).setInteractive().on('pointerdown', () => this.pickVehicle(model.key));

        });

        //  The one empty slot in the 4-across, 2-row grid — Car Wash, not
        //  a vehicle card
        const washX = CX - 3 * 125 + 3 * 250;
        const washY = 380 + 210;

        const washCard = this.add.rectangle(washX, washY, 220, 180, 0x0277bd);
        washCard.setStrokeStyle(6, 0x01579b);

        this.add.circle(washX, washY - 30, 30, 0x4fc3f7).setStrokeStyle(4, 0x0288d1);
        this.add.text(washX, washY - 30, '🧽', { fontSize: 34 }).setOrigin(0.5);

        this.add.text(washX, washY + 52, 'Car Wash', {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(washX, washY + 78, 'Give it a scrub', {
            fontFamily: 'Arial Black', fontSize: 15, color: '#b3e5fc'
        }).setOrigin(0.5);

        this.add.zone(washX, washY, 230, 190).setInteractive().on('pointerdown', () => this.openCarWash());
    }

    openCarWash ()
    {
        this.scene.launch('CarWash');
        this.scene.pause();
    }

    //  Whether the given world position sits inside the yard, in which case
    //  a dropped vehicle just goes home rather than being left on the spot
    inYard (mapId: string, x: number, y: number): boolean
    {
        if (mapId !== YARD_MAP)
        {
            return false;
        }

        const map = this.cache.json.get(mapCacheKey(YARD_MAP)) as MapData | undefined;
        const yardObj = map?.objects?.find(o => o.type === 'yard');

        if (!yardObj)
        {
            return false;
        }

        const w = yardObj.w ?? 3;
        const h = yardObj.h ?? 2;

        return x >= yardObj.col * TILE && x <= (yardObj.col + w) * TILE
            && y >= yardObj.row * TILE && y <= (yardObj.row + h) * TILE;
    }

    pickVehicle (model: string)
    {
        const driving = this.scene.get('Driving') as Driving;
        const fleet = loadFleet();

        if (model !== fleet.current)
        {
            //  Leave his current vehicle exactly where he stopped (unless he's
            //  standing in the yard, in which case it just goes home)
            const mapId = this.registry.get('mapId') as string;

            if (!this.inYard(mapId, driving.car.x, driving.car.y))
            {
                fleet.parked[fleet.current] = { mapId, x: driving.car.x, y: driving.car.y, heading: driving.heading };
            }
        }

        //  The picked vehicle is recalled to the yard and driven from there
        delete fleet.parked[model];
        fleet.current = model;
        saveFleet(fleet);

        driving.scene.restart({ mapId: YARD_MAP, fromYard: true });
        this.scene.resume('Dashboard');
        this.scene.stop();
    }

    close ()
    {
        this.scene.resume('Driving');
        this.scene.resume('Dashboard');
        this.scene.stop();
    }
}
