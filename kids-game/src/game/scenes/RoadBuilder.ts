import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { Edge, mapCacheKey, MapData, OPPOSITE_EDGE, PlacedRoadStub, TILE } from '../mapBuilder';
import { ExtraRoadTile, loadCoins, saveCoins, saveExtraExit, saveExtraRoad, saveExtraStub, saveUnlockedTown } from '../storage';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;
const TILE_Y = 480;
const PREVIEW_TILE = 220;

//  Road builders get paid too!
const ROAD_REWARD = 5;

//  Taps needed to pave the tile, mirrors Cooking.ts's stir-counter idiom
const PAVES_NEEDED = 3;

//  The direction-picker grid: a true compass layout (north always up)
//  around the target tile, so a tile's real screen offset always matches
//  its real compass side — no canonical/abstract left-right relabelling
const GRID_TILE = 150;

const DIR_OFFSET: Record<Edge, [number, number]> = {
    north: [ 0, -GRID_TILE ], south: [ 0, GRID_TILE ], east: [ GRID_TILE, 0 ], west: [ -GRID_TILE, 0 ]
};

export class RoadBuilder extends Scene
{
    mapId = '';
    stub: PlacedRoadStub;
    targetCol = 0;
    targetRow = 0;

    instruction: Phaser.GameObjects.Text;
    paletteZones: Phaser.GameObjects.Container[] = [];
    newTile: Phaser.GameObjects.Rectangle;
    pavesLeft = PAVES_NEEDED;
    chosenSides: Edge[] = [];
    crossing: ExtraRoadTile['crossing'] = undefined;
    crossingChoice: 'bridge' | 'tunnel' | null = null;
    finished = false;

    constructor ()
    {
        super('RoadBuilder');
    }

    init (data: { mapId: string; stub: PlacedRoadStub })
    {
        this.mapId = data.mapId;
        this.stub = data.stub;

        //  The stub's x/y is already the target tile's own centre pixel
        this.targetCol = Math.round(this.stub.x / TILE - 0.5);
        this.targetRow = Math.round(this.stub.y / TILE - 0.5);

        this.pavesLeft = PAVES_NEEDED;
        this.chosenSides = [];
        this.crossing = undefined;
        this.crossingChoice = null;
        this.finished = false;
        this.paletteZones = [];
    }

    create ()
    {
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x7cb342);

        const title = this.stub.unlocksMap ? 'Build the road out of town!' : this.stub.isCrossing ? 'A road crosses here!' : 'Where should the road go?';

        this.instruction = this.add.text(CX, 90, title, {
            fontFamily: 'Arial Black', fontSize: 44, color: '#ffffff',
            stroke: '#00000', strokeThickness: 8
        }).setOrigin(0.5);

