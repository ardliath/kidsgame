import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { parseColour } from '../mapBuilder';
import { loadCoins, loadPlayerName, saveCoins } from '../storage';

const CX = GAME_WIDTH / 2;

//  The box sits on the left, like a folded takeaway pail, wide open at the
//  top; the picking controls run down the right, same layout as the chippy
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

interface ChineseConfig
{
    maxRice: number;
    ricePrice: number;
    riceColour: string;
    mains: Option[];
    sauces: Option[];
    extras: Option[];
}

export class Chinese extends Scene
{
    houseId = '';
    shopColour = 0xd32f2f;
    sells: string[] = [];
    config: ChineseConfig;

    rice = 0;
    main: Option | null = null;
    sauce: Option | null = null;
    crackers = false;

    trayGfx: Phaser.GameObjects.Graphics;
    ricePips: Phaser.GameObjects.Arc[] = [];
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
        super('Chinese');
    }

    init (data: { houseId: string; colour: number; sells: string[] })
    {
        this.houseId = data.houseId;
        this.shopColour = data.colour;
        this.sells = data.sells;
    }

    create ()
    {
        this.config = this.cache.json.get('chinese') as ChineseConfig;
        this.rice = 0;
        this.main = null;
        this.sauce = null;
        this.crackers = false;
        this.ricePips = [];
        this.rings.clear();
        this.speech = null;
        this.speechTimer = null;
        this.orderZone = null;

        if (this.registry.get('coins') === undefined)
        {
            this.registry.set('coins', loadCoins());
        }

        //  A red-and-gold takeaway counter, lanterns strung along the top
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xfff3e0);

        for (let x = 0; x < GAME_WIDTH; x += 90)
        {
            this.add.rectangle(x + 45, 150, 90, 300, (x / 90) % 2 === 0 ? 0xffccbc : 0xfff3e0);
        }

        for (let x = 80; x < GAME_WIDTH; x += 160)
        {
            this.add.rectangle(x, 40, 6, 40, 0x5d4037);
            this.add.ellipse(x, 76, 44, 54, 0xd32f2f).setStrokeStyle(3, 0xb71c1c);
            this.add.rectangle(x, 100, 10, 14, 0xffd54f);
        }

        const shopDark = Phaser.Display.Color.IntegerToColor(this.shopColour).darken(35).color;
        this.add.rectangle(CX, 860, GAME_WIDTH, 200, 0x37474f);
        this.add.rectangle(CX, 762, GAME_WIDTH, 16, shopDark);

        this.instructionText('Order some Chinese food!');

        this.drawDoor();
        this.drawShopkeeper();
        this.createHud();

        this.trayGfx = this.add.graphics();

        this.drawRiceControl();
        this.drawOptionRow('main', 'Main', this.mainChoices(), 360);
        this.drawOptionRow('sauce', 'Sauce', this.config.sauces, 510);
        this.drawExtraToggle();
        this.drawOrderButton();

        this.drawTray();
        this.refreshTotal();

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `Hi ${name}! What can I get you?` : 'What can I get you?');
    }

    mainChoices (): Option[]
    {
        return this.config.mains.filter(m => this.sells.length === 0 || this.sells.includes(m.id));
    }

    instructionText (text: string)
    {
        this.add.text(CX, 80, text, {
            fontFamily: 'Arial Black', fontSize: 40, color: '#b71c1c',
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

        this.add.rectangle(x, 860, 90, 160, 0xb71c1c).setStrokeStyle(5, 0x7f0000);
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
        this.add.rectangle(x, 822, 34, 40, 0xffd54f);
        this.add.circle(x, 758, 26, 0xffcc80);
        this.add.rectangle(x, 738, 50, 16, 0x263238);
        this.add.circle(x - 9, 752, 3, 0x263238);
        this.add.circle(x + 9, 752, 3, 0x263238);

        //  A red takeaway-counter headband
        this.add.rectangle(x, 726, 54, 12, 0xd32f2f);
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

    //  ---- the takeaway box ----

    halfWidthAt (y: number): number
    {
        const t = (TRAY_BOTTOM - y) / (TRAY_BOTTOM - TRAY_TOP);

        return TRAY_HALF_BOT + (TRAY_HALF_TOP - TRAY_HALF_BOT) * t;
    }

    drawTray ()
    {
        const g = this.trayGfx;
        g.clear();

        //  Rice, filling from the bottom; more portions means a fuller box
        if (this.rice > 0)
        {
            const level = 0.35 + (this.rice / this.config.maxRice) * 0.55;
            const surfaceY = TRAY_BOTTOM - level * (TRAY_BOTTOM - TRAY_TOP);
            const halfSurf = this.halfWidthAt(surfaceY);
            const riceColour = parseColour(this.config.riceColour, 0xfdf6e3);
            const riceDark = Phaser.Display.Color.IntegerToColor(riceColour).darken(15).color;

            g.fillStyle(riceColour, 1);
            g.fillPoints([
                new Phaser.Math.Vector2(TRAY_X - halfSurf, surfaceY),
                new Phaser.Math.Vector2(TRAY_X + halfSurf, surfaceY),
                new Phaser.Math.Vector2(TRAY_X + TRAY_HALF_BOT, TRAY_BOTTOM),
                new Phaser.Math.Vector2(TRAY_X - TRAY_HALF_BOT, TRAY_BOTTOM)
            ], true);

            //  A scatter of little rice grains across the surface for texture
            for (let i = 0; i < 16; i++)
            {
                const cx = TRAY_X + (Math.random() - 0.5) * halfSurf * 1.7;
                const cy = surfaceY + (Math.random() - 0.5) * 16;
                g.fillStyle(riceDark, 1);
                g.fillEllipse(cx, cy, 6, 3);
            }

            this.drawMainOnTop(surfaceY, halfSurf);
            this.drawSauce(surfaceY, halfSurf);
            this.drawCrackers(surfaceY, halfSurf);
        }

        //  The takeaway box, drawn over the food as a pale wall + outline
        const pts = [
            new Phaser.Math.Vector2(TRAY_X - TRAY_HALF_TOP, TRAY_TOP),
            new Phaser.Math.Vector2(TRAY_X + TRAY_HALF_TOP, TRAY_TOP),
            new Phaser.Math.Vector2(TRAY_X + TRAY_HALF_BOT, TRAY_BOTTOM),
            new Phaser.Math.Vector2(TRAY_X - TRAY_HALF_BOT, TRAY_BOTTOM)
        ];

        g.fillStyle(0xffffff, 0.16);
        g.fillPoints(pts, true);
        g.lineStyle(6, 0xb71c1c, 1);
        g.strokePoints(pts, true, true);

        //  A little wire carry-handle across the open top
        g.lineStyle(5, 0xb71c1c, 1);
        g.strokeEllipse(TRAY_X, TRAY_TOP, TRAY_HALF_TOP * 2, 26);
        g.beginPath();
        g.arc(TRAY_X, TRAY_TOP - 6, TRAY_HALF_TOP * 0.7, Math.PI, Math.PI * 2, false);
        g.strokePath();
    }

    drawMainOnTop (surfaceY: number, halfSurf: number)
    {
        if (!this.main || this.main.id === 'plain')
        {
            return;
        }

        const g = this.trayGfx;
        const colour = parseColour(this.main.colour, 0xe64a19);
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
        const colour = parseColour(this.sauce.colour, 0x3e2723);

        g.fillStyle(colour, 1);

        //  A wobbly drizzle across the top
        for (let i = -2; i <= 2; i++)
        {
            const dx = i * (halfSurf / 3);
            g.fillCircle(TRAY_X + dx, surfaceY - 30 + Math.abs(i) * 6, 8);
        }
    }

    drawCrackers (surfaceY: number, halfSurf: number)
    {
        if (!this.crackers)
        {
            return;
        }

        const g = this.trayGfx;
        g.fillStyle(0xffe0b2, 1);
        g.lineStyle(2, 0xe0a660, 1);

        for (let i = 0; i < 5; i++)
        {
            const sx = TRAY_X + (i - 2) * (halfSurf / 2.4);
            const sy = surfaceY - 42 + Math.abs(i - 2) * 4;
            g.fillEllipse(sx, sy, 22, 14);
            g.strokeEllipse(sx, sy, 22, 14);
        }
    }

    //  ---- controls ----

    drawRiceControl ()
    {
        this.add.text(790, 150, 'Rice', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#b71c1c'
        }).setOrigin(0.5);

        //  A tappable scoop of rice that adds a portion
        this.add.circle(700, 215, 44, 0xfdf6e3).setStrokeStyle(4, 0xc68e17);
        this.add.text(700, 262, `+${this.config.ricePrice}`, {
            fontFamily: 'Arial Black', fontSize: 18, color: '#5d4037'
        }).setOrigin(0.5);

        this.add.circle(700 + 32, 215 + 30, 15, 0xffd54f).setStrokeStyle(3, 0xf9a825);
        this.add.text(700 + 32, 215 + 30, String(this.config.ricePrice), {
            fontFamily: 'Arial Black', fontSize: 16, color: '#5d4037'
        }).setOrigin(0.5);

        const zone = this.add.zone(700, 215, 100, 100).setInteractive();
        zone.on('pointerdown', () => this.addRice(zone));

        //  Pips showing how many portions are in
        for (let i = 0; i < this.config.maxRice; i++)
        {
            const pip = this.add.circle(810 + i * 46, 215, 15, 0xd7ccc8).setStrokeStyle(3, 0x8d6e63);
            this.ricePips.push(pip);
        }
    }

    refreshPips ()
    {
        this.ricePips.forEach((pip, i) => pip.setFillStyle(i < this.rice ? 0xfdf6e3 : 0xd7ccc8));
    }

    drawOptionRow (group: string, label: string, options: Option[], y: number)
    {
        this.add.text(560, y, label, {
            fontFamily: 'Arial Black', fontSize: 26, color: '#b71c1c'
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
            fontFamily: 'Arial Black', fontSize: 26, color: '#b71c1c', stroke: '#ffffff', strokeThickness: 4
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
        return this.rice * this.config.ricePrice
            + (this.main?.price ?? 0)
            + (this.sauce?.price ?? 0)
            + (this.crackers ? (this.config.extras[0]?.price ?? 0) : 0);
    }

    coins (): number
    {
        return (this.registry.get('coins') as number) ?? 0;
    }

    addRice (zone: Phaser.GameObjects.Zone)
    {
        if (this.rice >= this.config.maxRice)
        {
            this.say(`That's a lot of rice! Max ${this.config.maxRice} portions.`);
            this.bump(zone);

            return;
        }

        if (this.cost() + this.config.ricePrice > this.coins())
        {
            this.say('Not enough coins!');
            this.bump(zone);

            return;
        }

        this.rice++;
        this.refreshPips();
        this.drawTray();
        this.refreshTotal();
    }

    pickOption (group: string, option: Option, zone: Phaser.GameObjects.Zone)
    {
        const current = group === 'main' ? this.main : this.sauce;
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

        if (group === 'main') { this.main = next; }
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
        const next = !this.crackers;

        if (next && this.cost() + extra.price > this.coins())
        {
            this.say('Not enough coins!');

            return;
        }

        this.crackers = next;
        this.extraBg.setFillStyle(this.crackers ? 0xd32f2f : 0x455a64);
        this.extraLabel.setText(this.crackers ? `${extra.name}! ✓` : `${extra.name}?`);
        this.drawTray();
        this.refreshTotal();
    }

    refreshTotal ()
    {
        this.totalText.setText(this.rice > 0 ? `Total: ${this.cost()}` : 'Add some rice!');
    }

    bump (zone: Phaser.GameObjects.Zone)
    {
        this.tweens.add({ targets: zone, x: zone.x + 8, duration: 60, yoyo: true, repeat: 2 });
    }

    startOver ()
    {
        this.rice = 0;
        this.main = null;
        this.sauce = null;
        this.crackers = false;

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
        if (this.rice === 0)
        {
            this.say('Add some rice first!');

            return;
        }

        const total = this.cost();
        const coins = this.coins() - total;

        this.registry.set('coins', coins);
        saveCoins(coins);
        this.coinCount.setText(String(coins));

        this.orderZone?.destroy();
        this.setInstruction('Enjoy your Chinese takeaway!');

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `There you go, ${name}!` : 'There you go!');

        //  The box tips towards the counter as if being carried off, then a
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
