import { Edge, MapData, TILE } from './mapBuilder';

//  A place the compass can point at — always a named, always-present spot
//  (the yard, a shop, a landmark), never something dynamic like a built house
export interface NavDestination
{
    id: string;
    name: string;
    mapId: string;
    x: number;
    y: number;
}

const SHOP_NAME: Record<string, string> = {
    grocery: 'Shop',
    treat: 'Ice Cream',
    cafe: 'Café'
};

const LANDMARK_NAME: Record<string, string> = {
    'clock-tower': 'Clock Tower',
    windmill: 'Windmill',
    pier: 'Pier',
    lighthouse: 'Lighthouse'
};

export function listKnownDestinations (allMaps: Record<string, MapData>): NavDestination[]
{
    const found: NavDestination[] = [];

    for (const map of Object.values(allMaps))
    {
        map.objects?.forEach(obj => {

            const w = obj.w ?? (obj.type === 'yard' ? 3 : 1);
            const h = obj.h ?? (obj.type === 'yard' ? 2 : 1);
            const x = (obj.col + w / 2) * TILE;
            const y = (obj.row + h / 2) * TILE;

            if (obj.type === 'yard')
            {
                found.push({ id: obj.id ?? `${map.id}-yard`, name: 'Yard', mapId: map.id, x, y });
            }
            else if (obj.sign && obj.sells && obj.sells.length > 0)
            {
                const kind = SHOP_NAME[obj.shopType ?? 'grocery'] ?? 'Shop';
                found.push({ id: obj.id ?? `${map.id}-shop-${obj.col}x${obj.row}`, name: `${map.name} ${kind}`, mapId: map.id, x, y });
            }
            else if (obj.type === 'landmark' && obj.kind)
            {
                const kind = LANDMARK_NAME[obj.kind] ?? 'Landmark';
                found.push({ id: obj.id ?? `${map.id}-landmark-${obj.col}x${obj.row}`, name: kind, mapId: map.id, x, y });
            }

        });
    }

    return found;
}

//  Which way to head from `fromMapId` to eventually reach `toMapId`, via a
//  breadth-first search over the towns' exits. Returns null if they're the
//  same town (nothing to hop) or no path exists.
export function findNextHop (fromMapId: string, toMapId: string, allMaps: Record<string, MapData>): Edge | null
{
    if (fromMapId === toMapId)
    {
        return null;
    }

    const queue: { mapId: string; firstEdge: Edge }[] = [];
    const visited = new Set<string>([ fromMapId ]);

    const start = allMaps[fromMapId];

    for (const edge of Object.keys(start?.exits ?? {}) as Edge[])
    {
        const target = start.exits![edge];

        if (target === toMapId)
        {
            return edge;
        }

        if (target && !visited.has(target))
        {
            visited.add(target);
            queue.push({ mapId: target, firstEdge: edge });
        }
    }

    while (queue.length > 0)
    {
        const { mapId, firstEdge } = queue.shift()!;
        const map = allMaps[mapId];

        for (const edge of Object.keys(map?.exits ?? {}) as Edge[])
        {
            const target = map.exits![edge];

            if (target === toMapId)
            {
                return firstEdge;
            }

            if (target && !visited.has(target))
            {
                visited.add(target);
                queue.push({ mapId: target, firstEdge });
            }
        }
    }

    return null;
}

//  Angle convention shared with mapBuilder/Driving: 0 = north (up), clockwise
const EDGE_ANGLE: Record<Edge, number> = {
    north: 0,
    south: Math.PI,
    east: Math.PI / 2,
    west: -Math.PI / 2
};

export function edgeAngle (edge: Edge): number
{
    return EDGE_ANGLE[edge];
}

//  Compass-needle angle from the car to a same-town target, same convention
export function bearingTo (carX: number, carY: number, targetX: number, targetY: number): number
{
    return Math.atan2(targetX - carX, -(targetY - carY));
}
