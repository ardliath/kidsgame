const SAVE_KEY = 'kids-game-save';
const CAR_KEY = 'kids-game-car';
const BUILT_KEY = 'kids-game-built';

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
