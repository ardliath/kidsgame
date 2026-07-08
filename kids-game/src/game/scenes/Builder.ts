import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { NAMED_COLOURS } from '../mapBuilder';
import { saveBuiltHouse } from '../storage';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;

//  The house front is a 5 x 4 wall of bricks above a dug foundation
const BRICK_COLS = 5;
const BRICK_ROWS = 4;
const BRICK_W = 104;
const BRICK_H = 56;
const GROUND_Y = 700;
const WALL_LEFT = CX - (BRICK_COLS * BRICK_W) / 2;

const SWATCH_NAMES = [ 'red', 'orange', 'yellow', 'green', 'blue', 'purple' ];

interface Mound
{
    ellipse: Phaser.GameObjects.Ellipse;
    zone: Phaser.GameObjects.Zone;
    hits: number;
}

//  A single brick-shaped space in the wall. Rows alternate between full
//  bricks and a "running bond" offset (half brick, fulls, half brick), so
//  each brick overlaps the joint between the two bricks beneath it — just
//  like real brickwork — rather than sitting in a plain stack.
//  xUnits are in half-brick units from the left edge of the wall, so
//  overlap between rows can be compared directly.
interface BrickSlot
{
    row: number;
    index: number;
    xUnits: [number, number];
    x: number;
    width: number;
    rect: Phaser.GameObjects.Rectangle;
    laid: boolean;
}

export class Builder extends Scene
{
    siteId = '';
    instruction: Phaser.GameObjects.Text;

    mounds: Mound[] = [];
    dugCount = 0;

    bricks: Phaser.GameObjects.Rectangle[] = [];
    brickSlots: BrickSlot[] = [];
    pulseTweens: Map<string, Phaser.Tweens.Tween> = new Map();
    totalPieces = 0;
    laidCount = 0;

    chosenColour = 'red';
    swatchRings: Map<string, Phaser.GameObjects.Arc> = new Map();
    finished = false;

    constructor ()
    {
        super('Builder');
    }

    init (data: { siteId: string })
    {
        this.siteId = data.siteId;
    }

    create ()
    {
        this.mounds = [];
        this.dugCount = 0;
        this.bricks = [];
        this.brickSlots = [];
        this.pulseTweens.clear();
        this.totalPieces = 0;
        this.laidCount = 0;
        this.chosenColour = 'red';
        this.swatchRings.clear();
        this.finished = false;

        //  Sky, sun and grass
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x81d4fa);
        this.add.circle(150, 130, 60, 0xffeb3b);
        this.add.ellipse(1000, 150, 220, 70, 0xffffff);
        this.add.ellipse(880, 190, 160, 50, 0xffffff);
        this.add.rectangle(CX, (GROUND_Y + GAME_HEIGHT) / 2, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, 0x7cb342);

        this.instruction = this.add.text(CX, 90, 'Tap the dirt to dig!', {
            fontFamily: 'Arial Black', fontSize: 44, color: '#ffffff',
            stroke: '#00000', strokeThickness: 8
        }).setOrigin(0.5);

