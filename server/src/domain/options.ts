/**
 * Adding and removing the things a vacation watches.
 *
 * "Where to sleep" is not a field on the vacation — it is whatever hotels have
 * been added here. Adding one is how the lodging list grows, which is why this
 * takes only a name: the dates and the party already live on the group.
 */
import { db } from './db.js';
import type { Option } from '@prisma/client';

export interface HotelToWatch {
  /** Google's own id, when the hotel was chosen from suggestions. */
  entityId?: string | null;
  /** The fallback: free text, used only when no entity id is known. */
  query?: string;
  title?: string;
  stars?: number | null;
  rating?: number | null;
  ratingCount?: number | null;
}

/**
 * Watch a hotel for this vacation's stay.
 *
 * The entity id is the identity when there is one: it cannot drift the way a
 * name can, so `matchKey` prefers it and falls back to the text only for a
 * hotel added by name alone. The unique index on (vacation, kind, matchKey)
 * then makes adding the same hotel twice an update rather than a duplicate.
 */
export async function addHotel(vacationId: string, hotel: HotelToWatch): Promise<Option> {
  const entityId = hotel.entityId?.trim() || null;
  const query = hotel.query?.trim() || '';
  const matchKey = entityId ?? query;
  if (!matchKey) throw new Error('צריך לבחור מלון מהרשימה, או להקליד שם');

  const title = hotel.title?.trim() || query || matchKey;

  return db.option.upsert({
    where: { vacationId_kind_matchKey: { vacationId, kind: 'HOTEL', matchKey } },
    create: {
      vacationId,
      kind: 'HOTEL',
      title,
      matchKey,
      entityId,
      hotelQuery: query || null,
      stars: hotel.stars ?? null,
      rating: hotel.rating ?? null,
      ratingCount: hotel.ratingCount ?? null,
    },
    update: { active: true, title, entityId },
  });
}

/** Pin a specific flight so it is followed even when it stops being cheapest. */
export async function pinFlight(
  vacationId: string,
  matchKey: string,
  facts: {
    title: string;
    airline?: string | null;
    departTime?: string | null;
    arriveTime?: string | null;
    durationMinutes?: number | null;
    stops?: number | null;
    route?: string | null;
    price?: number | null;
    currency?: string | null;
  },
): Promise<Option> {
  return db.option.upsert({
    where: { vacationId_kind_matchKey: { vacationId, kind: 'FLIGHT', matchKey } },
    create: {
      vacationId,
      kind: 'FLIGHT',
      title: facts.title,
      matchKey,
      airline: facts.airline ?? null,
      departTime: facts.departTime ?? null,
      arriveTime: facts.arriveTime ?? null,
      durationMinutes: facts.durationMinutes ?? null,
      stops: facts.stops ?? null,
      route: facts.route ?? null,
      lastPrice: facts.price ?? null,
    },
    update: { active: true },
  });
}

export async function setFavorite(optionId: string, favorite: boolean): Promise<Option> {
  return db.option.update({ where: { id: optionId }, data: { favorite } });
}

export async function setTarget(optionId: string, targetPrice: number | null): Promise<Option> {
  return db.option.update({ where: { id: optionId }, data: { targetPrice } });
}

/**
 * Stop watching something.
 *
 * The cheapest-flight option cannot be removed — a vacation without it tracks
 * nothing — so it is refused rather than silently ignored.
 */
export async function removeOption(optionId: string): Promise<void> {
  const option = await db.option.findUnique({ where: { id: optionId } });
  if (!option) return;
  if (option.kind === 'FLIGHT' && option.matchKey === null) {
    throw new Error('אי אפשר להסיר את מעקב הטיסה הזולה — הוא הבסיס של החופשה');
  }
  await db.option.delete({ where: { id: optionId } });
}
