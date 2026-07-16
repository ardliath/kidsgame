import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapesSide, GROUND_Y } from '../carShapesSide';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { playSplash } from '../sfx';
import { saveDirt } from '../storage';

const CX = GAME_WIDTH / 2;
const FLOOR_Y = 620;
const CAR_SCALE = 1.6;
const MAX_SCRUBS = 8;

//  Rough, generic speckle spots spanning a car's body and window area —
//  approximate on purpose (every model's silhouette differs a little), in
//  keeping with the game's whole cheap-primitives art style
const SPECKLE_OFFSETS: { x: number; y: number }[] = [
    { x: -35, y: -18 }, { x: -8, y: -14 }, { x: 20, y: -18 }, { x: 44, y: -24 },
    { x: -22, y: -48 }, { x: 8, y: -54 }, { x: -36, y: -58 }, { x: 28, y: -66 }
];

export class CarWash extends Scene
{
    scrubsLeft = 0;
    speckles: Phaser.GameObjects.Arc[] = [];
    sponge: Phaser.GameObjects.Container;
    doneText: Phaser.GameObjects.Text;

    constructor ()
    {
        super('CarWash');
    }

    create ()
    {
        this.scrubsLeft = 0;
        this.speckles = [];

        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xb3e5fc);
        this.add.rectangle(CX, FLOOR_Y + 70, GAME_WIDTH, 140, 0x90a4ae);
        this.add.rectangle(CX, FLOOR_Y, GAME_WIDTH, 6, 0x607d8b);

        this.add.text(CX, 90, '🧽 Car Wash', {
            fontFamily: 'Arial Black', fontSize: 48, color: '#ffffff', stroke: '#01579b', strokeThickness: 8
        }).setOrigin(0.5);

        //  Standard quit button
        this.add.circle(GAME_WIDTH - 60, 60, 30, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(GAME_WIDTH - 60, 60, 'X', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(GAME_WIDTH - 60, 60, 90, 90).setInteractive().on('pointerdown', () => this.close());

        const model = this.registry.get('carModel') as string;
        const colour = this.registry.get('carColour') as number;
        const dirt = (this.registry.get('dirt') as number) ?? 0;

        const carShapes = buildCarShapesSide(this, model, colour);
        this.add.container(CX, FLOOR_Y - GROUND_Y, carShapes).setScale(CAR_SCALE);

        this.scrubsLeft = Math.round(dirt * MAX_SCRUBS);

        for (let i = 0; i < this.scrubsLeft; i++)
        {
            const offset = SPECKLE_OFFSETS[i];
            const speckle = this.add.circle(CX + offset.x * CAR_SCALE, FLOOR_Y + offset.y * CAR_SCALE, 11, 0x6d4c41, 0.55);
            this.speckles.push(speckle);
        }

        this.doneText = this.add.text(CX, 400, 'All clean!', {
            fontFamily: 'Arial Black', fontSize: 40, color: '#2e7d32', stroke: '#ffffff', strokeThickness: 6
        }).setOrigin(0.5).setVisible(this.scrubsLeft === 0);

        //  The sponge: tap repeatedly over the car to wipe the speckles away
        const spongeBody = this.add.circle(0, 0, 34, 0xfff176).setStrokeStyle(4, 0xf9a825);
        this.sponge = this.add.container(CX, FLOOR_Y - 140, [ spongeBody ]);

        this.add.zone(CX, FLOOR_Y - 140, 400, 300).setInteractive().on('pointerdown', () => this.scrub());
    }

    scrub ()
    {
        if (this.scrubsLeft <= 0)
        {
            return;
        }

        this.tweens.add({ targets: this.sponge, scale: 1.2, duration: 90, yoyo: true });
        playSplash();

        this.scrubsLeft--;

        const speckle = this.speckles.pop();

        if (speckle)
        {
            this.tweens.add({ targets: speckle, alpha: 0, scale: 0, duration: 200, onComplete: () => speckle.destroy() });
        }

        const model = this.registry.get('carModel') as string;
        const dirt = this.scrubsLeft / MAX_SCRUBS;

        this.registry.set('dirt', dirt);
        saveDirt(model, dirt);

        if (this.scrubsLeft <= 0)
        {
            this.doneText.setVisible(true);
        }
    }

    close ()
    {
        this.scene.resume('Yard');
        this.scene.stop();
    }
}
