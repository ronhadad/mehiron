'use client';

/**
 * One חופשה: the flights being followed, the hotels that make up "where to
 * sleep", and the price history behind each of them.
 *
 * Adding a hotel here is the only way lodging enters the group — the dates and
 * the travellers are already settled, so a hotel needs nothing but its name.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { INTERVALS } from '@server/domain/vacations';
import {
  addHotel,
  adultsLabel,
  checkVacation,
  companiesLabel,
  deleteVacation,
  getVacation,
  hebrewDate,
  hotelsLabel,
  isoDate,
  mapUrl,
  money,
  movement,
  nightsBetween,
  nightsLabel,
  plot,
  priceIndexLabel,
  recommendHotels,
  removeOption,
  seriesOf,
  setBooked,
  setFavorite,
  shortTime,
  suggestHotels,
  type HotelSuggestion,
  type OptionRow,
  type Point,
  type VacationWithOptions,
  updateVacation,
  watchFlights,
} from '@/lib/api';
import type { PriceIndex, Recommendation } from '@/lib/api';

export default function VacationPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [editing, setEditing] = useState(false);

  const [vacation, setVacation] = useState<VacationWithOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  const load = useCallback(() => {
    void getVacation(id)
      .then(({ vacation: v }) => setVacation(v))
      .catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const check = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { outcome } = await checkVacation(id);
      load();
      setToast({
        title: `נבדקו ${outcome.checked} פריטים`,
        body:
          outcome.drops.length > 0
            ? `${outcome.drops.length} מחירים ירדו.`
            : outcome.failed > 0
              ? `${outcome.failed} בדיקות נכשלו — ההיסטוריה מתעדת גם את זה.`
              : 'ללא שינוי במחירים.',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הבדיקה נכשלה');
    } finally {
      setBusy(false);
    }
  }, [id, load]);

  if (error && !vacation) {
    return (
      <main>
        <p className="lede">{error}</p>
        <Link href="/" className="link">
          ← חזרה לחופשות
        </Link>
      </main>
    );
  }
  if (!vacation) {
    return (
      <main>
        <p className="lede">טוענים…</p>
      </main>
    );
  }

  const flights = vacation.options.filter((o) => o.kind === 'FLIGHT');
  const hotels = vacation.options.filter((o) => o.kind === 'HOTEL');
  const nights = nightsBetween(vacation.checkin, vacation.checkout);
  const cheapestFlight = flights.filter((o) => o.lastPrice !== null).sort((a, b) => a.lastPrice! - b.lastPrice!)[0];
  const cheapestHotel = hotels.filter((o) => o.lastPrice !== null).sort((a, b) => a.lastPrice! - b.lastPrice!)[0];
  const total =
    cheapestFlight?.lastPrice != null && cheapestHotel?.lastPrice != null
      ? cheapestFlight.lastPrice + cheapestHotel.lastPrice
      : null;

  return (
    <>
      <header className="mast">
        <div className="mark">
          <b>מחירון</b>
          <span>טיסות ומלונות</span>
        </div>
        <nav className="nav">
          <Link href="/" className="link" style={{ padding: '8px 14px' }}>
            ← החופשות שלי
          </Link>
        </nav>
        <div className="spacer" />
        <div className="live">
          <span className={`dot ${busy ? 'busy' : 'idle'}`} />
          <span>
            {busy
              ? 'בודקים ב־Google…'
              : vacation.lastCheckedAt
                ? `נבדק ${hebrewDate(vacation.lastCheckedAt)}`
                : 'עוד לא נבדק'}
          </span>
        </div>
        <button className="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? 'סגירה' : 'עריכה'}
        </button>
        <button className="btn" onClick={() => void check()} disabled={busy}>
          {busy ? 'בודקים…' : 'בדיקה עכשיו'}
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
            <h1 className="page">{vacation.name}</h1>
            <p className="lede">
              {vacation.originAirport} → {vacation.destinationLabel} · {hebrewDate(vacation.checkin)} –{' '}
              {hebrewDate(vacation.checkout)} · {nightsLabel(nights)} · {adultsLabel(vacation.adults)}
              {vacation.childAges.length > 0 && `, ילדים בני ${vacation.childAges.join(', ')}`}
            </p>
          </div>
          <div className="spacer" />
          <div className="stats">
            <div className="stat">
              <div className="k">טיסה</div>
              <div className="v num">{money(cheapestFlight?.lastPrice ?? null, vacation.currency)}</div>
            </div>
            <div className="stat">
              <div className="k">מלון</div>
              <div className="v num">{money(cheapestHotel?.lastPrice ?? null, vacation.currency)}</div>
            </div>
            <div className="stat">
              <div className="k">סה״כ</div>
              <div className="v num accent">{money(total, vacation.currency)}</div>
            </div>
          </div>
        </div>

        {editing && (
          <EditVacation
            vacation={vacation}
            onSaved={() => {
              setEditing(false);
              load();
            }}
            onDeleted={() => router.push('/')}
          />
        )}

        {(vacation.imageUrl || vacation.latitude !== null) && (
          <>
            <div className="hero" style={{ minHeight: 260 }}>
              {vacation.imageUrl && <img src={vacation.imageUrl} alt={vacation.destinationLabel} />}
              <div className="body">
                <div className="place">{vacation.destinationLabel}</div>
                <div className="when">
                  {hebrewDate(vacation.checkin)} – {hebrewDate(vacation.checkout)} · <span className="num">{nights}</span>{' '}
                  לילות
                </div>
              </div>
            </div>
            {vacation.latitude !== null && vacation.longitude !== null && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 'var(--r-card)',
                  overflow: 'hidden',
                  border: '1px solid var(--line)',
                }}
              >
                <iframe
                  title={`מפה של ${vacation.destinationLabel}`}
                  src={mapUrl(vacation.latitude, vacation.longitude, 0.6)}
                  style={{ width: '100%', height: 260, border: 0, display: 'block' }}
                  loading="lazy"
                />
              </div>
            )}
            <p className="credit">
              {vacation.imageAttribution && <>תמונה: {vacation.imageAttribution} · {vacation.imageProvider} · </>}
              מפה: OpenStreetMap · מזהה החיפוש ב־Google: <span className="num">{vacation.destinationMid}</span>
            </p>
          </>
        )}

        {error && <div className="panel pad" style={{ marginTop: 18, color: 'var(--up-ink)' }}>{error}</div>}

        <div className="split" style={{ marginTop: 22 }}>
          <section className="panel">
            <div className="panel-head">
              <h2>טיסות</h2>
              <span className="count">{flights.length} במעקב</span>
              <div className="spacer" />
              {cheapestFlight?.route && <span className="chip info">{cheapestFlight.route}</span>}
              {vacation.priceIndex && (
                <span
                  className={`chip ${vacation.priceIndex === 'low' ? 'down' : vacation.priceIndex === 'high' ? 'up' : ''}`}
                  title="השיפוט של Google על המסלול הזה, לא שלנו — הוא מכיר מחירים שאנחנו לא ראינו"
                >
                  {priceIndexLabel(vacation.priceIndex as PriceIndex)}
                </span>
              )}
            </div>
            {flights.map((o) => (
              <OptionRowView key={o.id} option={o} currency={vacation.currency} onChanged={load} />
            ))}
            {flights.length > 0 ? (
              <p className="note">
                מעקב הטיסה הזולה עוקב אחרי מה שזול בתאריכים האלה, גם בלי לבחור טיסה מסוימת — כך טיסה שתופיע
                מחר לא תתפספס.
              </p>
            ) : (
              <div className="note" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 180 }}>
                  החופשה הזאת לא עוקבת אחרי טיסות. אם נוסעים ברכב אין מה לעקוב — ואם כן, אפשר להוסיף.
                </span>
                <button
                  className="ghost"
                  onClick={() => void watchFlights(id).then(load)}
                >
                  מעקב אחרי הטיסה הזולה
                </button>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>איפה לישון</h2>
              <span className="count">{hotelsLabel(hotels.length)} במעקב</span>
              <div className="spacer" />
              <span className="chip">
                <span className="num">{nights}</span> לילות
              </span>
            </div>
            {hotels.map((o) => (
              <OptionRowView key={o.id} option={o} currency={vacation.currency} onChanged={load} />
            ))}
            {hotels.length === 0 && (
              <p className="note">
                עוד לא נוספו מלונות. הוסיפו מלון למטה — הוא מה שממלא את &quot;איפה לישון&quot;, ויתומחר לתאריכים
                ולנוסעים של החופשה הזאת.
              </p>
            )}
            <Recommendations vacationId={id} currency={vacation.currency} nights={nights} onAdded={load} />
            <AddHotel vacationId={id} onAdded={load} />
          </section>
        </div>
      </main>

      {toast && (
        <div className="toast">
          <div className="ok">✓</div>
          <div style={{ flex: 1 }}>
            <b>{toast.title}</b>
            <span>{toast.body}</span>
          </div>
          <button onClick={() => setToast(null)} aria-label="סגירה">
            ×
          </button>
        </div>
      )}
    </>
  );
}

/** One watched thing: its price, how it moved, and its recent history. */
function OptionRowView({
  option,
  currency,
  onChanged,
}: {
  option: OptionRow;
  currency: string;
  onChanged: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const dir = movement(option.lastPrice, option.previousPrice);
  const delta =
    option.lastPrice !== null && option.previousPrice !== null ? Math.abs(option.lastPrice - option.previousPrice) : null;

  // Only successful checks have a price to plot; failures would read as a
  // crash to zero.
  const series = [...option.snapshots]
    .reverse()
    .filter((s) => s.price !== null)
    .map((s) => s.price as number);
  const cheapest = option.snapshots.find((s) => s.status === 'OK');

  const history = seriesOf(option, days);

  /*
   * Money back rather than a missed opportunity. Only shown when the current
   * price is genuinely below what was paid — and for a hotel, only when some
   * company still offers free cancellation, because without it the saving is
   * theoretical: there is no way to take the cheaper rate.
   */
  const freeCancellation = cheapest?.quotes.some((q) => q.freeCancellation) ?? false;
  const saving =
    option.bookedPrice !== null && option.lastPrice !== null
      ? Math.round(option.bookedPrice - option.lastPrice)
      : null;
  const canRebook = saving !== null && saving >= 20 && (option.kind === 'FLIGHT' || freeCancellation);

  return (
    <>
    <div className="row">
      <button
        className="link"
        title={option.favorite ? 'הסרה מהמועדפים' : 'סימון כמועדף'}
        onClick={() => void setFavorite(option.id, !option.favorite).then(onChanged)}
        style={{ color: option.favorite ? 'var(--accent)' : 'var(--edge-soft)', fontSize: 17 }}
      >
        ★
      </button>
      <div className={`glyph ${option.kind === 'HOTEL' ? 'hotel' : 'flight'}`}>
        {option.kind === 'HOTEL' ? '🛏' : '✈'}
      </div>
      <div className="grow">
        <div className="name">{option.title}</div>
        <div className="sub">
          {option.kind === 'FLIGHT' ? (
            <>
              {option.departTime && (
                <span className="num">
                  {option.departTime} → {option.arriveTime ?? '--:--'}
                </span>
              )}
              {option.stops !== null && ` · ${option.stops === 0 ? 'ישירה' : `${option.stops} עצירות`}`}
              {option.route && ` · ${option.route}`}
              {option.lastStatus === 'FAILED' && ' · הבדיקה האחרונה נכשלה'}
              {option.lastStatus === 'EMPTY' && ' · לא הופיעה בבדיקה האחרונה'}
            </>
          ) : (
            <>
              {cheapest?.cheapestCompany && <>הזול: {cheapest.cheapestCompany}</>}
              {cheapest?.quotes.length ? ` · ${companiesLabel(cheapest.quotes.length)}` : ''}
              {option.lastStatus === 'EMPTY' && ' · Google לא הציגה מחירים בבדיקה האחרונה'}
              {option.lastStatus === 'FAILED' && ' · הבדיקה האחרונה נכשלה'}
            </>
          )}
        </div>
        {canRebook && (
          <div style={{ marginTop: 7 }}>
            <span className="chip best" title="מחיר נוכחי נמוך ממה ששילמת">
              💸 {money(saving, currency)} בחזרה אם מזמינים מחדש
              {option.kind === 'HOTEL' && freeCancellation ? ' · ביטול חינם' : ''}
            </span>
          </div>
        )}
        {cheapest && cheapest.quotes.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
            {cheapest.quotes.map((q, i) => (
              <span key={q.id} className={`chip ${i === 0 ? 'best' : q.freeCancellation ? 'down' : ''}`}>
                {q.company} {money(q.price, q.currency)}
              </span>
            ))}
          </div>
        )}
      </div>

      {series.length > 1 && <Sparkline values={series} direction={dir} />}

      <div className="price">
        <div className="v num">{money(option.lastPrice, currency)}</div>
        {delta !== null && delta > 0 && (
          <div className="k">
            <span className={`chip ${dir}`}>
              {dir === 'down' ? '↓' : '↑'} {money(delta, currency)}
            </span>
          </div>
        )}
        {option.lowestPrice !== null && option.lowestPrice !== option.lastPrice && (
          <div className="k">
            שפל: <span className="num">{money(option.lowestPrice, currency)}</span>
          </div>
        )}
      </div>

      <button
        className="link"
        title={open ? 'סגירת הגרף' : 'הצגת היסטוריית מחירים'}
        onClick={() => setOpen((v) => !v)}
        style={{ fontSize: 15 }}
        aria-expanded={open}
      >
        {open ? '⌃' : '⌄'}
      </button>

      {!(option.kind === 'FLIGHT' && option.matchKey === null) && (
        <button
          className="link"
          title="הסרה מהמעקב"
          onClick={() => void removeOption(option.id).then(onChanged)}
          style={{ fontSize: 16 }}
        >
          ×
        </button>
      )}
    </div>

    {open && (
      <div className="history">
        <div className="history-head">
          <div>
            <div className="k">היסטוריית מחירים</div>
            <div className="range">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  className="fchip"
                  aria-pressed={days === d}
                  onClick={() => setDays(d)}
                >
                  {d} ימים
                </button>
              ))}
            </div>
          </div>
          <div className="spacer" />
          {history.length > 0 && (
            <div style={{ textAlign: 'end', fontSize: 12.5, color: 'var(--muted)' }}>
              <div>
                שפל <span className="num">{money(Math.min(...history.map((p) => p.price)), currency)}</span>
              </div>
              <div>
                שיא <span className="num">{money(Math.max(...history.map((p) => p.price)), currency)}</span>
              </div>
            </div>
          )}
        </div>

        <BookedPrice option={option} currency={currency} onChanged={onChanged} />
        <PriceChart points={history} currency={currency} target={option.targetPrice} />

        {option.snapshots.length > 0 && (
          <table className="log">
            <tbody>
              {option.snapshots.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <td className="num">{shortTime(new Date(s.checkedAt))}</td>
                  <td>{s.price === null ? '—' : <span className="num">{money(s.price, s.currency ?? currency)}</span>}</td>
                  <td>
                    {s.status === 'OK' ? (
                      s.cheapestCompany ?? 'נמצא'
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>{s.note ?? s.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )}
    </>
  );
}

/**
 * The price line for one option.
 *
 * A single point is drawn as a dot rather than a line, and an empty series says
 * so instead of rendering an empty box — the two states people actually hit
 * early on, when there is one check or none.
 */
function PriceChart({
  points,
  currency,
  target,
}: {
  points: Point[];
  currency: string;
  target: number | null;
}): React.JSX.Element {
  const W = 640;
  const H = 180;
  const geometry = plot(points, W, H, target);

  if (!geometry) {
    return (
      <p className="note" style={{ padding: '18px 0 6px', border: 0 }}>
        עוד אין מחירים בטווח הזה. כל בדיקה מוסיפה נקודה — נסו טווח ארוך יותר, או הריצו בדיקה עכשיו.
      </p>
    );
  }

  return (
    <>
      {/* Not scaled horizontally: time reads left-to-right even in an RTL page,
          because the newest price belongs at the end of the line people scan. */}
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="גרף מחירים">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--line-soft)" strokeWidth={1} />
        ))}
        {geometry.targetY !== null && (
          <line
            x1={0}
            x2={W}
            y1={geometry.targetY}
            y2={geometry.targetY}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />
        )}
        <polyline points={geometry.area} fill="rgba(46,158,107,.11)" stroke="none" />
        <polyline
          points={geometry.line}
          fill="none"
          stroke="var(--down)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={geometry.last.x} cy={geometry.last.y} r={5} fill="var(--down)" stroke="var(--surface)" strokeWidth={2.5} />
      </svg>
      <div className="axis">
        <span className="num">{shortTime(points[0]!.at)}</span>
        <span>
          <span className="num">{points.length}</span> בדיקות עם מחיר
          {target !== null && (
            <>
              {' · יעד '}
              <span className="num">{money(target, currency)}</span>
            </>
          )}
        </span>
        <span className="num">{shortTime(points[points.length - 1]!.at)}</span>
      </div>
    </>
  );
}

