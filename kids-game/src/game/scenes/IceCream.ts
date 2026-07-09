import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { parseColour } from '../mapBuilder';
import { loadCoins, loadPlayerName, saveCoins } from '../storage';

const CX = GAME_WIDTH / 2;
const CONE_TIP_Y = 660;
const SCOOP_R = 52;

interface Flavour
{
    id: string;
    name: string;
    colour: string;
    price: number;
}

interface IceCreamConfig
{
    maxScoops: number;
    flavours: Flavour[];
}

export class IceCream extends Scene
{
    houseId = '';
    shopColour = 0xf48fb1;
    sells: string[] = [];
    config: IceCreamConfig;

    scoops: Flavour[] = [];
    sprinkles = false;
    coneLayer: Phaser.GameObjects.Container;
    totalText: Phaser.GameObjects.Text;
    coinCount: Phaser.GameObjects.Text;
    enjoyZone: Phaser.GameObjects.Zone | null = null;

    speech: Phaser.GameObjects.Container | null = null;
    speechTimer: Phaser.Time.TimerEvent | null = null;

    constructor ()
    {
        super('IceCream');
    }

    init (data: { houseId: string; colour: number; sells: string[] })
    {
        this.houseId = data.houseId;
        this.shopColour = data.colour;
        this.sells = data.sells;
    }

    create ()
    {
        this.config = this.cache.json.get('icecream') as IceCreamConfig;
        this.scoops = [];
        this.sprinkles = false;
        this.speech = null;
        this.speechTimer = null;
        this.enjoyZone = null;

        if (this.registry.get('coins') === undefined)
        {
            this.registry.set('coins', loadCoins());
        }

        //  A candy-stripe parlour backdrop
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xfff0f5);

        for (let x = 0; x < GAME_WIDTH; x += 80)
        {
            this.add.rectangle(x + 40, 140, 80, 280, (x / 80) % 2 === 0 ? 0xf8bbd0 : 0xffffff);
        }

        this.add.rectangle(CX, 300, GAME_WIDTH, 20, 0xffffff);

        const shopDark = Phaser.Display.Color.IntegerToColor(this.shopColour).darken(35).color;
        this.add.rectangle(CX, 850, GAME_WIDTH, 220, shopDark);
        this.add.rectangle(CX, 745, GAME_WIDTH, 16, 0xffffff);

        this.instructionText('Pick your scoops!');

