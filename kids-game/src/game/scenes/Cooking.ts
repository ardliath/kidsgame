import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { drawFoodIcon, foodColour, RecipeConfig, RecipeDef } from '../recipes';

const CX = GAME_WIDTH / 2;
const COUNTER_Y = 700;
const GLASS_FULL = 120;

export class Cooking extends Scene
{
    config: RecipeConfig;
    recipe: RecipeDef | null = null;

    phaseLayer: Phaser.GameObjects.Container;
    instruction: Phaser.GameObjects.Text;

    fetched: Set<string> = new Set();
    trackers: Map<string, Phaser.GameObjects.Container> = new Map();

    stirsLeft = 0;
    panContents: Phaser.GameObjects.Ellipse | null = null;
    spoon: Phaser.GameObjects.Rectangle | null = null;

    pouringPointer = -1;
    pourLevel = 0;
    liquid: Phaser.GameObjects.Rectangle | null = null;
    carton: Phaser.GameObjects.Container | null = null;
    stream: Phaser.GameObjects.Rectangle | null = null;

    busy = false;

    constructor ()
    {
        super('Cooking');
    }

    create ()
    {
        this.config = this.cache.json.get('recipes') as RecipeConfig;
        this.recipe = null;
        this.fetched = new Set();
        this.trackers = new Map();
        this.pouringPointer = -1;
        this.pourLevel = 0;
        this.busy = false;

        //  A warm little kitchen backdrop
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xfff8e1);

        for (let x = 0; x < GAME_WIDTH; x += 60)
        {
            const shade = ((x / 60) % 2 === 0) ? 0xeceff1 : 0xb0bec5;
            this.add.rectangle(x + 30, 850, 60, 220, shade);
        }

        this.add.rectangle(CX, COUNTER_Y + 60, GAME_WIDTH, 130, 0xa1887f).setStrokeStyle(6, 0x795548);
        this.add.rectangle(CX, COUNTER_Y, GAME_WIDTH, 18, 0xd7ccc8);

        this.instruction = this.add.text(CX, 90, '', {
            fontFamily: 'Arial Black', fontSize: 44, color: '#5d4037',
            stroke: '#ffffff', strokeThickness: 8
        }).setOrigin(0.5).setDepth(20);

