import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapes, DEFAULT_COLOUR, DEFAULT_MODEL } from '../carShapes';
import { GAME_WIDTH, VIEW_HEIGHT } from '../layout';
import { buildMap, DEFAULT_MAP, Edge, MapData, mapCacheKey, PlacedHouse, TILE } from '../mapBuilder';
import { loadCarStyle, SaveData } from '../storage';

interface EntryState
{
    x: number;
    y: number;
    heading: number;
    speed: number;
}

interface DrivingData
{
    mapId?: string;
    entry?: EntryState;
}

export class Driving extends Scene
{
    car: Phaser.GameObjects.Container;
    speed = 0;
    heading = 0;

    map: MapData;
    mapWidth = 0;
    mapHeight = 0;
    startPos: { x: number; y: number };
    houses: PlacedHouse[] = [];
    transitioning = false;
    sceneData: DrivingData = {};

    constructor ()
    {
        super('Driving');
    }

    init (data: DrivingData)
    {
        this.sceneData = data ?? {};
    }

    create ()
    {
        this.speed = this.sceneData.entry?.speed ?? 0;
        this.heading = this.sceneData.entry?.heading ?? 0;
        this.transitioning = false;

        //  First boot only — map changes keep whatever the player was doing
        if (this.registry.get('gear') === undefined)
        {
            this.registry.set('steering', 0);
            this.registry.set('throttle', 0);
            this.registry.set('gear', 1);
        }

        if (this.registry.get('carColour') === undefined)
        {
            const style = loadCarStyle();
            this.registry.set('carColour', style?.colour ?? DEFAULT_COLOUR);
            this.registry.set('carModel', style?.model ?? DEFAULT_MODEL);
        }

        //  Extra pointers so the wheel, pedal and gear stick work at the same time
        this.input.addPointer(3);

        const mapId = this.sceneData.mapId ?? DEFAULT_MAP;
        this.registry.set('mapId', mapId);
        this.map = this.cache.json.get(mapCacheKey(mapId)) as MapData;

        const built = buildMap(this, this.map);
        this.mapWidth = built.width;
        this.mapHeight = built.height;
        this.startPos = built.start;
        this.houses = built.houses;

        this.physics.world.setBounds(0, 0, built.width, built.height);

        const spawn = this.sceneData.entry ?? this.startPos;
        this.car = this.buildCar(spawn.x, spawn.y);
        this.car.rotation = this.heading;

        this.physics.add.collider(this.car, built.obstacles);

        //  Repaint the car when the options screen changes it
        this.registry.events.on('changedata-carColour', this.restyleCar, this);
        this.registry.events.on('changedata-carModel', this.restyleCar, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.registry.events.off('changedata-carColour', this.restyleCar, this);
            this.registry.events.off('changedata-carModel', this.restyleCar, this);
        });

        const cam = this.cameras.main;
        cam.setViewport(0, 0, GAME_WIDTH, VIEW_HEIGHT);
        cam.setBounds(0, 0, built.width, built.height);
        cam.startFollow(this.car, true, 0.08, 0.08);
        cam.fadeIn(200, 16, 32, 39);

        //  Town name, fades out after a moment
        const label = this.add.text(20, 16, this.map.name, {
            fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff',
            stroke: '#000000', strokeThickness: 6
        }).setScrollFactor(0);

        this.tweens.add({ targets: label, alpha: 0, delay: 1500, duration: 500 });

