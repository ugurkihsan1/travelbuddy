import { useId, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarDays, Compass, Globe2, MapPin } from 'lucide-react';
import { stayAreas } from '../data/places';
import { translate, type Language } from '../lib/i18n';
import type { TripSettings } from '../types';
import './WelcomeScreen.css';

type Props = {
  settings: TripSettings;
  onStart: (settings: TripSettings) => void;
};

const calendarDay = 24 * 60 * 60 * 1000;

function calendarTimestamp(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date.getTime() : null;
}

/** Count arrival and departure as travel days without timezone or DST offsets. */
export function getWelcomeDayCount(arrival: string, departure: string): number | null {
  const first = calendarTimestamp(arrival);
  const last = calendarTimestamp(departure);
  if (first === null || last === null) return null;
  const days = (last - first) / calendarDay + 1;
  return Number.isInteger(days) && days >= 1 && days <= 7 ? days : null;
}

function latestDeparture(arrival: string): string | undefined {
  const first = calendarTimestamp(arrival);
  if (first === null) return undefined;
  const last = Math.min(first + 6 * calendarDay, Date.parse('9999-12-31T00:00:00.000Z'));
  return new Date(last).toISOString().slice(0, 10);
}

export function WelcomeScreen({ settings, onStart }: Props) {
  const id = useId();
  const [language, setLanguage] = useState<Language>(settings.language ?? 'en');
  const [stayArea, setStayArea] = useState('');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [submissionError, setSubmissionError] = useState(false);
  const t = (text: string) => translate(text, language);
  const days = getWelcomeDayCount(arrival, departure);
  const selectedArea = stayAreas.find((area) => area.id === stayArea);
  const invalidDates = !!arrival && !!departure && days === null;

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedArea || days === null || !event.currentTarget.checkValidity()) {
      setSubmissionError(true);
      return;
    }
    onStart({
      ...settings,
      stayArea: selectedArea.id,
      startDate: arrival,
      days,
      language,
      pace: settings.pace ?? 'balanced',
      startTime: settings.startTime ?? '09:00',
      coffeeStops: settings.coffeeStops ?? false,
      routeMode: settings.routeMode ?? 'keep',
      interests: settings.interests ?? [],
    });
  }

  return <div className="welcome-screen" lang={language}>
    <header className="welcome-header">
      <div className="welcome-brand" aria-label="TravelBuddy">
        <span className="welcome-brand-mark" aria-hidden="true"><Compass size={25} strokeWidth={1.8} /></span>
        <span>travel<span className="welcome-brand-light">buddy</span><span className="welcome-brand-dot">.</span></span>
      </div>
      <label className="welcome-language" htmlFor={`${id}-language`}>
        <Globe2 size={16} aria-hidden="true" />
        <span className="welcome-sr-only">{t('Language')}</span>
        <select id={`${id}-language`} value={language} onChange={(event) => setLanguage(event.target.value === 'tr' ? 'tr' : 'en')}>
          <option value="en">English</option><option value="tr">Türkçe</option>
        </select>
      </label>
    </header>
    <main className="welcome-main">
      <section className="welcome-card" aria-labelledby={`${id}-title`}>
        <div className="welcome-city"><span aria-hidden="true" />{t('Istanbul, Türkiye')}</div>
        <h1 id={`${id}-title`}>{t('First, tell us where and when.')}</h1>
        <p className="welcome-intro">{t('Choose your stay area and travel dates. Then we’ll build your Istanbul plan.')}</p>
        <form className="welcome-form" onSubmit={start}>
          <div className="welcome-field">
            <label htmlFor={`${id}-stay`}><MapPin size={19} aria-hidden="true" />{t('Where are you staying?')}</label>
            <select id={`${id}-stay`} required value={stayArea} onChange={(event) => { setStayArea(event.target.value); setSubmissionError(false); }}>
              <option value="" disabled>{t('Choose your stay area')}</option>
              {stayAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}
            </select>
          </div>
          <div className="welcome-dates">
            <div className="welcome-field">
              <label htmlFor={`${id}-arrival`}><CalendarDays size={19} aria-hidden="true" />{t('Arrival date')}</label>
              <input id={`${id}-arrival`} type="date" required value={arrival} aria-describedby={`${id}-dates-note`} onChange={(event) => {
                const nextArrival = event.target.value;
                setArrival(nextArrival);
                if (departure && getWelcomeDayCount(nextArrival, departure) === null) setDeparture('');
                setSubmissionError(false);
              }} />
            </div>
            <div className="welcome-field">
              <label htmlFor={`${id}-departure`}><CalendarDays size={19} aria-hidden="true" />{t('Departure date')}</label>
              <input id={`${id}-departure`} type="date" required disabled={!arrival} min={arrival || undefined} max={latestDeparture(arrival)} value={departure} aria-describedby={`${id}-dates-note`} aria-invalid={invalidDates || undefined} onChange={(event) => { setDeparture(event.target.value); setSubmissionError(false); }} />
            </div>
          </div>
          <p className="welcome-dates-note" id={`${id}-dates-note`}>{t('Plan 1–7 days, including your arrival and departure days.')}</p>
          {(invalidDates || submissionError) && <p className="welcome-error" role="alert">{t('Choose a stay area and a valid trip of 1–7 days. Departure must be on or after arrival.')}</p>}
          <button className="welcome-submit" type="submit" disabled={!selectedArea || days === null}>{t('Show my Istanbul plan')}<ArrowRight size={20} aria-hidden="true" /></button>
        </form>
        <p className="welcome-after-note">{t('You can adjust your pace, interests and exact hotel later.')}</p>
      </section>
    </main>
  </div>;
}
