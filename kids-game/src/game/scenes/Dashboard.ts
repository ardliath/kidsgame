import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { DASH_HEIGHT, DASH_TOP, GAME_WIDTH } from '../layout';

//  Wheel far left and pedal far right for thumbs, gear stick in the middle
const DASH_MID = DASH_TOP + DASH_HEIGHT / 2;

//  The wheel is big enough to poke up above the dashboard, like a real cockpit
const WHEEL_X = 200;
const WHEEL_Y = DASH_TOP + 130;
const WHEEL_RADIUS = 150;
const MAX_TURN = 2.0;

const SPEEDO_X = 465;
const SPEEDO_MAX = 330;
const DIAL_Y = DASH_MID;

const PEDAL_X = 1080;
const PEDAL_Y = DASH_MID;

const GEAR_X = 640;
const GEAR_SLOTS = [
    { y: DASH_MID - 90, value: 2, label: '2' },
    { y: DASH_MID, value: 1, label: '1' },
    { y: DASH_MID + 90, value: -1, label: 'R' }
];

export class Dashboard extends Scene
{
    wheel: Phaser.GameObjects.Container;
    wheelPointerId = -1;
    lastPointerAngle = 0;
    wheelRotation = 0;

    pedal: Phaser.GameObjects.Container;
    pedalPointerId = -1;

    knob: Phaser.GameObjects.Container;
    knobHit: Phaser.GameObjects.Arc;
    gearLabels: Map<number, Phaser.GameObjects.Text> = new Map();

    //  Panel pieces repainted to match the car colour
    panelRect: Phaser.GameObjects.Rectangle;
    trimRect: Phaser.GameObjects.Rectangle;
    hubDot: Phaser.GameObjects.Arc;

    speedNeedle: Phaser.GameObjects.Container;
    fuelNeedle: Phaser.GameObjects.Container;
    tempNeedle: Phaser.GameObjects.Container;

    //  Keyboard controls for desktop testing: arrows steer/shift, space accelerates
    cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
    keyThrottle = false;

    constructor ()
    {
        super('Dashboard');
    }

    create ()
    {
        this.wheelPointerId = -1;
        this.pedalPointerId = -1;
        this.wheelRotation = 0;

        this.panelRect = this.add.rectangle(GAME_WIDTH / 2, DASH_MID, GAME_WIDTH, DASH_HEIGHT, 0x263238);
        this.trimRect = this.add.rectangle(GAME_WIDTH / 2, DASH_TOP + 5, GAME_WIDTH, 10, 0x102027);

        //  Dark instrument cluster plate behind the gauges and gear stick
        const cluster = this.add.graphics();
        cluster.fillStyle(0x102027, 0.35);
        cluster.fillRoundedRect(375, DASH_TOP + 15, 615, DASH_HEIGHT - 30, 24);

        this.createSpeedo();
        this.createDials();
        this.createWheel();
        this.createGearStick();
        this.createPedal();
        this.createSettingsCog();

        this.repaintPanel();
        this.registry.events.on('changedata-carColour', this.repaintPanel, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.registry.events.off('changedata-carColour', this.repaintPanel, this);
        });

        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('gameout', this.releaseAll, this);

