'use client';

/**
 * The groups. Each saved חופשה is a card with its destination photograph, the
 * cheapest flight and hotel found so far, and how the price moved.
 *
 * Creating one is the whole flow: where to fly, when, how many — then the group
 * exists and starts collecting prices. "Where to sleep" is deliberately not
 * asked here; it is filled in by the hotels added inside the group.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  adultsLabel,
  createVacation,
  hebrewDate,
  inDays,
  listVacations,
  mapUrl,
  money,
  movement,
  nightsBetween,
  nightsLabel,
  searchPlaces,
  type Place,
  type VacationWithOptions,
} from '@/lib/api';

export default function Home(): React.JSX.Element {
  const [vacations, setVacations] = useState<VacationWithOptions[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    void listVacations()
      .then(({ vacations: rows }) => setVacations(rows))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const watched = (vacations ?? []).flatMap((v) => v.options);
  const priced = watched.filter((o) => o.lastPrice !== null);

  return (
    <>
      <header className="mast">
        <div className="mark">
          <b>מחירון</b>
          <span>טיסות ומלונות</span>
        </div>
        <nav className="nav" aria-label="ניווט ראשי">
          <button type="button" aria-current="page">
            החופשות שלי
          </button>
        </nav>
        <div className="spacer" />
        <div className="live">
          <span className="dot idle" />
          <span>{vacations === null ? 'טוענים…' : `${watched.length} פריטים במעקב`}</span>
        </div>
        <button className="btn" onClick={() => setCreating((v) => !v)}>
          {creating ? 'סגירה' : 'חופשה חדשה'}
        </button>
        <button
          className="link"
          onClick={() => {
            void fetch('/api/auth', { method: 'DELETE' }).then(() => {
              // A full navigation, so the middleware sees the cleared cookie.
              window.location.href = '/login';
            });
          }}
        >
          יציאה
        </button>
      </header>

      <main>
        <div className="head">
          <div>
            <h1 className="page">החופשות שלי</h1>
            <p className="lede">
              {vacations === null
                ? 'טוענים את החופשות…'
                : vacations.length === 0
                  ? 'עוד אין חופשות. צרו אחת, ונתחיל לאסוף מחירים.'
                  : `${vacations.length} חופשות · ${priced.length} מתוך ${watched.length} פריטים עם מחיר`}
            </p>
          </div>
          <div className="spacer" />
          <div className="stats">
            <div className="stat">
              <div className="k">חופשות</div>
              <div className="v num">{vacations?.length ?? '—'}</div>
            </div>
            <div className="stat">
              <div className="k">במעקב</div>
              <div className="v num">{watched.length}</div>
            </div>
            <div className="stat">
              <div className="k">מועדפים</div>
              <div className="v num accent">{watched.filter((o) => o.favorite).length}</div>
            </div>
          </div>
        </div>

        {creating && <NewVacation onCreated={() => { setCreating(false); load(); }} />}

        {error && (
          <div className="panel pad" style={{ marginBottom: 20, color: 'var(--up-ink)' }}>
            {error}
          </div>
        )}

        <div className="cards">
          {(vacations ?? []).map((v) => (
            <VacationCard key={v.id} vacation={v} />
          ))}

          {vacations !== null && !creating && (
            <button className="dashed" onClick={() => setCreating(true)}>
              <span className="plus" aria-hidden="true">
                +
              </span>
              <b>חופשה חדשה</b>
              <span>לאן לטוס, מתי, כמה אנשים. את המלונות מוסיפים אחר כך מתוך החופשה.</span>
            </button>
          )}
        </div>
      </main>
    </>
  );
}

function VacationCard({ vacation }: { vacation: VacationWithOptions }): React.JSX.Element {
  const flights = vacation.options.filter((o) => o.kind === 'FLIGHT');
  const hotels = vacation.options.filter((o) => o.kind === 'HOTEL');
  const cheapestFlight = flights.filter((o) => o.lastPrice !== null).sort((a, b) => a.lastPrice! - b.lastPrice!)[0];
  const cheapestHotel = hotels.filter((o) => o.lastPrice !== null).sort((a, b) => a.lastPrice! - b.lastPrice!)[0];
  const total =
    cheapestFlight?.lastPrice != null && cheapestHotel?.lastPrice != null
      ? cheapestFlight.lastPrice + cheapestHotel.lastPrice
      : null;

  const moves = vacation.options.map((o) => movement(o.lastPrice, o.previousPrice));
  const down = moves.filter((m) => m === 'down').length;
  const up = moves.filter((m) => m === 'up').length;
  const nights = nightsBetween(vacation.checkin, vacation.checkout);

  return (
    <Link href={`/vacations/${vacation.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="strip">
        <div className="shot">
          {vacation.imageUrl ? (
            <img src={vacation.imageUrl} alt={vacation.destinationLabel} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'var(--surface-3)' }} />
          )}
          <span className="cap">
            <b>{vacation.destinationLabel}</b>
            <span>
              {nightsLabel(nights)} · {adultsLabel(vacation.adults)}
              {vacation.childAges.length > 0 && `, ${vacation.childAges.length} ילדים`}
            </span>
          </span>
        </div>
        {vacation.latitude !== null && vacation.longitude !== null && (
          <div className="shot" style={{ maxWidth: '42%' }}>
            <iframe
              title={`מפה של ${vacation.destinationLabel}`}
              src={mapUrl(vacation.latitude, vacation.longitude)}
              style={{ width: '100%', height: '100%', border: 0, filter: 'saturate(.85)' }}
              loading="lazy"
            />
          </div>
        )}
      </div>

      <div className="body">
        <div className="title">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="name">{vacation.name}</div>
            <div className="when">
              {hebrewDate(vacation.checkin)} – {hebrewDate(vacation.checkout)}
            </div>
          </div>
          <span className="badge">
            {cheapestFlight ? `${vacation.originAirport} → ${vacation.destinationLabel}` : vacation.destinationLabel}
          </span>
        </div>

        <div className="tiles">
          {cheapestFlight ? (
            <div className="tile">
              <div className="k">טיסה</div>
              <div className="v num">{money(cheapestFlight.lastPrice, vacation.currency)}</div>
            </div>
          ) : (
            <div className="tile">
              <div className="k">טיסה</div>
              <div className="v" style={{ fontSize: 14, color: 'var(--faint)' }}>לא במעקב</div>
            </div>
          )}
          <div className="tile">
            <div className="k">מלון</div>
            <div className="v num">{money(cheapestHotel?.lastPrice ?? null, vacation.currency)}</div>
          </div>
          <div className="tile">
            <div className="k">מלונות במעקב</div>
            <div className="v num">
              {hotels.length}
              <small>🛏</small>
            </div>
          </div>
        </div>

        <div className="foot">
          {down > 0 && <span className="chip down">↓ {down} ירדו</span>}
          {up > 0 && <span className="chip up">↑ {up} עלו</span>}
          {down === 0 && up === 0 && <span className="chip">אין שינוי עדיין</span>}
          <div className="total">
            <div className="k">סה״כ לחופשה</div>
            <div className="v num">{money(total, vacation.currency)}</div>
          </div>
        </div>

        <div className="live" style={{ fontSize: 12.5 }}>
          <span className="dot idle" />
          <span>
            {vacation.lastCheckedAt
              ? `נבדק ${hebrewDate(vacation.lastCheckedAt)} · כל ${Math.round(vacation.intervalSeconds / 60)} דק׳`
              : 'עוד לא נבדק'}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Where to fly, when, how many. Nothing about hotels — those come later. */
