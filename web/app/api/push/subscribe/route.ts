/**
 * A browser signing up to be told when a price falls, or signing off.
 *
 * Behind the session wall, like everything else that is not the cron endpoint:
 * a subscription is a channel into someone's phone, and it should only be
 * creatable by whoever is signed in.
 */
import { NextResponse } from 'next/server';
import { pushConfig, removeSubscription, saveSubscription } from '@server/domain/notify.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The public key the browser needs before it can subscribe at all. */
export async function GET(): Promise<NextResponse> {
  const config = pushConfig();
  if (!config) {
    return NextResponse.json({ message: 'התראות לא מוגדרות בשרת' }, { status: 503 });
  }
  return NextResponse.json({ publicKey: config.publicKey });
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  } | null;

  const endpoint = body?.endpoint?.trim();
  const p256dh = body?.keys?.p256dh?.trim();
  const auth = body?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ message: 'המנוי לא תקין' }, { status: 400 });
  }

  await saveSubscription({
    endpoint,
    p256dh,
    auth,
    userAgent: request.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  const endpoint = body?.endpoint?.trim();
  if (!endpoint) return NextResponse.json({ message: 'חסר endpoint' }, { status: 400 });
  await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