        this.cursors = this.input.keyboard?.createCursorKeys();
        this.keyThrottle = false;
    }

    createWheel ()
    {
        //  An open ring rather than a filled disc, so the road shows through
        //  the part of the wheel that pokes up above the dashboard
        const spokes = [];

        for (const angle of [ 0, 60, 120 ])
        {
            const spoke = this.add.rectangle(0, 0, 22, (WHEEL_RADIUS - 18) * 2, 0x37474f);
            spoke.setRotation(Phaser.Math.DegToRad(angle));
            spokes.push(spoke);
        }

        const ring = this.add.circle(0, 0, WHEEL_RADIUS - 19);
        ring.setStrokeStyle(38, 0x37474f);

        const ringOuter = this.add.circle(0, 0, WHEEL_RADIUS);
        ringOuter.setStrokeStyle(5, 0x102027);

        const ringInner = this.add.circle(0, 0, WHEEL_RADIUS - 38);
        ringInner.setStrokeStyle(5, 0x102027);

        const hub = this.add.circle(0, 0, 44, 0x455a64).setStrokeStyle(4, 0x102027);

        //  The horn button takes the car colour
        this.hubDot = this.add.circle(0, 0, 20, 0x546e7a);

        //  Marker so you can see the wheel turning
        const marker = this.add.circle(0, -(WHEEL_RADIUS - 19), 10, 0xffeb3b);

        this.wheel = this.add.container(WHEEL_X, WHEEL_Y, [ ...spokes, ring, ringOuter, ringInner, hub, this.hubDot, marker ]);

        const zone = this.add.zone(WHEEL_X, WHEEL_Y, (WHEEL_RADIUS + 25) * 2, (WHEEL_RADIUS + 25) * 2);
        zone.setInteractive();

        zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {

            this.wheelPointerId = pointer.id;
            this.lastPointerAngle = Phaser.Math.Angle.Between(WHEEL_X, WHEEL_Y, pointer.x, pointer.y);

        });
    }

    //  Draws a round gauge and returns its needle, ready to be rotated
    createDial (x: number, y: number, radius: number, sweepDeg: number, tickCount: number, redTicks: number): Phaser.GameObjects.Container
    {
        this.add.circle(x, y, radius, 0x102027).setStrokeStyle(5, 0x37474f);

        for (let i = 0; i < tickCount; i++)
        {
            const f = i / (tickCount - 1);
            const angle = Phaser.Math.DegToRad(-sweepDeg / 2 + sweepDeg * f);
            const tickRadius = radius - 15;
            const colour = i >= tickCount - redTicks ? 0xef5350 : 0xcfd8dc;

            const tick = this.add.rectangle(x + Math.sin(angle) * tickRadius, y - Math.cos(angle) * tickRadius, 4, 13, colour);
            tick.setRotation(angle);
        }

        const needle = this.add.container(x, y, [
            this.add.rectangle(0, -(radius - 20) / 2, 5, radius - 20, 0xff7043)
        ]);

        this.add.circle(x, y, 9, 0xcfd8dc);

        return needle;
    }

    createSpeedo ()
    {
        this.speedNeedle = this.createDial(SPEEDO_X, DASH_MID, 85, 240, 9, 2);
    }

    createDials ()
    {
        //  Fuel gauge, slowly drains and refills itself; purely for show
        this.fuelNeedle = this.createDial(790, DIAL_Y, 55, 120, 3, 0);

        this.add.text(790 - 30, DIAL_Y + 36, 'E', { fontFamily: 'Arial Black', fontSize: 16, color: '#ef9a9a' }).setOrigin(0.5);
        this.add.text(790 + 30, DIAL_Y + 36, 'F', { fontFamily: 'Arial Black', fontSize: 16, color: '#cfd8dc' }).setOrigin(0.5);

        //  Temperature gauge, wobbles gently; also just for show
        this.tempNeedle = this.createDial(930, DIAL_Y, 55, 120, 3, 1);

        this.add.text(930 - 30, DIAL_Y + 36, 'C', { fontFamily: 'Arial Black', fontSize: 16, color: '#90caf9' }).setOrigin(0.5);
        this.add.text(930 + 30, DIAL_Y + 36, 'H', { fontFamily: 'Arial Black', fontSize: 16, color: '#ef9a9a' }).setOrigin(0.5);
    }

    repaintPanel ()
    {
        const colour = this.registry.get('carColour') as number;

        this.panelRect.setFillStyle(Phaser.Display.Color.IntegerToColor(colour).darken(35).color);
        this.trimRect.setFillStyle(Phaser.Display.Color.IntegerToColor(colour).darken(65).color);
        this.hubDot.setFillStyle(colour);
    }

    createGearStick ()
    {
        const track = this.add.graphics();
        track.fillStyle(0x102027, 1);
        track.fillRoundedRect(GEAR_X - 26, GEAR_SLOTS[0].y - 44, 52, (GEAR_SLOTS[2].y - GEAR_SLOTS[0].y) + 88, 26);

        for (const slot of GEAR_SLOTS)
        {
            this.add.circle(GEAR_X, slot.y, 8, 0x37474f);

            const label = this.add.text(GEAR_X - 78, slot.y, slot.label, {
                fontFamily: 'Arial Black', fontSize: 40,
                color: slot.value === -1 ? '#ef9a9a' : '#ffffff'
            }).setOrigin(0.5);

            this.gearLabels.set(slot.value, label);

            const slotZone = this.add.zone(GEAR_X, slot.y, 110, 88);
            slotZone.setInteractive();
            slotZone.on('pointerdown', () => this.moveKnobTo(slot.value));
        }

        const knobBase = this.add.circle(0, 0, 34, 0xb0bec5);
        knobBase.setStrokeStyle(5, 0x546e7a);

        const knobDot = this.add.circle(0, 0, 12, 0x78909c);

        this.knob = this.add.container(GEAR_X, GEAR_SLOTS[1].y, [ knobBase, knobDot ]);

        //  Invisible drag handle on top of the knob (and the slot zones)
        this.knobHit = this.add.circle(GEAR_X, GEAR_SLOTS[1].y, 48, 0xffffff, 0.001);
        this.knobHit.setInteractive({ draggable: true });

        this.knobHit.on('drag', (_pointer: Phaser.Input.Pointer, _dragX: number, dragY: number) => {

            const y = Phaser.Math.Clamp(dragY, GEAR_SLOTS[0].y, GEAR_SLOTS[2].y);

            this.knobHit.y = y;
            this.knob.y = y;

            this.setGear(this.nearestSlot(y).value);

        });

        this.knobHit.on('dragend', () => {

            const slot = this.nearestSlot(this.knob.y);

            this.knobHit.y = slot.y;
            this.tweens.add({ targets: this.knob, y: slot.y, duration: 100 });

            this.setGear(slot.value);

        });

        this.setGear(1);
    }

    createPedal ()
    {
        const g = this.add.graphics();
        g.fillStyle(0x455a64, 1);
        g.fillRoundedRect(-65, -95, 130, 190, 22);
        g.lineStyle(6, 0x102027, 1);
        g.strokeRoundedRect(-65, -95, 130, 190, 22);
        g.fillStyle(0x37474f, 1);

        for (let i = 0; i < 4; i++)
        {
            g.fillRoundedRect(-47, -72 + i * 44, 94, 22, 8);
        }

        this.pedal = this.add.container(PEDAL_X, PEDAL_Y, [ g ]);

        const zone = this.add.zone(PEDAL_X, PEDAL_Y, 160, 220);
        zone.setInteractive();

        zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {

            this.pedalPointerId = pointer.id;
            this.registry.set('throttle', 1);
            this.pedal.setScale(0.92);

        });
    }

    createSettingsCog ()
    {
        const parts: Phaser.GameObjects.GameObject[] = [
            this.add.circle(0, 0, 36, 0x102027, 0.45)
        ];

        //  Four bars through the centre make eight cog teeth
        for (let i = 0; i < 4; i++)
        {
            const tooth = this.add.rectangle(0, 0, 11, 60, 0xcfd8dc);
            tooth.setRotation(i * Math.PI / 4);
            parts.push(tooth);
        }

        parts.push(this.add.circle(0, 0, 22, 0xcfd8dc));
        parts.push(this.add.circle(0, 0, 9, 0x102027));

        this.add.container(GAME_WIDTH - 50, 50, parts);

        this.add.zone(GAME_WIDTH - 50, 50, 90, 90).setInteractive().on('pointerdown', () => this.openOptions());
    }

    //  Drop the controls so the car isn't stuck accelerating while paused
    releaseControls ()
    {
        this.releaseAll();
        this.wheelPointerId = -1;
        this.wheelRotation = 0;
        this.wheel.rotation = 0;
        this.registry.set('steering', 0);
    }

    openOptions ()
    {
        this.releaseControls();

        this.scene.pause('Driving');
        this.scene.launch('Options');
        this.scene.pause();
    }

    setGearImmediate (value: number)
    {
        const slot = GEAR_SLOTS.find(s => s.value === value);

        if (slot)
        {
            this.knobHit.y = slot.y;
            this.knob.y = slot.y;
            this.setGear(slot.value);
        }
    }

    nearestSlot (y: number)
    {
        return GEAR_SLOTS.reduce((best, slot) => Math.abs(slot.y - y) < Math.abs(best.y - y) ? slot : best);
    }

    moveKnobTo (value: number)
    {
        const slot = GEAR_SLOTS.find(s => s.value === value)!;

        this.knobHit.y = slot.y;
        this.tweens.add({ targets: this.knob, y: slot.y, duration: 120 });

        this.setGear(value);
    }

    setGear (value: number)
    {
        this.registry.set('gear', value);

        for (const [ gearValue, label ] of this.gearLabels)
        {
            label.setAlpha(gearValue === value ? 1 : 0.5);
        }
    }

    onPointerMove (pointer: Phaser.Input.Pointer)
    {
        if (pointer.id !== this.wheelPointerId)
        {
            return;
        }

        const angle = Phaser.Math.Angle.Between(WHEEL_X, WHEEL_Y, pointer.x, pointer.y);
        const delta = Phaser.Math.Angle.Wrap(angle - this.lastPointerAngle);

        this.lastPointerAngle = angle;
        this.wheelRotation = Phaser.Math.Clamp(this.wheelRotation + delta, -MAX_TURN, MAX_TURN);
    }

    onPointerUp (pointer: Phaser.Input.Pointer)
    {
        if (pointer.id === this.wheelPointerId)
        {
            this.wheelPointerId = -1;
        }

        if (pointer.id === this.pedalPointerId)
        {
            this.releasePedal();
        }
    }

    releasePedal ()
    {
        this.pedalPointerId = -1;
        this.registry.set('throttle', 0);
        this.pedal.setScale(1);
    }

    releaseAll ()
    {
        this.wheelPointerId = -1;
        this.releasePedal();

        //  Let a still-held space bar re-engage the throttle next frame
        this.keyThrottle = false;
    }

    update (time: number, delta: number)
    {
        const dt = delta / 1000;

        this.updateKeyboard(dt);

        //  Speedo tracks the real speed; fuel drains over ten minutes then
        //  refills; temperature just wobbles around the middle
        const speed = Phaser.Math.Clamp(((this.registry.get('speed') as number) ?? 0) / SPEEDO_MAX, 0, 1);
        this.speedNeedle.rotation = Phaser.Math.DegToRad(-120 + 240 * speed);

        const fuel = 1 - ((time / 1000) % 600) / 600;
        this.fuelNeedle.rotation = Phaser.Math.DegToRad(-60 + 120 * fuel);

        this.tempNeedle.rotation = Phaser.Math.DegToRad(12 * Math.sin(time / 2600));

        //  Wheel springs back to centre when let go (touch or keys)
        if (this.wheelPointerId === -1 && !this.steeringKeyDown() && this.wheelRotation !== 0)
        {
            this.wheelRotation *= 1 - Math.min(1, dt * 6);

            if (Math.abs(this.wheelRotation) < 0.01)
            {
                this.wheelRotation = 0;
            }
        }

        this.wheel.rotation = this.wheelRotation;
        this.registry.set('steering', this.wheelRotation / MAX_TURN);
    }

    steeringKeyDown (): boolean
    {
        return !!this.cursors && (this.cursors.left.isDown || this.cursors.right.isDown);
    }

    updateKeyboard (dt: number)
    {
        if (!this.cursors)
        {
            return;
        }

        //  Arrows turn the wheel, unless a finger is already holding it
        if (this.wheelPointerId === -1)
        {
            const turnRate = 5 * dt;

            if (this.cursors.left.isDown && !this.cursors.right.isDown)
            {
                this.wheelRotation = Math.max(this.wheelRotation - turnRate, -MAX_TURN);
            }
            else if (this.cursors.right.isDown && !this.cursors.left.isDown)
            {
                this.wheelRotation = Math.min(this.wheelRotation + turnRate, MAX_TURN);
            }
        }

        //  Space is the accelerator, unless a finger is already on the pedal
        if (this.pedalPointerId === -1)
        {
            if (this.cursors.space.isDown && !this.keyThrottle)
            {
                this.keyThrottle = true;
                this.registry.set('throttle', 1);
                this.pedal.setScale(0.92);
            }
            else if (!this.cursors.space.isDown && this.keyThrottle)
            {
                this.keyThrottle = false;
                this.registry.set('throttle', 0);
                this.pedal.setScale(1);
            }
        }

        //  Up/down arrows shift gear: R -> 1 -> 2
        const order = [ -1, 1, 2 ];
        const index = order.indexOf(this.registry.get('gear') as number);

        if (Phaser.Input.Keyboard.JustDown(this.cursors.up) && index < order.length - 1)
        {
            this.moveKnobTo(order[index + 1]);
        }
        else if (Phaser.Input.Keyboard.JustDown(this.cursors.down) && index > 0)
        {
            this.moveKnobTo(order[index - 1]);
        }
    }
}
