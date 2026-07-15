import { CAR_MODELS, DEFAULT_MODEL } from './carShapes';
import { DeliveryJob } from './deliveries';

const SAVE_KEY = 'kids-game-save';
const CAR_KEY = 'kids-game-car';
const FLEET_KEY = 'kids-game-fleet';
const BUILT_KEY = 'kids-game-built';
const EXTRA_SITES_KEY = 'kids-game-extra-sites';
const DEMOLISHED_KEY = 'kids-game-demolished';
const VISITED_KEY = 'kids-game-visited';
const MAP_KEY = 'kids-game-map';
const INTERIORS_KEY = 'kids-game-interiors';
const NAME_KEY = 'kids-game-name';
const COINS_KEY = 'kids-game-coins';
const PANTRY_KEY = 'kids-game-pantry';
const MUTED_KEY = 'kids-game-muted';
const COMPLETED_RECIPES_KEY = 'kids-game-recipes-done';
const NAV_TARGET_KEY = 'kids-game-nav-target';
const DELIVERY_KEY = 'kids-game-delivery';
const FUEL_KEY = 'kids-game-fuel';

export interface SaveData
{
    mapId?: string;
    x: number;
    y: number;
    heading: number;
    gear: number;
    carColour: number;
    carModel: string;
}

export interface CarStyle
{
    colour: number;
    model: string;
}

//  localStorage can throw (private browsing, full quota) — never let that crash the game

export function saveGame (data: SaveData): boolean
{
    try
    {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        return true;
    }
    catch
    {
        return false;
    }
}

export function loadGame (): SaveData | null
{
    try
    {
        const raw = localStorage.getItem(SAVE_KEY);
        return raw ? JSON.parse(raw) as SaveData : null;
    }
    catch
    {
        return null;
    }
}

export function saveCarStyle (style: CarStyle)
{
    try
    {
        localStorage.setItem(CAR_KEY, JSON.stringify(style));
    }
    catch
    {
        //  Not the end of the world, the car just won't be remembered
    }
}

export function loadCarStyle (): CarStyle | null
{
    try
    {
        const raw = localStorage.getItem(CAR_KEY);
        return raw ? JSON.parse(raw) as CarStyle : null;
    }
    catch
    {
        return null;
    }
}

//  The player's fleet of vehicles (one of each model). Exactly one is the
//  "current" one he's driving; the rest are either at the builders' yard
//  (absent from `parked`) or left out in the world (in `parked` at a spot).
export interface WorldSpot
{
    mapId: string;
    x: number;
    y: number;
    heading: number;
}

export interface Fleet
{
    current: string;
    parked: Record<string, WorldSpot>;
}

export function loadFleet (): Fleet
{
    const validKeys = new Set(CAR_MODELS.map(m => m.key));

    try
    {
        const raw = localStorage.getItem(FLEET_KEY);
        const data = raw ? JSON.parse(raw) as Fleet : null;

        const current = data && validKeys.has(data.current) ? data.current : DEFAULT_MODEL;
        const parked: Record<string, WorldSpot> = {};

        if (data?.parked)
        {
            for (const [ model, spot ] of Object.entries(data.parked))
            {
                //  Skip unknown models, and never let the current one also be parked
                if (validKeys.has(model) && model !== current && spot && typeof spot.x === 'number')
                {
                    parked[model] = spot;
                }
            }
        }

        return { current, parked };
    }
    catch
    {
        return { current: DEFAULT_MODEL, parked: {} };
    }
}

export function saveFleet (fleet: Fleet)
{
    try
    {
        localStorage.setItem(FLEET_KEY, JSON.stringify(fleet));
    }
    catch
    {
        //  Ignore: the fleet just won't be remembered
    }
}

//  Houses the player has built on construction sites, keyed by site id.
//  These are layered on top of the JSON maps when a town is built.
export type BuiltHouses = Record<string, { colour: string }>;

export function loadBuiltHouses (): BuiltHouses
{
    try
    {
        return JSON.parse(localStorage.getItem(BUILT_KEY) ?? '{}') as BuiltHouses;
    }
    catch
    {
        return {};
    }
}

export function saveBuiltHouse (siteId: string, colour: string)
{
    try
    {
        const all = loadBuiltHouses();
        all[siteId] = { colour };
        localStorage.setItem(BUILT_KEY, JSON.stringify(all));
    }
    catch
    {
        //  The house will still appear this session, it just won't survive a reload
    }
}