        //  Quit button
        this.add.circle(GAME_WIDTH - 60, 60, 30, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(GAME_WIDTH - 60, 60, 'X', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(GAME_WIDTH - 60, 60, 90, 90).setInteractive().on('pointerdown', () => this.cancel());

        if (this.stub.unlocksMap)
        {
            this.showUnlockPreview(this.stub.unlocksMap);
            this.paletteZones.push(this.makeChoiceButton(CX, 760, 'UNLOCK', 0x43a047, () => this.pickUnlock()));

            return;
        }

        if (this.stub.isCrossing)
        {
            //  A canonical two-tile preview — the existing road on the left
            //  connecting to the already-road tile on the right — since
            //  there's nothing new to pave here, just a choice to make
            this.add.rectangle(CX - PREVIEW_TILE / 2 - 20, TILE_Y, PREVIEW_TILE, PREVIEW_TILE, 0x9e9e9e).setStrokeStyle(4, 0x616161);
            this.add.rectangle(CX - PREVIEW_TILE / 2 - 20, TILE_Y, PREVIEW_TILE - 40, 24, 0xffffff, 0.6);

            this.newTile = this.add.rectangle(CX + PREVIEW_TILE / 2 + 20, TILE_Y, PREVIEW_TILE, PREVIEW_TILE, 0x9e9e9e).setStrokeStyle(4, 0x616161);

            this.showCrossingChoice();

            return;
        }

        this.showDirectionPicker();
    }

    //  A real, true-compass snapshot of the target tile and its neighbours
    //  (north always up, matching the actual map) — grass sides you can
    //  grow into are tappable, anything blocked or already road is shown
    //  as it really is, so a loop or a crossing is something you can see
    //  coming rather than discover afterwards
    showDirectionPicker ()
    {
        const entrySide = OPPOSITE_EDGE[this.stub.edge];
        const valid = new Set(this.stub.validSides);
        const otherSides: Edge[] = ([ 'north', 'south', 'east', 'west' ] as Edge[]).filter(side => side !== entrySide);

        const [ ex, ey ] = DIR_OFFSET[entrySide];
        this.add.rectangle(CX + ex, TILE_Y + ey, GRID_TILE, GRID_TILE, 0x555555).setStrokeStyle(4, 0x333333);

        this.newTile = this.add.rectangle(CX, TILE_Y, GRID_TILE, GRID_TILE, 0x7cb342).setStrokeStyle(4, 0x33691e);

        for (const side of otherSides)
        {
            const [ dx, dy ] = DIR_OFFSET[side];
            const x = CX + dx;
            const y = TILE_Y + dy;

            if (valid.has(side))
            {
                const tile = this.add.rectangle(0, 0, GRID_TILE - 6, GRID_TILE - 6, 0x9ccc65).setStrokeStyle(4, 0x558b2f);
                const container = this.add.container(x, y, [ tile ]);

                const zone = this.add.zone(0, 0, GRID_TILE, GRID_TILE).setInteractive();
                zone.on('pointerdown', () => this.pickDirection(side));
                container.add(zone);

                this.paletteZones.push(container);
            }
            else
            {
                this.add.rectangle(x, y, GRID_TILE - 6, GRID_TILE - 6, 0x000000, 0.15).setStrokeStyle(3, 0x000000, 0.25);
            }
        }

        this.paletteZones.push(this.makeChoiceButton(CX, 760, 'FINISH', 0x616161, () => this.pickDirection(null)));
    }

    pickDirection (side: Edge | null)
    {
        this.chosenSides = side ? [ side ] : [];

        for (const zone of this.paletteZones)
        {
            zone.destroy();
        }

        this.paletteZones = [];

        this.instruction.setText(`Pave it! (${this.pavesLeft} left)`);
        this.newTile.setInteractive();
        this.newTile.on('pointerdown', () => this.paveTap());
    }

    //  A signpost preview of the town this stub would open up, in the same
    //  style as the real in-world signposts mapBuilder draws at an exit
    showUnlockPreview (targetId: string)
    {
        const targetData = this.cache.json.get(mapCacheKey(targetId)) as MapData | undefined;
        const label = targetData?.name ?? targetId;

        this.add.rectangle(CX, TILE_Y, 10, 260, 0x795548).setStrokeStyle(3, 0x4e342e);

        const board = this.add.rectangle(CX, TILE_Y - 120, 320, 70, 0xfff3e0);
        board.setStrokeStyle(5, 0x5d4037);

        this.add.text(CX, TILE_Y - 120, `→ ${label}`, {
            fontFamily: 'Arial Black', fontSize: 28, color: '#3e2723'
        }).setOrigin(0.5);
    }

    pickUnlock ()
    {
        for (const zone of this.paletteZones)
        {
            zone.destroy();
        }

        this.paletteZones = [];

        this.finish();
    }

    //  A perpendicular road already runs through the target tile — offer to
    //  go over it (bridge) or under it (tunnel) instead of the usual palette
    showCrossingChoice ()
    {
        this.paletteZones.push(this.makeChoiceButton(CX - 110, 760, 'BRIDGE', 0x8d6e63, () => this.pickCrossing('bridge')));
        this.paletteZones.push(this.makeChoiceButton(CX + 110, 760, 'TUNNEL', 0x455a64, () => this.pickCrossing('tunnel')));
    }

    makeChoiceButton (x: number, y: number, label: string, colour: number, onTap: () => void): Phaser.GameObjects.Container
    {
        const dark = Phaser.Display.Color.IntegerToColor(colour).darken(35).color;

        const bg = this.add.graphics();
        bg.fillStyle(colour, 1);
        bg.fillRoundedRect(-90, -45, 180, 90, 16);
        bg.lineStyle(5, dark, 1);
        bg.strokeRoundedRect(-90, -45, 180, 90, 16);

        const text = this.add.text(0, 0, label, {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
        }).setOrigin(0.5);

        const container = this.add.container(x, y, [ bg, text ]);

        const zone = this.add.zone(0, 0, 190, 100).setInteractive();
        zone.on('pointerdown', onTap);
        container.add(zone);

        return container;
    }

    //  The new road picks which axis rides over the other; the "beyond"
    //  continuation only exists if the straight-ahead side is still open
    pickCrossing (choice: 'bridge' | 'tunnel')
    {
        const newAxis: 'ns' | 'ew' = (this.stub.edge === 'north' || this.stub.edge === 'south') ? 'ns' : 'ew';
        const otherAxis: 'ns' | 'ew' = newAxis === 'ns' ? 'ew' : 'ns';

        this.crossing = choice === 'bridge' ? `${newAxis}-over` : `${otherAxis}-over`;
        this.crossingChoice = choice;
        this.chosenSides = this.stub.validSides.includes(this.stub.edge) ? [ this.stub.edge ] : [];

        for (const zone of this.paletteZones)
        {
            zone.destroy();
        }

        this.paletteZones = [];

        this.finish();
    }

    paveTap ()
    {
        if (this.pavesLeft <= 0)
        {
            return;
        }

        this.pavesLeft--;

        const progress = (PAVES_NEEDED - this.pavesLeft) / PAVES_NEEDED;
        const from = Phaser.Display.Color.IntegerToColor(0x7cb342);
        const to = Phaser.Display.Color.IntegerToColor(0x9e9e9e);
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, Math.round(progress * 100));

        this.newTile.setFillStyle(Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b));
        this.tweens.add({ targets: this.newTile, scaleX: 0.9, scaleY: 0.9, duration: 90, yoyo: true });

