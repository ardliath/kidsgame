import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { parseColour } from '../mapBuilder';
import { loadCoins, loadPlayerName, saveCoins } from '../storage';

const CX = GAME_WIDTH / 2;

//  The cup sits on the left; the picking controls run down the right
const CUP_X = 320;
const CUP_TOP = 315;
const CUP_BOTTOM = 615;
const CUP_HALF_TOP = 100;
const CUP_HALF_BOT = 80;

interface Option
{
    id: string;
    name: string;
    colour: string;
    price: number;
}

interface CoffeeConfig
{
    maxShots: number;
    shotPrice: number;
    coffeeColour: string;
    milks: Option[];
    syrups: Option[];
    toppings: Option[];
}

//  Blend two colours: t=0 gives a, t=1 gives b
function blend (a: number, b: number, t: number): number
{
    const c1 = Phaser.Display.Color.IntegerToColor(a);
    const c2 = Phaser.Display.Color.IntegerToColor(b);
    const r = Math.round(c1.red + (c2.red - c1.red) * t);
    const g = Math.round(c1.green + (c2.green - c1.green) * t);
    const bl = Math.round(c1.blue + (c2.blue - c1.blue) * t);

    return (r << 16) | (g << 8) | bl;
}

export class Cafe extends Scene
{
    houseId = '';
    shopColour = 0x8d6e63;
    sells: string[] = [];
    config: CoffeeConfig;

    shots = 0;
    milk: Option | null = null;
    syrup: Option | null = null;
    topping: Option | null = null;

    cupGfx: Phaser.GameObjects.Graphics;
    steam: Phaser.GameObjects.Container;
    shotPips: Phaser.GameObjects.Arc[] = [];
    rings: Map<string, Phaser.GameObjects.Arc> = new Map();
    totalText: Phaser.GameObjects.Text;
    coinCount: Phaser.GameObjects.Text;
    makeZone: Phaser.GameObjects.Zone | null = null;

    speech: Phaser.GameObjects.Container | null = null;
    speechTimer: Phaser.Time.TimerEvent | null = null;

    constructor ()
    {
        super('Cafe');
    }

    init (data: { houseId: string; colour: number; sells: string[] })
    {
        this.houseId = data.houseId;
        this.shopColour = data.colour;
        this.sells = data.sells;
    }

    create ()
    {
        this.config = this.cache.json.get('coffee') as CoffeeConfig;
        this.shots = 0;
        this.milk = null;
        this.syrup = null;
        this.topping = null;
        this.shotPips = [];
        this.rings.clear();
        this.speech = null;
        this.speechTimer = null;
        this.makeZone = null;

        if (this.registry.get('coins') === undefined)
        {
            this.registry.set('coins', loadCoins());
        }

        //  A cosy café backdrop: warm walls, a wood counter along the bottom
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xf3e5d8);

        for (let x = 0; x < GAME_WIDTH; x += 90)
        {
            this.add.rectangle(x + 45, 150, 90, 300, (x / 90) % 2 === 0 ? 0xe7d3bf : 0xf3e5d8);
        }

        const shopDark = Phaser.Display.Color.IntegerToColor(this.shopColour).darken(35).color;
        this.add.rectangle(CX, 860, GAME_WIDTH, 200, 0x6d4c41);
        this.add.rectangle(CX, 762, GAME_WIDTH, 16, shopDark);

        this.instructionText('Make a coffee!');

        this.drawDoor();
        this.drawShopkeeper();
        this.createHud();

        this.steam = this.add.container(0, 0);
        this.cupGfx = this.add.graphics();

        this.drawCoffeeControl();
        this.drawOptionRow('milk', 'Milk', this.config.milks, 360);
        this.drawOptionRow('syrup', 'Syrup', this.syrupChoices(), 510);
        this.drawOptionRow('topping', 'Topping', this.config.toppings, 655);
        this.drawMakeButton();