function NewVacation({ onCreated }: { onCreated: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('TLV');
  const [trackFlights, setTrackFlights] = useState(true);
  const [checkin, setCheckin] = useState(inDays(30));
  const [checkout, setCheckout] = useState(inDays(37));
  const [adults, setAdults] = useState(2);
  const [childAges, setChildAges] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef('');
  useEffect(() => {
    const typed = query.trim();
    latest.current = typed;
    if (typed.length < 2 || place?.label === typed) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchPlaces(typed)
        .then(({ places }) => {
          if (latest.current === typed) setSuggestions(places);
        })
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, place]);

  const submit = useCallback(async () => {
    if (!place?.mid) {
      setError('בחרו יעד מהרשימה — צריך את המזהה של Google כדי לחפש טיסות.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createVacation({
        name: name.trim() || place.label,
        destinationLabel: place.label,
        destinationMid: place.mid,
        wikidataId: place.wikidataId,
        latitude: place.latitude ?? null,
        longitude: place.longitude ?? null,
        originAirport: origin.trim().toUpperCase() || 'TLV',
        trackFlights,
        checkin,
        checkout,
        adults,
        childAges: childAges.split(',').map((a) => Number(a.trim())).filter(Number.isFinite),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת החופשה נכשלה');
    } finally {
      setBusy(false);
    }
  }, [place, name, origin, trackFlights, checkin, checkout, adults, childAges, onCreated]);

  return (
    <div className="panel" style={{ marginBottom: 24 }}>
      <div className="panel-head">
        <h2>חופשה חדשה</h2>
        <span className="count">לאן לטוס, מתי, כמה אנשים</span>
      </div>

      <div style={{ padding: 22 }}>
        <div className="fields">
          <label className="f">
            <span className="k">לאן טסים</span>
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
                if (e.key === 'Enter' && suggestions[0]) {
                  setPlace(suggestions[0]);
                  setQuery(suggestions[0].label);
                  setSuggestions([]);
                }
              }}
            />
            {suggestions.length > 0 && (
              <ul className="suggest">
                {suggestions.map((s) => (
                  <li key={s.wikidataId}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlace(s);
                        setQuery(s.label);
                        setSuggestions([]);
                      }}
                    >
                      <span className="s-label">{s.label}</span>
                      {s.description && <span className="s-desc">{s.description}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </label>

          {trackFlights && (
            <label className="f">
              <span className="k">משדה</span>
              <input className="input" value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </label>
          )}

          <label className="f">
            <span className="k">צ׳ק-אין</span>
            <input className="input num" type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
          </label>

          <label className="f">
            <span className="k">צ׳ק-אאוט</span>
            <input className="input num" type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
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
            <span className="k">שם החופשה</span>
            <input className="input" placeholder={place?.label ?? 'רודוס בספטמבר'} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="f">
            <span className="k">מה לעקוב</span>
            <button
              type="button"
              className="fchip"
              aria-pressed={trackFlights}
              onClick={() => setTrackFlights((v) => !v)}
            >
              {trackFlights ? '✓ טיסות' : 'בלי טיסות'}
            </button>
          </div>

          <button className="btn" onClick={() => void submit()} disabled={busy || !place?.mid}>
            {busy ? 'שומרים…' : 'שמירת חופשה'}
          </button>
        </div>

        {place?.latitude != null && place.longitude != null && (
          <div style={{ marginTop: 16, borderRadius: 'var(--r-field)', overflow: 'hidden', border: '1px solid var(--line)' }}>
            <iframe
              title={`מפה של ${place.label}`}
              src={mapUrl(place.latitude, place.longitude)}
              style={{ width: '100%', height: 220, border: 0 }}
              loading="lazy"
            />
          </div>
        )}

        <label className="f" style={{ marginTop: 14, maxWidth: 260 }}>
          <span className="k">גילי ילדים (אם יש)</span>
          <input className="input" placeholder="1,8" value={childAges} onChange={(e) => setChildAges(e.target.value)} />
        </label>
      </div>

      {error && <p className="note bad">{error}</p>}
      <p className="note">
        אחרי השמירה נכנסים לחופשה ומוסיפים מלונות למעקב — הם מה שממלא את &quot;איפה לישון&quot;. התאריכים והנוסעים
        נקבעים פעם אחת וחלים על הטיסות ועל כל המלונות.
      </p>
    </div>
  );
}