export function saveBuiltHouses (all: BuiltHouses)
{
    try
    {
        localStorage.setItem(BUILT_KEY, JSON.stringify(all));
    }
    catch
    {
        //  Ignore
    }
}

//  Building sites the game has added on empty grass to keep at least two
//  plots available per map, keyed by map id
export interface ExtraSite
{
    id: string;
    col: number;
    row: number;
}

export function loadExtraSites (): Record<string, ExtraSite[]>
{
    try
    {
        return JSON.parse(localStorage.getItem(EXTRA_SITES_KEY) ?? '{}') as Record<string, ExtraSite[]>;
    }
    catch
    {
        return {};
    }
}

export function saveExtraSite (mapId: string, site: ExtraSite)
{
    try
    {
        const all = loadExtraSites();
        const list = all[mapId] ?? [];

        if (!list.some(s => s.id === site.id))
        {
            list.push(site);
            all[mapId] = list;
            localStorage.setItem(EXTRA_SITES_KEY, JSON.stringify(all));
        }
    }
    catch
    {
        //  Ignore: the site will simply be re-chosen next time
    }
}

export function saveExtraSites (all: Record<string, ExtraSite[]>)
{
    try
    {
        localStorage.setItem(EXTRA_SITES_KEY, JSON.stringify(all));
    }
    catch
    {
        //  Ignore
    }
}

//  Houses knocked down to make room for new building sites
export function loadDemolished (): string[]
{
    try
    {
        return JSON.parse(localStorage.getItem(DEMOLISHED_KEY) ?? '[]') as string[];
    }
    catch
    {
        return [];
    }
}

export function saveDemolished (ids: string[])
{
    try
    {
        localStorage.setItem(DEMOLISHED_KEY, JSON.stringify(ids));
    }
    catch
    {
        //  Ignore
    }
}

//  The town the player was last driving in, so reopening the game
//  puts him back there
export function saveCurrentMap (mapId: string)
{
    try
    {
        localStorage.setItem(MAP_KEY, mapId);
    }
    catch
    {
        //  Ignore: he'll just start back in the home town
    }
}

export function loadCurrentMap (): string | null
{
    try
    {
        return localStorage.getItem(MAP_KEY);
    }
    catch
    {
        return null;
    }
}

//  Houses the player has been inside. Demolition never touches these.
export function loadVisitedHouses (): string[]
{
    try
    {
        return JSON.parse(localStorage.getItem(VISITED_KEY) ?? '[]') as string[];
    }
    catch
    {
        return [];
    }
}

export function saveVisitedHouse (houseId: string)
{
    try
    {
        const visited = loadVisitedHouses();

        if (!visited.includes(houseId))
        {
            visited.push(houseId);
            localStorage.setItem(VISITED_KEY, JSON.stringify(visited));
        }
    }
    catch
    {
        //  Ignore
    }
}

//  Pocket money, earned by building houses and spent in shops
export function loadCoins (): number
{
    try
    {
        const raw = localStorage.getItem(COINS_KEY);

        return raw === null ? 5 : Math.max(0, parseInt(raw, 10) || 0);
    }
    catch
    {
        return 5;
    }
}

export function saveCoins (coins: number)
{
    try
    {
        localStorage.setItem(COINS_KEY, String(Math.max(0, Math.round(coins))));
    }
    catch
    {
        //  Ignore
    }
}

//  The player's pantry — his home fridge. Shopping stocks it, and cooking
//  (wherever he does it) draws from it. There's only one, his; other
//  houses don't have their own food.
export type Pantry = Record<string, number>;

//  Whether the pantry has ever been set up. Lets a fresh game seed a small
//  starting stock exactly once (see seedPantryIfNew), while a pantry the
//  player has since emptied by cooking stays empty until he shops.
export function pantryExists (): boolean
{
    try
    {
        return localStorage.getItem(PANTRY_KEY) !== null;
    }
    catch
    {
        return true;
    }
}

export function loadPantry (): Pantry
{
    try
    {
        return JSON.parse(localStorage.getItem(PANTRY_KEY) ?? '{}') as Pantry;
    }
    catch
    {
        return {};
    }
}

export function savePantry (pantry: Pantry)
{
    try
    {
        localStorage.setItem(PANTRY_KEY, JSON.stringify(pantry));
    }
    catch
    {
        //  Ignore
    }
}

