import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapes, CAR_MODELS, DEFAULT_COLOUR } from '../carShapes';
import { GAME_WIDTH, VIEW_HEIGHT } from '../layout';
import { DeliveriesConfig, DeliveryJob, generateJob } from '../deliveries';
import { buildMap, DEFAULT_MAP, Edge, MAP_IDS, MapData, mapCacheKey, PlacedHouse, PlacedLandmark, PlacedNpcCar, PlacedRoadStub, PlacedSite, PlacedYard, TILE } from '../mapBuilder';
import { bearingTo, edgeAngle, findNextHop } from '../navigation';
import { initSfx, playBrake, playCrunch } from '../sfx';
import { loadCarStyle, loadCoins, loadCurrentMap, loadDelivery, loadDirt, loadFleet, loadFuel, loadNavTarget, NavTarget, pantryExists, saveCoins, saveCurrentMap, saveDelivery, saveDirt, saveFleet, saveFuel, saveNavTarget, savePantry, SaveData } from '../storage';
import { Dashboard } from './Dashboard';

//  Speed at which steering reaches full grip, and the fastest the car can
//  turn once gripped. Turn radius at full lock bottoms out at
//  GRIP_SPEED / MAX_TURN_RATE, so these two together set how tight a
//  corner feels — keep that above ~half a tile or it starts to spin in place.
const GRIP_SPEED = 130;
const MAX_TURN_RATE = 1.1;

//  Delivery drivers get paid too!
const DELIVERY_REWARD = 8;

//  Seconds of continuous driving to empty a full tank; below this fraction
//  remaining, the engine gets sluggish rather than ever cutting out
const FUEL_DRAIN_SECONDS = 360;
const FUEL_LOW_THRESHOLD = 0.2;
const FUEL_LOW_FLOOR = 0.35;

//  Cost of a full tank; a part-fill costs proportionally less, with a
//  minimum of 1 coin so topping up is never free
const FUEL_FULL_PRICE = 10;

//  Seconds of continuous driving to go from spotless to fully dirty
const DIRT_ACCUM_SECONDS = 720;

//  Small low-alpha speckles overlaid on the top-down car, one per position
//  filled in as dirt climbs — a cheap "he could do with a wash" tell
const DIRT_SPECKLE_OFFSETS: { x: number; y: number }[] = [
    { x: -12, y: -18 }, { x: 10, y: -8 }, { x: -8, y: 6 },
    { x: 12, y: 18 }, { x: -14, y: 22 }, { x: 6, y: -22 }
];

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
//  visiting a house, going into a shop, swapping into a parked vehicle, or
//  picking up/delivering the active delivery job
type ActionTarget =
    { kind: 'build'; site: PlacedSite } |
    { kind: 'visit'; house: PlacedHouse } |
    { kind: 'shop'; house: PlacedHouse } |
    { kind: 'swap'; model: string; x: number; y: number; heading: number; height: number } |
    { kind: 'pickup'; x: number; y: number; height: number } |
    { kind: 'deliver'; x: number; y: number; height: number } |
    { kind: 'refuel'; house: PlacedHouse } |
    { kind: 'road'; stub: PlacedRoadStub };

interface DrivingData
{
    mapId?: string;
    entry?: EntryState;
    fromYard?: boolean;
}

export class Driving extends Scene
{
    car: Phaser.GameObjects.Container;
    speed = 0;
    heading = 0;

    //  Dirt speckles overlaid on the driven car, refreshed only when the
    //  filled-in count actually changes
    dirtSpeckles: Phaser.GameObjects.Arc[] = [];
    dirtSpeckleCount = 0;

    map: MapData;
    mapWidth = 0;
    mapHeight = 0;
    startPos: { x: number; y: number };
    houses: PlacedHouse[] = [];
    sites: PlacedSite[] = [];
    landmarks: PlacedLandmark[] = [];
    roadStubs: PlacedRoadStub[] = [];
    npcCars: NpcCarState[] = [];
    npcGroup: Phaser.Physics.Arcade.Group;

    //  Fleet vehicles left parked out in this town, offered as SWAP targets
    parkedFleet: { model: string; x: number; y: number; heading: number }[] = [];

