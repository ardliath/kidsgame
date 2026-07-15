import * as Phaser from 'phaser';
import { Scene } from 'phaser';

//  Every model sits with its wheels resting on this local y (0), so the
//  CarWash scene can place any model's container against the same floor
//  line with no per-model offset math.
export const GROUND_Y = 0;

const WHEEL_R = 16;

function wheelsSide (scene: Scene, xs: number[], radius = WHEEL_R): Phaser.GameObjects.GameObject[]
{
    const parts: Phaser.GameObjects.GameObject[] = [];

    for (const x of xs)
    {
        parts.push(scene.add.circle(x, GROUND_Y - radius, radius, 0x212121));
        parts.push(scene.add.circle(x, GROUND_Y - radius, radius * 0.4, 0x757575));
    }

    return parts;
}

export function buildCarShapesSide (scene: Scene, model: string, colour: number): Phaser.GameObjects.GameObject[]
{
    const dark = Phaser.Display.Color.IntegerToColor(colour).darken(35).color;

    switch (model)
    {
        case 'racer': return racerShapesSide(scene, colour, dark);
        case 'truck': return truckShapesSide(scene, colour, dark);
        case 'lorry': return lorryShapesSide(scene, colour, dark);
        case 'forklift': return forkliftShapesSide(scene, colour, dark);
        case 'digger': return diggerShapesSide(scene, colour, dark);
        case 'mixer': return mixerShapesSide(scene, colour, dark);
        default: return hatchShapesSide(scene, colour, dark);
    }
}

function hatchShapesSide (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheelsSide(scene, [ -24, 24 ]),
        scene.add.rectangle(0, -34, 84, 32, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(10, -56, 46, 24, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(10, -58, 30, 14, 0xb3e5fc),
        scene.add.circle(40, -30, 5, 0xfff176),
        scene.add.rectangle(-40, -34, 6, 10, 0xef5350)
    ];
}

function racerShapesSide (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheelsSide(scene, [ -26, 26 ], 14),
        scene.add.rectangle(0, -26, 90, 20, colour).setStrokeStyle(4, dark),
        //  Triangle points must be non-negative or Phaser miscalculates the origin
        scene.add.triangle(10, -50, 0, 24, 50, 24, 30, 0, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(10, -40, 24, 14, 0xb3e5fc),
        scene.add.rectangle(-42, -44, 8, 24, dark),
        scene.add.circle(44, -22, 4, 0xfff176)
    ];
}

function truckShapesSide (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheelsSide(scene, [ -28, 20 ], 17),
        scene.add.rectangle(-8, -30, 70, 30, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(-24, -52, 34, 24, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(-24, -54, 22, 12, 0xb3e5fc),
        scene.add.rectangle(18, -44, 34, 10, 0x9e9e9e).setStrokeStyle(3, 0x757575),
        scene.add.circle(34, -25, 5, 0xfff176)
    ];
}

function lorryShapesSide (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheelsSide(scene, [ -34, -14, 30 ], 15),
        scene.add.rectangle(-30, -40, 30, 34, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(-30, -44, 20, 14, 0xb3e5fc),
        scene.add.circle(-42, -26, 4, 0xfff176),
        scene.add.rectangle(24, -46, 66, 52, 0xe0e0e0).setStrokeStyle(4, 0x757575),
        scene.add.rectangle(24, -60, 66, 10, colour)
    ];
}

function forkliftShapesSide (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheelsSide(scene, [ -20, 20 ], 15),
        scene.add.rectangle(-6, -32, 60, 28, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(-16, -50, 24, 18, 0xb3e5fc),
        scene.add.rectangle(28, -60, 8, 60, 0x757575),
        scene.add.rectangle(28, -92, 30, 8, 0x616161),
        scene.add.rectangle(46, -32, 26, 6, 0x9e9e9e),
        scene.add.rectangle(46, -20, 26, 6, 0x9e9e9e)
    ];
}

function diggerShapesSide (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        //  Track, instead of wheels
        scene.add.rectangle(0, -14, 90, 22, 0x212121).setStrokeStyle(2, 0x000000),
        scene.add.circle(-38, -14, 11, 0x424242),
        scene.add.circle(38, -14, 11, 0x424242),

        scene.add.rectangle(-8, -46, 56, 34, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(-20, -50, 22, 16, 0xb3e5fc),

        //  Boom, arm and bucket reaching out
        scene.add.rectangle(20, -70, 46, 12, dark).setRotation(-0.3),
        scene.add.rectangle(48, -92, 34, 10, 0x757575).setRotation(-0.15),
        scene.add.rectangle(66, -78, 20, 22, 0x9e9e9e).setStrokeStyle(3, 0x616161)
    ];
}

function mixerShapesSide (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    const stripe = (angle: number) => scene.add.rectangle(10, -50, 60, 8, dark).setRotation(angle);

    return [
        ...wheelsSide(scene, [ -34, -8, 26 ], 15),

        scene.add.rectangle(-32, -40, 28, 30, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(-32, -44, 18, 12, 0xb3e5fc),

        //  The big rotating drum, seen from the side, with its spiral fin as stripes
        scene.add.circle(10, -50, 38, colour).setStrokeStyle(4, dark),
        stripe(0.5), stripe(1.1), stripe(-0.3),

        scene.add.rectangle(10, -14, 12, 12, dark)
    ];
}
