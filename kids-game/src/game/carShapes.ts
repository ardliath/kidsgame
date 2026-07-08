import * as Phaser from 'phaser';
import { Scene } from 'phaser';

export const CAR_COLOURS = [
    { name: 'Red', value: 0xe53935 },
    { name: 'Orange', value: 0xfb8c00 },
    { name: 'Yellow', value: 0xfdd835 },
    { name: 'Green', value: 0x43a047 },
    { name: 'Blue', value: 0x1e88e5 },
    { name: 'Purple', value: 0x8e24aa }
];

export const CAR_MODELS = [
    { key: 'hatch', name: 'Car' },
    { key: 'racer', name: 'Racer' },
    { key: 'truck', name: 'Truck' },
    { key: 'lorry', name: 'Lorry' }
];

export const DEFAULT_COLOUR = 0xe53935;
export const DEFAULT_MODEL = 'hatch';

//  All models are drawn pointing up, roughly 90 units long, so they share
//  the same physics circle and can be swapped without touching the body.
export function buildCarShapes (scene: Scene, model: string, colour: number): Phaser.GameObjects.GameObject[]
{
    const dark = Phaser.Display.Color.IntegerToColor(colour).darken(35).color;

    switch (model)
    {
        case 'racer': return racerShapes(scene, colour, dark);
        case 'truck': return truckShapes(scene, colour, dark);
        case 'lorry': return lorryShapes(scene, colour, dark);
        default: return hatchShapes(scene, colour, dark);
    }
}

function wheels (scene: Scene, positions: [number, number][], w = 12, h = 26): Phaser.GameObjects.GameObject[]
{
    return positions.map(([ x, y ]) => scene.add.rectangle(x, y, w, h, 0x212121));
}

function hatchShapes (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheels(scene, [ [ -22, -24 ], [ 22, -24 ], [ -22, 24 ], [ 22, 24 ] ]),
        scene.add.rectangle(0, 0, 46, 78, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(0, -12, 34, 16, 0xb3e5fc),
        scene.add.rectangle(0, 22, 30, 10, 0xb3e5fc),
        scene.add.circle(-13, -36, 5, 0xfff176),
        scene.add.circle(13, -36, 5, 0xfff176)
    ];
}

function racerShapes (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheels(scene, [ [ -20, -22 ], [ 20, -22 ], [ -20, 26 ], [ 20, 26 ] ], 12, 24),
        scene.add.rectangle(0, 7, 40, 70, colour).setStrokeStyle(4, dark),
        //  Triangle points must be non-negative or Phaser miscalculates the origin
        scene.add.triangle(0, -36, 0, 16, 40, 16, 20, 0, colour),
        scene.add.rectangle(0, 10, 10, 62, 0xffffff, 0.85),
        scene.add.rectangle(0, -4, 30, 14, 0xb3e5fc),
        scene.add.rectangle(0, 40, 52, 10, dark),
        scene.add.circle(-10, -34, 4, 0xfff176),
        scene.add.circle(10, -34, 4, 0xfff176)
    ];
}

function lorryShapes (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheels(scene, [ [ -23, -36 ], [ 23, -36 ], [ -23, 6 ], [ 23, 6 ], [ -23, 40 ], [ 23, 40 ] ], 12, 22),

        //  Cab up front in the body colour
        scene.add.rectangle(0, -39, 46, 26, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(0, -43, 38, 8, 0xb3e5fc),
        scene.add.circle(-14, -50, 4, 0xfff176),
        scene.add.circle(14, -50, 4, 0xfff176),

        //  Big box trailer with a stripe to match
        scene.add.rectangle(0, 15, 50, 74, 0xe0e0e0).setStrokeStyle(4, 0x757575),
        scene.add.rectangle(0, -6, 50, 14, colour),
        scene.add.rectangle(0, 49, 42, 6, 0x757575)
    ];
}

function truckShapes (scene: Scene, colour: number, dark: number): Phaser.GameObjects.GameObject[]
{
    return [
        ...wheels(scene, [ [ -24, -24 ], [ 24, -24 ], [ -24, 28 ], [ 24, 28 ] ], 13, 26),
        scene.add.rectangle(0, -16, 46, 42, colour).setStrokeStyle(4, dark),
        scene.add.rectangle(0, -26, 36, 12, 0xb3e5fc),
        scene.add.rectangle(0, 27, 44, 44, dark),
        scene.add.rectangle(0, 27, 34, 34, 0x9e9e9e),
        scene.add.circle(-14, -38, 5, 0xfff176),
        scene.add.circle(14, -38, 5, 0xfff176)
    ];
}