        this.drawCup();
        this.refreshTotal();

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `Hi ${name}! What can I get you?` : 'What can I get you?');
    }

    syrupChoices (): Option[]
    {
        return this.config.syrups.filter(s => this.sells.length === 0 || this.sells.includes(s.id));
    }

    instructionText (text: string)
    {
        this.add.text(CX, 80, text, {
            fontFamily: 'Arial Black', fontSize: 40, color: '#4e342e',
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

        this.add.rectangle(x, 860, 90, 160, 0x795548).setStrokeStyle(5, 0x4e342e);
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

        this.add.rectangle(x, 810, 46, 66, 0x6d4c41).setStrokeStyle(3, 0x263238);
        this.add.rectangle(x, 822, 34, 40, 0xffffff);
        this.add.circle(x, 758, 26, 0xffcc80);
        this.add.rectangle(x, 738, 50, 16, 0x3e2723);
        this.add.circle(x - 9, 752, 3, 0x263238);
        this.add.circle(x + 9, 752, 3, 0x263238);

        //  A flat barista cap. Triangle points must be non-negative or Phaser
        //  miscalculates the origin.
        this.add.rectangle(x, 726, 54, 12, 0x3e2723);
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

    //  ---- the cup ----

    halfWidthAt (y: number): number
    {
        const t = (CUP_BOTTOM - y) / (CUP_BOTTOM - CUP_TOP);

        return CUP_HALF_BOT + (CUP_HALF_TOP - CUP_HALF_BOT) * t;
    }

    liquidColour (): number
    {
        let col = parseColour(this.config.coffeeColour, 0x4e342e);

        if (this.milk)
        {
            col = blend(col, parseColour(this.milk.colour, col), 0.7);
        }

        if (this.syrup)
        {
            col = blend(col, parseColour(this.syrup.colour, col), 0.25);
        }

        return col;
    }

    drawCup ()
    {
        const g = this.cupGfx;
        g.clear();
        this.steam.removeAll(true);

        //  Liquid, filling from the bottom; more shots means a fuller cup
        if (this.shots > 0)
        {
            const level = 0.35 + (this.shots / this.config.maxShots) * 0.5;
            const surfaceY = CUP_BOTTOM - level * (CUP_BOTTOM - CUP_TOP);
            const halfSurf = this.halfWidthAt(surfaceY);

            g.fillStyle(this.liquidColour(), 1);
            g.fillPoints([
                new Phaser.Math.Vector2(CUP_X - halfSurf, surfaceY),
                new Phaser.Math.Vector2(CUP_X + halfSurf, surfaceY),
                new Phaser.Math.Vector2(CUP_X + CUP_HALF_BOT, CUP_BOTTOM),
                new Phaser.Math.Vector2(CUP_X - CUP_HALF_BOT, CUP_BOTTOM)
            ], true);

            //  A darker rim of liquid to give it a surface
            g.fillStyle(blend(this.liquidColour(), 0x000000, 0.15), 1);
            g.fillEllipse(CUP_X, surfaceY, halfSurf * 2, 20);

            this.drawTopping(surfaceY, halfSurf);
            this.drawSteam(surfaceY);
        }

        //  The cup itself, drawn over the liquid as a translucent wall + outline
        const pts = [
            new Phaser.Math.Vector2(CUP_X - CUP_HALF_TOP, CUP_TOP),
            new Phaser.Math.Vector2(CUP_X + CUP_HALF_TOP, CUP_TOP),
            new Phaser.Math.Vector2(CUP_X + CUP_HALF_BOT, CUP_BOTTOM),
            new Phaser.Math.Vector2(CUP_X - CUP_HALF_BOT, CUP_BOTTOM)
        ];

        g.fillStyle(0xffffff, 0.12);
        g.fillPoints(pts, true);
        g.lineStyle(6, 0x4e342e, 1);
        g.strokePoints(pts, true, true);

        //  Rim ellipse and a little handle
        g.lineStyle(6, 0x4e342e, 1);
        g.strokeEllipse(CUP_X, CUP_TOP, CUP_HALF_TOP * 2, 26);
        g.lineStyle(14, 0x4e342e, 1);
        g.beginPath();
        g.arc(CUP_X + CUP_HALF_BOT + 6, (CUP_TOP + CUP_BOTTOM) / 2 + 10, 46, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70), false);
        g.strokePath();
    }

    drawTopping (surfaceY: number, halfSurf: number)
    {
        if (!this.topping)
        {
            return;
        }

        const g = this.cupGfx;
        const colour = parseColour(this.topping.colour, 0xffffff);

        if (this.topping.id === 'sprinkles')
        {
            const colours = [ 0xffeb3b, 0x42a5f5, 0x66bb6a, 0xff7043, 0xab47bc ];

            for (let i = 0; i < 10; i++)
            {
                const sx = CUP_X + (Math.random() - 0.5) * halfSurf * 1.6;
                const sy = surfaceY + (Math.random() - 0.5) * 12;
                g.fillStyle(colours[i % colours.length], 1);
                g.fillCircle(sx, sy, 4);
            }

            return;
        }

        //  Foam is a flat frothy band; cream is a piped dollop
        if (this.topping.id === 'foam')
        {
            g.fillStyle(colour, 1);
            g.fillEllipse(CUP_X, surfaceY - 4, halfSurf * 2, 30);
        }
        else
        {
            g.fillStyle(colour, 1);
            g.fillEllipse(CUP_X, surfaceY - 6, halfSurf * 1.5, 34);
            g.fillCircle(CUP_X, surfaceY - 26, 28);
            g.fillCircle(CUP_X - 22, surfaceY - 16, 20);
            g.fillCircle(CUP_X + 22, surfaceY - 16, 20);
        }
    }

    drawSteam (surfaceY: number)
    {
        for (const dx of [ -34, 0, 34 ])
        {
            const wisp = this.add.text(CUP_X + dx, surfaceY - 60, '~', {
                fontFamily: 'Arial Black', fontSize: 34, color: '#ffffff'
            }).setOrigin(0.5).setAlpha(0.5).setAngle(90);

            this.steam.add(wisp);
            this.tweens.add({ targets: wisp, y: wisp.y - 30, alpha: 0, duration: 1600, repeat: -1, ease: 'Sine.Out' });
        }
    }

    //  ---- controls ----

    drawCoffeeControl ()
    {
        this.add.text(790, 150, 'Coffee', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#4e342e'
        }).setOrigin(0.5);

        //  A tappable espresso cup that adds a shot
        this.add.circle(700, 215, 44, 0x4e342e).setStrokeStyle(4, 0x3e2723);
        this.add.circle(700, 215, 26, 0x6d4c41);
        this.add.text(700, 262, `+${this.config.shotPrice}`, {
            fontFamily: 'Arial Black', fontSize: 18, color: '#5d4037'
        }).setOrigin(0.5).setName('shot-price');

        this.add.circle(700 + 32, 215 + 30, 15, 0xffd54f).setStrokeStyle(3, 0xf9a825);
        this.add.text(700 + 32, 215 + 30, String(this.config.shotPrice), {
            fontFamily: 'Arial Black', fontSize: 16, color: '#5d4037'
        }).setOrigin(0.5);

        const zone = this.add.zone(700, 215, 100, 100).setInteractive();
        zone.on('pointerdown', () => this.addShot(zone));

        //  Pips showing how many shots are in
        for (let i = 0; i < this.config.maxShots; i++)
        {
            const pip = this.add.circle(810 + i * 46, 215, 15, 0xd7ccc8).setStrokeStyle(3, 0x8d6e63);
            this.shotPips.push(pip);
        }
    }

    refreshPips ()
    {
        this.shotPips.forEach((pip, i) => pip.setFillStyle(i < this.shots ? 0x4e342e : 0xd7ccc8));
    }

    drawOptionRow (group: string, label: string, options: Option[], y: number)
    {
        this.add.text(560, y, label, {
            fontFamily: 'Arial Black', fontSize: 26, color: '#4e342e'
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

    drawMakeButton ()
    {
        this.totalText = this.add.text(CUP_X, 668, '', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#5d4037', stroke: '#ffffff', strokeThickness: 4
        }).setOrigin(0.5);

        const g = this.add.graphics();
        g.fillStyle(0x43a047, 1);
        g.fillRoundedRect(CUP_X - 115, 700, 230, 66, 18);
        g.lineStyle(5, 0x1b5e20, 1);
        g.strokeRoundedRect(CUP_X - 115, 700, 230, 66, 18);

        this.add.text(CUP_X, 733, 'MAKE!', {
            fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff'
        }).setOrigin(0.5);

        this.makeZone = this.add.zone(CUP_X, 733, 240, 76).setInteractive();
        this.makeZone.on('pointerdown', () => this.makeCoffee());

        //  Start over, tucked in the gap between MAKE and the option rows
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
        return this.shots * this.config.shotPrice
            + (this.milk?.price ?? 0)
            + (this.syrup?.price ?? 0)
            + (this.topping?.price ?? 0);
    }

    coins (): number
    {
        return (this.registry.get('coins') as number) ?? 0;
    }

    addShot (zone: Phaser.GameObjects.Zone)
    {
        if (this.shots >= this.config.maxShots)
        {
            this.say(`That's a lot of coffee! Max ${this.config.maxShots} shots.`);
            this.bump(zone);

            return;
        }

        if (this.cost() + this.config.shotPrice > this.coins())
        {
            this.say('Not enough coins!');
            this.bump(zone);

            return;
        }

        this.shots++;
        this.refreshPips();
        this.drawCup();
        this.refreshTotal();
    }

    pickOption (group: string, option: Option, zone: Phaser.GameObjects.Zone)
    {
        const current = group === 'milk' ? this.milk : group === 'syrup' ? this.syrup : this.topping;
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

        if (group === 'milk') { this.milk = next; }
        else if (group === 'syrup') { this.syrup = next; }
        else { this.topping = next; }

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

        this.drawCup();
        this.refreshTotal();
    }

    refreshTotal ()
    {
        this.totalText.setText(this.shots > 0 ? `Total: ${this.cost()}` : 'Add some coffee!');
    }

    bump (zone: Phaser.GameObjects.Zone)
    {
        this.tweens.add({ targets: zone, x: zone.x + 8, duration: 60, yoyo: true, repeat: 2 });
    }

    startOver ()
    {
        this.shots = 0;
        this.milk = null;
        this.syrup = null;
        this.topping = null;

        for (const ring of this.rings.values())
        {
            ring.setVisible(false);
        }

        this.refreshPips();
        this.drawCup();
        this.refreshTotal();
    }

    makeCoffee ()
    {
        if (this.shots === 0)
        {
            this.say('Add some coffee first!');

            return;
        }

        const total = this.cost();
        const coins = this.coins() - total;

        this.registry.set('coins', coins);
        saveCoins(coins);
        this.coinCount.setText(String(coins));

        this.makeZone?.destroy();
        this.setInstruction('Enjoy your coffee!');

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `There you go, ${name}!` : 'There you go!');

        //  The cup tips towards the counter as if being sipped, then a
        //  little burst of stars
        this.tweens.add({
            targets: this.cupGfx,
            angle: -14,
            y: 40,
            alpha: 0,
            duration: 1200,
            ease: 'Back.In',
            delay: 400
        });

        this.tweens.add({ targets: this.steam, alpha: 0, duration: 400 });

        for (let i = 0; i < 8; i++)
        {
            const angle = (i / 8) * Math.PI * 2;
            const star = this.add.circle(CUP_X, 460, 9, [ 0xffeb3b, 0xff7043, 0x4dd0e1, 0xaed581 ][i % 4]);

            this.tweens.add({
                targets: star,
                x: CUP_X + Math.cos(angle) * 220,
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
