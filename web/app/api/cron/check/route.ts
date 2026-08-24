/**
 * The endpoint a scheduler hits to check everything that is due.
 *
 * This route sits outside the session wall — a cron job has no cookie — so it
 * carries its own credential instead: `CRON_SECRET`, compared in constant time.
 * With the variable unset the route refuses to run at all. That is the
 * important direction to fail in: an open version of this URL lets anyone on
 * the internet spend this deployment's Google requests, and each one is a page
 * load Google attributes to us.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` automatically to its own
 * cron invocations once that variable exists, so the same check serves both
 * Vercel Cron and any outside scheduler.
 */
import { NextResponse } from 'next/server';
import { runDueChecks } from '@server/domain/schedule.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/*
 * Vercel's Hobby plan caps a function at 60s. The sweep stops starting new
 * vacations at 45s so the one in flight can finish and still be reported.
 */
export const maxDuration = 60;

/** Length-independent comparison, so a wrong secret leaks nothing by timing. */
function secretMatches(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  // Comparing over the longer of the two keeps the loop count independent of
  // how much of the secret was guessed right.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function presented(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  // Some schedulers cannot set headers. A secret in a query string ends up in
  // access logs, so it is accepted but never preferred.
  return new URL(request.url).searchParams.get('key');
}

async function sweep(request: Request): Promise<NextResponse> {
  const expected = process.env['CRON_SECRET']?.trim();
  if (!expected) {
    return NextResponse.json(
      { message: 'CRON_SECRET לא מוגדר — הבדיקה האוטומטית כבויה' },
      { status: 503 },
    );
  }

  const given = presented(request);
  if (!given || !secretMatches(given, expected)) {
    return NextResponse.json({ message: 'לא מורשה' }, { status: 401 });
  }

  try {
    const result = await runDueChecks();
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'הסבב נכשל' },
      { status: 500 },
    );
  }
}

/** Vercel Cron issues a GET; an outside scheduler may prefer POST. */
export async function GET(request: Request): Promise<NextResponse> {
  return sweep(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return sweep(request);
}