        this.drawDoor();
        this.drawShopkeeper();
        this.createHud();
        this.coneLayer = this.add.container(0, 0);
        this.drawCone();
        this.drawFlavours();
        this.drawExtras();

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `Hello, ${name}!` : 'Hello!');
    }

    instructionText (text: string)
    {
        this.add.text(CX, 90, text, {
            fontFamily: 'Arial Black', fontSize: 40, color: '#880e4f',
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

        this.add.rectangle(x, 850, 90, 170, 0x795548).setStrokeStyle(5, 0x4e342e);
        this.add.circle(x + 30, 850, 7, 0xffeb3b);

        const label = this.add.text(x, 745, 'OUT', {
            fontFamily: 'Arial Black', fontSize: 20, color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);

        this.tweens.add({ targets: label, y: label.y - 8, duration: 600, yoyo: true, repeat: -1 });

        this.add.zone(x, 850, 120, 200).setInteractive().on('pointerdown', () => this.close());
    }

    drawShopkeeper ()
    {
        const x = GAME_WIDTH - 110;

        this.add.rectangle(x, 800, 46, 66, 0xf06292).setStrokeStyle(3, 0x263238);
        this.add.rectangle(x, 812, 34, 40, 0xffffff);
        this.add.circle(x, 748, 26, 0xffcc80);
        this.add.rectangle(x, 728, 50, 16, 0x4e342e);
        this.add.circle(x - 9, 742, 3, 0x263238);
        this.add.circle(x + 9, 742, 3, 0x263238);

        //  A little hat, because ice cream shops need a little hat.
        //  Triangle points must be non-negative or Phaser miscalculates the origin.
        this.add.triangle(x, 712, 0, 20, 52, 20, 26, 0, 0xffffff);
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

    drawCone ()
    {
        this.coneLayer.removeAll(true);

        //  Waffle cone. Triangle points must be non-negative or Phaser
        //  miscalculates the origin, which is why the scoops were drifting
        //  away from it.
        const cone = this.add.triangle(CX, CONE_TIP_Y + 90, 0, 0, 100, 0, 50, 130, 0xd7a86e);
        cone.setStrokeStyle(4, 0xa9784f);
        this.coneLayer.add(cone);

        for (let i = -40; i <= 40; i += 20)
        {
            const line = this.add.rectangle(CX + i * 0.6, CONE_TIP_Y + 90 + 30, 3, 90, 0xa9784f, 0.5);
            this.coneLayer.add(line);
        }

        //  Scoops stack up from the cone tip
        this.scoops.forEach((flavour, i) => {

            const colour = parseColour(flavour.colour, 0xffffff);
            const y = CONE_TIP_Y - i * (SCOOP_R * 1.15);

            const scoop = this.add.circle(CX, y, SCOOP_R, colour).setStrokeStyle(3, 0x00000022);
            this.coneLayer.add(scoop);

            //  Sprinkles go on the very top scoop
            if (this.sprinkles && i === this.scoops.length - 1)
            {
                for (let s = 0; s < 8; s++)
                {
                    const angle = (s / 8) * Math.PI * 2;
                    const sx = CX + Math.cos(angle) * (SCOOP_R * 0.6);
                    const sy = y + Math.sin(angle) * (SCOOP_R * 0.6) * 0.6 - SCOOP_R * 0.2;
                    const sprinkle = this.add.rectangle(sx, sy, 4, 12, [ 0xffeb3b, 0x42a5f5, 0x66bb6a, 0xff7043 ][s % 4]);
                    sprinkle.setRotation(angle);
                    this.coneLayer.add(sprinkle);
                }
            }

        });

        //  A little pop when a scoop lands
        if (this.scoops.length > 0)
        {
            const top = this.coneLayer.list[this.coneLayer.list.length - (this.sprinkles ? 9 : 1)] as Phaser.GameObjects.Arc;

            if (top?.setScale)
            {
                top.setScale(0);
                this.tweens.add({ targets: top, scale: 1, duration: 200, ease: 'Back.Out' });
            }
        }
    }

    cost (): number
    {
        return this.scoops.reduce((sum, f) => sum + f.price, 0);
    }

    drawFlavours ()
    {
        const flavours = this.config.flavours.filter(f => this.sells.length === 0 || this.sells.includes(f.id));

        flavours.forEach((flavour, i) => {

            const x = 300 + i * 170;
            const y = 460;

            this.add.circle(x, y, 46, parseColour(flavour.colour, 0xffffff)).setStrokeStyle(4, 0x455a64);

            this.add.circle(x + 32, y + 34, 15, 0xffd54f).setStrokeStyle(3, 0xf9a825);
            this.add.text(x + 32, y + 34, String(flavour.price), {
                fontFamily: 'Arial Black', fontSize: 18, color: '#5d4037'
            }).setOrigin(0.5);

            this.add.text(x, y + 66, flavour.name, {
                fontFamily: 'Arial Black', fontSize: 18, color: '#5d4037'
            }).setOrigin(0.5);

            const zone = this.add.zone(x, y, 110, 110).setInteractive();
            zone.on('pointerdown', () => this.addScoop(flavour, zone));

        });
    }

    addScoop (flavour: Flavour, zone: Phaser.GameObjects.Zone)
    {
        if (this.scoops.length >= this.config.maxScoops)
        {
            this.say(`Only ${this.config.maxScoops} scoops fit on a cone!`);
            this.tweens.add({ targets: zone, x: zone.x + 8, duration: 60, yoyo: true, repeat: 2 });

            return;
        }

        const coins = (this.registry.get('coins') as number) ?? 0;

        if (this.cost() + flavour.price > coins)
        {
            this.say('Not enough coins!');
            this.tweens.add({ targets: zone, x: zone.x + 8, duration: 60, yoyo: true, repeat: 2 });

            return;
        }

        this.scoops.push(flavour);
        this.drawCone();
        this.refreshTotal();
    }

    drawExtras ()
    {
        //  Sprinkles toggle
        const sprinkleBg = this.add.rectangle(1080, 400, 170, 60, 0x455a64).setStrokeStyle(4, 0x263238);
        const sprinkleLabel = this.add.text(1080, 400, 'Sprinkles?', {
            fontFamily: 'Arial Black', fontSize: 20, color: '#ffffff'
        }).setOrigin(0.5);

        this.add.zone(1080, 400, 180, 70).setInteractive().on('pointerdown', () => {

            this.sprinkles = !this.sprinkles;
            sprinkleBg.setFillStyle(this.sprinkles ? 0xec407a : 0x455a64);
            sprinkleLabel.setText(this.sprinkles ? 'Sprinkles! ✓' : 'Sprinkles?');
            this.drawCone();

        });

        //  Start over
        const resetLabel = this.add.text(1080, 480, 'Start over', {
            fontFamily: 'Arial Black', fontSize: 20, color: '#ffcdd2', stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);

        this.add.zone(1080, 480, 180, 50).setInteractive().on('pointerdown', () => {

            resetLabel.setAlpha(0.5);
            this.time.delayedCall(100, () => resetLabel.setAlpha(1));

            this.scoops = [];
            this.sprinkles = false;
            sprinkleBg.setFillStyle(0x455a64);
            sprinkleLabel.setText('Sprinkles?');
            this.drawCone();
            this.refreshTotal();

        });

        //  Total + ENJOY
        this.totalText = this.add.text(1080, 550, '', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffd54f', stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        const enjoy = this.add.graphics();
        enjoy.fillStyle(0x43a047, 1);
        enjoy.fillRoundedRect(995, 590, 170, 70, 18);
        enjoy.lineStyle(5, 0x1b5e20, 1);
        enjoy.strokeRoundedRect(995, 590, 170, 70, 18);

        this.add.text(1080, 625, 'ENJOY!', {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
        }).setOrigin(0.5);

        this.enjoyZone = this.add.zone(1080, 625, 180, 80).setInteractive();
        this.enjoyZone.on('pointerdown', () => this.enjoyCone());
    }

    refreshTotal ()
    {
        this.totalText.setText(this.scoops.length > 0 ? `Total: ${this.cost()}` : '');
    }

    enjoyCone ()
    {
        if (this.scoops.length === 0)
        {
            this.say('Pick a scoop first!');

            return;
        }

        const total = this.cost();
        const coins = ((this.registry.get('coins') as number) ?? 0) - total;

        this.registry.set('coins', coins);
        saveCoins(coins);
        this.coinCount.setText(String(coins));

        this.enjoyZone?.destroy();
        this.setInstruction('Yum yum yum!');

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `Enjoy, ${name}!` : 'Enjoy!');

        //  The cone shrinks bite by bite while stars burst around it
        this.tweens.add({
            targets: this.coneLayer,
            scale: 0,
            y: 40,
            duration: 1200,
            ease: 'Back.In',
            delay: 400
        });

        for (let i = 0; i < 8; i++)
        {
            const angle = (i / 8) * Math.PI * 2;
            const star = this.add.circle(CX, CONE_TIP_Y - 60, 9, [ 0xffeb3b, 0xff7043, 0x4dd0e1, 0xaed581 ][i % 4]);

            this.tweens.add({
                targets: star,
                x: CX + Math.cos(angle) * 220,
                y: CONE_TIP_Y - 60 + Math.sin(angle) * 160,
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

        this.speech = this.add.container(GAME_WIDTH - 170, 620, [ bg, tail, label ]);
        this.speech.setDepth(15);

        this.speechTimer = this.time.delayedCall(2400, () => {
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
