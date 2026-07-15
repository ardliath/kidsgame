import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { NAMED_COLOURS } from '../mapBuilder';
import { loadCoins, saveBuiltHouse, saveCoins } from '../storage';
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

//  Openings left in the wall while bricking (in half-brick units, same
//  scale as BrickSlot.xUnits), filled in by hand once the rest is up
const DOOR_UNITS: [number, number] = [ 4, 6 ];
const WINDOW_UNITS: [number, number][] = [ [ 2, 4 ], [ 6, 8 ] ];

//  Builders get paid!
const BUILD_REWARD = 5;

//  The foundations start as a top-down square plot; only the ring of tiles
//  around the edge is the trench, dug one tap each, grass green to dirt brown
const DIG_GRID = 5;
const DIG_TILE = 72;
const DIG_CENTRE_Y = 470;

//  One tile of the foundation trench, seen from above
interface DirtTile
{
    rect: Phaser.GameObjects.Rectangle;
    dug: boolean;
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

//  A door- or window-shaped gap, tapped by hand once the wall is up
interface OpeningSlot
{
    zone: Phaser.GameObjects.Zone;
    marker: Phaser.GameObjects.Rectangle;
    tween: Phaser.Tweens.Tween;
    filled: boolean;
    build: () => void;
}

export class Builder extends Scene
{
    siteId = '';
    instruction: Phaser.GameObjects.Text;

    dirtTiles: DirtTile[] = [];
    allDigRects: Phaser.GameObjects.Rectangle[] = [];
    digBackground: Phaser.GameObjects.Rectangle | null = null;
    dugCount = 0;

    bricks: Phaser.GameObjects.Rectangle[] = [];
    brickSlots: BrickSlot[] = [];
    pulseTweens: Map<string, Phaser.Tweens.Tween> = new Map();
    totalPieces = 0;
    laidCount = 0;

    openings: OpeningSlot[] = [];
    openingsFilled = 0;

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
        this.dirtTiles = [];
        this.allDigRects = [];
        this.digBackground = null;
        this.dugCount = 0;
        this.bricks = [];
        this.brickSlots = [];
        this.pulseTweens.clear();
        this.totalPieces = 0;
        this.laidCount = 0;
        this.openings = [];
        this.openingsFilled = 0;
        this.chosenColour = 'red';
        this.swatchRings.clear();
        this.finished = false;

        //  Digging is a top-down look at the plot, so it's grass all the
        //  way to every edge — no sky until we stand the wall up afterwards
        this.digBackground = this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x7cb342);

        this.instruction = this.add.text(CX, 90, 'Dig out the foundations!', {
            fontFamily: 'Arial Black', fontSize: 44, color: '#ffffff',
            stroke: '#00000', strokeThickness: 8
        }).setOrigin(0.5);

