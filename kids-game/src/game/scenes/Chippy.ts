import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { parseColour } from '../mapBuilder';
import { loadCoins, loadPlayerName, saveCoins } from '../storage';

const CX = GAME_WIDTH / 2;

//  The tray sits on the left, like a paper chip cone, wide open at the top;
//  the picking controls run down the right, same layout as the café
const TRAY_X = 320;
const TRAY_TOP = 340;
const TRAY_BOTTOM = 640;
const TRAY_HALF_TOP = 130;
const TRAY_HALF_BOT = 70;

interface Option
{
    id: string;
    name: string;
    colour: string;
    price: number;
}

interface ChippyConfig
{
    maxChips: number;
    chipsPrice: number;
    chipsColour: string;
    fish: Option[];
    sauces: Option[];
    extras: Option[];
}

export class Chippy extends Scene
{
    houseId = '';
    shopColour = 0x1e88e5;
    sells: string[] = [];
    config: ChippyConfig;

    chips = 0;
    fish: Option | null = null;
    sauce: Option | null = null;
    saltVinegar = false;

    trayGfx: Phaser.GameObjects.Graphics;
    chipPips: Phaser.GameObjects.Arc[] = [];
    rings: Map<string, Phaser.GameObjects.Arc> = new Map();
    totalText: Phaser.GameObjects.Text;
    coinCount: Phaser.GameObjects.Text;
    orderZone: Phaser.GameObjects.Zone | null = null;
    extraBg: Phaser.GameObjects.Rectangle;
    extraLabel: Phaser.GameObjects.Text;

    speech: Phaser.GameObjects.Container | null = null;
    speechTimer: Phaser.Time.TimerEvent | null = null;

    constructor ()
    {
        super('Chippy');
    }

    init (data: { houseId: string; colour: number; sells: string[] })
    {
        this.houseId = data.houseId;
        this.shopColour = data.colour;
        this.sells = data.sells;
    }

    create ()
    {
        this.config = this.cache.json.get('chippy') as ChippyConfig;
        this.chips = 0;
        this.fish = null;
        this.sauce = null;
        this.saltVinegar = false;
        this.chipPips = [];
        this.rings.clear();
        this.speech = null;
        this.speechTimer = null;
        this.orderZone = null;

        if (this.registry.get('coins') === undefined)
        {
            this.registry.set('coins', loadCoins());
        }

        //  A breezy seaside chippy: blue-and-white striped walls, a dark counter
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xe3f2fd);

        for (let x = 0; x < GAME_WIDTH; x += 90)
        {
            this.add.rectangle(x + 45, 150, 90, 300, (x / 90) % 2 === 0 ? 0xbbdefb : 0xe3f2fd);
        }

        const shopDark = Phaser.Display.Color.IntegerToColor(this.shopColour).darken(35).color;
        this.add.rectangle(CX, 860, GAME_WIDTH, 200, 0x37474f);
        this.add.rectangle(CX, 762, GAME_WIDTH, 16, shopDark);

        this.instructionText('Order some fish & chips!');

        this.drawDoor();
        this.drawShopkeeper();
        this.createHud();

        this.trayGfx = this.add.graphics();

        this.drawChipsControl();
        this.drawOptionRow('fish', 'Fish', this.fishChoices(), 360);
        this.drawOptionRow('sauce', 'Sauce', this.config.sauces, 510);
        this.drawExtraToggle();
        this.drawOrderButton();