        //  Quit button
        this.add.circle(GAME_WIDTH - 60, 60, 30, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(GAME_WIDTH - 60, 60, 'X', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(GAME_WIDTH - 60, 60, 90, 90).setInteractive().on('pointerdown', () => this.cancel());

        this.createMounds();
    }

    slotX (col: number): number
    {
        return WALL_LEFT + BRICK_W / 2 + col * BRICK_W;
    }

    createMounds ()
    {
        for (let i = 0; i < BRICK_COLS; i++)
        {
            const x = this.slotX(i);

            const ellipse = this.add.ellipse(x, GROUND_Y - 20, 92, 56, 0x8d6e63);
            ellipse.setStrokeStyle(4, 0x6d4c41);

            const zone = this.add.zone(x, GROUND_Y - 20, 104, 100);
            zone.setInteractive();

            const mound: Mound = { ellipse, zone, hits: 0 };
            this.mounds.push(mound);

            zone.on('pointerdown', () => this.dig(mound));
        }
    }

    dig (mound: Mound)
    {
        mound.hits++;

        if (mound.hits === 1)
        {
            //  First hit: the mound squashes down
            mound.ellipse.setFillStyle(0x795548);
            this.tweens.add({ targets: mound.ellipse, scaleY: 0.55, scaleX: 0.85, duration: 120 });
        }
        else if (mound.hits === 2)
        {
            //  Second hit: it becomes a dug hole
            mound.ellipse.destroy();
            mound.zone.destroy();

            this.add.rectangle(mound.zone.x, GROUND_Y - 12, 96, 32, 0x4e342e);

            this.dugCount++;

            if (this.dugCount === BRICK_COLS)
            {
                this.startBricks();
            }
        }
    }

    startBricks ()
    {
        //  Concrete pours into the trench
        const concrete = this.add.rectangle(CX, GROUND_Y - 12, BRICK_COLS * BRICK_W + 16, 0, 0xbdbdbd);
        this.tweens.add({ targets: concrete, height: 32, displayHeight: 32, duration: 300 });

        this.instruction.setText('Lay the bricks!');

        this.buildBrickSlots();
    }

    brickY (row: number): number
    {
        return GROUND_Y - 28 - 28 - row * BRICK_H;
    }

    //  Lays out every brick-shaped gap in the wall up front. Even rows are
    //  full bricks; odd rows are offset by half a brick (a half brick at
    //  each end) so every brick sits over the joint of two bricks below —
    //  a running bond, same as a real wall.
    buildBrickSlots ()
    {
        const halfUnit = BRICK_W / 2;

        for (let row = 0; row < BRICK_ROWS; row++)
        {
            const offset = row % 2 === 1;
            const pieces: [number, number][] = [];

            if (!offset)
            {
                for (let c = 0; c < BRICK_COLS; c++)
                {
                    pieces.push([ c * 2, c * 2 + 2 ]);
                }
            }
            else
            {
                pieces.push([ 0, 1 ]);

                for (let c = 0; c < BRICK_COLS - 1; c++)
                {
                    pieces.push([ 1 + c * 2, 3 + c * 2 ]);
                }

                pieces.push([ BRICK_COLS * 2 - 1, BRICK_COLS * 2 ]);
            }

            pieces.forEach((units, index) => {

                const x = WALL_LEFT + (units[0] + units[1]) / 2 * halfUnit;
                const width = (units[1] - units[0]) * halfUnit;

                const rect = this.add.rectangle(x, this.brickY(row), width - 8, BRICK_H - 8, 0xffffff, 0.08);
                rect.setStrokeStyle(3, 0xffffff, 0.35);

                const slot: BrickSlot = { row, index, xUnits: units, x, width, rect, laid: false };
                this.brickSlots.push(slot);

                rect.on('pointerdown', () => this.layBrick(slot));

            });
        }

        this.totalPieces = this.brickSlots.length;

        //  The ground row rests on the foundation, so it starts unlocked
        for (const slot of this.brickSlots)
        {
            if (slot.row === 0)
            {
                this.unlockSlot(slot);
            }
        }
    }

    overlaps (a: [number, number], b: [number, number]): boolean
    {
        return a[0] < b[1] && b[0] < a[1];
    }

    isSupported (slot: BrickSlot): boolean
    {
        if (slot.row === 0)
        {
            return true;
        }

        return this.brickSlots
            .filter(s => s.row === slot.row - 1 && this.overlaps(s.xUnits, slot.xUnits))
            .every(s => s.laid);
    }

    unlockSlot (slot: BrickSlot)
    {
        slot.rect.setInteractive();

        const tween = this.tweens.add({
            targets: slot.rect,
            fillAlpha: 0.3,
            strokeAlpha: 1,
            duration: 400,
            yoyo: true,
            repeat: -1
        });

        this.pulseTweens.set(`${slot.row}-${slot.index}`, tween);
    }

    layBrick (slot: BrickSlot)
    {
        //  Needs its supporting brick(s) below in place first
        if (slot.laid || !this.isSupported(slot))
        {
            this.tweens.add({ targets: slot.rect, x: slot.x + 6, duration: 50, yoyo: true, repeat: 1 });

            return;
        }

        slot.laid = true;
        this.laidCount++;

        const key = `${slot.row}-${slot.index}`;
        this.pulseTweens.get(key)?.destroy();
        this.pulseTweens.delete(key);

        slot.rect.destroy();

        const colour = NAMED_COLOURS[this.chosenColour];
        const darker = Phaser.Display.Color.IntegerToColor(colour).darken(35).color;

        const brick = this.add.rectangle(slot.x, this.brickY(slot.row), slot.width - 8, BRICK_H - 8, colour);
        brick.setStrokeStyle(4, darker);
        brick.setScale(0);
        this.tweens.add({ targets: brick, scaleX: 1, scaleY: 1, duration: 140, ease: 'Back.Out' });

        this.bricks.push(brick);

        //  This may have just freed up bricks in the row above
        for (const above of this.brickSlots)
        {
            if (above.row === slot.row + 1 && !above.laid && !this.pulseTweens.has(`${above.row}-${above.index}`) && this.isSupported(above))
            {
                this.unlockSlot(above);
            }
        }

        if (this.laidCount === this.totalPieces)
        {
            this.decorate();
        }
    }

    decorate ()
    {
        //  Door and windows pop in, then the roof slides down
        const wallTop = this.brickY(BRICK_ROWS - 1) - BRICK_H / 2;

        const door = this.add.rectangle(CX, GROUND_Y - 56 - 60, 84, 120, 0x6d4c41).setScale(0);
        this.tweens.add({ targets: door, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.Out', delay: 100 });

        const knob = this.add.circle(CX + 26, GROUND_Y - 56 - 60, 7, 0xffeb3b).setAlpha(0);
        this.tweens.add({ targets: knob, alpha: 1, duration: 150, delay: 320 });

        for (const wx of [ CX - 140, CX + 140 ])
        {
            const window = this.add.rectangle(wx, this.brickY(2), 90, 70, 0xb3e5fc).setStrokeStyle(6, 0xffffff).setScale(0);
            this.tweens.add({ targets: window, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.Out', delay: 250 });
        }

        const roofWidth = BRICK_COLS * BRICK_W + 60;
        const roof = this.add.triangle(CX, -100, 0, 120, roofWidth, 120, roofWidth / 2, 0, 0x6d4c41);
        this.tweens.add({ targets: roof, y: wallTop - 60, duration: 450, ease: 'Bounce.Out', delay: 450 });

        this.time.delayedCall(1000, () => this.showColourPicker());
    }

    showColourPicker ()
    {
        this.instruction.setText('Pick a colour!');

        SWATCH_NAMES.forEach((name, i) => {

            const x = CX - 225 + i * 90;

            const ring = this.add.circle(x, 850, 40);
            ring.setStrokeStyle(5, 0xffffff);
            ring.setVisible(name === this.chosenColour);
            this.swatchRings.set(name, ring);

            this.add.circle(x, 850, 32, NAMED_COLOURS[name]).setStrokeStyle(3, 0x455a64);

            this.add.zone(x, 850, 84, 84).setInteractive().on('pointerdown', () => this.pickColour(name));

        });

        //  Big friendly DONE button
        const g = this.add.graphics();
        g.fillStyle(0x43a047, 1);
        g.fillRoundedRect(1010, 810, 200, 80, 20);
        g.lineStyle(5, 0x1b5e20, 1);
        g.strokeRoundedRect(1010, 810, 200, 80, 20);

        this.add.text(1110, 850, 'DONE', {
            fontFamily: 'Arial Black', fontSize: 34, color: '#ffffff'
        }).setOrigin(0.5);

        this.add.zone(1110, 850, 210, 90).setInteractive().on('pointerdown', () => this.finish());
    }

    pickColour (name: string)
    {
        this.chosenColour = name;

        const colour = NAMED_COLOURS[name];
        const darker = Phaser.Display.Color.IntegerToColor(colour).darken(35).color;

        for (const brick of this.bricks)
        {
            brick.setFillStyle(colour);
            brick.setStrokeStyle(4, darker);
        }

        for (const [ ringName, ring ] of this.swatchRings)
        {
            ring.setVisible(ringName === name);
        }
    }

    finish ()
    {
        if (this.finished)
        {
            return;
        }

        this.finished = true;

        saveBuiltHouse(this.siteId, this.chosenColour);

        this.instruction.setText('You built a house!');
        this.tweens.add({ targets: this.instruction, scale: 1.25, duration: 300, yoyo: true, repeat: 2 });

        //  Give the celebration a moment, then drive off with the new house in place
        this.time.delayedCall(1400, () => {

            const driving = this.scene.get('Driving') as Driving;

            driving.scene.restart({
                mapId: this.registry.get('mapId') as string,
                entry: { x: driving.car.x, y: driving.car.y, heading: driving.heading, speed: 0 }
            });

            this.scene.resume('Dashboard');
            this.scene.stop();

        });
    }

    cancel ()
    {
        this.scene.resume('Driving');
        this.scene.resume('Dashboard');
        this.scene.stop();
    }
}
