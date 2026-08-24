/**
 * Creating and reading a חופשה — the group that owns the dates, the travellers
 * and everything watched for them.
 */
import { db } from './db.js';
import { fromIso, nights, toIso } from './dates.js';
import { destinationPhoto } from '../google/images.js';
import type { Prisma, Vacation } from '@prisma/client';

export interface NewVacation {
  name?: string;
  destinationLabel: string;
  destinationMid: string;
  wikidataId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  originAirport?: string;
  checkin: string;
  checkout: string;
  adults?: number;
  childAges?: number[];
  currency?: string;
  intervalSeconds?: number;
  maxStops?: number | null;
  freeCancellationOnly?: boolean;
  minRating?: number | null;
  minStars?: number | null;
  maxNightly?: number | null;
}

/**
 * Create the group, then attach the one option every vacation has: "the
 * cheapest fare for these dates". It is created up front because a vacation
 * without it would silently track nothing until a flight was pinned by hand.
 */
export async function createVacation(input: NewVacation): Promise<Vacation> {
  const photo = await destinationPhoto(input.destinationLabel).catch(() => null);

  const vacation = await db.vacation.create({
    data: {
      name: input.name?.trim() || input.destinationLabel,
      destinationLabel: input.destinationLabel,
      destinationMid: input.destinationMid,
      wikidataId: input.wikidataId ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      originAirport: input.originAirport ?? 'TLV',
      checkin: fromIso(input.checkin),
      checkout: fromIso(input.checkout),
      adults: Math.max(1, input.adults ?? 2),
      childAges: input.childAges ?? [],
      currency: input.currency ?? 'ILS',
      intervalSeconds: input.intervalSeconds ?? 3600,
      maxStops: input.maxStops ?? null,
      freeCancellationOnly: input.freeCancellationOnly ?? false,
      minRating: input.minRating ?? null,
      minStars: input.minStars ?? null,
      maxNightly: input.maxNightly ?? null,
      imageUrl: photo?.url ?? null,
      imageAttribution: photo?.title ?? null,
      imageProvider: photo?.provider ?? null,
      options: {
        create: {
          kind: 'FLIGHT',
          title: 'הטיסה הזולה בתאריכים האלה',
          matchKey: null,
        },
      },
    },
  });

  return vacation;
}

const WITH_OPTIONS = {
  options: {
    orderBy: [{ kind: 'asc' }, { lastPrice: 'asc' }],
    include: {
      snapshots: {
        orderBy: { checkedAt: 'desc' },
        take: 40,
        include: { quotes: { orderBy: { price: 'asc' } } },
      },
    },
  },
} satisfies Prisma.VacationInclude;

/**
 * Drop history that belongs to a stay the vacation no longer has.
 *
 * Editing the dates does not delete the old prices — they are a true record of
 * what was asked and answered — but they describe a different stay, and showing
 * them on the same line would read as a price change. So they are filtered out
 * of the current view and reappear if the dates are put back.
 */
function forCurrentStay(vacation: VacationWithOptions): VacationWithOptions {
  const sameStay = (s: VacationWithOptions['options'][number]['snapshots'][number]): boolean =>
    // A legacy row with no stay recorded predates editable dates, and its
    // vacation had only ever had one stay.
    s.stayCheckin === null ||
    (s.stayCheckin.getTime() === vacation.checkin.getTime() &&
      s.stayCheckout?.getTime() === vacation.checkout.getTime() &&
      s.stayAdults === vacation.adults);

  return {
    ...vacation,
    options: vacation.options.map((o) => ({ ...o, snapshots: o.snapshots.filter(sameStay) })),
  };
}

export type VacationWithOptions = Prisma.VacationGetPayload<{ include: typeof WITH_OPTIONS }>;

export async function listVacations(): Promise<VacationWithOptions[]> {
  const rows = await db.vacation.findMany({
    where: { archived: false },
    orderBy: { createdAt: 'desc' },
    include: WITH_OPTIONS,
  });
  return rows.map(forCurrentStay);
}

export async function getVacation(id: string): Promise<VacationWithOptions | null> {
  const row = await db.vacation.findUnique({ where: { id }, include: WITH_OPTIONS });
  return row === null ? null : forCurrentStay(row);
}

/**
 * Delete a vacation and everything watched inside it.
 *
 * The cascade is declared on the relations, so options, snapshots and quotes go
 * with it. This is deliberately a real delete rather than an archive flag: a
 * holiday that is not happening is noise, and the history is only meaningful in
 * the context of the group that owns it.
 */
export async function deleteVacation(id: string): Promise<void> {
  await db.vacation.delete({ where: { id } });
}