        this.drawTray();
        this.refreshTotal();

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `Hi ${name}! What can I get you?` : 'What can I get you?');
    }

    fishChoices (): Option[]
    {
        return this.config.fish.filter(f => this.sells.length === 0 || this.sells.includes(f.id));
    }

    instructionText (text: string)
    {
        this.add.text(CX, 80, text, {
            fontFamily: 'Arial Black', fontSize: 40, color: '#01579b',
            stroke: '#ffffff', strokeThickness: 8
        }).setOrigin(0.5).setName('instruction');
    }

    setInstruction (text: string)
    {
        const existing = this.children.getByName('instruction') as Phaser.GameObjects.Text;
        existing?.setText(text);
    }

    drawDoor ()
    {
        const x = 90;

        this.add.rectangle(x, 860, 90, 160, 0x1565c0).setStrokeStyle(5, 0x0d47a1);
        this.add.circle(x + 30, 862, 7, 0xffeb3b);

        const label = this.add.text(x, 770, 'OUT', {
            fontFamily: 'Arial Black', fontSize: 20, color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);

        this.tweens.add({ targets: label, y: label.y - 8, duration: 600, yoyo: true, repeat: -1 });

        this.add.zone(x, 850, 120, 200).setInteractive().on('pointerdown', () => this.close());
    }

    drawShopkeeper ()
    {
        const x = GAME_WIDTH - 110;

        this.add.rectangle(x, 810, 46, 66, 0x37474f).setStrokeStyle(3, 0x263238);
        this.add.rectangle(x, 822, 34, 40, 0xffffff);
        this.add.circle(x, 758, 26, 0xffcc80);
        this.add.rectangle(x, 738, 50, 16, 0x263238);
        this.add.circle(x - 9, 752, 3, 0x263238);
        this.add.circle(x + 9, 752, 3, 0x263238);

        //  A striped seaside cap
        this.add.rectangle(x, 726, 54, 12, 0x1565c0);
    }

    createHud ()
    {
        //  Quit
        this.add.circle(GAME_WIDTH - 60, 60, 30, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.add.text(GAME_WIDTH - 60, 60, 'X', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
        }).setOrigin(0.5);
        this.add.zone(GAME_WIDTH - 60, 60, 90, 90).setInteractive().on('pointerdown', () => this.close());

        //  Coins
        this.add.rectangle(100, 60, 130, 48, 0x102027, 0.85).setStrokeStyle(3, 0xffd54f);
        this.add.circle(62, 60, 15, 0xffd54f).setStrokeStyle(3, 0xf9a825);

        this.coinCount = this.add.text(148, 60, String(this.registry.get('coins') ?? 0), {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffd54f'
        }).setOrigin(0.5);
    }

    //  ---- the tray ----

    halfWidthAt (y: number): number
    {
        const t = (TRAY_BOTTOM - y) / (TRAY_BOTTOM - TRAY_TOP);

        return TRAY_HALF_BOT + (TRAY_HALF_TOP - TRAY_HALF_BOT) * t;
    }

    drawTray ()
    {
        const g = this.trayGfx;
        g.clear();

        //  Chips, filling from the bottom; more portions means a fuller cone
        if (this.chips > 0)
        {
            const level = 0.35 + (this.chips / this.config.maxChips) * 0.55;
            const surfaceY = TRAY_BOTTOM - level * (TRAY_BOTTOM - TRAY_TOP);
            const halfSurf = this.halfWidthAt(surfaceY);
            const chipsColour = parseColour(this.config.chipsColour, 0xf4b942);
            const chipsDark = Phaser.Display.Color.IntegerToColor(chipsColour).darken(20).color;

            g.fillStyle(chipsColour, 1);
            g.fillPoints([
                new Phaser.Math.Vector2(TRAY_X - halfSurf, surfaceY),
                new Phaser.Math.Vector2(TRAY_X + halfSurf, surfaceY),
                new Phaser.Math.Vector2(TRAY_X + TRAY_HALF_BOT, TRAY_BOTTOM),
                new Phaser.Math.Vector2(TRAY_X - TRAY_HALF_BOT, TRAY_BOTTOM)
            ], true);

            //  A scatter of individual chips across the surface for texture
            for (let i = 0; i < 12; i++)
            {
                const cx = TRAY_X + (Math.random() - 0.5) * halfSurf * 1.7;
                const cy = surfaceY + (Math.random() - 0.5) * 16;
                g.fillStyle(chipsDark, 1);
                g.fillRect(cx - 5, cy - 12, 10, 24);
            }

            this.drawFishOnTop(surfaceY, halfSurf);
            this.drawSauce(surfaceY, halfSurf);
            this.drawSaltVinegar(surfaceY, halfSurf);
        }

        //  The paper cone, drawn over the food as a pale wall + outline
        const pts = [
            new Phaser.Math.Vector2(TRAY_X - TRAY_HALF_TOP, TRAY_TOP),
            new Phaser.Math.Vector2(TRAY_X + TRAY_HALF_TOP, TRAY_TOP),
            new Phaser.Math.Vector2(TRAY_X + TRAY_HALF_BOT, TRAY_BOTTOM),
            new Phaser.Math.Vector2(TRAY_X - TRAY_HALF_BOT, TRAY_BOTTOM)
        ];

        g.fillStyle(0xffffff, 0.16);
        g.fillPoints(pts, true);
        g.lineStyle(6, 0x37474f, 1);
        g.strokePoints(pts, true, true);

        //  Rim ellipse at the open top
        g.lineStyle(6, 0x37474f, 1);
        g.strokeEllipse(TRAY_X, TRAY_TOP, TRAY_HALF_TOP * 2, 26);
    }

    drawFishOnTop (surfaceY: number, halfSurf: number)
    {
        if (!this.fish || this.fish.id === 'plain')
        {
            return;
        }

        const g = this.trayGfx;
        const colour = parseColour(this.fish.colour, 0xf0dcae);
        const dark = Phaser.Display.Color.IntegerToColor(colour).darken(25).color;

        g.fillStyle(colour, 1);
        g.fillEllipse(TRAY_X, surfaceY - 16, Math.min(halfSurf * 1.3, 150), 54);
        g.lineStyle(4, dark, 1);
        g.strokeEllipse(TRAY_X, surfaceY - 16, Math.min(halfSurf * 1.3, 150), 54);
    }

    drawSauce (surfaceY: number, halfSurf: number)
    {
        if (!this.sauce)
        {
            return;
        }

        const g = this.trayGfx;
        const colour = parseColour(this.sauce.colour, 0xc62828);

        g.fillStyle(colour, 1);

        //  A wobbly drizzle across the top
        for (let i = -2; i <= 2; i++)
        {
            const dx = i * (halfSurf / 3);
            g.fillCircle(TRAY_X + dx, surfaceY - 30 + Math.abs(i) * 6, 8);
        }
    }

    drawSaltVinegar (surfaceY: number, halfSurf: number)
    {
        if (!this.saltVinegar)
        {
            return;
        }

        const g = this.trayGfx;
        g.fillStyle(0xffffff, 0.85);

        for (let i = 0; i < 14; i++)
        {
            const sx = TRAY_X + (Math.random() - 0.5) * halfSurf * 1.6;
            const sy = surfaceY + (Math.random() - 0.5) * 40;
            g.fillCircle(sx, sy, 2.5);
        }
    }

    //  ---- controls ----

    drawChipsControl ()
    {
        this.add.text(790, 150, 'Chips', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#01579b'
        }).setOrigin(0.5);

        //  A tappable pile of chips that adds a portion
        this.add.circle(700, 215, 44, 0xf4b942).setStrokeStyle(4, 0xc68e17);
        this.add.text(700, 262, `+${this.config.chipsPrice}`, {
            fontFamily: 'Arial Black', fontSize: 18, color: '#5d4037'
        }).setOrigin(0.5);

        this.add.circle(700 + 32, 215 + 30, 15, 0xffd54f).setStrokeStyle(3, 0xf9a825);
        this.add.text(700 + 32, 215 + 30, String(this.config.chipsPrice), {
            fontFamily: 'Arial Black', fontSize: 16, color: '#5d4037'
        }).setOrigin(0.5);

        const zone = this.add.zone(700, 215, 100, 100).setInteractive();
        zone.on('pointerdown', () => this.addChips(zone));

        //  Pips showing how many portions are in
        for (let i = 0; i < this.config.maxChips; i++)
        {
            const pip = this.add.circle(810 + i * 46, 215, 15, 0xd7ccc8).setStrokeStyle(3, 0x8d6e63);
            this.chipPips.push(pip);
        }
    }

    refreshPips ()
    {
        this.chipPips.forEach((pip, i) => pip.setFillStyle(i < this.chips ? 0xf4b942 : 0xd7ccc8));
    }

    drawOptionRow (group: string, label: string, options: Option[], y: number)
    {
        this.add.text(560, y, label, {
            fontFamily: 'Arial Black', fontSize: 26, color: '#01579b'
        }).setOrigin(0.5);

        options.forEach((option, i) => {

            const x = 690 + i * 128;

            const ring = this.add.circle(x, y, 46).setStrokeStyle(6, 0x43a047).setVisible(false);
            this.rings.set(`${group}:${option.id}`, ring);

            this.add.circle(x, y, 38, parseColour(option.colour, 0xffffff)).setStrokeStyle(4, 0x8d6e63);

            if (option.price > 0)
            {
                this.add.circle(x + 28, y + 28, 14, 0xffd54f).setStrokeStyle(3, 0xf9a825);
                this.add.text(x + 28, y + 28, String(option.price), {
                    fontFamily: 'Arial Black', fontSize: 15, color: '#5d4037'
                }).setOrigin(0.5);
            }

            this.add.text(x, y + 58, option.name, {
                fontFamily: 'Arial Black', fontSize: 17, color: '#5d4037'
            }).setOrigin(0.5);

            const zone = this.add.zone(x, y, 96, 96).setInteractive();
            zone.on('pointerdown', () => this.pickOption(group, option, zone));

        });
    }

    drawExtraToggle ()
    {
        const extra = this.config.extras[0];
        const y = 655;

        this.extraBg = this.add.rectangle(CX, y, 260, 60, 0x455a64).setStrokeStyle(4, 0x263238);
        this.extraLabel = this.add.text(CX, y, `${extra.name}?`, {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff'
        }).setOrigin(0.5);

        this.add.zone(CX, y, 270, 70).setInteractive().on('pointerdown', () => this.toggleExtra());
    }

    drawOrderButton ()
    {
        this.totalText = this.add.text(TRAY_X, 668, '', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#01579b', stroke: '#ffffff', strokeThickness: 4
        }).setOrigin(0.5);

        const g = this.add.graphics();
        g.fillStyle(0x43a047, 1);
        g.fillRoundedRect(TRAY_X - 115, 700, 230, 66, 18);
        g.lineStyle(5, 0x1b5e20, 1);
        g.strokeRoundedRect(TRAY_X - 115, 700, 230, 66, 18);

        this.add.text(TRAY_X, 733, 'ORDER!', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
        }).setOrigin(0.5);

        this.orderZone = this.add.zone(TRAY_X, 733, 240, 76).setInteractive();
        this.orderZone.on('pointerdown', () => this.order());

        //  Start over, tucked in the gap between ORDER and the option rows
        const reset = this.add.text(545, 700, '↺ Start over', {
            fontFamily: 'Arial Black', fontSize: 22, color: '#8d6e63'
        }).setOrigin(0.5);

        this.add.zone(545, 700, 200, 60).setInteractive().on('pointerdown', () => {

            reset.setAlpha(0.5);
            this.time.delayedCall(100, () => reset.setAlpha(1));
            this.startOver();

        });
    }

    //  ---- picking ----

    cost (): number
    {
        return this.chips * this.config.chipsPrice
            + (this.fish?.price ?? 0)
            + (this.sauce?.price ?? 0)
            + (this.saltVinegar ? (this.config.extras[0]?.price ?? 0) : 0);
    }

    coins (): number
    {
        return (this.registry.get('coins') as number) ?? 0;
    }

    addChips (zone: Phaser.GameObjects.Zone)
    {
        if (this.chips >= this.config.maxChips)
        {
            this.say(`That's a lot of chips! Max ${this.config.maxChips} portions.`);
            this.bump(zone);

            return;
        }

        if (this.cost() + this.config.chipsPrice > this.coins())
        {
            this.say('Not enough coins!');
            this.bump(zone);

            return;
        }

        this.chips++;
        this.refreshPips();
        this.drawTray();
        this.refreshTotal();
    }

    pickOption (group: string, option: Option, zone: Phaser.GameObjects.Zone)
    {
        const current = group === 'fish' ? this.fish : this.sauce;
        const selecting = current?.id !== option.id;

        //  Adding this option mustn't tip us over what we can afford
        if (selecting)
        {
            const delta = option.price - (current?.price ?? 0);

            if (this.cost() + delta > this.coins())
            {
                this.say('Not enough coins!');
                this.bump(zone);

                return;
            }
        }

        const next = selecting ? option : null;

        if (group === 'fish') { this.fish = next; }
        else { this.sauce = next; }

        //  Only one in each group can be lit at a time
        for (const [ key, ring ] of this.rings)
        {
            if (key.startsWith(`${group}:`))
            {
                ring.setVisible(false);
            }
        }

        if (next)
        {
            this.rings.get(`${group}:${option.id}`)?.setVisible(true);
        }

        this.drawTray();
        this.refreshTotal();
    }

    toggleExtra ()
    {
        const extra = this.config.extras[0];
        const next = !this.saltVinegar;

        if (next && this.cost() + extra.price > this.coins())
        {
            this.say('Not enough coins!');

            return;
        }

        this.saltVinegar = next;
        this.extraBg.setFillStyle(this.saltVinegar ? 0x0288d1 : 0x455a64);
        this.extraLabel.setText(this.saltVinegar ? `${extra.name}! ✓` : `${extra.name}?`);
        this.drawTray();
        this.refreshTotal();
    }

    refreshTotal ()
    {
        this.totalText.setText(this.chips > 0 ? `Total: ${this.cost()}` : 'Add some chips!');
    }

    bump (zone: Phaser.GameObjects.Zone)
    {
        this.tweens.add({ targets: zone, x: zone.x + 8, duration: 60, yoyo: true, repeat: 2 });
    }

    startOver ()
    {
        this.chips = 0;
        this.fish = null;
        this.sauce = null;
        this.saltVinegar = false;

        for (const ring of this.rings.values())
        {
            ring.setVisible(false);
        }

        const extra = this.config.extras[0];
        this.extraBg.setFillStyle(0x455a64);
        this.extraLabel.setText(`${extra.name}?`);

        this.refreshPips();
        this.drawTray();
        this.refreshTotal();
    }

    order ()
    {
        if (this.chips === 0)
        {
            this.say('Add some chips first!');

            return;
        }

        const total = this.cost();
        const coins = this.coins() - total;

        this.registry.set('coins', coins);
        saveCoins(coins);
        this.coinCount.setText(String(coins));

        this.orderZone?.destroy();
        this.setInstruction('Enjoy your fish & chips!');

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `There you go, ${name}!` : 'There you go!');

        //  The tray tips towards the counter as if being carried off, then a
        //  little burst of stars
        this.tweens.add({
            targets: this.trayGfx,
            angle: -14,
            y: 40,
            alpha: 0,
            duration: 1200,
            ease: 'Back.In',
            delay: 400
        });

        for (let i = 0; i < 8; i++)
        {
            const angle = (i / 8) * Math.PI * 2;
            const star = this.add.circle(TRAY_X, 460, 9, [ 0xffeb3b, 0xff7043, 0x4dd0e1, 0xaed581 ][i % 4]);

            this.tweens.add({
                targets: star,
                x: TRAY_X + Math.cos(angle) * 220,
                y: 460 + Math.sin(angle) * 160,
                alpha: 0,
                duration: 900,
                delay: 500,
                ease: 'Cubic.Out'
            });
        }

        this.time.delayedCall(2000, () => this.close());
    }

    say (text: string)
    {
        this.speech?.destroy(true);
        this.speechTimer?.remove();

        const label = this.add.text(0, 0, text, {
            fontFamily: 'Arial Black', fontSize: 22, color: '#263238'
        }).setOrigin(0.5);

        const bg = this.add.rectangle(0, 0, label.width + 36, 46, 0xffffff).setStrokeStyle(4, 0x263238);
        const tail = this.add.triangle(20, 30, 0, 0, 24, 0, 12, 16, 0xffffff);

        this.speech = this.add.container(GAME_WIDTH - 210, 630, [ bg, tail, label ]);
        this.speech.setDepth(15);

        this.speechTimer = this.time.delayedCall(2600, () => {
            this.speech?.destroy(true);
            this.speech = null;
        });
    }

    close ()
    {
        this.scene.resume('Driving');
        this.scene.resume('Dashboard');
        this.scene.stop();
    }
}
