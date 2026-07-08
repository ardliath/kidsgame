import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../layout';
import { CookStep, drawFoodIcon, foodColour, RecipeConfig, RecipeDef, recipeSteps } from '../recipes';
import { Bag, InteriorSpec, loadBag, loadInteriors, saveBag, saveInterior } from '../storage';
import { Interior } from './Interior';

const CX = GAME_WIDTH / 2;
const COUNTER_Y = 700;
const GLASS_FULL = 120;
const WATER_COLOUR = 0x4fc3f7;
const PALE_FOOD = 0xfff3c4;

//  How far the jug/carton tips while pouring (radians, clockwise)
const POUR_TILT = 0.5;

export class Cooking extends Scene
{
    config: RecipeConfig;
    recipe: RecipeDef | null = null;
    steps: CookStep[] = [];
    stepIndex = 0;

    //  surfaceLayer holds the pan and its contents, kept across the steps of
    //  one recipe; stepLayer is the transient UI for the current step
    surfaceLayer: Phaser.GameObjects.Container;
    stepLayer: Phaser.GameObjects.Container;
    instruction: Phaser.GameObjects.Text;
    busy = false;
    lastFetched = '';

    //  Pan, created lazily the first time a step needs it
    panCreated = false;
    panX = CX;
    panY = COUNTER_Y - 60;
    panContents: Phaser.GameObjects.Ellipse | null = null;

    //  Pour step
    pourActive = false;
    pourTarget: 'pan' | 'glass' = 'glass';
    pourProgress = 0;
    pouringPointer = -1;
    carton: Phaser.GameObjects.Container | null = null;
    stream: Phaser.GameObjects.Rectangle | null = null;
    liquid: Phaser.GameObjects.Rectangle | null = null;

    //  Stir step
    stirsLeft = 0;
    stirFrom = PALE_FOOD;
    spoon: Phaser.GameObjects.Rectangle | null = null;

    //  This house's fridge stock, plus the shopping bag from the car.
    //  Fetch steps use fridge first, then bag; empty means a shop trip.
    houseId = '';
    houseSpec: InteriorSpec | null = null;
    fridge: Record<string, number> = {};
    bag: Bag = {};

    constructor ()
    {
        super('Cooking');
    }

    init (data: { houseId: string })
    {
        this.houseId = data?.houseId ?? '';
    }

