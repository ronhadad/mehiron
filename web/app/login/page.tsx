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
  const googleError = params.get('googleError');

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

            <a className="google" href="/api/auth/google">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-3.9H24v7.5h11.9c-.2 2-1.5 5-4.4 7l6.7 5.2C42.1 36.2 45 30.7 45 24z" />
                <path fill="#34A853" d="M24 46c5.9 0 10.8-1.9 14.2-5.2l-6.7-5.2c-1.8 1.3-4.3 2.2-7.5 2.2-5.8 0-10.7-3.8-12.4-9.1l-7 5.4C8 41.1 15.4 46 24 46z" />
                <path fill="#FBBC05" d="M11.6 28.7A13.5 13.5 0 0 1 10.9 24c0-1.6.3-3.2.7-4.7l-7-5.4A22 22 0 0 0 2 24c0 3.5.9 6.9 2.6 10.1l7-5.4z" />
                <path fill="#EA4335" d="M24 10.2c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.8 4 29.9 2 24 2 15.4 2 8 6.9 4.6 13.9l7 5.4C13.3 14 18.2 10.2 24 10.2z" />
              </svg>
              המשך עם Google
            </a>

            {googleError && (
              <p className="note bad" style={{ padding: '12px 0 0', border: 0 }}>
                {googleError === 'unconfigured'
                  ? 'התחברות עם Google לא מוגדרת בשרת.'
                  : 'ההתחברות עם Google לא הושלמה. אפשר להיכנס עם הסיסמה במקום.'}
              </p>
            )}

            <div className="or">
              <span>או עם סיסמה</span>
            </div>
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