//  Whether the player has turned the sound off (default: on)
export function loadMuted (): boolean
{
    try
    {
        return localStorage.getItem(MUTED_KEY) === '1';
    }
    catch
    {
        return false;
    }
}

export function saveMuted (muted: boolean)
{
    try
    {
        localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    }
    catch
    {
        //  Ignore
    }
}

//  Recipes he's cooked at least once, so new ones can unlock once he's
//  gotten through most of what's already there
export function loadCompletedRecipes (): string[]
{
    try
    {
        return JSON.parse(localStorage.getItem(COMPLETED_RECIPES_KEY) ?? '[]') as string[];
    }
    catch
    {
        return [];
    }
}

export function saveCompletedRecipe (recipeId: string)
{
    try
    {
        const done = loadCompletedRecipes();

        if (!done.includes(recipeId))
        {
            done.push(recipeId);
            localStorage.setItem(COMPLETED_RECIPES_KEY, JSON.stringify(done));
        }
    }
    catch
    {
        //  Ignore
    }
}

//  Where the compass is currently pointing (the GPS feature) — null means
//  no active target
export interface NavTarget
{
    id: string;
    name: string;
    mapId: string;
    x: number;
    y: number;
}

export function loadNavTarget (): NavTarget | null
{
    try
    {
        const raw = localStorage.getItem(NAV_TARGET_KEY);
        return raw ? JSON.parse(raw) as NavTarget : null;
    }
    catch
    {
        return null;
    }
}

export function saveNavTarget (target: NavTarget | null)
{
    try
    {
        localStorage.setItem(NAV_TARGET_KEY, JSON.stringify(target));
    }
    catch
    {
        //  Ignore: the compass just won't remember its target next reload
    }
}

//  The active delivery job, if any — null means no job offered/accepted
export function loadDelivery (): DeliveryJob | null
{
    try
    {
        const raw = localStorage.getItem(DELIVERY_KEY);
        return raw ? JSON.parse(raw) as DeliveryJob : null;
    }
    catch
    {
        return null;
    }
}

export function saveDelivery (job: DeliveryJob | null)
{
    try
    {
        localStorage.setItem(DELIVERY_KEY, JSON.stringify(job));
    }
    catch
    {
        //  Ignore: worst case a job has to be re-generated next session
    }
}

//  How full the tank is, from 0 to 1. Drains while actually driving, topped
//  back up at a petrol station.
export function loadFuel (): number
{
    try
    {
        const raw = localStorage.getItem(FUEL_KEY);
        const n = raw === null ? 1 : parseFloat(raw);

        return isNaN(n) ? 1 : Math.max(0, Math.min(1, n));
    }
    catch
    {
        return 1;
    }
}

export function saveFuel (level: number)
{
    try
    {
        localStorage.setItem(FUEL_KEY, String(Math.max(0, Math.min(1, level))));
    }
    catch
    {
        //  Ignore: worst case the tank looks fuller than it should next session
    }
}

//  The player's name, so the people in the houses can greet him properly
export function loadPlayerName (): string
{
    try
    {
        return localStorage.getItem(NAME_KEY) ?? '';
    }
    catch
    {
        return '';
    }
}

export function savePlayerName (name: string)
{
    try
    {
        localStorage.setItem(NAME_KEY, name);
    }
    catch
    {
        //  Ignore
    }
}

//  The inside of each house, generated the first time it's visited and
//  kept forever after. Versioned so future features (cooking!) can extend it.
export interface InteriorPerson
{
    floor: number;
    x: number;
    skin: number;
    hair: number;
    shirt: number;
    greeting: string;
}

export interface InteriorSpec
{
    version: 1;
    ground: string[];
    upstairs: string[];
    tints: Record<string, number>;
    variants: Record<string, number>;
    people: InteriorPerson[];
}

export function loadInteriors (): Record<string, InteriorSpec>
{
    try
    {
        return JSON.parse(localStorage.getItem(INTERIORS_KEY) ?? '{}') as Record<string, InteriorSpec>;
    }
    catch
    {
        return {};
    }
}

export function saveInterior (houseId: string, spec: InteriorSpec)
{
    try
    {
        const all = loadInteriors();
        all[houseId] = spec;
        localStorage.setItem(INTERIORS_KEY, JSON.stringify(all));
    }
    catch
    {
        //  The house will still work this session, it just won't be remembered
    }
}
