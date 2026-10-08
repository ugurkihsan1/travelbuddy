import { describe, expect, it } from 'vitest';
import type { TripDay } from '../types';
import { createJournalHtml, escapeJournalText, isJournalPhoto, MAX_JOURNAL_PHOTO_BYTES } from './journal';

const jpeg = 'data:image/jpeg;base64,/9j/';
const day = (): TripDay => ({ id: 1, title: 'My <Istanbul> & day', subtitle: '', stops: [
  { placeId: 'blue-mosque', status: 'visited', memory: { note: '<script>alert("hello")</script> & "nice"', photo: jpeg } },
  { placeId: 'hagia-sophia', status: 'pending', memory: { note: 'PENDING SECRET' } },
  { placeId: 'grand-bazaar', status: 'skipped', memory: { note: 'SKIPPED SECRET' } },
] });

describe('portable day journal', () => {
  it('escapes notes and headings so exported text cannot become executable HTML', () => {
    const html = createJournalHtml(day());
    expect(html).toContain('My &lt;Istanbul&gt; &amp; day');
    expect(html).toContain('&lt;script&gt;alert(&quot;hello&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(escapeJournalText("<>&\"'" )).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('includes only visited stops and embeds valid user photos without remote resources', () => {
    const html = createJournalHtml(day());
    expect(html).toContain('Blue Mosque');
    expect(html).toContain(`src="${jpeg}"`);
    expect(html).not.toContain('Hagia Sophia');
    expect(html).not.toContain('Grand Bazaar');
    expect(html).not.toContain('PENDING SECRET');
    expect(html).not.toContain('SKIPPED SECRET');
    expect(html).not.toMatch(/(?:src|href)="https?:/);
    expect(html).not.toContain('@import');
  });

  it.each(['https://example.com/private.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/jpeg;base64,x" onerror="alert(1)', 'data:image/jpeg;base64,!!', 'data:image/jpeg;base64,YQ'])('rejects unsafe or malformed photo payload: %s', (photo) => {
    expect(isJournalPhoto(photo)).toBe(false);
    const payload = day(); payload.stops[0].memory!.photo = photo;
    expect(createJournalHtml(payload)).not.toContain('<img');
  });

  it('accepts bounded JPEG, PNG, and WebP data URLs but rejects oversized photos', () => {
    for (const type of ['jpeg', 'png', 'webp']) expect(isJournalPhoto(`data:image/${type};base64,YQ==`)).toBe(true);
    expect(isJournalPhoto(`data:image/jpeg;base64,${'A'.repeat(Math.ceil((MAX_JOURNAL_PHOTO_BYTES + 3) / 3) * 4)}`)).toBe(false);
  });

  it('keeps notes optional and gives empty days a useful standalone summary', () => {
    const empty = day(); empty.stops = [];
    expect(createJournalHtml(empty)).toContain('No visited places yet');
    const noNote = day(); noNote.stops[0].memory = undefined;
    expect(createJournalHtml(noNote)).toContain('A little Istanbul memory.');
  });
});