        //  Quit button
        this.add.circle(GAME_WIDTH - 60, 60, 30, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(GAME_WIDTH - 60, 60, 'X', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(GAME_WIDTH - 60, 60, 90, 90).setInteractive().on('pointerdown', () => this.cancel());

        this.createDirtGrid();
    }

    //  A top-down look at the building plot: a 5x5 square of grass tiles.
    //  Only the ring around the edge is the trench — tap a tile to dig it,
    //  flipping it from grass green to dug-out brown. The 3x3 in the middle
    //  is just the untouched lawn where the house floor will be.
    createDirtGrid ()
    {
        const left = CX - (DIG_GRID * DIG_TILE) / 2;
        const top = DIG_CENTRE_Y - (DIG_GRID * DIG_TILE) / 2;

        for (let row = 0; row < DIG_GRID; row++)
        {
            for (let col = 0; col < DIG_GRID; col++)
            {
                const border = row === 0 || row === DIG_GRID - 1 || col === 0 || col === DIG_GRID - 1;
                const x = left + col * DIG_TILE + DIG_TILE / 2;
                const y = top + row * DIG_TILE + DIG_TILE / 2;

                const rect = this.add.rectangle(x, y, DIG_TILE - 6, DIG_TILE - 6, 0x7cb342);
                rect.setStrokeStyle(3, 0x33691e);
                this.allDigRects.push(rect);

                if (!border)
                {
                    continue;
                }

                rect.setInteractive();

                const tile: DirtTile = { rect, dug: false };
                this.dirtTiles.push(tile);

                rect.on('pointerdown', () => this.digTile(tile));
            }
        }
    }

    digTile (tile: DirtTile)
    {
        if (tile.dug)
        {
            return;
        }

        tile.dug = true;
        tile.rect.disableInteractive();
        tile.rect.setFillStyle(0x6d4c41);
        tile.rect.setStrokeStyle(3, 0x4e342e);

        this.tweens.add({ targets: tile.rect, scaleX: 0.85, scaleY: 0.85, duration: 100, yoyo: true });

        this.dugCount++;

        if (this.dugCount === this.dirtTiles.length)
        {
            for (const rect of this.allDigRects)
            {
                rect.destroy();
            }

            this.allDigRects = [];

            this.digBackground?.destroy();
            this.digBackground = null;

            this.buildFrontBackdrop();
            this.startBricks();
        }
    }

    //  Standing the view up from looking-straight-down at the plot to
    //  looking-straight-at the wall we're about to build: sky, sun, grass.
    //  Sent behind everything already on screen (the instruction text, quit
    //  button) since it's added well after them.
    buildFrontBackdrop ()
    {
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x81d4fa).setDepth(-10);
        this.add.circle(150, 130, 60, 0xffeb3b).setDepth(-10);
        this.add.ellipse(1000, 150, 220, 70, 0xffffff).setDepth(-10);
        this.add.ellipse(880, 190, 160, 50, 0xffffff).setDepth(-10);
        this.add.rectangle(CX, (GROUND_Y + GAME_HEIGHT) / 2, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, 0x7cb342).setDepth(-10);
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
            let pieces: [number, number][] = [];

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

            //  Cut the door (rows 0-1) and windows (row 2) out of the wall,
            //  capping the cut edges with a half brick when the row's own
            //  bond doesn't already land exactly on the opening's edge
            const openings = row <= 1 ? [ DOOR_UNITS ] : row === 2 ? WINDOW_UNITS : [];

            for (const [ a, b ] of openings)
            {
                const next: [number, number][] = [];

                for (const piece of pieces)
                {
                    if (piece[1] <= a || piece[0] >= b)
                    {
                        next.push(piece);
                        continue;
                    }

                    if (piece[0] < a)
                    {
                        next.push([ piece[0], a ]);
                    }

                    if (piece[1] > b)
                    {
                        next.push([ b, piece[1] ]);
                    }
                }

                pieces = next;
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

    //  The wall's up; the door and window holes are left showing the sky
    //  through them, same pulsing look as an unlocked brick, until he taps
    //  each one in by hand
    decorate ()
    {
        this.instruction.setText('Tap in the door and windows!');

        this.addOpening(CX, GROUND_Y - 84, 96, 104, () => this.placeDoor());

        for (const wx of [ CX - 104, CX + 104 ])
        {
            this.addOpening(wx, this.brickY(2), 96, 48, () => this.placeWindow(wx));
        }
    }

    addOpening (x: number, y: number, width: number, height: number, build: () => void)
    {
        const marker = this.add.rectangle(x, y, width, height, 0xffffff, 0.08).setStrokeStyle(3, 0xffffff, 0.35);
        const zone = this.add.zone(x, y, width + 8, height + 8).setInteractive();

        const tween = this.tweens.add({
            targets: marker,
            fillAlpha: 0.3,
            strokeAlpha: 1,
            duration: 400,
            yoyo: true,
            repeat: -1
        });

        const slot: OpeningSlot = { zone, marker, tween, filled: false, build };
        this.openings.push(slot);

        zone.on('pointerdown', () => this.fillOpening(slot));
    }

    fillOpening (slot: OpeningSlot)
    {
        if (slot.filled)
        {
            return;
        }

        slot.filled = true;
        slot.tween.destroy();
        slot.zone.destroy();
        slot.marker.destroy();

        slot.build();
        this.openingsFilled++;

        if (this.openingsFilled === this.openings.length)
        {
            this.raiseRoof();
        }
    }

    placeDoor ()
    {
        const door = this.add.rectangle(CX, GROUND_Y - 84, 84, 104, 0x6d4c41).setScale(0);
        this.tweens.add({ targets: door, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.Out' });

        const knob = this.add.circle(CX + 26, GROUND_Y - 84, 7, 0xffeb3b).setAlpha(0);
        this.tweens.add({ targets: knob, alpha: 1, duration: 150, delay: 120 });
    }

    placeWindow (wx: number)
    {
        const window = this.add.rectangle(wx, this.brickY(2), 90, 70, 0xb3e5fc).setStrokeStyle(6, 0xffffff).setScale(0);
        this.tweens.add({ targets: window, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.Out' });
    }

    raiseRoof ()
    {
        const wallTop = this.brickY(BRICK_ROWS - 1) - BRICK_H / 2;
        const roofWidth = BRICK_COLS * BRICK_W + 60;

        const roof = this.add.triangle(CX, -100, 0, 120, roofWidth, 120, roofWidth / 2, 0, 0x6d4c41);
        this.tweens.add({ targets: roof, y: wallTop - 60, duration: 450, ease: 'Bounce.Out' });

        this.time.delayedCall(650, () => this.showColourPicker());
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

        //  Pay the builder
        const coins = ((this.registry.get('coins') as number) ?? loadCoins()) + BUILD_REWARD;
        this.registry.set('coins', coins);
        saveCoins(coins);

        this.instruction.setText(`You built a house! +${BUILD_REWARD} coins!`);
        this.tweens.add({ targets: this.instruction, scale: 1.25, duration: 300, yoyo: true, repeat: 2 });

        //  Coin shower
        for (let i = 0; i < BUILD_REWARD; i++)
        {
            const coin = this.add.circle(CX - 100 + i * 50, -30, 18, 0xffd54f).setStrokeStyle(4, 0xf9a825);

            this.tweens.add({
                targets: coin,
                y: 240 + Math.random() * 60,
                duration: 500 + i * 120,
                ease: 'Bounce.Out',
                delay: i * 90
            });
        }

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
