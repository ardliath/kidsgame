import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { drawFoodIcon, RecipeConfig } from '../recipes';
import { loadCoins, loadPantry, loadPlayerName, savePantry, saveCoins } from '../storage';

const WALL_TOP = 262;
const FLOOR_Y = 790;

export class Shop extends Scene
{
    houseId = '';
    shopColour = 0xfb8c00;
    sells: string[] = [];
    config: RecipeConfig;

    player: Phaser.GameObjects.Container;
    legLeft: Phaser.GameObjects.Rectangle;
    legRight: Phaser.GameObjects.Rectangle;

    basket: string[] = [];
    basketIcons: Phaser.GameObjects.Container;
    basketTotal: Phaser.GameObjects.Text;
    coinCount: Phaser.GameObjects.Text;

    speech: Phaser.GameObjects.Container | null = null;
    speechTimer: Phaser.Time.TimerEvent | null = null;

    cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    leftPointerId = -1;
    rightPointerId = -1;

    constructor ()
    {
        super('Shop');
    }

    init (data: { houseId: string; colour: number; sells: string[] })
    {
        this.houseId = data.houseId;
        this.shopColour = data.colour;
        this.sells = data.sells;
    }

    create ()
    {
        this.config = this.cache.json.get('recipes') as RecipeConfig;
        this.basket = [];
        this.leftPointerId = -1;
        this.rightPointerId = -1;
        this.speech = null;
        this.speechTimer = null;

        if (this.registry.get('coins') === undefined)
        {
            this.registry.set('coins', loadCoins());
        }

        const houseDark = Phaser.Display.Color.IntegerToColor(this.shopColour).darken(35).color;

        //  Backdrop and shop shell
        this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x102027);
        this.add.rectangle(GAME_WIDTH / 2, (WALL_TOP + FLOOR_Y) / 2, GAME_WIDTH - 48, FLOOR_Y - WALL_TOP, 0xfff3e0);
        this.add.rectangle(GAME_WIDTH / 2, WALL_TOP - 11, GAME_WIDTH - 8, 22, houseDark);
        this.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 30, GAME_WIDTH - 8, 60, houseDark);
        this.add.rectangle(12, (WALL_TOP + FLOOR_Y + 60) / 2, 24, FLOOR_Y + 60 - WALL_TOP, houseDark);
        this.add.rectangle(GAME_WIDTH - 12, (WALL_TOP + FLOOR_Y + 60) / 2, 24, FLOOR_Y + 60 - WALL_TOP, houseDark);

        //  Chequered shop floor
        for (let x = 36; x < GAME_WIDTH - 36; x += 40)
        {
            const shade = ((x / 40) % 2 === 0) ? 0xeceff1 : 0xb0bec5;
            this.add.rectangle(x + 20, FLOOR_Y - 8, 40, 16, shade);
        }

        this.add.rectangle(GAME_WIDTH / 2, FLOOR_Y + 6, GAME_WIDTH - 48, 14, 0x8d6e63);

        this.drawDoor();
        this.drawShelves();
        this.drawCounter();
        this.createHud();
        this.createPlayer();
        this.createWalkButtons();

        this.cursors = this.input.keyboard?.createCursorKeys();
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('gameout', () => { this.leftPointerId = -1; this.rightPointerId = -1; });
        this.input.keyboard?.on('keydown-ESC', () => this.leave());

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `Hello, ${name}!` : 'Hello!');
    }

    drawDoor ()
    {
        const x = 110;

        this.add.rectangle(x, FLOOR_Y - 95, 108, 190, 0x795548).setStrokeStyle(6, 0x4e342e);
        this.add.rectangle(x, FLOOR_Y - 140, 70, 60, 0x5d4037);
        this.add.circle(x + 36, FLOOR_Y - 90, 8, 0xffeb3b);

        const label = this.add.text(x, FLOOR_Y - 215, 'OUT', {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);

        this.tweens.add({ targets: label, y: label.y - 8, duration: 600, yoyo: true, repeat: -1 });

        this.add.zone(x, FLOOR_Y - 95, 150, 230).setInteractive().on('pointerdown', () => this.leave());
    }

    itemPrice (id: string): number
    {
        return this.config.ingredients[id]?.price ?? 1;
    }

    drawShelves ()
    {
        //  Two long shelves of goods between the door and the counter
        const shelfYs = [ 430, 590 ];

        this.sells.forEach((id, i) => {

            const def = this.config.ingredients[id];
            const x = 300 + (i % 4) * 170;
            const y = shelfYs[Math.floor(i / 4)];

            const item = this.add.container(x, y - 34, drawFoodIcon(this, def?.icon ?? '', def?.colour ?? '#ffca28'));
            item.setScale(1.3);

            //  Price tag
            this.add.circle(x - 22, y + 26, 12, 0xffd54f).setStrokeStyle(3, 0xf9a825);
            this.add.text(x + 2, y + 26, String(this.itemPrice(id)), {
                fontFamily: 'Arial Black', fontSize: 22, color: '#5d4037'
            }).setOrigin(0.5);

            const zone = this.add.zone(x, y - 20, 130, 130).setInteractive();
            zone.on('pointerdown', () => this.addToBasket(id, item));

        });

        for (const y of shelfYs)
        {
            this.add.rectangle(510, y + 46, 700, 14, 0x8d6e63).setStrokeStyle(3, 0x5d4037);
            this.add.rectangle(200, y + 70, 12, 40, 0x5d4037);
            this.add.rectangle(820, y + 70, 12, 40, 0x5d4037);
        }
    }

    drawCounter ()
    {
        //  Till and shopkeeper at the right-hand end
        this.add.rectangle(1080, FLOOR_Y - 60, 280, 120, 0xa1887f).setStrokeStyle(5, 0x795548);
        this.add.rectangle(1080, FLOOR_Y - 124, 300, 14, 0xd7ccc8);

        //  The till
        this.add.rectangle(1000, FLOOR_Y - 156, 70, 50, 0x455a64).setStrokeStyle(4, 0x263238);
        this.add.rectangle(1000, FLOOR_Y - 186, 46, 14, 0x263238);

        //  Shopkeeper behind the counter
        this.add.rectangle(1150, FLOOR_Y - 160, 46, 66, 0x43a047).setStrokeStyle(3, 0x263238);
        this.add.rectangle(1150, FLOOR_Y - 150, 34, 44, 0xffffff);
        this.add.circle(1150, FLOOR_Y - 214, 26, 0xd7a97c);
        this.add.rectangle(1150, FLOOR_Y - 232, 50, 14, 0x4e342e);
        this.add.circle(1141, FLOOR_Y - 218, 3, 0x263238);
        this.add.circle(1159, FLOOR_Y - 218, 3, 0x263238);

        const label = this.add.text(1080, FLOOR_Y - 250, 'PAY', {
            fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);

        this.tweens.add({ targets: label, y: label.y - 8, duration: 600, yoyo: true, repeat: -1 });

        this.add.zone(1090, FLOOR_Y - 140, 260, 220).setInteractive().on('pointerdown', () => this.pay());
    }

    createHud ()
    {
        //  Coins, top left
        const bg = this.add.rectangle(0, 0, 130, 48, 0x102027, 0.85);
        bg.setStrokeStyle(3, 0xffd54f);
        const coin = this.add.circle(-38, 0, 15, 0xffd54f).setStrokeStyle(3, 0xf9a825);

        this.coinCount = this.add.text(10, 0, String(this.registry.get('coins') ?? 0), {
            fontFamily: 'Arial Black', fontSize: 26, color: '#ffd54f'
        }).setOrigin(0.5);

        this.add.container(100, 46, [ bg, coin, this.coinCount ]).setDepth(20);

        //  Basket, top middle
        this.add.text(430, 46, 'Basket:', {
            fontFamily: 'Arial Black', fontSize: 24, color: '#ffffff', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(20);

        this.basketIcons = this.add.container(520, 46);
        this.basketIcons.setDepth(20);

        this.basketTotal = this.add.text(880, 46, '', {
            fontFamily: 'Arial Black', fontSize: 24, color: '#ffd54f', stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(20);
    }

    refreshBasket ()
    {
        this.basketIcons.removeAll(true);

        this.basket.forEach((id, i) => {

            const def = this.config.ingredients[id];
            const icon = this.add.container(i * 56, 0, drawFoodIcon(this, def?.icon ?? '', def?.colour ?? '#ffca28'));
            icon.setScale(0.6);
            this.basketIcons.add(icon);

        });

        const total = this.basket.reduce((sum, id) => sum + this.itemPrice(id), 0);
        this.basketTotal.setText(this.basket.length > 0 ? `Total: ${total}` : '');
    }

    basketCost (): number
    {
        return this.basket.reduce((sum, id) => sum + this.itemPrice(id), 0);
    }

    addToBasket (id: string, item: Phaser.GameObjects.Container)
    {
        const coins = (this.registry.get('coins') as number) ?? 0;

        if (this.basketCost() + this.itemPrice(id) > coins)
        {
            this.say('Not enough coins!');
            this.tweens.add({ targets: item, x: item.x + 8, duration: 60, yoyo: true, repeat: 2 });

            return;
        }

        this.basket.push(id);
        this.refreshBasket();

        //  A copy hops up to the basket row
        const def = this.config.ingredients[id];
        const copy = this.add.container(item.x, item.y, drawFoodIcon(this, def?.icon ?? '', def?.colour ?? '#ffca28'));
        copy.setScale(1.3);

        this.tweens.add({
            targets: copy,
            x: 520 + (this.basket.length - 1) * 56,
            y: 46,
            scale: 0.6,
            duration: 400,
            ease: 'Back.In',
            onComplete: () => copy.destroy()
        });
    }

    pay ()
    {
        if (this.basket.length === 0)
        {
            this.say('Pick something from the shelves!');

            return;
        }

        const total = this.basketCost();
        const coins = ((this.registry.get('coins') as number) ?? 0) - total;

        this.registry.set('coins', coins);
        saveCoins(coins);
        this.coinCount.setText(String(coins));

        //  Stock his pantry (home fridge) with what he bought
        const pantry = loadPantry();

        for (const id of this.basket)
        {
            pantry[id] = (pantry[id] ?? 0) + 1;
        }

        savePantry(pantry);

        this.basket = [];
        this.refreshBasket();

        const name = loadPlayerName().trim();
        this.say(name.length > 0 ? `Thank you, ${name}!` : 'Thank you!');

        //  Coins hop over to the till
        for (let i = 0; i < Math.min(total, 6); i++)
        {
            const c = this.add.circle(100, 46, 12, 0xffd54f).setStrokeStyle(3, 0xf9a825);

            this.tweens.add({
                targets: c,
                x: 1000,
                y: FLOOR_Y - 170,
                duration: 500,
                delay: i * 90,
                ease: 'Quad.In',
                onComplete: () => c.destroy()
            });
        }
    }

    say (text: string)
    {
        this.speech?.destroy(true);
        this.speechTimer?.remove();

        const label = this.add.text(0, 0, text, {
            fontFamily: 'Arial Black', fontSize: 22, color: '#263238'
        }).setOrigin(0.5);

        const bg = this.add.rectangle(0, 0, label.width + 36, 46, 0xffffff).setStrokeStyle(4, 0x263238);
        const tail = this.add.triangle(30, 30, 0, 0, 24, 0, 12, 16, 0xffffff);

        this.speech = this.add.container(Math.min(1150, 1280 - (label.width + 36) / 2 - 20), FLOOR_Y - 290, [ bg, tail, label ]);
        this.speech.setDepth(15);

        this.speechTimer = this.time.delayedCall(2600, () => {
            this.speech?.destroy(true);
            this.speech = null;
        });
    }

    createPlayer ()
    {
        const shirt = (this.registry.get('carColour') as number) ?? 0xe53935;

        this.legLeft = this.add.rectangle(-8, -18, 13, 36, 0x37474f);
        this.legRight = this.add.rectangle(8, -18, 13, 36, 0x37474f);

        this.player = this.add.container(200, FLOOR_Y, [
            this.legLeft,
            this.legRight,
            this.add.rectangle(0, -64, 40, 60, shirt).setStrokeStyle(3, 0x263238),
            this.add.circle(0, -112, 22, 0xffcc80),
            this.add.rectangle(0, -128, 44, 12, shirt),
            this.add.circle(-7, -115, 3, 0x263238),
            this.add.circle(7, -115, 3, 0x263238)
        ]);

        this.player.setDepth(10);
    }

    createWalkButtons ()
    {
        const makeArrow = (x: number, dir: number) => {

            this.add.circle(x, 890, 56, 0x102027, 0.55).setStrokeStyle(4, 0xffffff, 0.6).setDepth(20);

            const tri = dir < 0
                ? this.add.triangle(x, 890, 40, 0, 40, 48, 0, 24, 0xffffff)
                : this.add.triangle(x, 890, 0, 0, 0, 48, 40, 24, 0xffffff);
            tri.setDepth(20);

            const zone = this.add.zone(x, 890, 130, 130).setInteractive();

            zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {

                if (dir < 0) { this.leftPointerId = pointer.id; }
                else { this.rightPointerId = pointer.id; }

            });
        };

        makeArrow(110, -1);
        makeArrow(260, 1);
    }

    onPointerUp (pointer: Phaser.Input.Pointer)
    {
        if (pointer.id === this.leftPointerId) this.leftPointerId = -1;
        if (pointer.id === this.rightPointerId) this.rightPointerId = -1;
    }

    leave ()
    {
        this.scene.resume('Driving');
        this.scene.resume('Dashboard');
        this.scene.stop();
    }

    update (time: number, delta: number)
    {
        const dt = delta / 1000;

        let dir = 0;

        if (this.leftPointerId !== -1 || this.cursors?.left.isDown) dir -= 1;
        if (this.rightPointerId !== -1 || this.cursors?.right.isDown) dir += 1;

        if (dir !== 0)
        {
            this.player.x = Phaser.Math.Clamp(this.player.x + dir * 280 * dt, 70, 1210);
            this.player.setScale(dir > 0 ? 1 : -1, 1);

            const swing = Math.sin(time / 70) * 14;
            this.legLeft.x = -8 + swing;
            this.legRight.x = 8 - swing;
        }
        else
        {
            this.legLeft.x = -8;
            this.legRight.x = 8;
        }
    }
}
