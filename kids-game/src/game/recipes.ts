import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { parseColour } from './mapBuilder';

//  Everything cookable is defined in public/assets/recipes.json — add new
//  ingredients and recipes there, no code needed. A recipe picks one of the
//  three cooking methods: 'toaster' (tap the lever), 'hob' (stir the pan)
//  or 'pour' (hold to fill the glass).
//
//  Icons available for ingredients/results: bread, toast, pasta, carton,
//  bowl, glass. Anything else draws as a plain blob in the given colour.

export interface IngredientDef
{
    name: string;
    colour: string;
    icon: string;
}

export interface RecipeDef
{
    id: string;
    name: string;
    ingredients: string[];
    method: 'toaster' | 'hob' | 'pour';
    stirs?: number;
    result: { colour: string; icon: string };
}

export interface RecipeConfig
{
    ingredients: Record<string, IngredientDef>;
    recipes: RecipeDef[];
}

export function foodColour (name: string | undefined): number
{
    return parseColour(name, 0xffca28);
}

//  Draws a little food glyph centred on (0, 0), ready to drop in a container
export function drawFoodIcon (scene: Scene, icon: string, colourName: string): Phaser.GameObjects.GameObject[]
{
    const colour = foodColour(colourName);
    const dark = Phaser.Display.Color.IntegerToColor(colour).darken(30).color;

    switch (icon)
    {
        case 'bread':
        case 'toast':
            return [
                scene.add.circle(0, -14, 19, colour).setStrokeStyle(3, dark),
                scene.add.rectangle(0, 4, 38, 36, colour).setStrokeStyle(3, dark),
                scene.add.rectangle(0, 6, 26, 24, icon === 'toast' ? 0xe6c088 : 0xf3ddb0)
            ];

        case 'pasta':
            return [
                scene.add.rectangle(-8, -26, 4, 16, 0xfff59d),
                scene.add.rectangle(0, -28, 4, 18, 0xfff59d),
                scene.add.rectangle(8, -26, 4, 16, 0xfff59d),
                scene.add.rectangle(0, 2, 42, 46, colour).setStrokeStyle(3, dark),
                scene.add.rectangle(0, 4, 30, 18, 0xffffff)
            ];

        case 'carton':
            return [
                scene.add.triangle(0, -25, 0, 14, 38, 14, 19, 0, dark),
                scene.add.rectangle(0, 6, 38, 44, colour).setStrokeStyle(3, dark),
                scene.add.rectangle(0, 8, 26, 20, 0xffffff),
                scene.add.circle(0, 14, 7, colour)
            ];

        case 'bowl':
            return [
                scene.add.ellipse(0, 12, 56, 30, 0xeceff1).setStrokeStyle(3, 0xb0bec5),
                scene.add.ellipse(0, 2, 46, 14, colour)
            ];

        case 'glass':
            return [
                scene.add.rectangle(0, 4, 36, 48, 0xe3f2fd, 0.45).setStrokeStyle(3, 0x90caf9),
                scene.add.rectangle(0, 12, 30, 30, colour)
            ];

        default:
            return [ scene.add.circle(0, 0, 22, colour).setStrokeStyle(3, dark) ];
    }
}
