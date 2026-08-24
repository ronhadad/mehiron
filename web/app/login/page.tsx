'use client';

/**
 * The sign-in screen.
 *
 * Also the place a misconfigured deployment lands, because the middleware sends
 * it here with `?setup=` naming what is missing — an app that refuses every
 * request should say why rather than looking broken.
 */
import { Suspense, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/*
 * `useSearchParams` cannot be prerendered, so the form sits behind a Suspense
 * boundary. Forcing the whole page dynamic would work too, but this keeps the
 * shell static and only defers the part that actually needs the URL.
 */
export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense fallback={<main className="gate" />}>
      <Login />
    </Suspense>
  );
}

function Login(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const setup = params.get('setup');
  const next = params.get('next') ?? '/';

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? 'ההתחברות נכשלה');
      }
      // A full navigation, so the middleware sees the new cookie.
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההתחברות נכשלה');
      setBusy(false);
    }
  }, [password, next, router]);

  return (
    <main className="gate">
      <div className="panel pad" style={{ width: '100%', maxWidth: 420 }}>
        <div className="mark" style={{ marginBottom: 6 }}>
          <b>מחירון</b>
          <span>טיסות ומלונות</span>
        </div>

        {setup ? (
          <>
            <h1 className="page" style={{ fontSize: 28, margin: '10px 0 8px' }}>
              האפליקציה לא מוגדרת
            </h1>
            <p className="lede" style={{ marginBottom: 14 }}>
              חסר <span className="num">{setup}</span>. עד שיוגדר, כל בקשה נדחית — כדי שפריסה בלי הגדרות לא תהיה פריסה
              פתוחה.
            </p>
            <p className="note" style={{ padding: 0, border: 0 }}>
              הגדירו את המשתנים בסביבה (ב־Vercel: Settings → Environment Variables), ואז טענו מחדש.
            </p>
          </>
        ) : (
          <>
            <h1 className="page" style={{ fontSize: 28, margin: '10px 0 14px' }}>
              התחברות
            </h1>
            <label className="f">
              <span className="k">סיסמה</span>
              <input
                className="input"
                type="password"
                value={password}
                autoFocus
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
              />
            </label>

            <button
              className="btn"
              onClick={() => void submit()}
              disabled={busy || !password}
              style={{ marginTop: 16, width: '100%' }}
            >
              {busy ? 'בודקים…' : 'כניסה'}
            </button>

            {error && (
              <p className="note bad" style={{ padding: '12px 0 0', border: 0 }}>
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
