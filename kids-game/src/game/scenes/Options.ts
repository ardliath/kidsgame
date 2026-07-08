import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { buildCarShapes, CAR_COLOURS, CAR_MODELS } from '../carShapes';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { loadGame, saveCarStyle, saveGame } from '../storage';
import { Dashboard } from './Dashboard';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;

export class Options extends Scene
{
    swatchRings: Map<number, Phaser.GameObjects.Arc> = new Map();
    modelSlots: Map<string, Phaser.GameObjects.Rectangle> = new Map();
    modelPreviews: Map<string, Phaser.GameObjects.Container> = new Map();
    message: Phaser.GameObjects.Text;

    constructor ()
    {
        super('Options');
    }

    create ()
    {
        //  Dim the game behind and swallow stray taps
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setInteractive();

        const panel = this.add.graphics();
        panel.fillStyle(0x263238, 1);
        panel.fillRoundedRect(CX - 380, 160, 760, 640, 24);
        panel.lineStyle(6, 0x102027, 1);
        panel.strokeRoundedRect(CX - 380, 160, 760, 640, 24);

        this.add.text(CX, 208, 'Options', {
            fontFamily: 'Arial Black', fontSize: 44, color: '#ffffff'
        }).setOrigin(0.5);

        //  Close button
        this.add.circle(CX + 350, 208, 26, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(CX + 350, 208, 'X', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(CX + 350, 208, 80, 80).setInteractive().on('pointerdown', () => this.close());

        this.makeButton(CX - 195, 300, 'New', () => this.newGame());
        this.makeButton(CX, 300, 'Save', () => this.saveGame());
        this.makeButton(CX + 195, 300, 'Load', () => this.loadGame());

        this.add.text(CX, 390, 'Car colour', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#b0bec5'
        }).setOrigin(0.5);

        CAR_COLOURS.forEach((colour, i) => {

            const x = CX - 225 + i * 90;

            const ring = this.add.circle(x, 460, 40);
            ring.setStrokeStyle(5, 0xffffff);
            this.swatchRings.set(colour.value, ring);

            this.add.circle(x, 460, 32, colour.value).setStrokeStyle(3, 0x102027);

            this.add.zone(x, 460, 84, 84).setInteractive().on('pointerdown', () => this.selectColour(colour.value));

        });

        this.add.text(CX, 545, 'Car model', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#b0bec5'
        }).setOrigin(0.5);

        CAR_MODELS.forEach((model, i) => {

            const x = CX - 225 + i * 150;

            const slot = this.add.rectangle(x, 655, 120, 135, 0x37474f);
            this.modelSlots.set(model.key, slot);

            const preview = this.add.container(x, 647, buildCarShapes(this, model.key, this.registry.get('carColour') as number));
            this.modelPreviews.set(model.key, preview);

            this.add.text(x, 707, model.name, {
                fontFamily: 'Arial Black', fontSize: 16, color: '#ffffff'
            }).setOrigin(0.5);

            this.add.zone(x, 655, 130, 145).setInteractive().on('pointerdown', () => this.selectModel(model.key));

        });

        this.message = this.add.text(CX, 772, '', {
            fontFamily: 'Arial Black', fontSize: 24, color: '#fff176'
        }).setOrigin(0.5);

        this.refreshSelection();
    }

    makeButton (x: number, y: number, label: string, onTap: () => void)
    {
        const g = this.add.graphics();
        g.fillStyle(0x455a64, 1);
        g.fillRoundedRect(x - 85, y - 35, 170, 70, 16);
        g.lineStyle(4, 0x102027, 1);
        g.strokeRoundedRect(x - 85, y - 35, 170, 70, 16);

        this.add.text(x, y, label, {
            fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff'
        }).setOrigin(0.5);

        this.add.zone(x, y, 180, 80).setInteractive().on('pointerdown', onTap);
    }

    refreshSelection ()
    {
        const colour = this.registry.get('carColour') as number;
        const model = this.registry.get('carModel') as string;

        for (const [ value, ring ] of this.swatchRings)
        {
            ring.setVisible(value === colour);
        }

        for (const [ key, slot ] of this.modelSlots)
        {
            slot.setStrokeStyle(5, key === model ? 0xffffff : 0x102027);
        }
    }

    selectColour (colour: number)
    {
        this.registry.set('carColour', colour);
        saveCarStyle({ colour, model: this.registry.get('carModel') as string });

        //  Repaint the little preview cars too
        for (const [ key, preview ] of this.modelPreviews)
        {
            preview.removeAll(true);
            preview.add(buildCarShapes(this, key, colour));
        }

        this.refreshSelection();
    }

    selectModel (model: string)
    {
        this.registry.set('carModel', model);
        saveCarStyle({ colour: this.registry.get('carColour') as number, model });

        this.refreshSelection();
    }

    newGame ()
    {
        const driving = this.scene.get('Driving') as Driving;
        const dashboard = this.scene.get('Dashboard') as Dashboard;

        driving.resetCar();
        dashboard.setGearImmediate(1);

        this.close();
    }

    saveGame ()
    {
        const driving = this.scene.get('Driving') as Driving;

        if (saveGame(driving.getSaveData()))
        {
            this.showMessage('Saved!');
        }
        else
        {
            this.showMessage('Could not save');
        }
    }

    loadGame ()
    {
        const data = loadGame();

        if (!data)
        {
            this.showMessage('No saved game yet');

            return;
        }

        const driving = this.scene.get('Driving') as Driving;
        const dashboard = this.scene.get('Dashboard') as Dashboard;

        driving.applySave(data);
        dashboard.setGearImmediate(data.gear);

        this.close();
    }

    showMessage (text: string)
    {
        this.message.setText(text).setAlpha(1);

        this.tweens.add({ targets: this.message, alpha: 0, delay: 900, duration: 400 });
    }

    close ()
    {
        this.scene.resume('Driving');
        this.scene.resume('Dashboard');
        this.scene.stop();
    }
}
