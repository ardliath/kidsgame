import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { CAR_COLOURS } from '../carShapes';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { loadGame, loadPlayerName, saveCarStyle, saveGame, savePlayerName } from '../storage';
import { Dashboard } from './Dashboard';
import { Driving } from './Driving';

const CX = GAME_WIDTH / 2;

export class Options extends Scene
{
    swatchRings: Map<number, Phaser.GameObjects.Arc> = new Map();
    message: Phaser.GameObjects.Text;

    nameOverlay: Phaser.GameObjects.Container | null = null;
    nameDisplay: Phaser.GameObjects.Text;
    pendingName = '';

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
        panel.fillRoundedRect(CX - 380, 160, 760, 480, 24);
        panel.lineStyle(6, 0x102027, 1);
        panel.strokeRoundedRect(CX - 380, 160, 760, 480, 24);

        this.add.text(CX, 208, 'Options', {
            fontFamily: 'Arial Black', fontSize: 44, color: '#ffffff'
        }).setOrigin(0.5);

        //  Close button
        this.add.circle(CX + 350, 208, 26, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(CX + 350, 208, 'X', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(CX + 350, 208, 80, 80).setInteractive().on('pointerdown', () => this.close());

        this.makeButton(CX - 285, 300, 'New', () => this.newGame());
        this.makeButton(CX - 95, 300, 'Save', () => this.saveGame());
        this.makeButton(CX + 95, 300, 'Load', () => this.loadGame());
        this.makeButton(CX + 285, 300, 'Name', () => this.openNameEditor());

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

        this.add.text(CX, 545, 'Pick which vehicle to drive at the 🏗️ yard', {
            fontFamily: 'Arial Black', fontSize: 20, color: '#78909c'
        }).setOrigin(0.5);

        this.message = this.add.text(CX, 595, '', {
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

    //  A big friendly on-screen keyboard for typing the player's name
    openNameEditor ()
    {
        if (this.nameOverlay)
        {
            return;
        }

        this.pendingName = loadPlayerName();

        const parts: Phaser.GameObjects.GameObject[] = [];

        const dim = this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
        dim.setInteractive();
        parts.push(dim);

        const panel = this.add.graphics();
        panel.fillStyle(0x263238, 1);
        panel.fillRoundedRect(CX - 470, 180, 940, 600, 24);
        panel.lineStyle(6, 0x102027, 1);
        panel.strokeRoundedRect(CX - 470, 180, 940, 600, 24);
        parts.push(panel);

        parts.push(this.add.text(CX, 240, 'Type your name', {
            fontFamily: 'Arial Black', fontSize: 36, color: '#ffffff'
        }).setOrigin(0.5));

        parts.push(this.add.rectangle(CX, 320, 520, 70, 0x102027).setStrokeStyle(4, 0x546e7a));

        this.nameDisplay = this.add.text(CX, 320, '', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#fff176'
        }).setOrigin(0.5);
        parts.push(this.nameDisplay);

        const rows = [ 'ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ' ];

        rows.forEach((letters, rowIndex) => {

            const y = 420 + rowIndex * 84;
            const startX = CX - (letters.length - 1) * 39 - (rowIndex === 2 ? 42 : 0);

            [ ...letters ].forEach((letter, i) => {

                const x = startX + i * 78;
                parts.push(this.add.rectangle(x, y, 66, 66, 0x455a64).setStrokeStyle(4, 0x102027));
                parts.push(this.add.text(x, y, letter, {
                    fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff'
                }).setOrigin(0.5));

                const zone = this.add.zone(x, y, 76, 76).setInteractive();
                zone.on('pointerdown', () => this.typeLetter(letter));
                parts.push(zone);

            });

            //  Backspace at the end of the bottom row
            if (rowIndex === 2)
            {
                const x = startX + letters.length * 78 + 20;
                parts.push(this.add.rectangle(x, y, 104, 66, 0x8d6e63).setStrokeStyle(4, 0x102027));
                parts.push(this.add.text(x, y, '<--', {
                    fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
                }).setOrigin(0.5));

                const zone = this.add.zone(x, y, 114, 76).setInteractive();
                zone.on('pointerdown', () => this.typeLetter(''));
                parts.push(zone);
            }

        });

        const ok = this.add.graphics();
        ok.fillStyle(0x43a047, 1);
        ok.fillRoundedRect(CX - 100, 690, 200, 70, 18);
        ok.lineStyle(5, 0x1b5e20, 1);
        ok.strokeRoundedRect(CX - 100, 690, 200, 70, 18);
        parts.push(ok);

        parts.push(this.add.text(CX, 725, 'OK', {
            fontFamily: 'Arial Black', fontSize: 32, color: '#ffffff'
        }).setOrigin(0.5));

        const okZone = this.add.zone(CX, 725, 220, 84).setInteractive();
        okZone.on('pointerdown', () => this.closeNameEditor());
        parts.push(okZone);

        this.nameOverlay = this.add.container(0, 0, parts);
        this.updateNameDisplay();
    }

    typeLetter (letter: string)
    {
        if (letter === '')
        {
            this.pendingName = this.pendingName.slice(0, -1);
        }
        else if (this.pendingName.length < 10)
        {
            this.pendingName += letter;
        }

        this.updateNameDisplay();
    }

    updateNameDisplay ()
    {
        this.nameDisplay.setText(this.pendingName.length > 0 ? this.pendingName : '_');
    }

    closeNameEditor ()
    {
        savePlayerName(this.pendingName.trim());

        this.nameOverlay?.destroy(true);
        this.nameOverlay = null;

        if (this.pendingName.trim().length > 0)
        {
            this.showMessage(`Hello, ${this.pendingName.trim()}!`);
        }
    }

    refreshSelection ()
    {
        const colour = this.registry.get('carColour') as number;

        for (const [ value, ring ] of this.swatchRings)
        {
            ring.setVisible(value === colour);
        }
    }

    selectColour (colour: number)
    {
        this.registry.set('carColour', colour);
        saveCarStyle({ colour, model: this.registry.get('carModel') as string });

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