    //  Sound triggers: whether he's been going fast (for the brake screech),
    //  whether he was hit last frame (for the crunch), and cooldowns so
    //  neither retriggers every frame
    wasFast = false;
    wasHit = false;
    brakeCooldown = 0;
    crunchCooldown = 0;

    actionBubble: Phaser.GameObjects.Container;
    bubbleBg: Phaser.GameObjects.Rectangle;
    bubbleLabel: Phaser.GameObjects.Text;
    bubbleTarget: ActionTarget | null = null;
    transitioning = false;
    sceneData: DrivingData = {};

    //  The GPS: where the compass is currently pointing, and every town's
    //  data (already preloaded) so cross-town direction-finding works
    //  without needing to load anything
    navTarget: NavTarget | null = null;
    allMaps: Record<string, MapData> = {};
    compassContainer: Phaser.GameObjects.Container;
    compassNeedle: Phaser.GameObjects.Container;
    compassLabel: Phaser.GameObjects.Text;

    //  The active delivery job, if any
    deliveryJob: DeliveryJob | null = null;

    //  Last fuel level actually written to storage, so draining doesn't
    //  hit localStorage every frame
    fuelLastSaved = 1;
    dirtLastSaved = 0;

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

        this.navTarget = loadNavTarget();
        this.deliveryJob = loadDelivery();
        this.allMaps = {};

        for (const id of MAP_IDS)
        {
            const data = this.cache.json.get(mapCacheKey(id)) as MapData | undefined;

            if (data)
            {
                this.allMaps[id] = data;
            }
        }

        this.ensureDeliveryOffered();

        //  First boot only — map changes keep whatever the player was doing
        if (this.registry.get('gear') === undefined)
        {
            this.registry.set('steering', 0);
            this.registry.set('throttle', 0);
            this.registry.set('gear', 1);
        }

        //  Colour is a remembered choice; the model is always whichever
        //  vehicle the fleet says is current (the yard changes this)
        if (this.registry.get('carColour') === undefined)
        {
            this.registry.set('carColour', loadCarStyle()?.colour ?? DEFAULT_COLOUR);
        }

        this.registry.set('carModel', loadFleet().current);

        if (this.registry.get('coins') === undefined)
        {
            this.registry.set('coins', loadCoins());
        }

        //  Each vehicle has its own tank, and the outgoing one is always
        //  flushed to storage on shutdown below, so it's safe to always
        //  reload here rather than only on first boot
        this.registry.set('fuel', loadFuel(this.registry.get('carModel') as string));
        this.fuelLastSaved = this.registry.get('fuel') as number;

        this.registry.set('dirt', loadDirt(this.registry.get('carModel') as string));
        this.dirtLastSaved = this.registry.get('dirt') as number;

