import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapes, DEFAULT_COLOUR, DEFAULT_MODEL } from '../carShapes';
import { GAME_WIDTH, VIEW_HEIGHT } from '../layout';
import { buildMap, DEFAULT_MAP, Edge, MapData, mapCacheKey, PlacedHouse, PlacedNpcCar, PlacedSite, TILE } from '../mapBuilder';
import { loadCarStyle, loadCoins, loadCurrentMap, saveCurrentMap, SaveData } from '../storage';
import { Dashboard } from './Dashboard';

//  Speed at which steering reaches full grip, and the fastest the car can
//  turn once gripped. Turn radius at full lock bottoms out at
//  GRIP_SPEED / MAX_TURN_RATE, so these two together set how tight a
//  corner feels — keep that above ~half a tile or it starts to spin in place.
const GRIP_SPEED = 130;
const MAX_TURN_RATE = 1.1;

//  NPC traffic: a gentle constant speed, and the four directions they can
//  choose between at each tile centre
const NPC_SPEED = 80;

const NPC_DIRS: { dx: number; dy: number; heading: number }[] = [
    { dx: 0, dy: -1, heading: 0 },
    { dx: 1, dy: 0, heading: Math.PI / 2 },
    { dx: 0, dy: 1, heading: Math.PI },
    { dx: -1, dy: 0, heading: -Math.PI / 2 }
];

interface NpcCarState
{
    container: Phaser.GameObjects.Container;
    heading: number;
    targetX: number;
    targetY: number;
    stuckTime: number;
}

interface EntryState
{
    x: number;
    y: number;
    heading: number;
    speed: number;
}