        //  Quit button
        this.add.circle(GAME_WIDTH - 60, 60, 30, 0xef5350).setStrokeStyle(4, 0x8e0000).setDepth(20);
        this.add.text(GAME_WIDTH - 60, 60, 'X', {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff'
        }).setOrigin(0.5).setDepth(20);
        this.add.zone(GAME_WIDTH - 60, 60, 90, 90).setInteractive().on('pointerdown', () => this.close());

        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {

            if (pointer.id === this.pouringPointer)
            {
                this.pouringPointer = -1;
            }

        });

        this.showChoose();
    }

    newPhaseLayer ()
    {
        this.phaseLayer?.destroy(true);
        this.phaseLayer = this.add.container(0, 0);
    }

    foodIcon (icon: string, colour: string, x: number, y: number, scale = 1): Phaser.GameObjects.Container
    {
        const container = this.add.container(x, y, drawFoodIcon(this, icon, colour));
        container.setScale(scale);
        this.phaseLayer.add(container);

        return container;
    }

    //  ---- Phase 1: pick a recipe ----

    showChoose ()
    {
        this.newPhaseLayer();
        this.instruction.setText('What shall we make?');

        const recipes = this.config.recipes;

        recipes.forEach((recipe, i) => {

            const x = CX + (i - (recipes.length - 1) / 2) * 300;
            const y = 450;

            const card = this.add.rectangle(x, y, 250, 300, 0x455a64).setStrokeStyle(6, 0x263238);
            this.phaseLayer.add(card);

            this.foodIcon(recipe.result.icon, recipe.result.colour, x, y - 60, 2);

            const label = this.add.text(x, y + 90, recipe.name, {
                fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
            }).setOrigin(0.5);
            this.phaseLayer.add(label);

            const zone = this.add.zone(x, y, 260, 310).setInteractive();
            zone.on('pointerdown', () => this.startFetch(recipe));
            this.phaseLayer.add(zone);

        });
    }

    //  ---- Phase 2: find the ingredients in the fridge ----

    startFetch (recipe: RecipeDef)
    {
        this.recipe = recipe;
        this.fetched = new Set();
        this.trackers = new Map();
        this.newPhaseLayer();

        const firstIngredient = this.config.ingredients[recipe.ingredients[0]];
        this.instruction.setText(`Find the ${firstIngredient?.name.toLowerCase() ?? 'food'}!`);

        //  What we need, shown dimmed until found
        const needed = recipe.ingredients;

        needed.forEach((id, i) => {

            const def = this.config.ingredients[id];
            const x = CX + (i - (needed.length - 1) / 2) * 110;

            const tracker = this.add.container(x, 190);
            tracker.add(this.add.circle(0, 0, 44, 0xffffff, 0.6).setStrokeStyle(4, 0xbcaaa4));
            tracker.add(this.add.container(0, 0, drawFoodIcon(this, def?.icon ?? '', def?.colour ?? '#ffca28')));
            tracker.setAlpha(0.4);
            this.phaseLayer.add(tracker);
            this.trackers.set(id, tracker);

        });

        //  The fridge, door open, shelves stocked with everything we know about
        this.phaseLayer.add(this.add.rectangle(330, 470, 340, 470, 0xeceff1).setStrokeStyle(6, 0x90a4ae));
        this.phaseLayer.add(this.add.rectangle(132, 470, 56, 470, 0xcfd8dc).setStrokeStyle(5, 0x90a4ae));

        const shelfYs = [ 350, 470, 590 ];

        for (const y of shelfYs)
        {
            this.phaseLayer.add(this.add.rectangle(330, y + 42, 320, 8, 0xb0bec5));
        }

        //  Required items plus decoys, spread over the shelves
        const allIds = Object.keys(this.config.ingredients);
        const decoys = allIds.filter(id => !needed.includes(id));
        const stock = [ ...needed, ...decoys ].slice(0, 6);

        Phaser.Utils.Array.Shuffle(stock);

        stock.forEach((id, i) => {

            const def = this.config.ingredients[id];
            const x = 240 + (i % 2) * 180;
            const y = shelfYs[Math.floor(i / 2)];

            const item = this.add.container(x, y, drawFoodIcon(this, def?.icon ?? '', def?.colour ?? '#ffca28'));
            item.setScale(1.4);
            this.phaseLayer.add(item);

            const zone = this.add.zone(x, y, 100, 100).setInteractive();
            zone.on('pointerdown', () => this.fetchItem(id, item, zone));
            this.phaseLayer.add(zone);

        });
    }

    fetchItem (id: string, item: Phaser.GameObjects.Container, zone: Phaser.GameObjects.Zone)
    {
        if (!this.recipe)
        {
            return;
        }

        if (!this.recipe.ingredients.includes(id) || this.fetched.has(id))
        {
            //  Not what we need: wiggle and stay put
            this.tweens.add({ targets: item, x: item.x + 10, duration: 60, yoyo: true, repeat: 2 });

            return;
        }

        this.fetched.add(id);
        zone.destroy();

        //  Fly to the counter
        this.tweens.add({
            targets: item,
            x: 850 + this.fetched.size * 90,
            y: COUNTER_Y - 50,
            scale: 1.2,
            duration: 400,
            ease: 'Back.In'
        });

        const tracker = this.trackers.get(id);

        if (tracker)
        {
            tracker.setAlpha(1);
            tracker.add(this.add.text(30, -30, '✓', { fontFamily: 'Arial Black', fontSize: 30, color: '#2e7d32' }).setOrigin(0.5));
        }

        if (this.fetched.size === this.recipe.ingredients.length)
        {
            this.time.delayedCall(600, () => this.startCook());
        }
    }

    //  ---- Phase 3: cook it ----

    startCook ()
    {
        if (!this.recipe)
        {
            return;
        }

        this.newPhaseLayer();

        switch (this.recipe.method)
        {
            case 'toaster': this.setupToaster(); break;
            case 'hob': this.setupHob(); break;
            case 'pour': this.setupPour(); break;
        }
    }

    setupToaster ()
    {
        this.instruction.setText('Push the lever!');

        const x = CX;
        const y = COUNTER_Y - 80;

        //  Bread peeking out of the slots
        const ingredient = this.config.ingredients[this.recipe!.ingredients[0]];
        const breadColour = foodColour(ingredient?.colour);

        const slices = [
            this.add.rectangle(x - 45, y - 80, 60, 50, breadColour).setStrokeStyle(3, 0xb08a50),
            this.add.rectangle(x + 45, y - 80, 60, 50, breadColour).setStrokeStyle(3, 0xb08a50)
        ];
        slices.forEach(s => this.phaseLayer.add(s));

        //  The toaster
        const body = this.add.rectangle(x, y, 260, 160, 0xb0bec5).setStrokeStyle(6, 0x78909c);
        this.phaseLayer.add(body);
        this.phaseLayer.add(this.add.rectangle(x - 45, y - 72, 70, 16, 0x455a64));
        this.phaseLayer.add(this.add.rectangle(x + 45, y - 72, 70, 16, 0x455a64));
        this.phaseLayer.add(this.add.circle(x - 95, y + 45, 10, 0x8d6e63));

        //  Lever
        const lever = this.add.rectangle(x + 155, y - 40, 36, 26, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.phaseLayer.add(this.add.rectangle(x + 145, y, 10, 110, 0x78909c));
        this.phaseLayer.add(lever);

        const zone = this.add.zone(x + 150, y - 20, 110, 130).setInteractive();
        this.phaseLayer.add(zone);

        zone.on('pointerdown', () => {

            if (this.busy)
            {
                return;
            }

            this.busy = true;
            zone.destroy();

            this.tweens.add({ targets: lever, y: y + 40, duration: 200 });
            this.tweens.add({ targets: slices, y: '+=40', duration: 200 });
            this.tweens.add({ targets: body, x: x + 3, duration: 70, yoyo: true, repeat: 8, delay: 300 });

            this.instruction.setText('Toasting...');

            this.time.delayedCall(1600, () => {

                const toastColour = foodColour(this.recipe!.result.colour);

                slices.forEach(s => s.setFillStyle(toastColour));
                this.tweens.add({ targets: slices, y: '-=70', duration: 300, ease: 'Back.Out' });
                this.tweens.add({ targets: lever, y: y - 40, duration: 200 });

                const ding = this.add.text(x, y - 180, 'DING!', {
                    fontFamily: 'Arial Black', fontSize: 40, color: '#fb8c00',
                    stroke: '#ffffff', strokeThickness: 8
                }).setOrigin(0.5).setScale(0);
                this.phaseLayer.add(ding);
                this.tweens.add({ targets: ding, scale: 1, duration: 250, ease: 'Back.Out' });

                this.time.delayedCall(900, () => this.finish());

            });

        });
    }

    setupHob ()
    {
        this.stirsLeft = this.recipe!.stirs ?? 5;
        this.instruction.setText(`Stir it ${this.stirsLeft} times!`);

        const x = CX;
        const y = COUNTER_Y - 60;

        //  Cooker ring and pan
        this.phaseLayer.add(this.add.rectangle(x, COUNTER_Y - 12, 320, 14, 0x455a64));
        this.phaseLayer.add(this.add.ellipse(x, y + 26, 240, 26, 0x263238));

        this.phaseLayer.add(this.add.rectangle(x + 175, y - 10, 110, 16, 0x455a64));
        this.phaseLayer.add(this.add.ellipse(x, y, 230, 60, 0x37474f).setStrokeStyle(5, 0x263238));

        this.panContents = this.add.ellipse(x, y - 6, 190, 36, 0xfff3c4);
        this.phaseLayer.add(this.panContents);

        this.spoon = this.add.rectangle(x + 40, y - 70, 14, 110, 0x8d6e63).setStrokeStyle(3, 0x5d4037);
        this.phaseLayer.add(this.spoon);

        const zone = this.add.zone(x, y - 30, 280, 160).setInteractive();
        this.phaseLayer.add(zone);

        zone.on('pointerdown', () => this.stir(x, y, zone));
    }

    stir (x: number, y: number, zone: Phaser.GameObjects.Zone)
    {
        if (this.stirsLeft <= 0 || !this.spoon || !this.panContents)
        {
            return;
        }

        this.stirsLeft--;

        //  Swish the spoon and puff some steam
        this.tweens.add({ targets: this.spoon, x: x - 40, duration: 160, yoyo: true });
        this.tweens.add({ targets: this.spoon, rotation: -0.35, duration: 160, yoyo: true });

        for (let i = 0; i < 2; i++)
        {
            const puff = this.add.circle(x - 40 + Math.random() * 80, y - 50, 12 + Math.random() * 8, 0xffffff, 0.75);
            this.phaseLayer.add(puff);
            this.tweens.add({ targets: puff, y: puff.y - 90, alpha: 0, duration: 700, onComplete: () => puff.destroy() });
        }

        //  Contents cook towards the finished colour
        const total = this.recipe!.stirs ?? 5;
        const progress = (total - this.stirsLeft) / total;
        const from = Phaser.Display.Color.IntegerToColor(0xfff3c4);
        const to = Phaser.Display.Color.IntegerToColor(foodColour(this.recipe!.result.colour));
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, Math.round(progress * 100));

        this.panContents.setFillStyle(Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b));

        if (this.stirsLeft > 0)
        {
            this.instruction.setText(`Stir it ${this.stirsLeft} more!`);
        }
        else
        {
            zone.destroy();
            this.instruction.setText('Smells great!');
            this.time.delayedCall(800, () => this.finish());
        }
    }

    setupPour ()
    {
        this.instruction.setText('Hold the carton to pour!');
        this.pourLevel = 0;

        const glassX = CX + 90;
        const glassBottom = COUNTER_Y - 14;

        //  The glass
        this.phaseLayer.add(this.add.rectangle(glassX, glassBottom - 70, 110, 140, 0xe3f2fd, 0.4).setStrokeStyle(5, 0x90caf9));

        this.liquid = this.add.rectangle(glassX, glassBottom - 6, 96, GLASS_FULL, foodColour(this.recipe!.result.colour));
        this.liquid.setOrigin(0.5, 1);
        this.liquid.setScale(1, 0.01);
        this.phaseLayer.add(this.liquid);

        //  Pouring stream, hidden until he holds the carton
        this.stream = this.add.rectangle(glassX - 24, glassBottom - 200, 14, 130, foodColour(this.recipe!.result.colour));
        this.stream.setOrigin(0.5, 0);
        this.stream.setVisible(false);
        this.phaseLayer.add(this.stream);

        //  The carton, held above and to the left
        const ingredient = this.config.ingredients[this.recipe!.ingredients[0]];
        this.carton = this.add.container(CX - 110, COUNTER_Y - 290, drawFoodIcon(this, ingredient?.icon ?? 'carton', ingredient?.colour ?? '#9ccc65'));
        this.carton.setScale(2.4);
        this.phaseLayer.add(this.carton);

        const zone = this.add.zone(CX - 110, COUNTER_Y - 290, 170, 190).setInteractive();
        this.phaseLayer.add(zone);

        zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.pouringPointer = pointer.id;
        });
    }

    //  ---- Phase 4: ta-da ----

    finish ()
    {
        if (!this.recipe)
        {
            return;
        }

        const recipe = this.recipe;

        this.newPhaseLayer();
        this.busy = false;

        this.instruction.setText(`You made ${recipe.name.toLowerCase()}!`);

        this.phaseLayer.add(this.add.ellipse(CX, 560, 300, 60, 0xffffff).setStrokeStyle(5, 0xb0bec5));
        this.foodIcon(recipe.result.icon, recipe.result.colour, CX, 480, 3);

        for (let i = 0; i < 8; i++)
        {
            const angle = (i / 8) * Math.PI * 2;
            const star = this.add.circle(CX, 470, 9, [ 0xffeb3b, 0xff7043, 0x4dd0e1, 0xaed581 ][i % 4]);
            this.phaseLayer.add(star);

            this.tweens.add({
                targets: star,
                x: CX + Math.cos(angle) * 220,
                y: 470 + Math.sin(angle) * 160,
                alpha: 0,
                duration: 900,
                ease: 'Cubic.Out'
            });
        }

        this.time.delayedCall(1700, () => this.close());
    }

    close ()
    {
        this.scene.resume('Interior');
        this.scene.stop();
    }

    update (_time: number, delta: number)
    {
        //  Pouring: hold to fill, let go to stop
        if (!this.liquid || !this.carton || !this.stream || this.pourLevel >= GLASS_FULL)
        {
            return;
        }

        const pouring = this.pouringPointer !== -1;

        this.carton.rotation = Phaser.Math.Linear(this.carton.rotation, pouring ? -0.5 : 0, 0.2);
        this.stream.setVisible(pouring);

        if (pouring)
        {
            this.pourLevel = Math.min(this.pourLevel + (delta / 1000) * 75, GLASS_FULL);
            this.liquid.setScale(1, Math.max(this.pourLevel / GLASS_FULL, 0.01));

            if (this.pourLevel >= GLASS_FULL)
            {
                this.stream.setVisible(false);
                this.carton.rotation = 0;
                this.pouringPointer = -1;
                this.instruction.setText('Perfect!');
                this.time.delayedCall(700, () => this.finish());
            }
        }
    }
}
