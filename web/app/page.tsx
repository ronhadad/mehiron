'use client';

/**
 * The whole app, for now: say where and when, then see what Google says.
 *
 * There is no database yet, so nothing survives a reload; the point of this
 * screen is that the pipeline is usable end to end before storage exists.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Place } from '@server/google/places';
import type { SearchResponse } from './api/search/route';

const money = (amount: number, currency: string): string =>
  `${currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `}${Math.round(amount).toLocaleString('en-US')}`;

const duration = (total: number | null): string => {
  if (total === null) return '';
  const h = Math.floor(total / 60);
  return h > 0 ? `${h}ש׳ ${String(total % 60).padStart(2, '0')}ד׳` : `${total}ד׳`;
};

/** Today plus n days, as `YYYY-MM-DD`, in local time. */
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Home(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [hotel, setHotel] = useState('');
  const [checkin, setCheckin] = useState(inDays(30));
  const [checkout, setCheckout] = useState(inDays(37));
  const [adults, setAdults] = useState(2);
  const [childAges, setChildAges] = useState('');

  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Suggestions are debounced and the response is matched against the query that
   * asked for it — Wikidata answers out of order often enough that a stale reply
   * would otherwise overwrite a newer one.
   */
  const latest = useRef('');
  useEffect(() => {
    const typed = query.trim();
    latest.current = typed;
    if (typed.length < 2 || place?.label === typed) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      void fetch(`/api/places?q=${encodeURIComponent(typed)}`)
        .then((r) => r.json() as Promise<{ places: Place[] }>)
        .then(({ places }) => {
          if (latest.current === typed) setSuggestions(places);
        })
        .catch(() => undefined);
    }, 350);

    return () => clearTimeout(timer);
  }, [query, place]);

  const choose = useCallback((chosen: Place) => {
    setPlace(chosen);
    setQuery(chosen.label);
    setSuggestions([]);
  }, []);

  const search = useCallback(async () => {
    if (!place?.mid) {
      setError('בחרו יעד מהרשימה');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          destination: place.mid,
          label: place.label,
          hotelQuery: hotel.trim() || place.label,
          checkin,
          checkout,
          adults,
          childAges: childAges.split(',').map((a) => Number(a.trim())).filter(Number.isFinite),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `שגיאת שרת (${response.status})`);
      }
      setResult((await response.json()) as SearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'החיפוש נכשל');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [place, hotel, checkin, checkout, adults, childAges]);

  const flight = result?.flights.itineraries[0] ?? null;
  const stay = result?.hotels.quotes[0] ?? null;
  const currency = stay?.currency ?? flight?.currency ?? 'ILS';
  const total = flight && stay ? flight.price + stay.total : null;

  return (
    <div className="wrap">
      <header className="mast">
        <div className="mark">
          מחיר<span>ון</span>
        </div>
        <div className="spacer" />
        <span className="eyebrow">טיסות ומלונות · מתוך Google</span>
      </header>

      <div className="sec">
        <h2>חופשה חדשה</h2>
        <span className="meta">לאן, מתי, כמה אנשים — ואנחנו מחפשים את שניהם יחד</span>
        <div className="rule" />
      </div>

      <div className="panel">
        <div className="wizard">
          <div className="fields">
            <label className="f" style={{ position: 'relative' }}>
              <span className="k">יעד</span>
              <input
                className="input"
                value={query}
                placeholder="רודוס, ברצלונה, ETM…"
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPlace(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && suggestions[0]) choose(suggestions[0]);
                }}
              />
              {suggestions.length > 0 && (
                <ul className="suggest">
                  {suggestions.map((s) => (
                    <li key={s.wikidataId}>
                      <button type="button" onClick={() => choose(s)}>
                        <span className="s-label">{s.label}</span>
                        {s.description && <span className="s-desc">{s.description}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>

            <label className="f">
              <span className="k">צ׳ק-אין</span>
              <input className="input mono" type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
            </label>

            <label className="f">
              <span className="k">צ׳ק-אאוט</span>
              <input className="input mono" type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
            </label>

            <label className="f">
              <span className="k">מבוגרים</span>
              <input
                className="input num"
                type="number"
                min={1}
                max={9}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
              />
            </label>

            <label className="f">
              <span className="k">גילי ילדים</span>
              <input className="input" placeholder="1,8" value={childAges} onChange={(e) => setChildAges(e.target.value)} />
            </label>

            <label className="f">
              <span className="k">מלון (לא חובה)</span>
              <input
                className="input"
                placeholder="שם מלון מסוים"
                value={hotel}
                onChange={(e) => setHotel(e.target.value)}
              />
            </label>

            <button className="btn" onClick={() => void search()} disabled={busy || !place?.mid}>
              {busy ? 'מחפשים…' : 'חיפוש'}
            </button>
          </div>
        </div>
        <p className="note">
          כל יעד בעולם — הקלידו בעברית או באנגלית ובחרו מהרשימה. כל חיפוש מריץ שתי בקשות ל־Google, טיסות ומלונות,
          ולוקח כשנייה. אין דפדפן ואין שמירה בשלב הזה.
        </p>
      </div>

      {error && (
        <div className="panel" style={{ marginTop: 20, padding: '16px 18px', color: 'var(--rise)' }}>
          {error}
        </div>
      )}

      {result && place && (
        <>
          {/* The signature card from the design: the photograph is the surface,
              and the prices sit on a plate over it. */}
          <div className="hero" style={{ marginTop: 30 }}>
            {result.photo && <img src={result.photo.url} alt={place.label} />}
            <div className="hero-body">
              <div className="place">{place.label}</div>
              <div className="when">
                <span className="mono">{checkin}</span> → <span className="mono">{checkout}</span> ·{' '}
                <span className="num">{result.nights}</span> לילות · <span className="num">{adults}</span> מבוגרים
                {childAges.trim() && `, ילדים בני ${childAges}`}
              </div>
              <div className="legs">
                <div className="leg">
                  <span className="k">טיסה</span>
                  <span className="v num">{flight ? money(flight.price, flight.currency) : '—'}</span>
                </div>
                <div className="leg">
                  <span className="k">מלון</span>
                  <span className="v num">{stay ? money(stay.total, stay.currency) : '—'}</span>
                </div>
              </div>
              {total !== null && (
                <div className="total">
                  <span className="amt num">{money(total, currency)}</span>
                  <span className="lbl">סה״כ לחופשה</span>
                </div>
              )}
            </div>
          </div>
          {result.photo && (
            <p className="credit">התמונה נמצאה אוטומטית לפי שם היעד · {result.photo.title} · {result.photo.provider}</p>
          )}

          <div className="split" style={{ marginTop: 22 }}>
            <section className="panel">
              <div className="panel-head">
                <h3>טיסות</h3>
                <span className="count">{result.flights.itineraries.length} נמצאו</span>
              </div>

              {result.flights.error && <p className="note" style={{ color: 'var(--rise)' }}>{result.flights.error}</p>}
              {!result.flights.error && result.flights.itineraries.length === 0 && (
                <p className="note">אין טיסות בתאריכים האלה — ייתכן שהקו עונתי.</p>
              )}

              {result.flights.itineraries.map((f) => (
                <div className="row" key={f.key}>
                  <div className="grow">
                    <div className="name">{f.airline}</div>
                    <div className="sub">
                      <span className="mono">
                        {f.departTime ?? '--:--'} → {f.arriveTime ?? '--:--'}
                      </span>
                      {' · '}
                      {f.stops === 0 ? 'ישירה' : `${f.stops ?? '?'} עצירות`}
                      {f.durationMinutes !== null && ` · ${duration(f.durationMinutes)}`}
                      {f.route && (
                        <>
                          {' · '}
                          <span className="mono">{f.route}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="price num">{money(f.price, f.currency)}</div>
                </div>
              ))}

              <p className="note">
                Google שולחת רק את הטיסות ה״מומלצות״ ב־HTML הראשוני, לכן זו לא כל הרשימה — אבל הזולה תמיד ביניהן.
              </p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h3>מלונות</h3>
                <span className="count">{result.hotels.quotes.length} חברות</span>
              </div>

              {result.hotels.error && <p className="note" style={{ color: 'var(--rise)' }}>{result.hotels.error}</p>}
              {!result.hotels.error && result.hotels.quotes.length === 0 && (
                <p className="note">לא נמצאו מחירים. נסו שם של מלון מסוים בשדה &quot;מלון&quot;.</p>
              )}

              {result.hotels.quotes.map((q, i) => (
                <div className="row" key={q.company}>
                  <div className="grow">
                    <div className="name">{q.company}</div>
                    <div className="sub">
                      {q.nightly !== null && (
                        <>
                          <span className="num">{money(q.nightly, q.currency)}</span> ללילה
                        </>
                      )}
                      {q.conditions && ` · ${q.conditions}`}
                    </div>
                  </div>
                  {i === 0 && <span className="chip best">הזול ביותר</span>}
                  {q.freeCancellation && <span className="chip down">ביטול חינם</span>}
                  <div className="price num">{money(q.total, q.currency)}</div>
                </div>
              ))}

              <p className="note">
                כל המחירים האלה מגיעים מטעינה אחת — לכן אפשר לראות מי מוכר בזול, ובהמשך לעקוב אחרי זה לאורך זמן.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