//  What the pop-up bubble beside the car offers: building on a plot,
//  visiting a house, or going into a shop
type ActionTarget =
    { kind: 'build'; site: PlacedSite } |
    { kind: 'visit'; house: PlacedHouse } |
    { kind: 'shop'; house: PlacedHouse };

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
    sites: PlacedSite[] = [];
    npcCars: NpcCarState[] = [];
    npcGroup: Phaser.Physics.Arcade.Group;

    actionBubble: Phaser.GameObjects.Container;
    bubbleBg: Phaser.GameObjects.Rectangle;
    bubbleLabel: Phaser.GameObjects.Text;
    bubbleTarget: ActionTarget | null = null;
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

        if (this.registry.get('coins') === undefined)
        {
            this.registry.set('coins', loadCoins());
        }

        //  Extra pointers so the wheel, pedal and gear stick work at the same time
        this.input.addPointer(3);

        //  Fresh boots resume in the town he was last driving in
        let mapId = this.sceneData.mapId ?? loadCurrentMap() ?? DEFAULT_MAP;

        if (!this.cache.json.get(mapCacheKey(mapId)))
        {
            mapId = DEFAULT_MAP;
        }

        this.registry.set('mapId', mapId);
        saveCurrentMap(mapId);
        this.map = this.cache.json.get(mapCacheKey(mapId)) as MapData;

        const built = buildMap(this, this.map);
        this.mapWidth = built.width;
        this.mapHeight = built.height;
        this.startPos = built.start;
        this.houses = built.houses;
        this.sites = built.sites;
        this.bubbleTarget = null;

        this.physics.world.setBounds(0, 0, built.width, built.height);

        const spawn = this.sceneData.entry ?? this.startPos;
        this.car = this.buildCar(spawn.x, spawn.y);
        this.car.rotation = this.heading;

        this.physics.add.collider(this.car, built.obstacles);

        this.setupNpcCars(built.npcCars, built.obstacles);

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
        const label = this.add.text(20, 64, this.map.name, {
            fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff',
            stroke: '#000000', strokeThickness: 6
        }).setScrollFactor(0);

        this.tweens.add({ targets: label, alpha: 0, delay: 1500, duration: 500 });

        this.createCoinHud();

        this.createActionBubble();

        this.input.keyboard?.on('keydown-ENTER', () => {

            if (this.bubbleTarget)
            {
                this.openAction(this.bubbleTarget);
            }

        });

        if (!this.scene.isActive('Dashboard'))
        {
            this.scene.launch('Dashboard');
        }
    }

    createCoinHud ()
    {
        const bg = this.add.rectangle(0, 0, 130, 48, 0x102027, 0.65);
        bg.setStrokeStyle(3, 0xffd54f);

        const coin = this.add.circle(-38, 0, 15, 0xffd54f).setStrokeStyle(3, 0xf9a825);

        const count = this.add.text(10, 0, String(this.registry.get('coins') ?? 0), {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffd54f'
        }).setOrigin(0.5);

        const hud = this.add.container(90, 40, [ bg, coin, count ]);
        hud.setScrollFactor(0);
        hud.setDepth(200);

        const onCoins = (_parent: unknown, value: number) => count.setText(String(value));
        this.registry.events.on('changedata-coins', onCoins);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.registry.events.off('changedata-coins', onCoins);
        });
    }

    createActionBubble ()
    {
        this.bubbleBg = this.add.rectangle(0, 0, 170, 56, 0xffeb3b);
        this.bubbleBg.setStrokeStyle(5, 0x795548);

        this.bubbleLabel = this.add.text(0, 0, 'BUILD', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#5d4037'
        }).setOrigin(0.5);

        this.actionBubble = this.add.container(0, 0, [ this.bubbleBg, this.bubbleLabel ]);
        this.actionBubble.setDepth(100);
        this.actionBubble.setVisible(false);

        this.bubbleBg.setInteractive().on('pointerdown', () => {

            if (this.bubbleTarget)
            {
                this.openAction(this.bubbleTarget);
            }

        });
    }

    updateActionBubble (time: number)
    {
        const candidates: { distance: number; target: ActionTarget }[] = [];

        const consider = (x: number, y: number, w: number, h: number, target: ActionTarget) => {

            const dx = Math.max(Math.abs(this.car.x - x) - w / 2, 0);
            const dy = Math.max(Math.abs(this.car.y - y) - h / 2, 0);

            candidates.push({ distance: Math.hypot(dx, dy), target });
        };

        for (const site of this.sites)
        {
            consider(site.x, site.y, site.width, site.height, { kind: 'build', site });
        }

        for (const house of this.houses)
        {
            if (!house.sign)
            {
                //  Ordinary houses can be visited
                consider(house.x, house.y, house.width, house.height, { kind: 'visit', house });
            }
            else if (house.sells && house.sells.length > 0)
            {
                //  Signed buildings with stock are shops
                consider(house.x, house.y, house.width, house.height, { kind: 'shop', house });
            }
        }

        let best: ActionTarget | null = null;
        let bestDistance = 120;

        for (const candidate of candidates)
        {
            if (candidate.distance < bestDistance)
            {
                best = candidate.target;
                bestDistance = candidate.distance;
            }
        }

        //  Only offer it when the car has more or less stopped alongside
        const slow = Math.abs(this.speed) < 60;

        this.bubbleTarget = slow && !this.transitioning ? best : null;

        if (this.bubbleTarget)
        {
            const at = this.bubbleTarget.kind === 'build' ? this.bubbleTarget.site : this.bubbleTarget.house;

            if (this.bubbleTarget.kind === 'build')
            {
                this.bubbleBg.setFillStyle(0xffeb3b);
                this.bubbleBg.setStrokeStyle(5, 0x795548);
                this.bubbleLabel.setText('BUILD').setColor('#5d4037');
            }
            else if (this.bubbleTarget.kind === 'visit')
            {
                this.bubbleBg.setFillStyle(0xe1f5fe);
                this.bubbleBg.setStrokeStyle(5, 0x0277bd);
                this.bubbleLabel.setText('VISIT').setColor('#01579b');
            }
            else if (this.bubbleTarget.house.shopType === 'treat')
            {
                this.bubbleBg.setFillStyle(0xfce4ec);
                this.bubbleBg.setStrokeStyle(5, 0xd81b60);
                this.bubbleLabel.setText('TREAT').setColor('#880e4f');
            }
            else
            {
                this.bubbleBg.setFillStyle(0xc8e6c9);
                this.bubbleBg.setStrokeStyle(5, 0x2e7d32);
                this.bubbleLabel.setText('SHOP').setColor('#1b5e20');
            }

            this.actionBubble.setVisible(true);
            this.actionBubble.setPosition(at.x, at.y - at.height / 2 - 46 + Math.sin(time / 280) * 5);
        }
        else
        {
            this.actionBubble.setVisible(false);
        }
    }

    openAction (target: ActionTarget)
    {
        const dashboard = this.scene.get('Dashboard') as Dashboard;
        dashboard.releaseControls();

        if (target.kind === 'build')
        {
            this.scene.launch('Builder', { siteId: target.site.id });
        }
        else if (target.kind === 'visit')
        {
            this.scene.launch('Interior', { houseId: target.house.id, colour: target.house.colour });
        }
        else if (target.house.shopType === 'treat')
        {
            this.scene.launch('IceCream', { houseId: target.house.id, colour: target.house.colour, sells: target.house.sells ?? [] });
        }
        else
        {
            this.scene.launch('Shop', { houseId: target.house.id, colour: target.house.colour, sells: target.house.sells ?? [] });
        }

        this.scene.pause('Dashboard');
        this.scene.pause();
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

    //  ---- NPC traffic: cars that drive themselves along the road tiles ----

    setupNpcCars (placed: PlacedNpcCar[], obstacles: Phaser.Physics.Arcade.StaticGroup)
    {
        this.npcCars = [];
        this.npcGroup = this.physics.add.group();

        for (const npc of placed)
        {
            this.npcGroup.add(npc.container);

            const state: NpcCarState = {
                container: npc.container,
                heading: npc.heading,
                targetX: (npc.col + 0.5) * TILE,
                targetY: (npc.row + 0.5) * TILE,
                stuckTime: 0
            };

            //  Work out its first real destination tile from its starting spot
            this.pickNextNpcTarget(state);

            this.npcCars.push(state);
        }

        this.physics.add.collider(this.car, this.npcGroup);
        this.physics.add.collider(this.npcGroup, obstacles);
    }

    isRoadTile (col: number, row: number): boolean
    {
        return row >= 0 && row < this.map.tiles.length && col >= 0 && col < this.map.tiles[0].length
            && this.map.tiles[row][col] === 'R';
    }

    //  Chooses where an NPC drives to next, from the tile it's just reached.
    //  Never reverses unless that's the only way forward (a dead end).
    pickNextNpcTarget (npc: NpcCarState)
    {
        const col = Math.round(npc.targetX / TILE - 0.5);
        const row = Math.round(npc.targetY / TILE - 0.5);

        const reverseHeading = Phaser.Math.Angle.Wrap(npc.heading + Math.PI);
        const valid = NPC_DIRS.filter(d => this.isRoadTile(col + d.dx, row + d.dy));
        const notReversing = valid.filter(d => Math.abs(Phaser.Math.Angle.Wrap(d.heading - reverseHeading)) > 0.1);

        const pool = notReversing.length > 0 ? notReversing : valid;
        const choice = pool.length > 0 ? Phaser.Utils.Array.GetRandom(pool) : null;

        if (choice)
        {
            npc.heading = choice.heading;
            npc.targetX = (col + choice.dx + 0.5) * TILE;
            npc.targetY = (row + choice.dy + 0.5) * TILE;
        }
        else
        {
            //  Nowhere valid to go (shouldn't happen on a well-formed map) —
            //  just keep going the way it was facing rather than freeze
            npc.targetX += Math.sin(npc.heading) * TILE;
            npc.targetY -= Math.cos(npc.heading) * TILE;
        }

        npc.stuckTime = 0;
    }

    updateNpcCars (dt: number)
    {
        for (const npc of this.npcCars)
        {
            const body = npc.container.body as Phaser.Physics.Arcade.Body;

            body.setVelocity(Math.sin(npc.heading) * NPC_SPEED, -Math.cos(npc.heading) * NPC_SPEED);
            npc.container.rotation = npc.heading;

            const distance = Phaser.Math.Distance.Between(npc.container.x, npc.container.y, npc.targetX, npc.targetY);

            //  A stuck timer covers the rare case another car or the player
            //  blocks it from ever quite reaching its target tile
            npc.stuckTime += dt;

            if (distance < 6 || npc.stuckTime > 5)
            {
                body.reset(npc.targetX, npc.targetY);
                this.pickNextNpcTarget(npc);
            }
        }
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

    update (time: number, delta: number)
    {
        if (this.transitioning)
        {
            return;
        }

        this.updateActionBubble(time);

        const dt = delta / 1000;

        this.updateNpcCars(dt);

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

        //  Can only turn while moving; steering flips when reversing, like a real car.
        //  Turn radius at full lock is GRIP_SPEED / MAX_TURN_RATE once gripped,
        //  so tune those two to make corners feel like a curve, not a spin.
        const grip = Phaser.Math.Clamp(Math.abs(this.speed) / GRIP_SPEED, 0, 1);
        this.heading += steering * MAX_TURN_RATE * grip * Math.sign(this.speed) * dt;

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
