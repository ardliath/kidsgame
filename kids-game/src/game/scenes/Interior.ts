import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { RecipeDef } from '../recipes';
import { InteriorPerson, InteriorSpec, loadInteriors, loadPlayerName, saveInterior, saveVisitedHouse } from '../storage';

//  The house cross-section: one floor shown at a time
const WALL_TOP = 262;
const FLOOR_Y = 790;

const SKINS = [ 0xffcc80, 0xd7a97c, 0x8d5524, 0xffe0b2 ];
const HAIRS = [ 0x4e342e, 0xfbc02d, 0xd84315, 0x212121, 0x9e9e9e ];
const SHIRTS = [ 0xe53935, 0xfb8c00, 0x43a047, 0x1e88e5, 0x8e24aa, 0x26a69a ];
//  {name} is swapped for the player's name when the bubble is shown, so a
//  name change reaches every house — even ones generated long ago
const GREETINGS = [ 'Hello, {name}!', 'Hi, {name}!', 'Welcome, {name}!', 'Nice to see you, {name}!', 'Come on in, {name}!', 'Lovely day, {name}!' ];
const WALL_TINTS = [ 0xfff3e0, 0xe3f2fd, 0xf3e5f5, 0xe8f5e9, 0xfffde7, 0xfce4ec ];

interface Room
{
    x0: number;
    x1: number;
    type: string;
}

export class Interior extends Scene
{
    houseId = '';
    houseColour = 0xe53935;
    spec: InteriorSpec;
    floorIndex = 0;

    floorLayer: Phaser.GameObjects.Container;
    player: Phaser.GameObjects.Container;
    legLeft: Phaser.GameObjects.Rectangle;
    legRight: Phaser.GameObjects.Rectangle;

    peopleOnFloor: { data: InteriorPerson; bubble: Phaser.GameObjects.Container; shown: boolean }[] = [];

    cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    leftPointerId = -1;
    rightPointerId = -1;

    constructor ()
    {
        super('Interior');
    }

    init (data: { houseId: string; colour: number })
    {
        this.houseId = data.houseId;
        this.houseColour = data.colour;
    }

    create ()
    {
        this.floorIndex = 0;
        this.leftPointerId = -1;
        this.rightPointerId = -1;
        this.peopleOnFloor = [];

        //  Being inside counts as a visit, which protects the house from demolition
        saveVisitedHouse(this.houseId);

        //  Lazily generate the inside of this house, then keep it forever
        this.spec = loadInteriors()[this.houseId] ?? this.generateSpec();

        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x102027);

        this.createPlayer();
        this.showFloor(0);

