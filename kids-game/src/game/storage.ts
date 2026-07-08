const SAVE_KEY = 'kids-game-save';
const CAR_KEY = 'kids-game-car';
const BUILT_KEY = 'kids-game-built';
const EXTRA_SITES_KEY = 'kids-game-extra-sites';
const DEMOLISHED_KEY = 'kids-game-demolished';
const VISITED_KEY = 'kids-game-visited';
const MAP_KEY = 'kids-game-map';
const INTERIORS_KEY = 'kids-game-interiors';
const NAME_KEY = 'kids-game-name';

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
