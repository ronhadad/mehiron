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

export type VacationWithOptions = Prisma.VacationGetPayload<{ include: typeof WITH_OPTIONS }>;

export function listVacations(): Promise<VacationWithOptions[]> {
  return db.vacation.findMany({
    where: { archived: false },
    orderBy: { createdAt: 'desc' },
    include: WITH_OPTIONS,
  });
}

export function getVacation(id: string): Promise<VacationWithOptions | null> {
  return db.vacation.findUnique({ where: { id }, include: WITH_OPTIONS });
}

export async function deleteVacation(id: string): Promise<void> {
  await db.vacation.delete({ where: { id } });
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
