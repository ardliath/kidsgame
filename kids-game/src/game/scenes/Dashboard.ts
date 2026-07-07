import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { DASH_HEIGHT, DASH_TOP, GAME_WIDTH } from '../layout';

//  Wheel far left and pedal far right for thumbs, gear stick in the middle
const DASH_MID = DASH_TOP + DASH_HEIGHT / 2;

const WHEEL_X = 200;
const WHEEL_Y = DASH_MID;
const WHEEL_RADIUS = 120;
const MAX_TURN = 2.0;

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

    constructor ()
    {
        super('Dashboard');
    }

    create ()
    {
        this.wheelPointerId = -1;
        this.pedalPointerId = -1;
        this.wheelRotation = 0;

        this.add.rectangle(GAME_WIDTH / 2, DASH_MID, GAME_WIDTH, DASH_HEIGHT, 0x263238);
        this.add.rectangle(GAME_WIDTH / 2, DASH_TOP + 4, GAME_WIDTH, 8, 0x102027);

        this.createWheel();
        this.createGearStick();
        this.createPedal();

        this.input.on('pointermove', this.onPointerMove, this);
        this.input.on('pointerup', this.onPointerUp, this);
        this.input.on('gameout', this.releaseAll, this);
    }

    createWheel ()
    {
        const rim = this.add.circle(0, 0, WHEEL_RADIUS, 0x37474f);
        rim.setStrokeStyle(6, 0x102027);

        const inner = this.add.circle(0, 0, WHEEL_RADIUS - 34, 0x263238);

        const spokes = [];

        for (const angle of [ 0, 60, 120 ])
        {
            const spoke = this.add.rectangle(0, 0, 18, (WHEEL_RADIUS - 20) * 2, 0x37474f);
            spoke.setRotation(Phaser.Math.DegToRad(angle));
            spokes.push(spoke);
        }

        const hub = this.add.circle(0, 0, 36, 0x455a64);
        const hubDot = this.add.circle(0, 0, 14, 0x546e7a);

        //  Marker so you can see the wheel turning
        const marker = this.add.circle(0, -(WHEEL_RADIUS - 17), 9, 0xffeb3b);

        this.wheel = this.add.container(WHEEL_X, WHEEL_Y, [ rim, inner, ...spokes, hub, hubDot, marker ]);

        const zone = this.add.zone(WHEEL_X, WHEEL_Y, (WHEEL_RADIUS + 25) * 2, (WHEEL_RADIUS + 25) * 2);
        zone.setInteractive();

        zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {

            this.wheelPointerId = pointer.id;
            this.lastPointerAngle = Phaser.Math.Angle.Between(WHEEL_X, WHEEL_Y, pointer.x, pointer.y);

        });
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
    }

    update (_time: number, delta: number)
    {
        //  Wheel springs back to centre when let go
        if (this.wheelPointerId === -1 && this.wheelRotation !== 0)
        {
            this.wheelRotation *= 1 - Math.min(1, (delta / 1000) * 6);

            if (Math.abs(this.wheelRotation) < 0.01)
            {
                this.wheelRotation = 0;
            }
        }

        this.wheel.rotation = this.wheelRotation;
        this.registry.set('steering', this.wheelRotation / MAX_TURN);
    }
}
