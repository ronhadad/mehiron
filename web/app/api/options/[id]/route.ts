/** Favourite, target price, or stop watching. */
import { NextResponse } from 'next/server';
import { removeOption, setFavorite, setTarget } from '@server/domain/options.js';

/*
 * Next's generated route validator hands the context in as `params:
 * Promise<unknown>`, so a narrower annotation here is rejected outright. The
 * shape is asserted once, on the line that awaits it.
 */
type RouteContext = { params: Promise<unknown> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  const body = (await request.json().catch(() => ({}))) as { favorite?: boolean; targetPrice?: number | null };

  try {
    if (typeof body.favorite === 'boolean') return NextResponse.json({ option: await setFavorite(id, body.favorite) });
    if (body.targetPrice !== undefined) return NextResponse.json({ option: await setTarget(id, body.targetPrice) });
    return NextResponse.json({ message: 'אין מה לעדכן' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'העדכון נכשל' }, { status: 400 });
  }
}

export async function DELETE(_: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  try {
    await removeOption(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'ההסרה נכשלה' }, { status: 400 });
  }
}
