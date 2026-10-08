export const DAY_MS = 24 * 60 * 60 * 1000;

// Each parser is tied to a named official tariff and its visitor category.
// No parser treats the first number on an HTML page as an admission price.
export const venueSources = {
  'topkapi-palace': { url: 'https://www.millisaraylar.gov.tr/Lokasyon/2/topkapi-sarayi', parser: 'palace', heading: 'Topkapı Sarayı Kombine Bilet (Topkapı Sarayı + Aya İrini + Harem)', label: 'Foreign adult · palace, Hagia Irene & Harem' },
  'dolmabahce-palace': { url: 'https://www.millisaraylar.gov.tr/Lokasyon/3/dolmabahce-sarayi', parser: 'palace', heading: 'Selamlık, Harem ve Resim Müzesi Birlikte', label: 'Foreign adult · Selamlık, Harem & Painting Museum' },
  'beylerbeyi-palace': { url: 'https://www.millisaraylar.gov.tr/Lokasyon/4/beylerbeyi-sarayi', parser: 'palace', heading: 'BİLET FİYATLARI', label: 'Foreign adult · palace admission' },
  'istanbul-modern': { url: 'https://www.istanbulmodern.org/en/visit/museum', parser: 'modern', label: 'Regular adult · non-resident museum ticket' },
  'pera-museum': { url: 'https://www.peramuseum.org/Home/Visit', parser: 'pera', label: 'Full adult museum ticket' },
  'basilica-cistern': { url: 'https://yerebatan.com/en/', parser: 'unsupported', label: 'Daytime foreign adult ticket · price not verified' },
  'hagia-sophia': { url: 'https://muze.gov.tr/', parser: 'unsupported', label: 'Foreign visitor gallery · price not verified' },
  'archaeology-museums': { url: 'https://muze.gov.tr/ETicket', parser: 'muze', heading: 'İSTANBUL ARCHAEOLOGICAL MUSEUMS', label: 'Standard foreign visitor · archaeology museums' },
  'galata-tower': { url: 'https://muze.gov.tr/ETicket', parser: 'muze', heading: 'GALATA TOWER', label: 'Standard foreign visitor · Galata Tower; excludes resident night-ticket offers' },
  'naval-museum': { url: 'https://denizmuzesi.dzkk.tsk.tr/', parser: 'unsupported', label: 'Adult museum ticket · price not verified' },
  'chora-mosque': { url: 'https://muze.gov.tr/', parser: 'unsupported', label: 'Sightseeing visitor ticket · price not verified' },
  'rahmi-koc-museum': { url: 'https://www.rmk-museum.org.tr/', parser: 'unsupported', label: 'Adult museum ticket · price not verified' },
  'dilburnu': { url: 'https://www.tarimorman.gov.tr/DKMP/', parser: 'unsupported', label: 'Nature-park admission · price not verified' },
};

export function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;|&amp;|&quot;|&apos;|&lt;|&gt;/g, entity => ({ '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' })[entity])
    .replace(/\s+/g, ' ').trim();
}

function amountFromMatch(match) {
  if (!match) throw new Error('The named adult tariff was not found on the official page.');
  const amount = Number(match[1].replace(/[.,\s]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 100000) throw new Error('The official tariff amount is invalid.');
  return amount;
}

export function parseOfficialPrice(html, source) {
  const text = visibleText(html);
  const money = '([0-9]+(?:[.,][0-9]{3})*)\\s*(?:TL|₺)';
  if (source.parser === 'palace') {
    const feeStart = html.search(/id=["']fiyatMenu["']/i);
    if (feeStart < 0) throw new Error('The official ticket-prices section was not found.');
    const fees = visibleText(html.slice(feeStart));
    const headingAt = fees.indexOf(source.heading);
    if (headingAt < 0) throw new Error('The requested palace ticket bundle was not found.');
    // A short scope stops us from drifting into the next bundle or an add-on.
    const scope = fees.slice(headingAt + source.heading.length, headingAt + source.heading.length + 350);
    return { amount: amountFromMatch(scope.match(new RegExp('Yabancı Ziyaretçi Bilet Fiyatı:\\s*' + money, 'i'))), currency: 'TRY' };
  }
  if (source.parser === 'modern') {
    // The resident price is deliberately excluded from the non-resident scope.
    const match = text.match(new RegExp('Admission\\s+Regular:\\s*' + money + '[\\s\\S]{0,350}?Residents of Türkiye', 'i'));
    return { amount: amountFromMatch(match), currency: 'TRY' };
  }
  if (source.parser === 'muze') {
    const cards = [...html.matchAll(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi)];
    for (const card of cards) {
      const text = visibleText(card[1]);
      if (!text.startsWith(source.heading + ' ')) continue;
      const match = text.slice(source.heading.length).match(/^\s*([0-9]+(?:[.,][0-9]{3})*)\s*Euro\b/i);
      return { amount: amountFromMatch(match), currency: 'EUR' };
    }
    throw new Error('The exact standard foreign e-ticket was not found.');
  }
  if (source.parser === 'pera') {
    return { amount: amountFromMatch(text.match(new RegExp('ENTRANCE FEES\\s+Full ticket:\\s*' + money, 'i'))), currency: 'TRY' };
  }
  throw new Error('A current official adult tariff could not be verified for this venue.');
}
