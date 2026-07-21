import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { PlacedRoadStub, TILE } from '../mapBuilder';
import { loadCoins, saveCoins, saveExtraRoad, saveExtraStub } from '../storage';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;
const TILE_Y = 480;
const PREVIEW_TILE = 220;

//  Road builders get paid too!
const ROAD_REWARD = 5;

//  Taps needed to pave the tile, mirrors Cooking.ts's stir-counter idiom
const PAVES_NEEDED = 3;

export class RoadBuilder extends Scene
{
    mapId = '';
    stub: PlacedRoadStub;
    targetCol = 0;
    targetRow = 0;

    instruction: Phaser.GameObjects.Text;
    paletteContainer: Phaser.GameObjects.Container | null = null;
    newTile: Phaser.GameObjects.Rectangle;
    pavesLeft = PAVES_NEEDED;
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
        this.finished = false;
        this.paletteContainer = null;
    }

    create ()
    {
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x7cb342);

        this.instruction = this.add.text(CX, 90, 'Pick a piece to build!', {
            fontFamily: 'Arial Black', fontSize: 44, color: '#ffffff',
            stroke: '#00000', strokeThickness: 8
        }).setOrigin(0.5);

        //  Quit button
        this.add.circle(GAME_WIDTH - 60, 60, 30, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(GAME_WIDTH - 60, 60, 'X', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(GAME_WIDTH - 60, 60, 90, 90).setInteractive().on('pointerdown', () => this.cancel());

        //  A canonical two-tile preview — the existing road on the left
        //  connecting to the new grass tile on the right — rather than a
        //  literal replay of the map's own orientation
        this.add.rectangle(CX - PREVIEW_TILE / 2 - 20, TILE_Y, PREVIEW_TILE, PREVIEW_TILE, 0x9e9e9e).setStrokeStyle(4, 0x616161);
        this.add.rectangle(CX - PREVIEW_TILE / 2 - 20, TILE_Y, PREVIEW_TILE - 40, 24, 0xffffff, 0.6);

        this.newTile = this.add.rectangle(CX + PREVIEW_TILE / 2 + 20, TILE_Y, PREVIEW_TILE, PREVIEW_TILE, 0x7cb342).setStrokeStyle(4, 0x33691e);

        this.showPalette();
    }

    showPalette ()
    {
        const bg = this.add.graphics();
        bg.fillStyle(0x616161, 1);
        bg.fillRoundedRect(-110, -60, 220, 120, 16);
        bg.lineStyle(5, 0x212121, 1);
        bg.strokeRoundedRect(-110, -60, 220, 120, 16);

        const road = this.add.rectangle(0, 0, 180, 30, 0x424242);
        const dash = this.add.rectangle(0, 0, 40, 8, 0xffffff, 0.8);
        const label = this.add.text(0, 90, 'STRAIGHT', {
            fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff'
        }).setOrigin(0.5);

        this.paletteContainer = this.add.container(CX, 760, [ bg, road, dash, label ]);

        const zone = this.add.zone(0, 0, 240, 140).setInteractive();
        zone.on('pointerdown', () => this.pickStraight());
        this.paletteContainer.add(zone);
    }

    pickStraight ()
    {
        this.paletteContainer?.destroy();
        this.paletteContainer = null;

        this.instruction.setText(`Pave it! (${this.pavesLeft} left)`);
        this.newTile.setInteractive();
        this.newTile.on('pointerdown', () => this.paveTap());
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

        saveExtraRoad(this.mapId, { col: this.targetCol, row: this.targetRow });

        //  The new tile is now road, so it can keep growing the same way
        //  the piece it was built from did — one continuation stub, same
        //  edge, sat on the tile that was just paved
        saveExtraStub(this.mapId, {
            id: `${this.mapId}-stub-${this.targetCol}x${this.targetRow}-${this.stub.edge}`,
            col: this.targetCol,
            row: this.targetRow,
            edge: this.stub.edge
        });

        //  Pay the road builder
        const coins = ((this.registry.get('coins') as number) ?? loadCoins()) + ROAD_REWARD;
        this.registry.set('coins', coins);
        saveCoins(coins);

        this.instruction.setText(`You built a road! +${ROAD_REWARD} coins!`);
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
