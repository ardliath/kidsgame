import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapesSide, GROUND_Y } from '../carShapesSide';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { playSplash } from '../sfx';
import { saveDirt } from '../storage';

const CX = GAME_WIDTH / 2;
const FLOOR_Y = 620;
const CAR_SCALE = 1.6;

//  Seconds of continuous scrubbing to fully clean a maximally-dirty car;
//  a lightly-dirty one takes proportionally less
const MAX_SCRUB_SECONDS = 5;

const SPONGE_BOUNDS = { minX: CX - 260, maxX: CX + 260, minY: FLOOR_Y - 260, maxY: FLOOR_Y - 20 };

//  Rough, generic speckle spots spanning a car's body and window area —
//  approximate on purpose (every model's silhouette differs a little), in
//  keeping with the game's whole cheap-primitives art style
const SPECKLE_OFFSETS: { x: number; y: number }[] = [
    { x: -35, y: -18 }, { x: -8, y: -14 }, { x: 20, y: -18 }, { x: 44, y: -24 },
    { x: -22, y: -48 }, { x: 8, y: -54 }, { x: -36, y: -58 }, { x: 28, y: -66 }
];

export class CarWash extends Scene
{
    startDirt = 0;
    scrubElapsed = 0;
    requiredSeconds = 0;
    lastSavedDirt = 0;

    scrubbing = false;
    scrubPointerId = -1;
    bubbleCooldown = 0;

    speckles: Phaser.GameObjects.Arc[] = [];
    sponge: Phaser.GameObjects.Container;
    doneText: Phaser.GameObjects.Text;

    constructor ()
    {
        super('CarWash');
    }

    create ()
    {
        this.scrubElapsed = 0;
        this.scrubbing = false;
        this.scrubPointerId = -1;
        this.bubbleCooldown = 0;
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

        this.startDirt = (this.registry.get('dirt') as number) ?? 0;
        this.lastSavedDirt = this.startDirt;
        this.requiredSeconds = MAX_SCRUB_SECONDS * this.startDirt;

        const carShapes = buildCarShapesSide(this, model, colour);
        this.add.container(CX, FLOOR_Y - GROUND_Y, carShapes).setScale(CAR_SCALE);

        const initialCount = Math.round(this.startDirt * SPECKLE_OFFSETS.length);

        for (let i = 0; i < initialCount; i++)
        {
            const offset = SPECKLE_OFFSETS[i];
            const speckle = this.add.circle(CX + offset.x * CAR_SCALE, FLOOR_Y + offset.y * CAR_SCALE, 11, 0x6d4c41, 0.55);
            this.speckles.push(speckle);
        }

        this.doneText = this.add.text(CX, 400, 'All clean!', {
            fontFamily: 'Arial Black', fontSize: 40, color: '#2e7d32', stroke: '#ffffff', strokeThickness: 6
        }).setOrigin(0.5).setVisible(this.requiredSeconds <= 0);

        //  The sponge: drag it around over the car to scrub the dirt away
        const spongeBody = this.add.circle(0, 0, 34, 0xfff176).setStrokeStyle(4, 0xf9a825);
        this.sponge = this.add.container(CX, FLOOR_Y - 140, [ spongeBody ]);

        const zone = this.add.zone(CX, FLOOR_Y - 130, 560, 420);
        zone.setInteractive();
        zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.startScrub(pointer));

        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('gameout', this.onPointerUp, this);
    }

    startScrub (pointer: Phaser.Input.Pointer)
    {
        if (this.requiredSeconds <= 0)
        {
            return;
        }

        this.scrubbing = true;
        this.scrubPointerId = pointer.id;
        playSplash();
        this.moveSponge(pointer);
    }

    onPointerMove (pointer: Phaser.Input.Pointer)
    {
        if (!this.scrubbing || pointer.id !== this.scrubPointerId)
        {
            return;
        }

        this.moveSponge(pointer);
    }

    onPointerUp (pointer: Phaser.Input.Pointer)
    {
        if (pointer.id === this.scrubPointerId)
        {
            this.scrubbing = false;
            this.scrubPointerId = -1;
        }
    }

    moveSponge (pointer: Phaser.Input.Pointer)
    {
        const x = Phaser.Math.Clamp(pointer.x, SPONGE_BOUNDS.minX, SPONGE_BOUNDS.maxX);
        const y = Phaser.Math.Clamp(pointer.y, SPONGE_BOUNDS.minY, SPONGE_BOUNDS.maxY);

        this.sponge.setPosition(x, y);
    }

    update (_time: number, delta: number)
    {
        if (!this.scrubbing || this.requiredSeconds <= 0)
        {
            return;
        }

        const dt = delta / 1000;

        this.bubbleCooldown -= dt;

        if (this.bubbleCooldown <= 0)
        {
            this.spawnBubble(this.sponge.x, this.sponge.y);
            this.bubbleCooldown = 0.12;
        }

        this.scrubElapsed = Math.min(this.requiredSeconds, this.scrubElapsed + dt);

        const progress = this.scrubElapsed / this.requiredSeconds;
        const dirt = this.startDirt * (1 - progress);

        for (const speckle of this.speckles)
        {
            speckle.setAlpha(0.55 * (1 - progress));
        }

        this.registry.set('dirt', dirt);

        if (Math.abs(dirt - this.lastSavedDirt) >= 0.01)
        {
            saveDirt(this.registry.get('carModel') as string, dirt);
            this.lastSavedDirt = dirt;
        }

        if (progress >= 1)
        {
            this.finishWash();
        }
    }

    spawnBubble (x: number, y: number)
    {
        const bubble = this.add.circle(
            x + Phaser.Math.Between(-24, 24), y + Phaser.Math.Between(-24, 24),
            Phaser.Math.Between(5, 10), 0xffffff, 0.7
        );
        bubble.setStrokeStyle(2, 0xb3e5fc, 0.9);

        this.tweens.add({
            targets: bubble,
            y: bubble.y - 26,
            scale: 1.5,
            alpha: 0,
            duration: 500,
            ease: 'Cubic.Out',
            onComplete: () => bubble.destroy()
        });
    }

    finishWash ()
    {
        this.scrubbing = false;
        this.scrubPointerId = -1;
        this.requiredSeconds = 0;

        const model = this.registry.get('carModel') as string;
        this.registry.set('dirt', 0);
        saveDirt(model, 0);
        this.lastSavedDirt = 0;

        for (const speckle of this.speckles)
        {
            speckle.destroy();
        }

        this.speckles = [];
        this.doneText.setVisible(true);

        //  A little rinse of water droplets to mark the finish
        for (let i = 0; i < 10; i++)
        {
            const angle = (i / 10) * Math.PI * 2;
            const drop = this.add.circle(this.sponge.x, this.sponge.y, 8, [ 0xffffff, 0xb3e5fc, 0x4fc3f7 ][i % 3]);

            this.tweens.add({
                targets: drop,
                x: this.sponge.x + Math.cos(angle) * 110,
                y: this.sponge.y + Math.sin(angle) * 110,
                alpha: 0,
                duration: 650,
                ease: 'Cubic.Out',
                onComplete: () => drop.destroy()
            });
        }
    }

    close ()
    {
        //  Flush whatever's live in the registry, in case the last in-progress
        //  update() tick hadn't crossed the throttled-save threshold yet
        saveDirt(this.registry.get('carModel') as string, (this.registry.get('dirt') as number) ?? this.startDirt);

        this.scene.resume('Yard');
        this.scene.stop();
    }
}
