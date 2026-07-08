import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { parseColour } from './mapBuilder';

//  Everything cookable is defined in public/assets/recipes.json — add new
//  ingredients and recipes there, no code needed. A recipe is a list of
//  steps the child does in order:
//
//    { "type": "fetch", "ingredient": "bread" }   find it in the fridge
//    { "type": "pour",  "ingredient": "water", "into": "pan" }  hold to pour
//    { "type": "add",   "ingredient": "pasta" }   tap to tip into the pan
//    { "type": "stir",  "stirs": 5 }              stir the pan
//    { "type": "toast" }                          push the toaster lever
//
//  Each step may carry an "instruction" string shown at the top.
//  Icons available for ingredients/results: bread, toast, pasta, carton,
//  jug, bowl, glass. Anything else draws as a plain blob in the given colour.

export interface IngredientDef
{
    name: string;
    colour: string;
    icon: string;
}

export type CookStepType = 'fetch' | 'pour' | 'add' | 'stir' | 'toast';

export interface CookStep
{
    type: CookStepType;
    ingredient?: string;
    into?: 'pan' | 'glass';
    stirs?: number;
    instruction?: string;
}

export interface RecipeDef
{
    id: string;
    name: string;
    result: { colour: string; icon: string };
    steps?: CookStep[];

    //  Legacy single-method form, still supported
    ingredients?: string[];
    method?: 'toaster' | 'hob' | 'pour';
    stirs?: number;
}

//  Every recipe becomes a list of steps. New recipes use "steps"; older
//  single-method recipes are expanded here so nothing breaks.
export function recipeSteps (recipe: RecipeDef): CookStep[]
{
    if (recipe.steps && recipe.steps.length > 0)
    {
        return recipe.steps;
    }

    const steps: CookStep[] = (recipe.ingredients ?? []).map(id => ({ type: 'fetch', ingredient: id } as CookStep));

    if (recipe.method === 'toaster')
    {
        steps.push({ type: 'toast' });
    }
    else if (recipe.method === 'hob')
    {
        steps.push({ type: 'stir', stirs: recipe.stirs });
    }
    else if (recipe.method === 'pour')
    {
        steps.push({ type: 'pour', ingredient: recipe.ingredients?.[0], into: 'glass' });
    }

    return steps;
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

        case 'jug':
            return [
                scene.add.rectangle(-26, 2, 8, 34, dark),
                scene.add.rectangle(0, 6, 42, 50, colour, 0.5).setStrokeStyle(3, dark),
                scene.add.rectangle(0, 13, 34, 34, colour),
                scene.add.triangle(24, -10, 0, 0, 0, 20, 16, 6, colour)
            ];

        default:
            return [ scene.add.circle(0, 0, 22, colour).setStrokeStyle(3, dark) ];
    }
}
