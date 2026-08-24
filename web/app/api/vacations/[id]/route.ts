/** One group, with its options and their history. */
import { NextResponse } from 'next/server';
import { deleteVacation, getVacation, updateVacation, type VacationEdit } from '@server/domain/vacations.js';

/*
 * Next's generated route validator hands the context in as `params:
 * Promise<unknown>`, so a narrower annotation here is rejected outright. The
 * shape is asserted once, on the line that awaits it.
 */
type RouteContext = { params: Promise<unknown> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  const vacation = await getVacation(id);
  if (!vacation) return NextResponse.json({ message: 'החופשה לא נמצאה' }, { status: 404 });
  return NextResponse.json({ vacation });
}

export async function DELETE(_: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  await deleteVacation(id);
  return NextResponse.json({ ok: true });
}

/** Change the group — its name, dates, travellers, cadence or filters. */
export async function PATCH(request: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  const edit = (await request.json().catch(() => null)) as VacationEdit | null;
  if (!edit) return NextResponse.json({ message: 'בקשה לא תקינה' }, { status: 400 });

  try {
    return NextResponse.json({ vacation: await updateVacation(id, edit) });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'העדכון נכשל' },
      { status: 400 },
    );
  }
}
