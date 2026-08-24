/** Check this group now, rather than waiting for its interval. */
import { NextResponse } from 'next/server';
import { getVacation } from '@server/domain/vacations.js';
import { checkVacation } from '@server/domain/check.js';

/*
 * Next's generated route validator hands the context in as `params:
 * Promise<unknown>`, so a narrower annotation here is rejected outright. The
 * shape is asserted once, on the line that awaits it.
 */
type RouteContext = { params: Promise<unknown> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/*
 * Vercel's Hobby plan caps a function at 60 seconds, so 120 was never going to
 * be honoured. A check is sequential — one flights page, then one page per
 * hotel, with a politeness gap between them — so a group with many hotels can
 * still run out of time. When it does, the snapshots already written stand and
 * the rest are simply not recorded; the response says how far it got.
 */
export const maxDuration = 60;

export async function POST(_: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  const vacation = await getVacation(id);
  if (!vacation) return NextResponse.json({ message: 'החופשה לא נמצאה' }, { status: 404 });

  try {
    return NextResponse.json({ outcome: await checkVacation(vacation) });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'הבדיקה נכשלה' },
      { status: 500 },
    );
  }
}