/** A price line, scaled to its own range so small moves stay visible. */
function Sparkline({ values, direction }: { values: number[]; direction: 'down' | 'up' | 'flat' }): React.JSX.Element {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * 108).toFixed(1)},${(30 - ((v - min) / span) * 26).toFixed(1)}`)
    .join(' ');
  const stroke = direction === 'up' ? 'var(--up)' : direction === 'down' ? 'var(--down)' : 'var(--fainter)';

  return (
    <svg viewBox="0 0 110 34" width={110} height={34} style={{ flex: 'none', transform: 'scaleX(-1)' }} aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * What was actually paid, so a later drop reads as money back.
 *
 * This is the whole of Pruvo's business reduced to one field: a price tracker
 * only becomes actionable once it knows what you already committed to. Before
 * that, "the price fell" is trivia — after it, the same number is a refund with
 * an expiry date attached.
 */
function BookedPrice({
  option,
  currency,
  onChanged,
}: {
  option: OptionRow;
  currency: string;
  onChanged: () => void;
}): React.JSX.Element {
  const [value, setValue] = useState(option.bookedPrice === null ? '' : String(option.bookedPrice));
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    async (next: number | null) => {
      setBusy(true);
      try {
        await setBooked(option.id, next);
        onChanged();
      } finally {
        setBusy(false);
      }
    },
    [option.id, onChanged],
  );

  return (
    <div className="booked">
      <span className="k">שילמתם</span>
      <input
        className="input num"
        inputMode="numeric"
        placeholder="—"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const parsed = Number(value.replace(/[^\d.]/g, ''));
          const next = value.trim() === '' || !Number.isFinite(parsed) || parsed <= 0 ? null : parsed;
          if (next !== option.bookedPrice) void save(next);
        }}
        disabled={busy}
        style={{ maxWidth: 110 }}
      />
      <span className="hint">
        {option.bookedPrice === null
          ? 'הזינו מה שילמתם, ותקבלו התראה אם המחיר יורד מתחת לזה'
          : `נשמר${option.bookedAt ? ` ${hebrewDate(option.bookedAt)}` : ''} · ${money(option.bookedPrice, currency)}`}
      </span>
    </div>
  );
}

/**
 * Hotels worth considering here, fetched from Google on request.
 *
 * On request rather than on page load: it is a 2.5 MB page fetch, and a panel
 * that spends one every time someone opens a vacation would be both slow and a
 * good way to get throttled. The button says what it will do.
 *
 * The prices need care. A destination search lists the *nightly* rate — checked
 * against one hotel's own page, where ₪311 a night matched its ₪2,176 total for
 * seven nights exactly — while what this app tracks is the stay total. Showing
 * the nightly figure alone would understate a week sevenfold, so both appear and
 * both are labelled.
 */
function Recommendations({
  vacationId,
  currency,
  nights,
  onAdded,
}: {
  vacationId: string;
  currency: string;
  nights: number;
  onAdded: () => void;
}): React.JSX.Element {
  const [hotels, setHotels] = useState<Recommendation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const { hotels: found, message } = await recommendHotels(vacationId);
      setHotels(found);
      // Google returning a shell is common enough that "none found" needs to be
      // distinguishable from "we could not read the page".
      if (found.length === 0) setNote(message ?? 'Google לא החזירה מלונות בבדיקה הזאת — כדאי לנסות שוב');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'החיפוש נכשל');
    } finally {
      setBusy(false);
    }
  }, [vacationId]);

  const add = useCallback(
    async (hotel: Recommendation) => {
      setAdding(hotel.entityId);
      try {
        await addHotel(vacationId, {
          entityId: hotel.entityId,
          title: hotel.name,
          stars: hotel.stars,
          rating: hotel.rating,
          ratingCount: hotel.ratingCount,
        });
        // Drop it from the list: it is being watched now, so it is no longer a
        // suggestion.
        setHotels((current) => current?.filter((h) => h.entityId !== hotel.entityId) ?? null);
        onAdded();
      } catch (e) {
        setNote(e instanceof Error ? e.message : 'ההוספה נכשלה');
      } finally {
        setAdding(null);
      }
    },
    [vacationId, onAdded],
  );

  return (
    <div className="recs">
      <div className="recs-head">
        <div>
          <div className="k">מלונות מומלצים ביעד</div>
          <div className="range">Google, במחירים לתאריכים של החופשה הזאת</div>
        </div>
        <div className="spacer" />
        <button className="ghost" onClick={() => void load()} disabled={busy}>
          {busy ? 'מחפשים…' : hotels ? 'רענון' : 'חיפוש מלונות'}
        </button>
      </div>

      {hotels && hotels.length > 0 && (
        <ul className="recs-list">
          {hotels.map((h) => (
            <li key={h.entityId}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{h.name}</div>
                <div className="sub">
                  {h.stars !== null && `${h.stars} כוכבים · `}
                  {h.rating !== null && `${h.rating}/5${h.ratingCount ? ` (${h.ratingCount})` : ''} · `}
                  {h.distance ?? ''}
                  {h.price !== null && `${money(h.price, h.currency ?? currency)} ללילה`}
                </div>
              </div>
              <div className="price">
                <div className="v num">{money(h.stayTotal, h.currency ?? currency)}</div>
                <div className="k">{nightsLabel(nights)}</div>
              </div>
              <button className="ghost" onClick={() => void add(h)} disabled={adding === h.entityId}>
                {adding === h.entityId ? 'מוסיפים…' : 'מעקב'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="note" style={{ border: 0 }}>{note}</p>}
    </div>
  );
}

/**
 * Adding a hotel is how "where to sleep" fills in.
 *
 * The name is completed from Google rather than trusted as typed: an inexact
 * name usually still finds the hotel but returns a page with no partner prices,
 * so picking a suggestion pins the hotel to Google's own entity id — which
 * cannot drift, and which returns more booking companies than the name does.
 */
function AddHotel({ vacationId, onAdded }: { vacationId: string; onAdded: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [hotels, setHotels] = useState<HotelSuggestion[]>([]);
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Each lookup is a real Google page load, so it is debounced generously and
   * the reply is matched against the text that asked for it — otherwise a slow
   * answer for "dan" lands on top of a fresh one for "dandrea".
   */
  const latest = useRef('');
  useEffect(() => {
    const typed = query.trim();
    latest.current = typed;
    if (typed.length < 3) {
      setHotels([]);
      setLooking(false);
      return;
    }

    setLooking(true);
    const timer = setTimeout(() => {
      void suggestHotels(vacationId, typed)
        .then(({ hotels: found }) => {
          if (latest.current !== typed) return;
          setHotels(found);
          setLooking(false);
        })
        .catch(() => {
          if (latest.current === typed) setLooking(false);
        });
    }, 700);

    return () => clearTimeout(timer);
  }, [query, vacationId]);

  const add = useCallback(
    async (hotel: HotelSuggestion | null) => {
      setBusy(true);
      setError(null);
      try {
        await addHotel(
          vacationId,
          hotel
            ? {
                entityId: hotel.entityId,
                title: hotel.name,
                query: hotel.name,
                stars: hotel.stars,
                rating: hotel.rating,
                ratingCount: hotel.ratingCount,
              }
            : { query: query.trim() },
        );
        setQuery('');
        setHotels([]);
        onAdded();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'ההוספה נכשלה');
      } finally {
        setBusy(false);
      }
    },
    [query, vacationId, onAdded],
  );

  return (
    <div style={{ padding: '16px 22px', borderTop: '1px solid var(--line-soft)' }}>
      <label className="f" style={{ position: 'relative' }}>
        <span className="k">הוספת מלון למעקב — נשלים את השם מ־Google</span>
        <input
          className="input"
          value={query}
          placeholder="מספיק בערך — למשל dandrea mare"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />

        {(looking || hotels.length > 0) && query.trim().length >= 3 && (
          <ul className="suggest">
            {looking && hotels.length === 0 && (
              <li>
                <span className="s-desc" style={{ padding: '9px 11px', display: 'block' }}>
                  מחפשים ב־Google…
                </span>
              </li>
            )}
            {hotels.map((h) => (
              <li key={h.entityId}>
                <button type="button" onClick={() => void add(h)} disabled={busy}>
                  <span className="s-label">{h.name}</span>
                  <span className="s-desc">
                    {h.price !== null && <>{money(h.price, h.currency ?? 'ILS')} · </>}
                    {h.rating !== null && <>★ {h.rating} </>}
                    {h.ratingCount !== null && <>({h.ratingCount}) </>}
                    {h.stars !== null && <>· {h.stars} כוכבים </>}
                    {h.distance && <>· {h.distance}</>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>

      {error && (
        <p className="note bad" style={{ padding: '10px 0 0', border: 0 }}>
          {error}
        </p>
      )}
      <p className="note" style={{ padding: '10px 0 0', border: 0 }}>
        בחירה מהרשימה שומרת את המלון לפי המזהה של Google, לא לפי השם — כך הבדיקה תמיד מגיעה לאותו מלון, ומחזירה יותר
        חברות. המחירים ברשימה הם לתאריכים של החופשה הזאת.
      </p>
    </div>
  );
}

/**
 * Changing or deleting the group.
 *
 * Editing the dates is the interesting case: the prices already collected were
 * for the old stay, so the summary numbers are recomputed from history for the
 * new one — which usually means they clear until the next check. The note below
 * says so, because a total quietly resetting to "—" otherwise looks like a bug.
 */
function EditVacation({
  vacation,
  onSaved,
  onDeleted,
}: {
  vacation: VacationWithOptions;
  onSaved: () => void;
  onDeleted: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(vacation.name);
  const [checkin, setCheckin] = useState(isoDate(vacation.checkin));
  const [checkout, setCheckout] = useState(isoDate(vacation.checkout));
  const [adults, setAdults] = useState(vacation.adults);
  const [childAges, setChildAges] = useState(vacation.childAges.join(','));
  const [origin, setOrigin] = useState(vacation.originAirport);
  const [interval, setInterval] = useState(vacation.intervalSeconds);
  const [paused, setPaused] = useState(vacation.paused);
  const [maxStops, setMaxStops] = useState(vacation.maxStops === null ? '' : String(vacation.maxStops));
  const [freeOnly, setFreeOnly] = useState(vacation.freeCancellationOnly);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const stayChanged =
    checkin !== isoDate(vacation.checkin) ||
    checkout !== isoDate(vacation.checkout) ||
    adults !== vacation.adults ||
    childAges !== vacation.childAges.join(',');

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await updateVacation(vacation.id, {
        name,
        checkin,
        checkout,
        adults,
        childAges: childAges.split(',').map((a) => Number(a.trim())).filter(Number.isFinite),
        originAirport: origin,
        intervalSeconds: interval,
        paused,
        maxStops: maxStops.trim() === '' ? null : Number(maxStops),
        freeCancellationOnly: freeOnly,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'העדכון נכשל');
    } finally {
      setBusy(false);
    }
  }, [vacation.id, name, checkin, checkout, adults, childAges, origin, interval, paused, maxStops, freeOnly, onSaved]);

  const remove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteVacation(vacation.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'המחיקה נכשלה');
      setBusy(false);
    }
  }, [vacation.id, onDeleted]);

  const watched = vacation.options.length;

  return (
    <div className="panel" style={{ marginBottom: 22 }}>
      <div className="panel-head">
        <h2>עריכת החופשה</h2>
        <span className="count">תאריכים, נוסעים, תדירות וסינון</span>
      </div>

      <div style={{ padding: 22 }}>
        <div className="fields">
          <label className="f">
            <span className="k">שם</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="f">
            <span className="k">משדה</span>
            <input className="input" value={origin} onChange={(e) => setOrigin(e.target.value)} />
          </label>
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
            <span className="k">גילי ילדים</span>
            <input className="input" placeholder="1,8" value={childAges} onChange={(e) => setChildAges(e.target.value)} />
          </label>
          <button className="btn" onClick={() => void save()} disabled={busy}>
            {busy ? 'שומרים…' : 'שמירה'}
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <span className="k" style={{ display: 'block', marginBottom: 8 }}>
            תדירות בדיקה
          </span>
          <div className="range">
            {INTERVALS.map((o) => (
              <button
                key={o.seconds}
                className="fchip"
                aria-pressed={interval === o.seconds}
                onClick={() => setInterval(o.seconds)}
              >
                כל {o.label}
              </button>
            ))}
            <button className="fchip" aria-pressed={paused} onClick={() => setPaused((v) => !v)}>
              {paused ? 'מושהה' : 'פעיל'}
            </button>
          </div>
          <p className="note" style={{ padding: '10px 0 0', border: 0 }}>
            מתזמן חיצוני מבקש מהאפליקציה כל 15 דקות לבדוק מה שהגיע זמנו, כך שהתדירות כאן
            היא זו שקובעת. &quot;מושהה&quot; עוצר את הבדיקות האוטומטיות בלבד —
            &quot;בדיקה עכשיו&quot; תמיד עובד.
          </p>
        </div>

        <div className="fields" style={{ marginTop: 18 }}>
          <label className="f">
            <span className="k">מקסימום עצירות</span>
            <input
              className="input num"
              placeholder="בלי הגבלה"
              value={maxStops}
              onChange={(e) => setMaxStops(e.target.value)}
            />
          </label>
          <label className="f">
            <span className="k">ביטול חינם בלבד</span>
            <button
              className="ghost"
              onClick={() => setFreeOnly((v) => !v)}
              style={freeOnly ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : undefined}
            >
              {freeOnly ? 'כן — רק ביטול חינם' : 'לא — כל המחירים'}
            </button>
          </label>
        </div>

        {stayChanged && (
          <p className="note" style={{ padding: '14px 0 0', border: 0 }}>
            שינוי התאריכים או הנוסעים מחליף את מה שנמדד: המחירים שנאספו הם לשהייה הקודמת, ולא ניתן להשוות ביניהם.
            ההיסטוריה נשמרת אבל מוצגת רק לשהייה המתאימה, והסיכומים יתאפסו עד הבדיקה הבאה.
          </p>
        )}
      </div>

      {error && <p className="note bad">{error}</p>}

      <div style={{ padding: '16px 22px', borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {!confirming ? (
          <button className="link" onClick={() => setConfirming(true)} style={{ color: 'var(--up-ink)' }}>
            מחיקת החופשה
          </button>
        ) : (
          <>
            <span style={{ fontSize: 13.5, color: 'var(--up-ink)', fontWeight: 600 }}>
              למחוק את &quot;{vacation.name}&quot; ואת {watched} הפריטים במעקב, כולל ההיסטוריה?
            </span>
            <button
              className="btn"
              onClick={() => void remove()}
              disabled={busy}
              style={{ background: 'var(--up-ink)', boxShadow: 'none' }}
            >
              {busy ? 'מוחקים…' : 'כן, למחוק'}
            </button>
            <button className="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              ביטול
            </button>
          </>
        )}
      </div>
    </div>
  );
}
