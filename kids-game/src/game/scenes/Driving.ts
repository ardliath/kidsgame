import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapes, DEFAULT_COLOUR, DEFAULT_MODEL } from '../carShapes';
import { GAME_WIDTH, VIEW_HEIGHT } from '../layout';
import { loadCarStyle, SaveData } from '../storage';

const WORLD_SIZE = 2400;
const START_X = 1200;
const START_Y = 1500;

//  Centre lines of the roads that cross the town, and how wide they are
const ROADS = [400, 1200, 2000];
const ROAD_WIDTH = 160;

const HOUSE_COLOURS = [0xef9a9a, 0x90caf9, 0xffcc80, 0xa5d6a7, 0xce93d8, 0xfff59d, 0x80cbc4, 0xffab91];

export class Driving extends Scene
{
    car: Phaser.GameObjects.Container;
    speed = 0;
    heading = 0;

    constructor ()
    {
        super('Driving');
    }

    create ()
    {
        this.speed = 0;
        this.heading = 0;

        //  The Dashboard scene writes these, we read them every frame
        this.registry.set('steering', 0);
        this.registry.set('throttle', 0);
        this.registry.set('gear', 1);

        //  Remember the car the player chose last time
        const style = loadCarStyle();
        this.registry.set('carColour', style?.colour ?? DEFAULT_COLOUR);
        this.registry.set('carModel', style?.model ?? DEFAULT_MODEL);

        //  Extra pointers so the wheel, pedal and gear stick work at the same time
        this.input.addPointer(3);

        this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

        const obstacles = this.buildTown();

        this.car = this.buildCar(START_X, START_Y);

        this.physics.add.collider(this.car, obstacles);

        //  Repaint the car when the options screen changes it
        this.registry.events.on('changedata-carColour', this.restyleCar, this);
        this.registry.events.on('changedata-carModel', this.restyleCar, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.registry.events.off('changedata-carColour', this.restyleCar, this);
            this.registry.events.off('changedata-carModel', this.restyleCar, this);
        });

        const cam = this.cameras.main;
        cam.setViewport(0, 0, GAME_WIDTH, VIEW_HEIGHT);
        cam.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
        cam.startFollow(this.car, true, 0.08, 0.08);

        this.scene.launch('Dashboard');
    }

    buildTown (): Phaser.Physics.Arcade.StaticGroup
    {
        //  Grass
        this.add.rectangle(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 0x7cb342);

        //  Kerbs, then the roads on top of them
        for (const road of ROADS)
        {
            this.add.rectangle(road, WORLD_SIZE / 2, ROAD_WIDTH + 24, WORLD_SIZE, 0x9e9e9e);
            this.add.rectangle(WORLD_SIZE / 2, road, WORLD_SIZE, ROAD_WIDTH + 24, 0x9e9e9e);
        }

        for (const road of ROADS)
        {
            this.add.rectangle(road, WORLD_SIZE / 2, ROAD_WIDTH, WORLD_SIZE, 0x555555);
            this.add.rectangle(WORLD_SIZE / 2, road, WORLD_SIZE, ROAD_WIDTH, 0x555555);
        }

        //  Dashed centre lines, skipping the junctions
        const nearRoad = (v: number) => ROADS.some(r => Math.abs(v - r) < 130);

        for (const road of ROADS)
        {
            for (let p = 60; p < WORLD_SIZE; p += 120)
            {
                if (!nearRoad(p))
                {
                    this.add.rectangle(road, p, 8, 44, 0xffffff);
                    this.add.rectangle(p, road, 44, 8, 0xffffff);
                }
            }
        }

        const obstacles = this.physics.add.staticGroup();

        //  The blocks of land between the roads
        const blocks: [number, number][] = [];
        let start = 0;

        for (const road of ROADS)
        {
            blocks.push([ start, road - ROAD_WIDTH / 2 - 12 ]);
            start = road + ROAD_WIDTH / 2 + 12;
        }

        blocks.push([ start, WORLD_SIZE ]);

        let n = 0;

        for (const [ x0, x1 ] of blocks)
        {
            for (const [ y0, y1 ] of blocks)
            {
                const w = x1 - x0;
                const h = y1 - y0;
                const cols = w > 400 ? 2 : 1;
                const rows = h > 400 ? 2 : 1;

                for (let cx = 0; cx < cols; cx++)
                {
                    for (let cy = 0; cy < rows; cy++)
                    {
                        const hx = x0 + w * (cx + 1) / (cols + 1);
                        const hy = y0 + h * (cy + 1) / (rows + 1);
                        const colour = HOUSE_COLOURS[n % HOUSE_COLOURS.length];
                        const size = 140 + (n % 3) * 25;
                        const darker = Phaser.Display.Color.IntegerToColor(colour).darken(35).color;

                        const house = this.add.rectangle(hx, hy, size, size, colour);
                        house.setStrokeStyle(8, darker);

                        //  Roof ridge line
                        this.add.rectangle(hx, hy, size - 16, 12, darker);

                        this.physics.add.existing(house, true);
                        obstacles.add(house);

                        n++;
                    }
                }

                //  A couple of trees in the bigger blocks
                if (w > 400 && h > 400)
                {
                    for (const [ tx, ty ] of [ [ x0 + 80, y0 + 80 ], [ x1 - 80, y1 - 80 ] ])
                    {
                        const tree = this.add.circle(tx, ty, 34, 0x2e7d32);
                        this.add.circle(tx, ty, 20, 0x43a047);

                        this.physics.add.existing(tree, true);
                        (tree.body as Phaser.Physics.Arcade.StaticBody).setCircle(34);
                        obstacles.add(tree);
                    }
                }
            }
        }

        return obstacles;
    }

    buildCar (x: number, y: number): Phaser.GameObjects.Container
    {
        //  Drawn pointing up, so rotation 0 = heading 0 = north
        const car = this.add.container(x, y);

        car.add(buildCarShapes(this, this.registry.get('carModel') as string, this.registry.get('carColour') as number));

        car.setSize(68, 68);
        this.physics.add.existing(car);

        const physicsBody = car.body as Phaser.Physics.Arcade.Body;
        physicsBody.setCircle(34);
        physicsBody.setCollideWorldBounds(true);

        return car;
    }

    restyleCar ()
    {
        this.car.removeAll(true);
        this.car.add(buildCarShapes(this, this.registry.get('carModel') as string, this.registry.get('carColour') as number));
    }

    resetCar ()
    {
        (this.car.body as Phaser.Physics.Arcade.Body).reset(START_X, START_Y);
        this.car.rotation = 0;
        this.heading = 0;
        this.speed = 0;
    }

    getSaveData (): SaveData
    {
        return {
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

        (this.car.body as Phaser.Physics.Arcade.Body).reset(data.x, data.y);
        this.car.rotation = data.heading;
        this.heading = data.heading;
        this.speed = 0;
    }

    update (_time: number, delta: number)
    {
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
    }
}