    create ()
    {
        this.config = this.cache.json.get('recipes') as RecipeConfig;
        this.recipe = null;
        this.busy = false;

        //  Older houses have no fridge stock yet: start them with 2 of everything
        this.houseSpec = loadInteriors()[this.houseId] ?? null;
        this.bag = loadBag();

        if (this.houseSpec && !this.houseSpec.fridge)
        {
            this.houseSpec.fridge = {};

            for (const id of Object.keys(this.config.ingredients))
            {
                this.houseSpec.fridge[id] = 2;
            }

            saveInterior(this.houseId, this.houseSpec);
        }

        if (this.houseSpec)
        {
            this.fridge = this.houseSpec.fridge ?? {};
        }
        else
        {
            //  No known house (shouldn't happen): don't block cooking
            this.fridge = {};

            for (const id of Object.keys(this.config.ingredients))
            {
                this.fridge[id] = 2;
            }
        }

        //  A warm little kitchen backdrop
        this.add.rectangle(CX, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xfff8e1);

        for (let x = 0; x < GAME_WIDTH; x += 60)
        {
            const shade = ((x / 60) % 2 === 0) ? 0xeceff1 : 0xb0bec5;
            this.add.rectangle(x + 30, 850, 60, 220, shade);
        }

        this.add.rectangle(CX, COUNTER_Y + 60, GAME_WIDTH, 130, 0xa1887f).setStrokeStyle(6, 0x795548);
        this.add.rectangle(CX, COUNTER_Y, GAME_WIDTH, 18, 0xd7ccc8);

        this.surfaceLayer = this.add.container(0, 0);
        this.stepLayer = this.add.container(0, 0);

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

    newStepLayer ()
    {
        this.stepLayer.destroy(true);
        this.stepLayer = this.add.container(0, 0);
        this.pourActive = false;
        this.pouringPointer = -1;
        this.carton = null;
        this.stream = null;
        this.liquid = null;
        this.spoon = null;
    }

    foodIcon (icon: string, colour: string, x: number, y: number, scale = 1): Phaser.GameObjects.Container
    {
        const container = this.add.container(x, y, drawFoodIcon(this, icon, colour));
        container.setScale(scale);
        this.stepLayer.add(container);

        return container;
    }

    //  ---- Choose a recipe ----

    showChoose ()
    {
        this.newStepLayer();
        this.instruction.setText('What shall we make?');

        const recipes = this.config.recipes;

        recipes.forEach((recipe, i) => {

            const x = CX + (i - (recipes.length - 1) / 2) * 300;
            const y = 450;

            this.stepLayer.add(this.add.rectangle(x, y, 250, 300, 0x455a64).setStrokeStyle(6, 0x263238));

            this.foodIcon(recipe.result.icon, recipe.result.colour, x, y - 60, 2);

            this.stepLayer.add(this.add.text(x, y + 90, recipe.name, {
                fontFamily: 'Arial Black', fontSize: 26, color: '#ffffff'
            }).setOrigin(0.5));

            const zone = this.add.zone(x, y, 260, 310).setInteractive();
            zone.on('pointerdown', () => this.startRecipe(recipe));
            this.stepLayer.add(zone);

        });
    }

    startRecipe (recipe: RecipeDef)
    {
        this.recipe = recipe;
        this.steps = recipeSteps(recipe);
        this.stepIndex = -1;
        this.busy = false;
        this.lastFetched = '';

        //  Fresh cooking surface for this recipe
        this.panCreated = false;
        this.panContents = null;
        this.surfaceLayer.destroy(true);
        this.surfaceLayer = this.add.container(0, 0);

        //  Keep the step UI above the surface
        this.children.bringToTop(this.stepLayer);

        this.nextStep();
    }

    nextStep ()
    {
        this.stepIndex++;

        if (this.stepIndex >= this.steps.length)
        {
            this.finish();

            return;
        }

        this.runStep(this.steps[this.stepIndex]);
    }

    runStep (step: CookStep)
    {
        this.newStepLayer();
        this.instruction.setText(step.instruction ?? '');

        switch (step.type)
        {
            case 'fetch': this.setupFetch(step); break;
            case 'pour': this.setupPour(step); break;
            case 'add': this.setupAdd(step); break;
            case 'stir': this.setupStir(step); break;
            case 'toast': this.setupToaster(step); break;
        }
    }

    ensurePan ()
    {
        if (this.panCreated)
        {
            return;
        }

        this.panCreated = true;

        const x = this.panX;
        const y = this.panY;

        this.surfaceLayer.add(this.add.rectangle(x, COUNTER_Y - 12, 320, 14, 0x455a64));
        this.surfaceLayer.add(this.add.ellipse(x, y + 26, 240, 26, 0x263238));
        this.surfaceLayer.add(this.add.rectangle(x + 175, y - 10, 110, 16, 0x455a64));
        this.surfaceLayer.add(this.add.ellipse(x, y, 230, 60, 0x37474f).setStrokeStyle(5, 0x263238));

        //  Contents start invisible: an empty pan
        this.panContents = this.add.ellipse(x, y - 6, 190, 36, WATER_COLOUR).setAlpha(0);
        this.surfaceLayer.add(this.panContents);
    }

    //  ---- fetch: find it in the fridge ----

    setupFetch (step: CookStep)
    {
        const def = this.config.ingredients[step.ingredient ?? ''];

        //  What we're after, shown at the top
        const tracker = this.add.container(CX, 190);
        tracker.add(this.add.circle(0, 0, 46, 0xffffff, 0.6).setStrokeStyle(4, 0xbcaaa4));
        tracker.add(this.add.container(0, 0, drawFoodIcon(this, def?.icon ?? '', def?.colour ?? '#ffca28')));
        this.stepLayer.add(tracker);

        //  The fridge, door open, shelves stocked
        this.stepLayer.add(this.add.rectangle(330, 470, 340, 470, 0xeceff1).setStrokeStyle(6, 0x90a4ae));
        this.stepLayer.add(this.add.rectangle(132, 470, 56, 470, 0xcfd8dc).setStrokeStyle(5, 0x90a4ae));

        const shelfYs = [ 350, 470, 590 ];

        for (const y of shelfYs)
        {
            this.stepLayer.add(this.add.rectangle(330, y + 42, 320, 8, 0xb0bec5));
        }

        //  The wanted item plus decoys
        const allIds = Object.keys(this.config.ingredients);
        const decoys = allIds.filter(id => id !== step.ingredient);
        const stock = [ step.ingredient ?? '', ...Phaser.Utils.Array.Shuffle(decoys) ].slice(0, 6);

        Phaser.Utils.Array.Shuffle(stock);

        stock.forEach((id, i) => {

            const idef = this.config.ingredients[id];
            const x = 240 + (i % 2) * 180;
            const y = shelfYs[Math.floor(i / 2)];

            const item = this.add.container(x, y, drawFoodIcon(this, idef?.icon ?? '', idef?.colour ?? '#ffca28'));
            item.setScale(1.4);
            this.stepLayer.add(item);

            //  How many we have: this fridge plus the shopping bag
            const count = this.available(id);

            if (count > 0)
            {
                const badge = this.add.text(x + 38, y - 38, `x${count}`, {
                    fontFamily: 'Arial Black', fontSize: 20, color: '#5d4037',
                    stroke: '#ffffff', strokeThickness: 5
                }).setOrigin(0.5);
                this.stepLayer.add(badge);
            }
            else
            {
                item.setAlpha(0.35);
            }

            const zone = this.add.zone(x, y, 100, 100).setInteractive();
            zone.on('pointerdown', () => this.fetchItem(step.ingredient ?? '', id, item, zone, tracker));
            this.stepLayer.add(zone);

        });
    }

    available (id: string): number
    {
        return (this.fridge[id] ?? 0) + (this.bag[id] ?? 0);
    }

    fetchItem (want: string, got: string, item: Phaser.GameObjects.Container, zone: Phaser.GameObjects.Zone, tracker: Phaser.GameObjects.Container)
    {
        if (got !== want)
        {
            //  Not what we need: wiggle and stay put
            this.tweens.add({ targets: item, x: item.x + 10, duration: 60, yoyo: true, repeat: 2 });

            return;
        }

        if (this.available(want) <= 0)
        {
            //  The right item, but none left: send him shopping
            const def = this.config.ingredients[want];
            this.instruction.setText(`No ${def?.name.toLowerCase() ?? 'food'} left! Buy some at the shop`);
            this.tweens.add({ targets: item, x: item.x + 10, duration: 60, yoyo: true, repeat: 2 });

            return;
        }

        //  Use up the fridge first, then the shopping bag
        if ((this.fridge[want] ?? 0) > 0)
        {
            this.fridge[want] = (this.fridge[want] ?? 0) - 1;

            if (this.houseSpec)
            {
                this.houseSpec.fridge = this.fridge;
                saveInterior(this.houseId, this.houseSpec);
            }
        }
        else
        {
            this.bag[want] = Math.max(0, (this.bag[want] ?? 0) - 1);
            saveBag(this.bag);
        }

        this.lastFetched = got;
        zone.destroy();

        this.tweens.add({ targets: item, x: 900, y: COUNTER_Y - 50, scale: 1.2, duration: 400, ease: 'Back.In' });

        tracker.add(this.add.text(32, -32, '✓', { fontFamily: 'Arial Black', fontSize: 32, color: '#2e7d32' }).setOrigin(0.5));

        this.time.delayedCall(500, () => this.nextStep());
    }

    //  ---- pour: hold to fill a glass, or fill the pan with water ----

    setupPour (step: CookStep)
    {
        const def = this.config.ingredients[step.ingredient ?? ''];
        const colour = foodColour(def?.colour);

        this.pourActive = true;
        this.pourProgress = 0;
        this.pourTarget = step.into ?? 'glass';
        this.pouringPointer = -1;

        //  Where the spout ends up once the container tilts by POUR_TILT, so the
        //  stream can start exactly at the spout rather than floating beside it
        const spoutAfterTilt = (sx: number, sy: number, scale: number) => ({
            x: (sx * scale) * Math.cos(POUR_TILT) - (sy * scale) * Math.sin(POUR_TILT),
            y: (sx * scale) * Math.sin(POUR_TILT) + (sy * scale) * Math.cos(POUR_TILT)
        });

        if (this.pourTarget === 'glass')
        {
            const glassX = CX + 90;
            const glassBottom = COUNTER_Y - 14;
            const scale = 2.4;

            //  The carton pours from its top spout
            const spout = spoutAfterTilt(0, -25, scale);
            const spoutX = glassX;
            const spoutY = glassBottom - 220;

            this.stepLayer.add(this.add.rectangle(glassX, glassBottom - 70, 110, 140, 0xe3f2fd, 0.4).setStrokeStyle(5, 0x90caf9));

            this.liquid = this.add.rectangle(glassX, glassBottom - 6, 96, GLASS_FULL, colour).setOrigin(0.5, 1).setScale(1, 0.01);
            this.stepLayer.add(this.liquid);

            this.stream = this.add.rectangle(spoutX, spoutY, 14, (glassBottom - 40) - spoutY, colour).setOrigin(0.5, 0).setVisible(false);
            this.stepLayer.add(this.stream);

            const cartonX = spoutX - spout.x;
            const cartonY = spoutY - spout.y;

            this.carton = this.add.container(cartonX, cartonY, drawFoodIcon(this, def?.icon ?? 'carton', def?.colour ?? '#9ccc65'));
            this.carton.setScale(scale);
            this.stepLayer.add(this.carton);

            const zone = this.add.zone(cartonX, cartonY, 170, 190).setInteractive();
            zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => { this.pouringPointer = pointer.id; });
            this.stepLayer.add(zone);
        }
        else
        {
            this.ensurePan();

            if (this.panContents)
            {
                this.panContents.setFillStyle(colour).setAlpha(0);
            }

            const scale = 2.2;

            //  The jug pours from its right-hand spout, aimed at the pan's middle
            const spout = spoutAfterTilt(24, -10, scale);
            const spoutX = this.panX;
            const spoutY = this.panY - 170;

            this.stream = this.add.rectangle(spoutX, spoutY, 14, (this.panY - 6) - spoutY, colour).setOrigin(0.5, 0).setVisible(false);
            this.stepLayer.add(this.stream);

            const jugX = spoutX - spout.x;
            const jugY = spoutY - spout.y;

            this.carton = this.add.container(jugX, jugY, drawFoodIcon(this, def?.icon ?? 'jug', def?.colour ?? '#4fc3f7'));
            this.carton.setScale(scale);
            this.stepLayer.add(this.carton);

            const zone = this.add.zone(jugX, jugY, 180, 200).setInteractive();
            zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => { this.pouringPointer = pointer.id; });
            this.stepLayer.add(zone);
        }
    }

    //  ---- add: tap an ingredient to tip it into the pan ----

    setupAdd (step: CookStep)
    {
        this.ensurePan();

        const def = this.config.ingredients[step.ingredient ?? ''];

        const icon = this.add.container(this.panX, this.panY - 200, drawFoodIcon(this, def?.icon ?? '', def?.colour ?? '#ffca28'));
        icon.setScale(1.8);
        this.stepLayer.add(icon);

        const zone = this.add.zone(this.panX, this.panY - 200, 140, 140).setInteractive();
        this.stepLayer.add(zone);

        zone.on('pointerdown', () => {

            if (this.busy)
            {
                return;
            }

            this.busy = true;
            zone.destroy();

            this.tweens.add({
                targets: icon,
                y: this.panY - 6,
                scale: 0.5,
                alpha: 0,
                duration: 450,
                ease: 'Quad.In',
                onComplete: () => {

                    this.busy = false;

                    if (this.panContents)
                    {
                        this.panContents.setFillStyle(PALE_FOOD).setAlpha(1);
                    }

                    //  A few bits bobbing in the pan
                    for (let i = 0; i < 4; i++)
                    {
                        const bit = this.add.rectangle(this.panX - 60 + i * 40, this.panY - 6, 20, 8, foodColour(def?.colour));
                        this.surfaceLayer.add(bit);
                    }

                    this.instruction.setText('In it goes!');
                    this.time.delayedCall(500, () => this.nextStep());

                }
            });

        });
    }

    //  ---- stir: stir the pan a number of times ----

    setupStir (step: CookStep)
    {
        this.ensurePan();

        this.stirsLeft = step.stirs ?? 5;
        this.stirFrom = this.panContents ? this.panContents.fillColor : PALE_FOOD;
        this.instruction.setText(`Stir it ${this.stirsLeft} times!`);

        this.spoon = this.add.rectangle(this.panX + 40, this.panY - 70, 14, 110, 0x8d6e63).setStrokeStyle(3, 0x5d4037);
        this.stepLayer.add(this.spoon);

        const zone = this.add.zone(this.panX, this.panY - 30, 280, 160).setInteractive();
        this.stepLayer.add(zone);

        zone.on('pointerdown', () => this.stir(zone));
    }

    stir (zone: Phaser.GameObjects.Zone)
    {
        if (this.stirsLeft <= 0 || !this.spoon || !this.panContents)
        {
            return;
        }

        this.stirsLeft--;

        this.tweens.add({ targets: this.spoon, x: this.panX - 40, duration: 160, yoyo: true });
        this.tweens.add({ targets: this.spoon, rotation: -0.35, duration: 160, yoyo: true });

        for (let i = 0; i < 2; i++)
        {
            const puff = this.add.circle(this.panX - 40 + Math.random() * 80, this.panY - 50, 12 + Math.random() * 8, 0xffffff, 0.75);
            this.surfaceLayer.add(puff);
            this.tweens.add({ targets: puff, y: puff.y - 90, alpha: 0, duration: 700, onComplete: () => puff.destroy() });
        }

        const total = this.steps[this.stepIndex].stirs ?? 5;
        const progress = (total - this.stirsLeft) / total;
        const from = Phaser.Display.Color.IntegerToColor(this.stirFrom);
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
            this.time.delayedCall(800, () => this.nextStep());
        }
    }

    //  ---- toast: push the lever ----

    setupToaster (_step: CookStep)
    {
        const x = CX;
        const y = COUNTER_Y - 80;

        const ingredient = this.config.ingredients[this.lastFetched];
        const breadColour = foodColour(ingredient?.colour ?? '#e0b070');

        const slices = [
            this.add.rectangle(x - 45, y - 80, 60, 50, breadColour).setStrokeStyle(3, 0xb08a50),
            this.add.rectangle(x + 45, y - 80, 60, 50, breadColour).setStrokeStyle(3, 0xb08a50)
        ];
        slices.forEach(s => this.stepLayer.add(s));

        const body = this.add.rectangle(x, y, 260, 160, 0xb0bec5).setStrokeStyle(6, 0x78909c);
        this.stepLayer.add(body);
        this.stepLayer.add(this.add.rectangle(x - 45, y - 72, 70, 16, 0x455a64));
        this.stepLayer.add(this.add.rectangle(x + 45, y - 72, 70, 16, 0x455a64));

        const lever = this.add.rectangle(x + 155, y - 40, 36, 26, 0xef5350).setStrokeStyle(4, 0x8e0000);
        this.stepLayer.add(this.add.rectangle(x + 145, y, 10, 110, 0x78909c));
        this.stepLayer.add(lever);

        const zone = this.add.zone(x + 150, y - 20, 110, 130).setInteractive();
        this.stepLayer.add(zone);

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
                this.stepLayer.add(ding);
                this.tweens.add({ targets: ding, scale: 1, duration: 250, ease: 'Back.Out' });

                this.busy = false;
                this.time.delayedCall(900, () => this.nextStep());

            });

        });
    }

    //  ---- ta-da ----

    finish ()
    {
        if (!this.recipe)
        {
            return;
        }

        const recipe = this.recipe;

        this.newStepLayer();
        this.busy = false;
        this.pourActive = false;

        this.instruction.setText(`You made ${recipe.name.toLowerCase()}!`);

        this.stepLayer.add(this.add.ellipse(CX, 560, 300, 60, 0xffffff).setStrokeStyle(5, 0xb0bec5));
        this.foodIcon(recipe.result.icon, recipe.result.colour, CX, 480, 3);

        for (let i = 0; i < 8; i++)
        {
            const angle = (i / 8) * Math.PI * 2;
            const star = this.add.circle(CX, 470, 9, [ 0xffeb3b, 0xff7043, 0x4dd0e1, 0xaed581 ][i % 4]);
            this.stepLayer.add(star);

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
        const interior = this.scene.get('Interior') as Interior;

        this.scene.resume('Interior');

        //  A resident in the kitchen thanks the chef by name
        if (this.recipe)
        {
            interior.onCooked(this.recipe);
        }

        this.scene.stop();
    }

    update (_time: number, delta: number)
    {
        if (!this.pourActive || !this.carton || !this.stream)
        {
            return;
        }

        const pouring = this.pouringPointer !== -1;

        //  Tip the spout towards the pan/glass, which sit to the lower-right
        this.carton.rotation = Phaser.Math.Linear(this.carton.rotation, pouring ? POUR_TILT : 0, 0.2);
        this.stream.setVisible(pouring);

        if (!pouring || this.pourProgress >= 1)
        {
            return;
        }

        const rate = this.pourTarget === 'glass' ? 0.42 : 0.55;
        this.pourProgress = Math.min(1, this.pourProgress + (delta / 1000) * rate);

        if (this.pourTarget === 'glass' && this.liquid)
        {
            this.liquid.setScale(1, Math.max(this.pourProgress, 0.01));
        }
        else if (this.panContents)
        {
            this.panContents.setAlpha(this.pourProgress);
        }

        if (this.pourProgress >= 1)
        {
            this.pourActive = false;
            this.pouringPointer = -1;
            this.stream.setVisible(false);
            this.carton.rotation = 0;
            this.instruction.setText(this.pourTarget === 'glass' ? 'Perfect!' : 'In it goes!');
            this.time.delayedCall(600, () => this.nextStep());
        }
    }
}
