import { MapData, scanGridHouses, TILE } from './mapBuilder';
import { listKnownDestinations } from './navigation';

export interface Parcel
{
    id: string;
    name: string;
    colour: string;
    icon: string;
}

export interface DeliveriesConfig
{
    parcels: Parcel[];
}

//  A house or landmark that can receive a delivery — a superset of the GPS's
//  known destinations (landmarks), plus explicitly-placed and plain-grid
//  houses (see the plan's scoping note: not houses built on a site, those
//  live at dynamic positions that would need a live scene to resolve)
export interface DropoffDestination
{
    id: string;
    name: string;
    mapId: string;
    x: number;
    y: number;
    kind: 'house' | 'landmark';
}

export interface DeliveryJob
{
    parcelId: string;
    pickupId: string;
    pickupName: string;
    pickupMapId: string;
    pickupX: number;
    pickupY: number;
    dropoffId: string;
    dropoffName: string;
    dropoffMapId: string;
    dropoffKind: 'house' | 'landmark';
    dropoffX: number;
    dropoffY: number;
    state: 'offered' | 'accepted' | 'carrying';
}

//  Every shop across all towns — reuses the GPS's destination list rather
//  than re-deriving what counts as a shop. Petrol stations are their own
//  `type: 'petrol'` in that list specifically so they're never picked up
//  here — a delivery job starting or ending at a pump wouldn't make sense.
export function enumerateShops (allMaps: Record<string, MapData>)
{
    return listKnownDestinations(allMaps).filter(d => d.type === 'shop');
}

//  Every landmark, explicitly-placed house (no sign, not the player's own),
//  and plain-grid house, across all towns. Signed buildings — shops and
//  petrol stations alike — are deliberately excluded below.
export function enumerateDropoffs (allMaps: Record<string, MapData>): DropoffDestination[]
{
    const found: DropoffDestination[] = [];

    for (const dest of listKnownDestinations(allMaps))
    {
        if (dest.type === 'landmark')
        {
            found.push({ id: dest.id, name: dest.name, mapId: dest.mapId, x: dest.x, y: dest.y, kind: 'landmark' });
        }
    }

    for (const map of Object.values(allMaps))
    {
        map.objects?.forEach(obj => {

            if (obj.type === 'house' && !obj.sign && !obj.player)
            {
                const w = obj.w ?? 1;
                const h = obj.h ?? 1;

                found.push({
                    id: obj.id ?? `${map.id}-house-${obj.col}x${obj.row}`,
                    name: `${map.name} House`,
                    mapId: map.id,
                    x: (obj.col + w / 2) * TILE,
                    y: (obj.row + h / 2) * TILE,
                    kind: 'house'
                });
            }

        });

        for (const grid of scanGridHouses(map))
        {
            found.push({
                id: grid.id,
                name: `${map.name} House`,
                mapId: map.id,
                x: (grid.col + 0.5) * TILE,
                y: (grid.row + 0.5) * TILE,
                kind: 'house'
            });
        }
    }

    return found;
}

//  One random shop, one random dropoff (independently — cross-town pairings
//  are expected and fine), one random parcel. Null if a town set has nothing
//  to offer yet (shouldn't happen with the shipped maps, but a save could
//  plausibly be missing map data mid-load).
export function generateJob (allMaps: Record<string, MapData>, parcels: Parcel[]): DeliveryJob | null
{
    const shops = enumerateShops(allMaps);
    const dropoffs = enumerateDropoffs(allMaps);

    if (shops.length === 0 || dropoffs.length === 0 || parcels.length === 0)
    {
        return null;
    }

    const shop = shops[Math.floor(Math.random() * shops.length)];
    const dropoff = dropoffs[Math.floor(Math.random() * dropoffs.length)];
    const parcel = parcels[Math.floor(Math.random() * parcels.length)];

    return {
        parcelId: parcel.id,
        pickupId: shop.id,
        pickupName: shop.name,
        pickupMapId: shop.mapId,
        pickupX: shop.x,
        pickupY: shop.y,
        dropoffId: dropoff.id,
        dropoffName: dropoff.name,
        dropoffMapId: dropoff.mapId,
        dropoffKind: dropoff.kind,
        dropoffX: dropoff.x,
        dropoffY: dropoff.y,
        state: 'offered'
    };
}
