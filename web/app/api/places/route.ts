/** Destination suggestions for whatever the user is typing. */
import { NextResponse } from 'next/server';
import { searchPlaces, type Place } from '@server/google/places.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  if (query.trim().length < 2) return NextResponse.json({ places: [] as Place[] });

  try {
    return NextResponse.json({ places: await searchPlaces(query) });
  } catch {
    // Suggestions are a convenience; a lookup failure must not break typing.
    return NextResponse.json({ places: [] as Place[] });
  }
}
