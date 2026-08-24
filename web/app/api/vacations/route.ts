/** The groups: list them, or create one. */
import { NextResponse } from 'next/server';
import { createVacation, listVacations, type NewVacation } from '@server/domain/vacations.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ vacations: await listVacations() });
}

export async function POST(request: Request): Promise<NextResponse> {
  let input: NewVacation;
  try {
    input = (await request.json()) as NewVacation;
  } catch {
    return NextResponse.json({ message: 'בקשה לא תקינה' }, { status: 400 });
  }

  if (!input.destinationMid || !input.destinationLabel || !input.checkin || !input.checkout) {
    return NextResponse.json({ message: 'צריך יעד ותאריכים' }, { status: 400 });
  }

  try {
    const vacation = await createVacation(input);
    return NextResponse.json({ vacation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'שמירת החופשה נכשלה' },
      { status: 500 },
    );
  }
}
