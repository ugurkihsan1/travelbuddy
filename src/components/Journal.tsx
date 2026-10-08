import { useState } from 'react';
import { Camera, Check, Download, Share2, Trash2 } from 'lucide-react';
import { findPlace } from '../data/places';
import { downloadJournal, isJournalPhoto, MAX_JOURNAL_NOTE_LENGTH, resizeJournalPhoto, shareJournal, type JournalMemory } from '../lib/journal';
import type { TripDay } from '../types';
import { translatePlace, useLanguage, useTranslation } from '../lib/i18n';

type Props = { day: TripDay; onSave: (placeId: string, memory: JournalMemory) => void; onClose?: () => void; storageError?: boolean };

export function JournalEditor({ day, onSave, onClose, storageError = false }: Props) {
  const t = useTranslation();
  const language = useLanguage();
  const visited = day.stops.filter((stop) => stop.status === 'visited');
  const [drafts, setDrafts] = useState<Record<string, JournalMemory>>(() => Object.fromEntries(visited.map((stop) => [stop.placeId, { note: stop.memory?.note ?? '', photo: isJournalPhoto(stop.memory?.photo) ? stop.memory?.photo : undefined }])));
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);

  function update(placeId: string, patch: Partial<JournalMemory>) {
    setDrafts((old) => ({ ...old, [placeId]: { ...old[placeId], ...patch } }));
  }

  function saveAll() {
    visited.forEach((stop) => onSave(stop.placeId, drafts[stop.placeId] ?? { note: '' }));
    setMessage('Your memories have been updated.');
  }

  const summaryDay: TripDay = { ...day, stops: day.stops.map((stop) => stop.status === 'visited' ? { ...stop, memory: drafts[stop.placeId] ?? stop.memory } : stop) };

  return <section className="journal-editor">
    <p className="modal-intro">{t('A photo, a little note, or simply being there. Memories are optional and stay on this device until you choose to share.')}</p>
    {storageError && <div className="journal-warning" role="alert">{t('Your browser can’t save these memories. Download your summary before closing this page.')}</div>}
    {!visited.length && <div className="journal-empty">{t('Mark a place as visited to start your day’s journal.')}</div>}
    <div className="journal-places">{visited.map((stop) => {
      const place = findPlace(stop.placeId);
      if (!place) return null;
      const draft = drafts[stop.placeId] ?? { note: '' };
      return <article className="journal-place" key={stop.placeId}>
        <h3><Check size={16} />{translatePlace(place, language)}</h3>
        {draft.photo && <div className="journal-photo"><img src={draft.photo} alt={`${t('My photo at')} ${translatePlace(place, language)}`} /><button className="icon-button" aria-label={`${t('Remove photo from')} ${translatePlace(place, language)}`} onClick={() => update(stop.placeId, { photo: undefined })}><Trash2 size={16} /></button></div>}
        <label className="journal-photo-button"><Camera size={16} />{t(loadingPhoto === stop.placeId ? 'Preparing photo…' : draft.photo ? 'Change photo' : 'Add a photo')}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={loadingPhoto !== null} aria-label={`${t('Add photo for')} ${translatePlace(place, language)}`} onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          setLoadingPhoto(stop.placeId); setMessage('');
          try { update(stop.placeId, { photo: await resizeJournalPhoto(file) }); }
          catch (error) { setMessage(error instanceof Error ? error.message : 'This photo could not be opened.'); }
          finally { setLoadingPhoto(null); }
        }} /></label>
        <label className="journal-note-label" htmlFor={`journal-note-${stop.placeId}`}>{t('Your note')} <span>{t('optional')}</span></label>
        <textarea id={`journal-note-${stop.placeId}`} maxLength={MAX_JOURNAL_NOTE_LENGTH} rows={3} value={draft.note} placeholder={t('A small detail you’d like to remember…')} onChange={(event) => update(stop.placeId, { note: event.currentTarget.value })} />
        <span className="journal-count">{draft.note.length}/{MAX_JOURNAL_NOTE_LENGTH}</span>
      </article>;
    })}</div>
    {message && <p className="journal-message" role="status">{t(message)}</p>}
    {!!visited.length && <div className="journal-actions">
      <button className="primary-button" disabled={loadingPhoto !== null} onClick={saveAll}><Check size={16} />{t('Save memories')}</button>
      <button className="secondary-button" disabled={sharing || loadingPhoto !== null} onClick={async () => {
        setSharing(true); setMessage('');
        try { const result = await shareJournal(summaryDay, language); if (result !== 'cancelled') setMessage(result === 'shared' ? 'Your day has been shared.' : 'Your day summary has been downloaded.'); }
        catch { setMessage('Sharing is unavailable right now. You can download your summary instead.'); }
        finally { setSharing(false); }
      }}><Share2 size={16} />{t(sharing ? 'Preparing…' : 'Share your day')}</button>
      <button className="text-button" disabled={loadingPhoto !== null} onClick={() => { downloadJournal(summaryDay, language); setMessage('Your day summary has been downloaded.'); }}><Download size={16} />{t('Download summary')}</button>
    </div>}
    {onClose && <button className="text-button journal-close" onClick={onClose}>{t('Done')}</button>}
  </section>;
}
