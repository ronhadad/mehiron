/**
 * Hotel completions from Google, priced for this vacation's actual stay.
 *
 * Lives under the vacation because the dates and the party decide both which
 * hotels Google offers and what they cost — a suggestion list detached from the
 * stay would show prices nobody is going to pay.
 */
import { NextResponse } from 'next/server';
import { getVacation, searchTerms } from '@server/domain/vacations.js';
import { suggestHotels } from '@server/domain/hotelSearch.js';

type RouteContext = { params: Promise<unknown> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One suggestion lookup is a 2.5 MB Google page load.
export const maxDuration = 30;

export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  const query = new URL(request.url).searchParams.get('q') ?? '';
  if (query.trim().length < 3) return NextResponse.json({ hotels: [] });

  const vacation = await getVacation(id);
  if (!vacation) return NextResponse.json({ message: 'החופשה לא נמצאה' }, { status: 404 });

  const terms = searchTerms(vacation);
  try {
    const hotels = await suggestHotels({
      query,
      checkin: terms.checkin,
      checkout: terms.checkout,
      adults: terms.adults,
      childAges: terms.childAges,
      currency: terms.currency,
    });
    return NextResponse.json({ hotels });
  } catch (error) {
    return NextResponse.json(
      { hotels: [], message: error instanceof Error ? error.message : 'החיפוש נכשל' },
      { status: 200 },
    );
  }
}