        if (!this.scene.isActive('Dashboard'))
        {
            this.scene.launch('Dashboard');
        }
    }

    buildCar (x: number, y: number): Phaser.GameObjects.Container
    {
        //  Drawn pointing up, so rotation 0 = heading 0 = north
        const car = this.add.container(x, y);

        car.add(buildCarShapes(this, this.registry.get('carModel') as string, this.registry.get('carColour') as number));

        car.setSize(68, 68);
        this.physics.add.existing(car);

        (car.body as Phaser.Physics.Arcade.Body).setCircle(34);

        return car;
    }

    restyleCar ()
    {
        this.car.removeAll(true);
        this.car.add(buildCarShapes(this, this.registry.get('carModel') as string, this.registry.get('carColour') as number));
    }

    resetCar ()
    {
        if (this.registry.get('mapId') !== DEFAULT_MAP)
        {
            this.scene.restart({ mapId: DEFAULT_MAP });

            return;
        }

        (this.car.body as Phaser.Physics.Arcade.Body).reset(this.startPos.x, this.startPos.y);
        this.car.rotation = 0;
        this.heading = 0;
        this.speed = 0;
    }

    getSaveData (): SaveData
    {
        return {
            mapId: this.registry.get('mapId') as string,
            x: this.car.x,
            y: this.car.y,
            heading: this.heading,
            gear: this.registry.get('gear') as number,
            carColour: this.registry.get('carColour') as number,
            carModel: this.registry.get('carModel') as string
        };
    }

    applySave (data: SaveData)
    {
        this.registry.set('carColour', data.carColour);
        this.registry.set('carModel', data.carModel);

        const mapId = data.mapId ?? DEFAULT_MAP;

        if (mapId !== this.registry.get('mapId'))
        {
            this.scene.restart({ mapId, entry: { x: data.x, y: data.y, heading: data.heading, speed: 0 } });

            return;
        }

        (this.car.body as Phaser.Physics.Arcade.Body).reset(data.x, data.y);
        this.car.rotation = data.heading;
        this.heading = data.heading;
        this.speed = 0;
    }

    exitMap (edge: Edge)
    {
        const target = this.map.exits?.[edge];

        if (!target || this.transitioning)
        {
            return;
        }

        this.transitioning = true;

        const targetMap = this.cache.json.get(mapCacheKey(target)) as MapData;
        const targetWidth = targetMap.tiles[0].length * TILE;
        const targetHeight = targetMap.tiles.length * TILE;

        //  Enter the next map from the opposite edge, keeping pace and direction
        const entry: EntryState = {
            x: this.car.x,
            y: this.car.y,
            heading: this.heading,
            speed: this.speed
        };

        if (edge === 'east') entry.x = 44;
        if (edge === 'west') entry.x = targetWidth - 44;
        if (edge === 'south') entry.y = 44;
        if (edge === 'north') entry.y = targetHeight - 44;

        this.cameras.main.fadeOut(180, 16, 32, 39);

        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.scene.restart({ mapId: target, entry });
        });
    }

    update (_time: number, delta: number)
    {
        if (this.transitioning)
        {
            return;
        }

        const dt = delta / 1000;

        const steering = (this.registry.get('steering') as number) ?? 0;
        const throttle = (this.registry.get('throttle') as number) ?? 0;
        const gear = (this.registry.get('gear') as number) ?? 1;

        //  Gear 1 = forwards, gear 2 = fast, R = backwards
        const topSpeed = gear === 2 ? 330 : gear === 1 ? 170 : -120;
        const target = throttle * topSpeed;
        const rate = throttle > 0 ? 240 : 280;

        if (this.speed < target)
        {
            this.speed = Math.min(this.speed + rate * dt, target);
        }
        else
        {
            this.speed = Math.max(this.speed - rate * dt, target);
        }

        //  Can only turn while moving; steering flips when reversing, like a real car
        const grip = Phaser.Math.Clamp(Math.abs(this.speed) / 130, 0, 1);
        this.heading += steering * 2.4 * grip * Math.sign(this.speed) * dt;

        const body = this.car.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(Math.sin(this.heading) * this.speed, -Math.cos(this.heading) * this.speed);

        this.car.rotation = this.heading;

        //  The dashboard speedo reads this
        this.registry.set('speed', Math.abs(this.speed));

        //  Through a gap in the edge walls and off the map = drive to the next town
        const margin = 20;

        if (this.car.x > this.mapWidth + margin)
        {
            this.exitMap('east');
        }
        else if (this.car.x < -margin)
        {
            this.exitMap('west');
        }
        else if (this.car.y > this.mapHeight + margin)
        {
            this.exitMap('south');
        }
        else if (this.car.y < -margin)
        {
            this.exitMap('north');
        }
    }
}
