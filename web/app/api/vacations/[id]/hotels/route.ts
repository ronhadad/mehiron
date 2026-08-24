/** Add a hotel to watch — this is what fills in "where to sleep". */
import { NextResponse } from 'next/server';
import { addHotel } from '@server/domain/options.js';

/*
 * Next's generated route validator hands the context in as `params:
 * Promise<unknown>`, so a narrower annotation here is rejected outright. The
 * shape is asserted once, on the line that awaits it.
 */
type RouteContext = { params: Promise<unknown> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  const body = (await request.json().catch(() => ({}))) as {
    entityId?: string | null;
    query?: string;
    title?: string;
    stars?: number | null;
    rating?: number | null;
    ratingCount?: number | null;
  };

  try {
    const option = await addHotel(id, body);
    return NextResponse.json({ option }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'הוספת המלון נכשלה' },
      { status: 400 },
    );
  }
}
