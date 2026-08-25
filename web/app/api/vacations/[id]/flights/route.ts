/** Start or stop watching the cheapest fare for this vacation's dates. */
import { NextResponse } from 'next/server';
import { watchCheapestFlight } from '@server/domain/options.js';

type RouteContext = { params: Promise<unknown> };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_: Request, ctx: RouteContext): Promise<NextResponse> {
  const { id } = (await ctx.params) as { id: string };
  try {
    return NextResponse.json({ option: await watchCheapestFlight(id) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'הוספת מעקב הטיסות נכשלה' },
      { status: 400 },
    );
  }
}