        if (this.pavesLeft > 0)
        {
            this.instruction.setText(`Pave it! (${this.pavesLeft} left)`);
        }
        else
        {
            this.newTile.disableInteractive();
            this.finish();
        }
    }

    finish ()
    {
        if (this.finished)
        {
            return;
        }

        this.finished = true;

        if (this.stub.unlocksMap)
        {
            saveExtraExit(this.mapId, this.stub.edge, this.stub.unlocksMap);
            saveUnlockedTown(this.stub.unlocksMap);
        }
        else
        {
            saveExtraRoad(this.mapId, { col: this.targetCol, row: this.targetRow, crossing: this.crossing });

            //  The new tile is now road, so it can keep growing — one
            //  continuation stub per side the chosen piece opened up
            for (const side of this.chosenSides)
            {
                saveExtraStub(this.mapId, {
                    id: `${this.mapId}-stub-${this.targetCol}x${this.targetRow}-${side}`,
                    col: this.targetCol,
                    row: this.targetRow,
                    edge: side
                });
            }
        }

        //  Pay the road builder
        const coins = ((this.registry.get('coins') as number) ?? loadCoins()) + ROAD_REWARD;
        this.registry.set('coins', coins);
        saveCoins(coins);

        const built = this.crossingChoice ?? 'road';
        this.instruction.setText(`You built a ${built}! +${ROAD_REWARD} coins!`);
        this.tweens.add({ targets: this.instruction, scale: 1.25, duration: 300, yoyo: true, repeat: 2 });

        //  Coin shower
        for (let i = 0; i < ROAD_REWARD; i++)
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