        this.createWalkButtons();
        this.cursors = this.input.keyboard?.createCursorKeys();

        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('gameout', () => { this.leftPointerId = -1; this.rightPointerId = -1; });
        this.input.keyboard?.on('keydown-ESC', () => this.leave());
    }

    generateSpec (): InteriorSpec
    {
        const pick = <T> (arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

        const spec: InteriorSpec = {
            version: 1,
            ground: Math.random() < 0.5 ? [ 'living', 'kitchen' ] : [ 'kitchen', 'living' ],
            upstairs: Math.random() < 0.5 ? [ 'bedroom', 'bathroom' ] : [ 'bathroom', 'bedroom' ],
            tints: {
                hall: pick(WALL_TINTS),
                living: pick(WALL_TINTS),
                kitchen: pick(WALL_TINTS),
                bedroom: pick(WALL_TINTS),
                bathroom: pick(WALL_TINTS),
                stairs: pick(WALL_TINTS),
                landing: pick(WALL_TINTS)
            },
            variants: {
                living: Math.floor(Math.random() * 3),
                bedroom: Math.floor(Math.random() * 2),
                bathroom: Math.floor(Math.random() * 2)
            },
            people: [
                { floor: 0, x: 330 + Math.floor(Math.random() * 580), skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), greeting: pick(GREETINGS) },
                { floor: 1, x: 200 + Math.floor(Math.random() * 700), skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), greeting: pick(GREETINGS) }
            ]
        };

        saveInterior(this.houseId, spec);

        return spec;
    }

    roomsForFloor (floor: number): Room[]
    {
        if (floor === 0)
        {
            return [
                { x0: 24, x1: 250, type: 'hall' },
                { x0: 250, x1: 640, type: this.spec.ground[0] },
                { x0: 640, x1: 1030, type: this.spec.ground[1] },
                { x0: 1030, x1: 1256, type: 'stairs' }
            ];
        }

        return [
            { x0: 24, x1: 510, type: this.spec.upstairs[0] },
            { x0: 510, x1: 1030, type: this.spec.upstairs[1] },
            { x0: 1030, x1: 1256, type: 'landing' }
        ];
    }

    showFloor (floor: number)
    {
        this.floorIndex = floor;
        this.floorLayer?.destroy(true);
        this.floorLayer = this.add.container(0, 0);
        this.floorLayer.setDepth(0);
        this.peopleOnFloor = [];

        const layer = this.floorLayer;
        const houseDark = Phaser.Display.Color.IntegerToColor(this.houseColour).darken(35).color;

        //  Outer shell
        layer.add(this.add.rectangle(GAME_WIDTH / 2, WALL_TOP - 11, GAME_WIDTH - 8, 22, houseDark));
        layer.add(this.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 30, GAME_WIDTH - 8, 60, houseDark));
        layer.add(this.add.rectangle(12, (WALL_TOP + FLOOR_Y + 60) / 2, 24, FLOOR_Y + 60 - WALL_TOP, houseDark));
        layer.add(this.add.rectangle(GAME_WIDTH - 12, (WALL_TOP + FLOOR_Y + 60) / 2, 24, FLOOR_Y + 60 - WALL_TOP, houseDark));

        const rooms = this.roomsForFloor(floor);

        for (const room of rooms)
        {
            this.drawRoom(room);
        }

        //  Dividers with open doorways at walking level
        for (let i = 1; i < rooms.length; i++)
        {
            const x = rooms[i].x0;
            layer.add(this.add.rectangle(x, (WALL_TOP + FLOOR_Y - 170) / 2, 20, FLOOR_Y - 170 - WALL_TOP, 0xbcaaa4));
            layer.add(this.add.rectangle(x, FLOOR_Y - 170, 32, 12, 0x8d6e63));
        }

        //  Wooden floor line
        layer.add(this.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 6, GAME_WIDTH - 48, 14, 0x8d6e63));

        if (floor === 0)
        {
            this.drawFrontDoor();
            this.drawStairs(true);
        }
        else
        {
            this.drawStairs(false);
        }

        //  Residents of this floor
        for (const person of this.spec.people.filter(p => p.floor === floor))
        {
            this.drawPerson(person);
        }

        //  Player appears by the door downstairs, by the stairs upstairs
        this.player.x = floor === 0 ? Math.min(Math.max(this.player.x, 80), 1200) : 1080;
        this.player.setDepth(10);

        this.cameras.main.flash(120, 255, 255, 255);
    }

    drawRoom (room: Room)
    {
        const layer = this.floorLayer;
        const cx = (room.x0 + room.x1) / 2;
        const w = room.x1 - room.x0;

        //  Wallpaper
        layer.add(this.add.rectangle(cx, (WALL_TOP + FLOOR_Y) / 2, w, FLOOR_Y - WALL_TOP, this.spec.tints[room.type] ?? 0xfff3e0));

        //  Kitchen and bathroom get tiled floors, everyone else gets wood
        if (room.type === 'kitchen' || room.type === 'bathroom')
        {
            for (let x = room.x0; x < room.x1 - 20; x += 40)
            {
                const shade = ((x / 40) % 2 === 0) ? 0xeceff1 : 0xb0bec5;
                layer.add(this.add.rectangle(x + 20, FLOOR_Y - 8, 40, 16, shade));
            }
        }

        //  A window in every proper room
        if (room.type !== 'hall' && room.type !== 'stairs' && room.type !== 'landing')
        {
            layer.add(this.add.rectangle(cx, 420, 130, 110, 0x81d4fa).setStrokeStyle(8, 0xffffff));
            layer.add(this.add.rectangle(cx, 420, 6, 110, 0xffffff));
            layer.add(this.add.rectangle(cx, 420, 130, 6, 0xffffff));
        }

        switch (room.type)
        {
            case 'kitchen': this.drawKitchen(room); break;
            case 'living': this.drawLiving(room); break;
            case 'bedroom': this.drawBedroom(room); break;
            case 'bathroom': this.drawBathroom(room); break;
            case 'hall': this.drawHall(room); break;
            case 'landing':
                this.drawPicture((room.x0 + room.x1) / 2 - 60, 400);
                this.drawPlant(room.x0 + 60);
                break;
        }
    }

    //  ---- Furniture, all standing on FLOOR_Y ----

    drawKitchen (room: Room)
    {
        const layer = this.floorLayer;
        const left = room.x0 + 20;

        //  Fridge
        layer.add(this.add.rectangle(left + 50, FLOOR_Y - 95, 90, 190, 0xcfd8dc).setStrokeStyle(4, 0x90a4ae));
        layer.add(this.add.rectangle(left + 50, FLOOR_Y - 130, 90, 4, 0x90a4ae));
        layer.add(this.add.rectangle(left + 82, FLOOR_Y - 105, 6, 40, 0x78909c));

        //  Cooker: oven door, knobs and a hob on top
        const cookerX = left + 145;
        layer.add(this.add.rectangle(cookerX, FLOOR_Y - 65, 90, 130, 0xeceff1).setStrokeStyle(4, 0xb0bec5));
        layer.add(this.add.rectangle(cookerX, FLOOR_Y - 50, 62, 56, 0x455a64).setStrokeStyle(4, 0x263238));
        layer.add(this.add.rectangle(cookerX, FLOOR_Y - 132, 90, 8, 0x455a64));

        for (let k = 0; k < 3; k++)
        {
            layer.add(this.add.circle(cookerX - 22 + k * 22, FLOOR_Y - 110, 5, 0x546e7a));
        }

        //  Counter with a sink
        const counterX = cookerX + 45 + ((room.x1 - 20) - (cookerX + 45)) / 2;
        const counterW = (room.x1 - 20) - (cookerX + 45);

        if (counterW > 60)
        {
            layer.add(this.add.rectangle(counterX, FLOOR_Y - 55, counterW, 110, 0xa1887f).setStrokeStyle(4, 0x795548));
            layer.add(this.add.rectangle(counterX, FLOOR_Y - 112, counterW + 10, 12, 0xd7ccc8));
            layer.add(this.add.rectangle(counterX, FLOOR_Y - 112, 60, 8, 0x90a4ae));
            layer.add(this.add.rectangle(counterX - 18, FLOOR_Y - 132, 6, 32, 0x90a4ae));
            layer.add(this.add.rectangle(counterX - 8, FLOOR_Y - 146, 26, 6, 0x90a4ae));
        }

        //  Tap the cooker to cook something
        const label = this.add.text(cookerX, FLOOR_Y - 215, 'COOK', {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);
        layer.add(label);

        this.tweens.add({ targets: label, y: label.y - 8, duration: 600, yoyo: true, repeat: -1 });

        const zone = this.add.zone(cookerX, FLOOR_Y - 90, 120, 190).setInteractive();
        layer.add(zone);
        zone.on('pointerdown', () => this.openCooking());
    }

    openCooking ()
    {
        this.scene.launch('Cooking', { houseId: this.houseId });
        this.scene.pause();
    }

    //  Called when the player finishes cooking: anyone in the kitchen thanks him
    onCooked (recipe: RecipeDef)
    {
        const kitchen = this.roomsForFloor(this.floorIndex).find(r => r.type === 'kitchen');

        if (!kitchen)
        {
            return;
        }

        const name = loadPlayerName().trim();
        const food = recipe.name.toLowerCase();
        const text = name.length > 0 ? `Thank you ${name} for the ${food}!` : `Thank you for the ${food}!`;

        for (const person of this.spec.people)
        {
            if (person.floor === this.floorIndex && person.x >= kitchen.x0 && person.x <= kitchen.x1)
            {
                this.showThankYou(person.x, text);
            }
        }
    }

    showThankYou (x: number, text: string)
    {
        const label = this.add.text(0, 0, text, {
            fontFamily: 'Arial Black', fontSize: 22, color: '#5d4037'
        }).setOrigin(0.5);

        const bg = this.add.rectangle(0, 0, label.width + 40, 50, 0xfff9c4).setStrokeStyle(4, 0x5d4037);
        const tail = this.add.triangle(-10, 32, 0, 0, 24, 0, 12, 16, 0xfff9c4);

        const bubbleX = Phaser.Math.Clamp(x, 200, GAME_WIDTH - 200);
        const bubble = this.add.container(bubbleX, FLOOR_Y - 220, [ bg, tail, label ]);
        bubble.setAlpha(0).setDepth(30);
        this.floorLayer.add(bubble);

        this.tweens.add({ targets: bubble, alpha: 1, y: FLOOR_Y - 240, duration: 220 });
        this.time.delayedCall(3400, () => {
            this.tweens.add({ targets: bubble, alpha: 0, duration: 400, onComplete: () => bubble.destroy() });
        });
    }

    drawLiving (room: Room)
    {
        const variant = this.spec.variants.living ?? 0;
        const cx = (room.x0 + room.x1) / 2;

        this.drawSofa(cx - 60);

        if (variant === 0)
        {
            this.drawTv(room.x1 - 90);
            this.drawPlant(room.x0 + 50);
        }
        else if (variant === 1)
        {
            this.drawBookshelf(room.x1 - 80);
            this.drawLamp(room.x0 + 50);
        }
        else
        {
            this.drawTv(room.x1 - 90);
            this.drawBookshelf(room.x0 + 70);
        }
    }

    drawBedroom (room: Room)
    {
        const variant = this.spec.variants.bedroom ?? 0;
        const cx = (room.x0 + room.x1) / 2;

        //  Bed
        const layer = this.floorLayer;
        layer.add(this.add.rectangle(cx - 60, FLOOR_Y - 35, 230, 46, 0x8d6e63).setStrokeStyle(4, 0x5d4037));
        layer.add(this.add.rectangle(cx - 60, FLOOR_Y - 66, 230, 26, 0xeceff1));
        layer.add(this.add.rectangle(cx - 145, FLOOR_Y - 74, 44, 20, 0xfff9c4));
        layer.add(this.add.rectangle(cx - 172, FLOOR_Y - 70, 14, 130, 0x5d4037));
        layer.add(this.add.rectangle(cx - 20, FLOOR_Y - 62, 140, 22, this.houseColour));

        if (variant === 0)
        {
            this.drawWardrobe(room.x1 - 80);
        }
        else
        {
            this.drawLamp(room.x1 - 60);
            this.drawRug(cx + 110);
        }
    }

    drawBathroom (room: Room)
    {
        const layer = this.floorLayer;
        const cx = (room.x0 + room.x1) / 2;

        //  Bath with taps and a duck
        layer.add(this.add.rectangle(cx - 40, FLOOR_Y - 40, 200, 70, 0xffffff).setStrokeStyle(5, 0xb0bec5));
        layer.add(this.add.rectangle(cx - 40, FLOOR_Y - 78, 210, 10, 0xcfd8dc));
        layer.add(this.add.rectangle(cx + 52, FLOOR_Y - 92, 8, 24, 0x90a4ae));
        layer.add(this.add.circle(cx - 60, FLOOR_Y - 86, 9, 0xffeb3b));

        //  Basin and mirror
        layer.add(this.add.rectangle(room.x1 - 70, FLOOR_Y - 45, 26, 90, 0xeceff1));
        layer.add(this.add.rectangle(room.x1 - 70, FLOOR_Y - 96, 70, 18, 0xffffff).setStrokeStyle(3, 0xb0bec5));
        layer.add(this.add.rectangle(room.x1 - 70, 430, 56, 76, 0xb3e5fc).setStrokeStyle(5, 0xeceff1));

        if ((this.spec.variants.bathroom ?? 0) === 1)
        {
            this.drawPlant(room.x0 + 45);
        }
    }

    drawHall (room: Room)
    {
        const layer = this.floorLayer;

        this.drawPicture((room.x0 + room.x1) / 2 + 55, 400);

        //  Coat hooks
        layer.add(this.add.rectangle((room.x0 + room.x1) / 2 + 55, 520, 70, 8, 0x8d6e63));
        layer.add(this.add.rectangle((room.x0 + room.x1) / 2 + 40, 540, 6, 32, 0x5d4037));
        layer.add(this.add.rectangle((room.x0 + room.x1) / 2 + 70, 540, 6, 32, 0x5d4037));
    }

    drawSofa (x: number)
    {
        const layer = this.floorLayer;
        const dark = Phaser.Display.Color.IntegerToColor(this.houseColour).darken(25).color;

        layer.add(this.add.rectangle(x, FLOOR_Y - 40, 210, 60, this.houseColour).setStrokeStyle(4, dark));
        layer.add(this.add.rectangle(x, FLOOR_Y - 82, 210, 26, this.houseColour).setStrokeStyle(4, dark));
        layer.add(this.add.rectangle(x - 55, FLOOR_Y - 52, 90, 24, dark));
        layer.add(this.add.rectangle(x + 55, FLOOR_Y - 52, 90, 24, dark));
    }

    drawTv (x: number)
    {
        const layer = this.floorLayer;
        layer.add(this.add.rectangle(x, FLOOR_Y - 25, 90, 50, 0x8d6e63).setStrokeStyle(4, 0x5d4037));
        layer.add(this.add.rectangle(x, FLOOR_Y - 95, 110, 76, 0x263238).setStrokeStyle(5, 0x102027));
        layer.add(this.add.rectangle(x, FLOOR_Y - 95, 86, 54, 0x4dd0e1));
    }

    drawBookshelf (x: number)
    {
        const layer = this.floorLayer;
        layer.add(this.add.rectangle(x, FLOOR_Y - 90, 110, 180, 0xa1887f).setStrokeStyle(5, 0x795548));

        for (let s = 0; s < 3; s++)
        {
            const shelfY = FLOOR_Y - 40 - s * 55;
            layer.add(this.add.rectangle(x, shelfY, 100, 8, 0x795548));

            for (let b = 0; b < 4; b++)
            {
                layer.add(this.add.rectangle(x - 36 + b * 24, shelfY - 22, 16, 32, SHIRTS[(s * 4 + b) % SHIRTS.length]));
            }
        }
    }

    drawLamp (x: number)
    {
        const layer = this.floorLayer;
        layer.add(this.add.rectangle(x, FLOOR_Y - 8, 50, 12, 0x5d4037));
        layer.add(this.add.rectangle(x, FLOOR_Y - 70, 8, 120, 0x5d4037));
        layer.add(this.add.triangle(x, FLOOR_Y - 160, 0, 60, 80, 60, 40, 0, 0xffe082));
    }

    drawPlant (x: number)
    {
        const layer = this.floorLayer;
        layer.add(this.add.rectangle(x, FLOOR_Y - 20, 50, 40, 0xbf6b57));
        layer.add(this.add.circle(x, FLOOR_Y - 62, 28, 0x43a047));
        layer.add(this.add.circle(x - 20, FLOOR_Y - 48, 20, 0x2e7d32));
        layer.add(this.add.circle(x + 20, FLOOR_Y - 48, 20, 0x2e7d32));
    }

    drawWardrobe (x: number)
    {
        const layer = this.floorLayer;
        layer.add(this.add.rectangle(x, FLOOR_Y - 95, 120, 190, 0xa1887f).setStrokeStyle(5, 0x795548));
        layer.add(this.add.rectangle(x, FLOOR_Y - 95, 6, 180, 0x795548));
        layer.add(this.add.circle(x - 14, FLOOR_Y - 95, 5, 0x5d4037));
        layer.add(this.add.circle(x + 14, FLOOR_Y - 95, 5, 0x5d4037));
    }

    drawRug (x: number)
    {
        this.floorLayer.add(this.add.ellipse(x, FLOOR_Y - 4, 160, 26, this.houseColour, 0.7));
    }

    drawPicture (x: number, y: number)
    {
        const layer = this.floorLayer;
        layer.add(this.add.rectangle(x, y, 70, 58, 0xfff9c4).setStrokeStyle(6, 0x8d6e63));
        layer.add(this.add.circle(x - 10, y + 6, 10, 0x43a047));
        layer.add(this.add.circle(x + 12, y - 6, 8, 0xffb300));
    }

    drawFrontDoor ()
    {
        const layer = this.floorLayer;
        const x = 130;

        layer.add(this.add.rectangle(x, FLOOR_Y - 95, 108, 190, 0x795548).setStrokeStyle(6, 0x4e342e));
        layer.add(this.add.rectangle(x, FLOOR_Y - 140, 70, 60, 0x5d4037));
        layer.add(this.add.circle(x + 36, FLOOR_Y - 90, 8, 0xffeb3b));

        const label = this.add.text(x, FLOOR_Y - 215, 'OUT', {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);
        layer.add(label);

        this.tweens.add({ targets: label, y: label.y - 8, duration: 600, yoyo: true, repeat: -1 });

        const zone = this.add.zone(x, FLOOR_Y - 95, 150, 230).setInteractive();
        layer.add(zone);
        zone.on('pointerdown', () => this.leave());
    }

    drawStairs (goingUp: boolean)
    {
        const layer = this.floorLayer;

        for (let i = 0; i < 6; i++)
        {
            const stepHeight = (i + 1) * 24;
            layer.add(this.add.rectangle(1052 + i * 34, FLOOR_Y - stepHeight / 2, 34, stepHeight, 0x8d6e63).setStrokeStyle(3, 0x5d4037));
        }

        const arrow = this.add.text(1150, FLOOR_Y - 210, goingUp ? 'UP' : 'DOWN', {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);
        layer.add(arrow);

        this.tweens.add({ targets: arrow, y: arrow.y - 8, duration: 600, yoyo: true, repeat: -1 });

        const zone = this.add.zone(1140, FLOOR_Y - 90, 230, 220).setInteractive();
        layer.add(zone);
        zone.on('pointerdown', () => this.showFloor(goingUp ? 1 : 0));
    }

    drawPerson (person: InteriorPerson)
    {
        const layer = this.floorLayer;

        const parts = [
            this.add.rectangle(-10, -22, 14, 44, 0x455a64),
            this.add.rectangle(10, -22, 14, 44, 0x455a64),
            this.add.rectangle(0, -78, 46, 72, person.shirt).setStrokeStyle(3, 0x263238),
            this.add.circle(0, -134, 26, person.skin),
            this.add.rectangle(0, -152, 50, 14, person.hair),
            this.add.circle(-9, -138, 3, 0x263238),
            this.add.circle(9, -138, 3, 0x263238)
        ];

        const body = this.add.container(person.x, FLOOR_Y, parts);
        layer.add(body);

        this.tweens.add({ targets: body, y: FLOOR_Y - 5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

        //  Speech bubble, shown when the player walks up. Older houses have
        //  greetings without {name} in them; those pass through untouched.
        const name = loadPlayerName().trim();
        const greeting = name.length > 0
            ? person.greeting.replace('{name}', name)
            : person.greeting.replace(', {name}', '');

        const text = this.add.text(0, 0, greeting, {
            fontFamily: 'Arial Black', fontSize: 22, color: '#263238'
        }).setOrigin(0.5);

        const bg = this.add.rectangle(0, 0, text.width + 36, 46, 0xffffff).setStrokeStyle(4, 0x263238);
        const tail = this.add.triangle(-10, 30, 0, 0, 24, 0, 12, 16, 0xffffff);

        const bubble = this.add.container(person.x, FLOOR_Y - 210, [ bg, tail, text ]);
        bubble.setAlpha(0);
        layer.add(bubble);

        this.peopleOnFloor.push({ data: person, bubble, shown: false });
    }

    createPlayer ()
    {
        const shirt = (this.registry.get('carColour') as number) ?? this.houseColour;

        this.legLeft = this.add.rectangle(-8, -18, 13, 36, 0x37474f);
        this.legRight = this.add.rectangle(8, -18, 13, 36, 0x37474f);

        this.player = this.add.container(150, FLOOR_Y, [
            this.legLeft,
            this.legRight,
            this.add.rectangle(0, -64, 40, 60, shirt).setStrokeStyle(3, 0x263238),
            this.add.circle(0, -112, 22, 0xffcc80),
            this.add.rectangle(0, -128, 44, 12, shirt),
            this.add.circle(-7, -115, 3, 0x263238),
            this.add.circle(7, -115, 3, 0x263238)
        ]);

        this.player.setDepth(10);
    }

    createWalkButtons ()
    {
        const makeArrow = (x: number, dir: number) => {

            const bg = this.add.circle(x, 890, 56, 0x102027, 0.55).setStrokeStyle(4, 0xffffff, 0.6);
            bg.setDepth(20);

            const tri = dir < 0
                ? this.add.triangle(x, 890, 40, 0, 40, 48, 0, 24, 0xffffff)
                : this.add.triangle(x, 890, 0, 0, 0, 48, 40, 24, 0xffffff);
            tri.setDepth(20);

            const zone = this.add.zone(x, 890, 130, 130).setInteractive();

            zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {

                if (dir < 0) { this.leftPointerId = pointer.id; }
                else { this.rightPointerId = pointer.id; }

            });
        };

        makeArrow(110, -1);
        makeArrow(260, 1);
    }

    onPointerUp (pointer: Phaser.Input.Pointer)
    {
        if (pointer.id === this.leftPointerId) this.leftPointerId = -1;
        if (pointer.id === this.rightPointerId) this.rightPointerId = -1;
    }

    leave ()
    {
        this.scene.resume('Driving');
        this.scene.resume('Dashboard');
        this.scene.stop();
    }

    update (time: number, delta: number)
    {
        const dt = delta / 1000;

        let dir = 0;

        if (this.leftPointerId !== -1 || this.cursors?.left.isDown) dir -= 1;
        if (this.rightPointerId !== -1 || this.cursors?.right.isDown) dir += 1;

        if (dir !== 0)
        {
            this.player.x = Phaser.Math.Clamp(this.player.x + dir * 280 * dt, 70, 1210);
            this.player.setScale(dir > 0 ? 1 : -1, 1);

            //  Little walking scissor-step
            const swing = Math.sin(time / 70) * 14;
            this.legLeft.x = -8 + swing;
            this.legRight.x = 8 - swing;
        }
        else
        {
            this.legLeft.x = -8;
            this.legRight.x = 8;
        }

        //  Residents greet the player when he walks up to them
        for (const person of this.peopleOnFloor)
        {
            const near = person.data.floor === this.floorIndex && Math.abs(this.player.x - person.data.x) < 160;

            if (near !== person.shown)
            {
                person.shown = near;
                this.tweens.add({ targets: person.bubble, alpha: near ? 1 : 0, duration: 180 });
            }
        }
    }
}