        //  Seed his pantry with a small starting stock the very first time,
        //  so his first cook works without a mandatory shop trip. After that
        //  it depletes as he cooks and he tops it up by shopping.
        if (!pantryExists())
        {
            const config = this.cache.json.get('recipes') as { ingredients: Record<string, { price?: number }> };
            const pantry: Record<string, number> = {};

            for (const [ id, def ] of Object.entries(config.ingredients))
            {
                if (def.price != null)
                {
                    pantry[id] = 2;
                }
            }

            savePantry(pantry);
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
        this.landmarks = built.landmarks;
        this.roadStubs = built.roadStubs;
        this.bubbleTarget = null;

        this.physics.world.setBounds(0, 0, built.width, built.height);

        //  Arriving from the yard spawns him on the road beside it, driving
        //  whatever vehicle he just picked
        let spawn = this.sceneData.entry ?? this.startPos;

        if (this.sceneData.fromYard && built.yard)
        {
            spawn = { x: built.yard.spawnX, y: built.yard.spawnY };
            this.heading = built.yard.spawnHeading;
        }

        this.car = this.buildCar(spawn.x, spawn.y);
        this.car.rotation = this.heading;

        this.dirtSpeckles = [];
        this.dirtSpeckleCount = 0;
        this.updateDirtSpeckles();

        this.physics.add.collider(this.car, built.obstacles);

        this.setupNpcCars(built.npcCars, built.obstacles);
        this.setupParkedFleet(built.yard);

        //  Repaint the car when the options screen changes it
        this.registry.events.on('changedata-carColour', this.restyleCar, this);
        this.registry.events.on('changedata-carModel', this.restyleCar, this);
        this.registry.events.on('changedata-dirt', this.updateDirtSpeckles, this);

        //  Sound: start the audio and reset the per-life trigger state
        initSfx();
        this.wasFast = false;
        this.wasHit = false;
        this.brakeCooldown = 0;
        this.crunchCooldown = 0;

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.registry.events.off('changedata-carColour', this.restyleCar, this);
            this.registry.events.off('changedata-carModel', this.restyleCar, this);
            this.registry.events.off('changedata-dirt', this.updateDirtSpeckles, this);

            //  Flush the outgoing vehicle's tank and dirt so the next create()
            //  (a new town, or a different vehicle entirely) reads an
            //  up-to-date value
            saveFuel(this.registry.get('carModel') as string, (this.registry.get('fuel') as number) ?? 1);
            saveDirt(this.registry.get('carModel') as string, (this.registry.get('dirt') as number) ?? 0);
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
        this.createCompassHud();

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

    //  The GPS compass: a fixed dial, top-centre, whose needle rotates to
    //  point at the current nav target — same-town bearing, or the exit
    //  direction to head toward if the target's town isn't the current one.
    //  Hidden whenever there's no active target.
    createCompassHud ()
    {
        const bg = this.add.circle(0, 0, 34, 0x102027, 0.75);
        bg.setStrokeStyle(3, 0xffd54f);

        const needle = this.add.rectangle(0, -14, 6, 28, 0xff7043);
        this.compassNeedle = this.add.container(0, 0, [ needle ]);

        const hub = this.add.circle(0, 0, 6, 0xcfd8dc);

        this.compassLabel = this.add.text(0, 46, '', {
            fontFamily: 'Arial Black', fontSize: 16, color: '#ffffff',
            stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        this.compassContainer = this.add.container(GAME_WIDTH / 2, 60, [ bg, this.compassNeedle, hub, this.compassLabel ]);
        this.compassContainer.setScrollFactor(0);
        this.compassContainer.setDepth(200);
        this.compassContainer.setVisible(false);
    }

    updateCompass ()
    {
        if (!this.navTarget)
        {
            this.compassContainer.setVisible(false);

            return;
        }

        const currentMapId = this.registry.get('mapId') as string;

        if (this.navTarget.mapId === currentMapId)
        {
            const dist = Phaser.Math.Distance.Between(this.car.x, this.car.y, this.navTarget.x, this.navTarget.y);

            if (dist < 120)
            {
                this.arriveAtNavTarget();

                return;
            }

            this.compassNeedle.rotation = bearingTo(this.car.x, this.car.y, this.navTarget.x, this.navTarget.y);
        }
        else
        {
            const hop = findNextHop(currentMapId, this.navTarget.mapId, this.allMaps);
            this.compassNeedle.rotation = hop !== null ? edgeAngle(hop) : 0;
        }

        this.compassLabel.setText(this.navTarget.name);
        this.compassContainer.setVisible(true);
    }

    arriveAtNavTarget ()
    {
        const name = this.navTarget?.name ?? 'your destination';
        this.clearNavTarget();
        this.showToast(`You made it to ${name}!`);
    }

    setNavTarget (target: NavTarget)
    {
        this.navTarget = target;
        saveNavTarget(target);
    }

    clearNavTarget ()
    {
        this.navTarget = null;
        saveNavTarget(null);
        this.compassContainer.setVisible(false);
    }

    showToast (text: string)
    {
        const toast = this.add.text(GAME_WIDTH / 2, 110, text, {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffeb3b',
            stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5).setScrollFactor(0).setDepth(200);

        this.tweens.add({ targets: toast, alpha: 0, delay: 1400, duration: 500, onComplete: () => toast.destroy() });
    }

    //  Sets (or clears) the active delivery job, persists it, and points the
    //  compass at whatever's next: the pickup shop once accepted, the
    //  drop-off once carrying, or nothing once it's done
    setDeliveryJob (job: DeliveryJob | null)
    {
        this.deliveryJob = job;
        saveDelivery(job);

        if (job && job.state === 'accepted')
        {
            this.setNavTarget({ id: job.pickupId, name: job.pickupName, mapId: job.pickupMapId, x: job.pickupX, y: job.pickupY });
        }
        else if (job && job.state === 'carrying')
        {
            this.setNavTarget({ id: job.dropoffId, name: job.dropoffName, mapId: job.dropoffMapId, x: job.dropoffX, y: job.dropoffY });
        }
        else if (!job)
        {
            //  Never leave him with nothing offered — the dashboard icon
            //  only has something to wiggle about if a job actually exists
            this.ensureDeliveryOffered();
        }
    }

    ensureDeliveryOffered ()
    {
        if (this.deliveryJob)
        {
            return;
        }

        const config = this.cache.json.get('deliveries') as DeliveriesConfig | undefined;
        const job = config ? generateJob(this.allMaps, config.parcels) : null;

        if (job)
        {
            this.deliveryJob = job;
            saveDelivery(job);
        }
    }

    parcelName (parcelId: string): string
    {
        const config = this.cache.json.get('deliveries') as DeliveriesConfig | undefined;

        return config?.parcels.find(p => p.id === parcelId)?.name ?? 'parcel';
    }

    onPickup ()
    {
        const job = this.deliveryJob;

        if (!job)
        {
            return;
        }

        this.setDeliveryJob({ ...job, state: 'carrying' });
        this.showToast(`Picked up the ${this.parcelName(job.parcelId)}!`);
    }

    onDeliver ()
    {
        const job = this.deliveryJob;

        if (!job)
        {
            return;
        }

        const coins = ((this.registry.get('coins') as number) ?? 0) + DELIVERY_REWARD;
        this.registry.set('coins', coins);
        saveCoins(coins);

        this.setDeliveryJob(null);
        this.clearNavTarget();
        this.showToast(`Delivered! +${DELIVERY_REWARD} coins`);

        for (let i = 0; i < 8; i++)
        {
            const angle = (i / 8) * Math.PI * 2;
            const star = this.add.circle(this.car.x, this.car.y, 9, [ 0xffeb3b, 0xff7043, 0x4dd0e1, 0xaed581 ][i % 4]);

            this.tweens.add({
                targets: star,
                x: this.car.x + Math.cos(angle) * 90,
                y: this.car.y + Math.sin(angle) * 90,
                alpha: 0,
                duration: 700,
                ease: 'Cubic.Out',
                onComplete: () => star.destroy()
            });
        }
    }

    onRefuel ()
    {
        const fuel = (this.registry.get('fuel') as number) ?? 1;

        if (fuel >= 1)
        {
            this.showToast('Already full!');

            return;
        }

        const cost = Math.max(1, Math.ceil(FUEL_FULL_PRICE * (1 - fuel)));
        const coins = (this.registry.get('coins') as number) ?? 0;

        if (coins < cost)
        {
            this.showToast('Not enough coins!');

            return;
        }

        const newCoins = coins - cost;
        this.registry.set('coins', newCoins);
        saveCoins(newCoins);

        const model = this.registry.get('carModel') as string;

        this.registry.set('fuel', 1);
        saveFuel(model, 1);
        this.fuelLastSaved = 1;

        this.showToast(`Filled up! -${cost} coins`);
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
            else if (house.shopType === 'petrol')
            {
                consider(house.x, house.y, house.width, house.height, { kind: 'refuel', house });
            }
            else if (house.sells && house.sells.length > 0)
            {
                //  Signed buildings with stock are shops
                consider(house.x, house.y, house.width, house.height, { kind: 'shop', house });
            }
        }

        for (const parked of this.parkedFleet)
        {
            //  Drive up to a vehicle you left out to hop into it
            consider(parked.x, parked.y, 68, 68, { kind: 'swap', model: parked.model, x: parked.x, y: parked.y, heading: parked.heading, height: 68 });
        }

        for (const stub of this.roadStubs)
        {
            consider(stub.x, stub.y, stub.width, stub.height, { kind: 'road', stub });
        }

        //  A pickup/deliver spot is often the exact same building as a shop
        //  or house (e.g. picking up from a café you could otherwise browse)
        //  — checked separately, and given first claim on `best` below, so it
        //  always wins that tie rather than losing to whichever happened to
        //  be pushed into `candidates` first. Its hit-box must match the real
        //  building's own width/height, not a guessed fixed size — a bigger
        //  building (like the ice cream parlour) has a bigger SHOP/TREAT
        //  hit-box than an undersized fixed one, letting it register as
        //  "closer" and win over PICKUP/DELIVER anywhere near the edges.
        const job = this.deliveryJob;
        const currentMapId = this.registry.get('mapId') as string;
        let deliveryCandidate: { distance: number; target: ActionTarget } | null = null;

        if (job && job.state === 'accepted' && job.pickupMapId === currentMapId)
        {
            const pickupHouse = this.houses.find(h => h.id === job.pickupId);
            const w = pickupHouse?.width ?? 160;
            const h = pickupHouse?.height ?? 160;

            const dx = Math.max(Math.abs(this.car.x - job.pickupX) - w / 2, 0);
            const dy = Math.max(Math.abs(this.car.y - job.pickupY) - h / 2, 0);

            deliveryCandidate = { distance: Math.hypot(dx, dy), target: { kind: 'pickup', x: job.pickupX, y: job.pickupY, height: h } };
        }
        else if (job && job.state === 'carrying' && job.dropoffMapId === currentMapId)
        {
            const dropoffHouse = this.houses.find(h => h.id === job.dropoffId);
            const dropoffLandmark = this.landmarks.find(l => l.id === job.dropoffId);
            const w = dropoffHouse?.width ?? dropoffLandmark?.width ?? 160;
            const h = dropoffHouse?.height ?? dropoffLandmark?.height ?? 160;

            const dx = Math.max(Math.abs(this.car.x - job.dropoffX) - w / 2, 0);
            const dy = Math.max(Math.abs(this.car.y - job.dropoffY) - h / 2, 0);

            deliveryCandidate = { distance: Math.hypot(dx, dy), target: { kind: 'deliver', x: job.dropoffX, y: job.dropoffY, height: h } };
        }

        let best: ActionTarget | null = null;
        let bestDistance = 120;

        if (deliveryCandidate && deliveryCandidate.distance < bestDistance)
        {
            best = deliveryCandidate.target;
            bestDistance = deliveryCandidate.distance;
        }

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
            const t = this.bubbleTarget;
            const at = t.kind === 'build' ? t.site
                : (t.kind === 'swap' || t.kind === 'pickup' || t.kind === 'deliver') ? t
                : t.kind === 'road' ? t.stub
                : t.house;

            if (t.kind === 'build')
            {
                this.bubbleBg.setFillStyle(0xffeb3b);
                this.bubbleBg.setStrokeStyle(5, 0x795548);
                this.bubbleLabel.setText('BUILD').setColor('#5d4037');
            }
            else if (t.kind === 'visit')
            {
                this.bubbleBg.setFillStyle(0xe1f5fe);
                this.bubbleBg.setStrokeStyle(5, 0x0277bd);
                this.bubbleLabel.setText('VISIT').setColor('#01579b');
            }
            else if (t.kind === 'swap')
            {
                this.bubbleBg.setFillStyle(0xffe0b2);
                this.bubbleBg.setStrokeStyle(5, 0xe65100);
                this.bubbleLabel.setText('DRIVE').setColor('#e65100');
            }
            else if (t.kind === 'pickup')
            {
                this.bubbleBg.setFillStyle(0xffccbc);
                this.bubbleBg.setStrokeStyle(5, 0xbf360c);
                this.bubbleLabel.setText('PICKUP').setColor('#bf360c');
            }
            else if (t.kind === 'deliver')
            {
                this.bubbleBg.setFillStyle(0xc5e1a5);
                this.bubbleBg.setStrokeStyle(5, 0x33691e);
                this.bubbleLabel.setText('DELIVER').setColor('#1b5e20');
            }
            else if (t.kind === 'refuel')
            {
                this.bubbleBg.setFillStyle(0xfff9c4);
                this.bubbleBg.setStrokeStyle(5, 0xf9a825);
                this.bubbleLabel.setText('FUEL').setColor('#f57f17');
            }
            else if (t.kind === 'road')
            {
                this.bubbleBg.setFillStyle(0x9e9e9e);
                this.bubbleBg.setStrokeStyle(5, 0x424242);
                this.bubbleLabel.setText('ROAD').setColor('#212121');
            }
            else if (t.house.shopType === 'treat')
            {
                this.bubbleBg.setFillStyle(0xfce4ec);
                this.bubbleBg.setStrokeStyle(5, 0xd81b60);
                this.bubbleLabel.setText('TREAT').setColor('#880e4f');
            }
            else if (t.house.shopType === 'cafe')
            {
                this.bubbleBg.setFillStyle(0xd7ccc8);
                this.bubbleBg.setStrokeStyle(5, 0x5d4037);
                this.bubbleLabel.setText('CAFÉ').setColor('#4e342e');
            }
            else if (t.house.shopType === 'chippy')
            {
                this.bubbleBg.setFillStyle(0xffe0b2);
                this.bubbleBg.setStrokeStyle(5, 0xe65100);
                this.bubbleLabel.setText('CHIPPY').setColor('#e65100');
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

        //  Swapping, picking up and delivering all happen in place — driving
        //  never pauses for them, so handle them before the pause/launch below
        if (target.kind === 'swap')
        {
            this.swapIntoVehicle(target);

            return;
        }

        if (target.kind === 'pickup')
        {
            this.onPickup();

            return;
        }

        if (target.kind === 'deliver')
        {
            this.onDeliver();

            return;
        }

        if (target.kind === 'refuel')
        {
            this.onRefuel();

            return;
        }

        if (target.kind === 'build')
        {
            this.scene.launch('Builder', { siteId: target.site.id });
        }
        else if (target.kind === 'visit')
        {
            this.scene.launch('Interior', { houseId: target.house.id, colour: target.house.colour });
        }
        else if (target.kind === 'road')
        {
            this.scene.launch('RoadBuilder', { mapId: this.registry.get('mapId') as string, stub: target.stub });
        }
        else if (target.house.shopType === 'treat')
        {
            this.scene.launch('IceCream', { houseId: target.house.id, colour: target.house.colour, sells: target.house.sells ?? [] });
        }
        else if (target.house.shopType === 'cafe')
        {
            this.scene.launch('Cafe', { houseId: target.house.id, colour: target.house.colour, sells: target.house.sells ?? [] });
        }
        else if (target.house.shopType === 'chippy')
        {
            this.scene.launch('Chippy', { houseId: target.house.id, colour: target.house.colour, sells: target.house.sells ?? [] });
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

        //  removeAll() just destroyed any speckles along with everything
        //  else, so force a full rebuild rather than trusting the count check
        this.dirtSpeckles = [];
        this.dirtSpeckleCount = 0;
        this.updateDirtSpeckles();
    }

    updateDirtSpeckles ()
    {
        const dirt = (this.registry.get('dirt') as number) ?? 0;
        const count = Math.round(dirt * DIRT_SPECKLE_OFFSETS.length);

        if (count === this.dirtSpeckleCount)
        {
            return;
        }

        this.dirtSpeckleCount = count;

        for (const speckle of this.dirtSpeckles)
        {
            speckle.destroy();
        }

        this.dirtSpeckles = [];

        for (let i = 0; i < count; i++)
        {
            const offset = DIRT_SPECKLE_OFFSETS[i];
            const speckle = this.add.circle(offset.x, offset.y, 4, 0x6d4c41, 0.4);

            this.car.add(speckle);
            this.dirtSpeckles.push(speckle);
        }
    }

    //  ---- The player's parked fleet: vehicles left out, and the ones at home ----

    setupParkedFleet (yard: PlacedYard | null)
    {
        this.parkedFleet = [];

        const fleet = loadFleet();
        const mapId = this.registry.get('mapId') as string;
        const colour = this.registry.get('carColour') as number;
        const group = this.physics.add.staticGroup();

        const park = (model: string, x: number, y: number, heading: number, swappable: boolean) => {

            const container = this.add.container(x, y, buildCarShapes(this, model, colour));
            container.setRotation(heading);

            const long = ({ lorry: 108, mixer: 108, digger: 140 } as Record<string, number>)[model] ?? 88;
            const horizontal = Math.abs(Math.sin(heading)) > 0.5;
            container.setSize(horizontal ? long : 56, horizontal ? 56 : long);

            this.physics.add.existing(container, true);
            group.add(container);

            if (swappable)
            {
                this.parkedFleet.push({ model, x, y, heading });
            }
        };

        //  Vehicles he left out in this town — these can be swapped into
        for (const [ model, spot ] of Object.entries(fleet.parked))
        {
            if (spot.mapId === mapId)
            {
                park(model, spot.x, spot.y, spot.heading, true);
            }
        }

        //  The rest of the fleet sits at home in the yard (home town only).
        //  These aren't swap targets — he picks them from the yard screen.
        if (yard)
        {
            const homeModels = CAR_MODELS.map(m => m.key).filter(k => k !== fleet.current && !fleet.parked[k]);

            homeModels.forEach((model, i) => {

                const slot = yard.slots[i];

                if (slot)
                {
                    park(model, slot.x, slot.y, 0, false);
                }

            });
        }

        this.physics.add.collider(this.car, group);
    }

    swapIntoVehicle (target: { model: string; x: number; y: number; heading: number })
    {
        const fleet = loadFleet();
        const mapId = this.registry.get('mapId') as string;

        //  His old vehicle stays where he stopped; he hops into the parked one
        fleet.parked[fleet.current] = { mapId, x: this.car.x, y: this.car.y, heading: this.heading };
        delete fleet.parked[target.model];
        fleet.current = target.model;
        saveFleet(fleet);

        this.scene.restart({ mapId, entry: { x: target.x, y: target.y, heading: target.heading, speed: 0 } });
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
        this.updateCompass();

        const dt = delta / 1000;

        this.updateNpcCars(dt);

        const steering = (this.registry.get('steering') as number) ?? 0;
        const throttle = (this.registry.get('throttle') as number) ?? 0;
        const gear = (this.registry.get('gear') as number) ?? 1;
        const fuel = (this.registry.get('fuel') as number) ?? 1;

        //  Running low makes the engine sluggish rather than ever stalling
        //  him out completely
        const fuelFactor = fuel < FUEL_LOW_THRESHOLD
            ? FUEL_LOW_FLOOR + (1 - FUEL_LOW_FLOOR) * (fuel / FUEL_LOW_THRESHOLD)
            : 1;

        //  Gear 1 = forwards, gear 2 = fast, R = backwards
        const topSpeed = (gear === 2 ? 330 : gear === 1 ? 170 : -120) * fuelFactor;
        const target = throttle * topSpeed;
        const rate = throttle > 0 ? 240 * fuelFactor : 280;

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
        const speedAbs = Math.abs(this.speed);
        this.registry.set('speed', speedAbs);

        //  The tank only drains while actually driving, not sitting idle
        if (speedAbs > 20)
        {
            const drained = Math.max(0, fuel - dt / FUEL_DRAIN_SECONDS);
            this.registry.set('fuel', drained);

            if (Math.abs(drained - this.fuelLastSaved) >= 0.01)
            {
                saveFuel(this.registry.get('carModel') as string, drained);
                this.fuelLastSaved = drained;
            }

            //  He gets dirty from driving, same throttled-save shape as fuel
            const dirt = (this.registry.get('dirt') as number) ?? 0;
            const dirtied = Math.min(1, dirt + dt / DIRT_ACCUM_SECONDS);
            this.registry.set('dirt', dirtied);

            if (Math.abs(dirtied - this.dirtLastSaved) >= 0.01)
            {
                saveDirt(this.registry.get('carModel') as string, dirtied);
                this.dirtLastSaved = dirtied;
            }
        }

        //  ---- brakes and crunches ----
        this.brakeCooldown = Math.max(0, this.brakeCooldown - dt);
        this.crunchCooldown = Math.max(0, this.crunchCooldown - dt);

        //  A tyre screech when he pulls up after really going for it
        if (speedAbs > 200)
        {
            this.wasFast = true;
        }

        if (this.wasFast && speedAbs < 40 && this.brakeCooldown === 0)
        {
            playBrake();
            this.brakeCooldown = 0.8;
            this.wasFast = false;
        }

        //  A crunch the moment he thumps into something while moving
        const touch = body.touching;
        const block = body.blocked;
        const hit = touch.up || touch.down || touch.left || touch.right || block.up || block.down || block.left || block.right;

        if (hit && !this.wasHit && speedAbs > 70 && this.crunchCooldown === 0)
        {
            playCrunch();
            this.crunchCooldown = 0.4;
        }

        this.wasHit = hit;

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
