const SAVE_KEY = 'kids-game-save';
const CAR_KEY = 'kids-game-car';
const BUILT_KEY = 'kids-game-built';
const EXTRA_SITES_KEY = 'kids-game-extra-sites';
const DEMOLISHED_KEY = 'kids-game-demolished';
const VISITED_KEY = 'kids-game-visited';

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

//  Houses the player has been inside. Nothing writes this yet — the visit
//  feature will — but demolition already respects it.
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
