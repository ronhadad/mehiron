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
 * This used to refuse to remove the cheapest-flight option, on the grounds that
 * a vacation without it tracks nothing. That was wrong: a trip that is driven to
 * has no flight to track, and the option only made every check spend a Google
 * request to record a failure. A vacation watching nothing is simply idle — the
 * scheduler already skips it — and flights can be added back.
 */
export async function removeOption(optionId: string): Promise<void> {
  const option = await db.option.findUnique({ where: { id: optionId } });
  if (!option) return;
  await db.option.delete({ where: { id: optionId } });
}

/**
 * Start watching the cheapest fare for this vacation's dates.
 *
 * Idempotent by the same unique index that stops a hotel being added twice: the
 * cheapest-flight option is the one with a null match key, so asking for it
 * again revives it rather than creating a second.
 */
export async function watchCheapestFlight(vacationId: string): Promise<Option> {
  /*
   * Not an upsert. The cheapest-flight option is identified by a *null* match
   * key, and a compound unique lookup cannot take null — in SQL nothing equals
   * null, so the index does not constrain these rows either. Find, then create.
   */
  const existing = await db.option.findFirst({
    where: { vacationId, kind: 'FLIGHT', matchKey: null },
  });

  if (existing) {
    return db.option.update({ where: { id: existing.id }, data: { active: true } });
  }

  return db.option.create({
    data: {
      vacationId,
      kind: 'FLIGHT',
      title: 'הטיסה הזולה בתאריכים האלה',
      matchKey: null,
    },
  });
}

/** Record what was actually paid, so a later drop reads as money back. */
export async function setBooked(optionId: string, bookedPrice: number | null): Promise<Option> {
  return db.option.update({
    where: { id: optionId },
    data: { bookedPrice, bookedAt: bookedPrice === null ? null : new Date() },
  });
}
