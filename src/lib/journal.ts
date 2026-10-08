import { findPlace } from '../data/places';
import type { TripDay } from '../types';
import { translate, translatePlace, type Language } from './i18n';

export type JournalMemory = { note: string; photo?: string };
export const MAX_JOURNAL_NOTE_LENGTH = 500;
export const MAX_JOURNAL_PHOTO_BYTES = 1024 * 1024;

export function isJournalPhoto(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[1].length % 4 !== 0) return false;
  const payload = match[1];
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return payload.length / 4 * 3 - padding <= MAX_JOURNAL_PHOTO_BYTES;
}

export function escapeJournalText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

/** A complete, offline document containing only the memories selected for sharing. */
export function createJournalHtml(day: TripDay, language: Language = 'en'): string {
  const t = (text: string) => translate(text, language);
  const visited = day.stops.filter((stop) => stop.status === 'visited');
  const cards = visited.map((stop) => {
    const place = findPlace(stop.placeId);
    const name = escapeJournalText(place ? translatePlace(place, language) : t('An Istanbul discovery'));
    const memory = stop.memory;
    const note = typeof memory?.note === 'string' ? memory.note.slice(0, MAX_JOURNAL_NOTE_LENGTH) : '';
    const photo = isJournalPhoto(memory?.photo) ? `<img src="${memory.photo}" alt="${escapeJournalText(t('My photo at'))} ${name}">` : '';
    return `<article>${photo}<div class="card-body"><h2>${name}</h2>${note.trim() ? `<p class="note">${escapeJournalText(note)}</p>` : `<p class="quiet">${escapeJournalText(t('A little Istanbul memory.'))}</p>`}</div></article>`;
  }).join('\n');
  const title = language === 'tr' ? `İstanbul’da ${day.id}. gün` : `Day ${day.id} in Istanbul`;
  return `<!doctype html>
<html lang="${language}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeJournalText(title)} · TravelBuddy</title>
<style>body{margin:0;background:#faf8f2;color:#24473b;font:16px/1.6 system-ui,-apple-system,sans-serif}main{max-width:720px;margin:auto;padding:48px 24px}header{margin-bottom:32px}.brand{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#7c8b70}h1{font-size:36px;line-height:1.2;font-weight:500;margin:12px 0}h2{font-size:22px;margin:0 0 8px;font-weight:550}article{background:#fff;border:1px solid #e3e6d9;border-radius:20px;overflow:hidden;margin:20px 0}img{display:block;width:100%;max-height:480px;object-fit:cover}.card-body{padding:24px}.note{white-space:pre-wrap;margin:0}.quiet,footer{color:#768176}footer{font-size:12px;margin-top:36px}@media print{body{background:white}article{break-inside:avoid}main{padding:20px}}</style></head>
<body><main><header><div class="brand">TravelBuddy · ${escapeJournalText(t('My memories'))}</div><h1>${escapeJournalText(title)}</h1><p>${escapeJournalText(t(day.title))} · ${visited.length} ${escapeJournalText(t(visited.length === 1 ? 'place' : 'places'))} ${escapeJournalText(t('explored'))}</p></header>
${cards || `<p>${escapeJournalText(t('No visited places yet. Your next discovery is waiting.'))}</p>`}
<footer>${escapeJournalText(t('Created with TravelBuddy. This summary includes only visited places and the notes or photos you chose to add.'))}</footer></main></body></html>`;
}

export function downloadJournal(day: TripDay, language: Language = 'en'): void {
  const blob = new Blob([createJournalHtml(day, language)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `TravelBuddy-day-${day.id}-memories.html`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareJournal(day: TripDay, language: Language = 'en'): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([createJournalHtml(day, language)], `TravelBuddy-day-${day.id}-memories.html`, { type: 'text/html' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: language === 'tr' ? `İstanbul’da ${day.id}. gün` : `Day ${day.id} in Istanbul` });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  downloadJournal(day, language);
  return 'downloaded';
}

/** Canvas exports a fresh JPEG, excluding source EXIF and GPS metadata. */
export async function resizeJournalPhoto(file: File): Promise<string> {
  if (!/^image\/(?:jpeg|png|webp|heic|heif)$/i.test(file.type)) throw new Error('Choose a JPEG, PNG, WebP, or HEIC photo.');
  if (file.size === 0 || file.size > 15 * 1024 * 1024) throw new Error('Choose a photo smaller than 15 MB.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This photo could not be opened.');
    const ratio = Math.min(1, 720 / image.naturalWidth, 720 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo editing is unavailable in this browser.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .78);
    if (!isJournalPhoto(data)) throw new Error('This photo is too large to save. Choose a smaller photo.');
    return data;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
