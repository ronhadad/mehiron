'use client';

/**
 * The whole app, for now: ask where and when, then show what Google says.
 *
 * The wizard is the flow — one form, then flights and hotels side by side. There
 * is no database yet, so nothing is stored between searches; the point of this
 * screen is that the pipeline is usable end to end before storage exists.
 */
import { useCallback, useState } from 'react';
import type { SearchResponse } from './api/search/route';

interface Destination {
  label: string;
  /** Google entity mid or airport code for flights. */
  flight: string;
  /** A hotel to price on arrival. Editable — this is just a starting point. */
  hotel: string;
}

/**
 * A short list rather than a free-text box, deliberately.
 *
 * Flights need an airport code or a Knowledge Graph mid — "רודוס" alone is not
 * something the flights endpoint can search. Resolving arbitrary text to an
 * entity is its own piece of work; until it exists, offering a box that fails on
 * most input would be worse than offering a few places that work.
 */
const DESTINATIONS: Destination[] = [
  { label: 'רודוס', flight: '/m/07yfd0', hotel: "D'Andrea Mare Beach Hotel Rhodes" },
  { label: 'אתונה', flight: 'ATH', hotel: 'Electra Metropolis Athens' },
  { label: 'כרתים', flight: 'HER', hotel: 'Aquila Atlantis Hotel Heraklion' },
  { label: 'לרנקה', flight: 'LCA', hotel: 'Radisson Blu Hotel Larnaca' },
  { label: 'רומא', flight: 'FCO', hotel: 'Hotel Artemide Rome' },
  { label: 'אילת', flight: 'ETM', hotel: 'ישרוטל ים סוף אילת' },
];

const shekel = (amount: number, currency: string): string =>
  `${currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `}${amount.toLocaleString('en-US')}`;

const minutes = (total: number | null): string => {
  if (total === null) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}ש׳ ${String(m).padStart(2, '0')}ד׳` : `${m}ד׳`;
};

export default function Home(): React.JSX.Element {
  const [destination, setDestination] = useState<Destination>(DESTINATIONS[0] as Destination);
  const [checkin, setCheckin] = useState('2026-10-04');
  const [checkout, setCheckout] = useState('2026-10-08');
  const [adults, setAdults] = useState(2);
  const [childAges, setChildAges] = useState('');
  const [hotel, setHotel] = useState(DESTINATIONS[0]!.hotel);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          destination: destination.flight,
          label: destination.label,
          hotelQuery: hotel,
          checkin,
          checkout,
          adults,
          childAges: childAges
            .split(',')
            .map((age) => Number(age.trim()))
            .filter((age) => Number.isFinite(age)),
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
  }, [destination, hotel, checkin, checkout, adults, childAges]);

  const cheapestFlight = result?.flights.itineraries[0] ?? null;
  const cheapestHotel = result?.hotels.quotes[0] ?? null;
  const total =
    cheapestFlight && cheapestHotel ? cheapestFlight.price + cheapestHotel.total : null;

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
            <label className="f">
              <span className="k">יעד</span>
              <select
                className="input"
                value={destination.label}
                onChange={(e) => {
                  const next = DESTINATIONS.find((d) => d.label === e.target.value) ?? (DESTINATIONS[0] as Destination);
                  setDestination(next);
                  setHotel(next.hotel);
                }}
              >
                {DESTINATIONS.map((d) => (
                  <option key={d.label} value={d.label}>
                    {d.label}
                  </option>
                ))}
              </select>
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
              <span className="k">מלון</span>
              <input className="input" value={hotel} onChange={(e) => setHotel(e.target.value)} />
            </label>

            <label className="f">
              <span className="k">גילי ילדים</span>
              <input
                className="input"
                placeholder="1,8"
                value={childAges}
                onChange={(e) => setChildAges(e.target.value)}
              />
            </label>

            <button className="btn" onClick={() => void search()} disabled={busy}>
              {busy ? 'מחפשים…' : 'חיפוש'}
            </button>
          </div>
        </div>
        <p className="note">
          כל חיפוש מריץ שתי בקשות ל־Google — טיסות ומלונות — ולוקח כשנייה. אין דפדפן ואין שמירה בשלב הזה.
          המלון מחופש בשמו; רשימת כל המלונות באזור היא החלק הבא.
        </p>
      </div>

      {error && (
        <div className="panel" style={{ marginTop: 20, padding: '16px 18px', color: 'var(--rise)' }}>
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="sec">
            <h2>{destination.label}</h2>
            <span className="meta">
              {checkin} → {checkout} · <span className="num">{result.nights}</span> לילות
              {total !== null && (
                <>
                  {' · סה״כ מ־'}
                  <strong className="num">{shekel(total, cheapestHotel?.currency ?? 'ILS')}</strong>
                </>
              )}
            </span>
            <div className="rule" />
          </div>

          {result.photo && (
            <figure style={{ margin: '0 0 22px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.photo.url}
                alt={destination.label}
                style={{
                  width: '100%',
                  height: 260,
                  objectFit: 'cover',
                  borderRadius: 'var(--r-tile)',
                  display: 'block',
                }}
              />
              <figcaption className="credit">
                התמונה נמצאה אוטומטית לפי שם היעד · {result.photo.title} · {result.photo.provider}
              </figcaption>
            </figure>
          )}

          <div className="split">
            <section className="panel">
              <div className="panel-head">
                <h3>טיסות</h3>
                <span className="count">
                  {result.flights.itineraries.length} נמצאו
                </span>
              </div>

              {result.flights.error && <p className="note" style={{ color: 'var(--rise)' }}>{result.flights.error}</p>}
              {!result.flights.error && result.flights.itineraries.length === 0 && (
                <p className="note">אין טיסות בתאריכים האלה — ייתכן שהקו עונתי.</p>
              )}

              {result.flights.itineraries.map((flight) => (
                <div className="row" key={flight.key}>
                  <div className="grow">
                    <div className="name">{flight.airline}</div>
                    <div className="sub">
                      <span className="mono">
                        {flight.departTime ?? '--:--'} → {flight.arriveTime ?? '--:--'}
                      </span>
                      {' · '}
                      {flight.stops === 0 ? 'ישירה' : `${flight.stops ?? '?'} עצירות`}
                      {flight.durationMinutes !== null && ` · ${minutes(flight.durationMinutes)}`}
                      {flight.route && (
                        <>
                          {' · '}
                          <span className="mono">{flight.route}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="price num">{shekel(flight.price, flight.currency)}</div>
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
                <p className="note">לא נמצאו מחירים לחיפוש הזה.</p>
              )}

              {result.hotels.quotes.map((quote, i) => (
                <div className="row" key={quote.company}>
                  <div className="grow">
                    <div className="name">{quote.company}</div>
                    <div className="sub">
                      {quote.nightly !== null && (
                        <>
                          <span className="num">{shekel(quote.nightly, quote.currency)}</span> ללילה
                        </>
                      )}
                      {quote.conditions && ` · ${quote.conditions}`}
                    </div>
                  </div>
                  {i === 0 && <span className="chip best">הזול ביותר</span>}
                  {quote.freeCancellation && <span className="chip down">ביטול חינם</span>}
                  <div className="price num">{shekel(quote.total, quote.currency)}</div>
                </div>
              ))}

              <p className="note">
                המחירים האלה מגיעים מאותה טעינה אחת — לכן אפשר לראות מי מוכר בזול ולעקוב אחרי זה לאורך זמן.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
