/**
 * Hotels worth considering here, without anyone typing a name.
 *
 * One Google page load, so it is a deliberate request rather than something the
 * page does on every render: the same search that completes a half-remembered
 * hotel name returns a whole shortlist when handed the destination instead.
 */
import { NextResponse } from 'next/server';
import { getVacation, searchTerms } from '@server/domain/vacations.js';
import { recommendHotels } from '@server/domain/hotelSearch.js';

type RouteContext = { params: Promise<unknown> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One suggestion lookup is a 2.5 MB Google page load.
export const maxDuration = 30;

export async function GET(_: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  const vacation = await getVacation(id);
  if (!vacation) return NextResponse.json({ message: 'החופשה לא נמצאה' }, { status: 404 });

  const terms = searchTerms(vacation);
  try {
    const hotels = await recommendHotels({
      destination: vacation.destinationLabel,
      checkin: terms.checkin,
      checkout: terms.checkout,
      adults: terms.adults,
      childAges: terms.childAges,
      currency: terms.currency,
      nights: terms.nights,
      // Hotels already watched are not recommendations any more.
      exclude: vacation.options.filter((o) => o.entityId).map((o) => o.entityId as string),
      minRating: vacation.minRating,
      minStars: vacation.minStars,
    });
    return NextResponse.json({ hotels });
  } catch (error) {
    return NextResponse.json(
      { hotels: [], message: error instanceof Error ? error.message : 'החיפוש נכשל' },
      { status: 200 },
    );
  }
}