export interface VacationEdit {
  name?: string;
  checkin?: string;
  checkout?: string;
  adults?: number;
  childAges?: number[];
  originAirport?: string;
  currency?: string;
  intervalSeconds?: number;
  paused?: boolean;
  maxStops?: number | null;
  freeCancellationOnly?: boolean;
  minRating?: number | null;
  minStars?: number | null;
  maxNightly?: number | null;
}

/**
 * Change a vacation, including its dates.
 *
 * When the stay changes, the rolled-up numbers on every option — last price,
 * previous price, the low-water mark — describe the old stay and would otherwise
 * be compared against the new one, reporting a saving that is really just a
 * shorter trip. They are therefore recomputed from whatever history exists for
 * the *new* stay, which for a stay never checked before means cleared.
 */
export async function updateVacation(id: string, edit: VacationEdit): Promise<Vacation> {
  const current = await db.vacation.findUnique({ where: { id } });
  if (!current) throw new Error('החופשה לא נמצאה');

  const checkin = edit.checkin === undefined ? current.checkin : fromIso(edit.checkin);
  const checkout = edit.checkout === undefined ? current.checkout : fromIso(edit.checkout);
  if (checkout.getTime() <= checkin.getTime()) {
    throw new Error('הצ׳ק-אאוט צריך להיות אחרי הצ׳ק-אין');
  }

  const adults = edit.adults === undefined ? current.adults : Math.max(1, edit.adults);
  const childAges = edit.childAges ?? current.childAges;

  const stayChanged =
    checkin.getTime() !== current.checkin.getTime() ||
    checkout.getTime() !== current.checkout.getTime() ||
    adults !== current.adults ||
    childAges.join(',') !== current.childAges.join(',');

  const vacation = await db.vacation.update({
    where: { id },
    data: {
      ...(edit.name === undefined ? {} : { name: edit.name.trim() || current.name }),
      checkin,
      checkout,
      adults,
      childAges,
      ...(edit.originAirport === undefined
        ? {}
        : { originAirport: edit.originAirport.trim().toUpperCase() || current.originAirport }),
      ...(edit.currency === undefined ? {} : { currency: edit.currency }),
      ...(edit.intervalSeconds === undefined ? {} : { intervalSeconds: Math.max(300, edit.intervalSeconds) }),
      ...(edit.paused === undefined ? {} : { paused: edit.paused }),
      ...(edit.maxStops === undefined ? {} : { maxStops: edit.maxStops }),
      ...(edit.freeCancellationOnly === undefined ? {} : { freeCancellationOnly: edit.freeCancellationOnly }),
      ...(edit.minRating === undefined ? {} : { minRating: edit.minRating }),
      ...(edit.minStars === undefined ? {} : { minStars: edit.minStars }),
      ...(edit.maxNightly === undefined ? {} : { maxNightly: edit.maxNightly }),
    },
  });

  if (stayChanged) await rebaseOptions(vacation);
  return vacation;
}

/** Recompute each option's summary from history for the vacation's current stay. */
async function rebaseOptions(vacation: Vacation): Promise<void> {
  const options = await db.option.findMany({ where: { vacationId: vacation.id } });

  for (const option of options) {
    const priced = await db.snapshot.findMany({
      where: {
        optionId: option.id,
        status: 'OK',
        price: { not: null },
        stayCheckin: vacation.checkin,
        stayCheckout: vacation.checkout,
        stayAdults: vacation.adults,
      },
      orderBy: { checkedAt: 'desc' },
    });

    const lowest = priced.reduce<{ price: number; at: Date } | null>(
      (best, s) => (best === null || (s.price as number) < best.price ? { price: s.price as number, at: s.checkedAt } : best),
      null,
    );

    await db.option.update({
      where: { id: option.id },
      data: {
        lastPrice: priced[0]?.price ?? null,
        previousPrice: priced[1]?.price ?? null,
        lowestPrice: lowest?.price ?? null,
        lowestAt: lowest?.at ?? null,
        lastCheckedAt: priced[0]?.checkedAt ?? null,
        lastStatus: priced.length > 0 ? 'OK' : null,
      },
    });
  }
}

/** Everything a check needs, in the shapes the Google layer expects. */
export function searchTerms(vacation: Vacation): {
  checkin: string;
  checkout: string;
  nights: number;
  adults: number;
  childAges: number[];
  currency: string;
} {
  return {
    checkin: toIso(vacation.checkin),
    checkout: toIso(vacation.checkout),
    nights: nights(vacation.checkin, vacation.checkout),
    adults: vacation.adults,
    childAges: vacation.childAges,
    currency: vacation.currency,
  };
}
