import jsdom from 'jsdom';

const { JSDOM } = jsdom;

export function createDocument(html, url) {
  return new JSDOM(html, { url }).window.document;
}

export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

export function firstText(document, selectors = []) {
  for (const selector of selectors) {
    const text = cleanText(document.querySelector(selector)?.textContent || '');
    if (text) return text;
  }

  return '';
}

export function firstHtml(document, selectors = []) {
  for (const selector of selectors) {
    const html = document.querySelector(selector)?.innerHTML?.trim();
    if (html) return html;
  }

  return '';
}

export function parseInteger(value) {
  const match = cleanText(String(value || '')).match(/[\d,]+/);
  if (!match) return null;
  return Number.parseInt(match[0].replace(/,/g, ''), 10);
}

export function normalizeSizeToMBytes(value) {
  const text = cleanText(String(value || '')).replace(/,/g, '');
  const match = text.match(/([\d.]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib|tb|tib)/i);

  if (!match) return null;

  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();

  if (Number.isNaN(amount)) return null;

  if (unit === 'b' || unit.startsWith('byte')) return amount / 1_000_000;
  if (unit === 'kb' || unit === 'kib') return amount / 1_000;
  if (unit === 'mb' || unit === 'mib') return amount;
  if (unit === 'gb' || unit === 'gib') return amount * 1_000;
  if (unit === 'tb' || unit === 'tib') return amount * 1_000_000;

  return null;
}

export function uniqueStrings(values = []) {
  return [...new Set(
    values
      .map(value => cleanText(String(value || '')))
      .filter(Boolean)
  )];
}

export function findMagnetLink(document) {
  const anchors = Array.from(document.querySelectorAll('a[href]'));

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href') || anchor.href || '';

    if (href.startsWith('magnet:?')) {
      return href;
    }

    if (href.includes('magnet%3A') || href.includes('magnet:?')) {
      const decoded = safeDecode(href);

      const directMatch = decoded.match(/magnet:\?[^"'<>\s]+/i);
      if (directMatch) return directMatch[0];

      try {
        const url = new URL(href, document.location.href);
        const wrapped = url.searchParams.get('url') || url.searchParams.get('u');

        if (wrapped) {
          const decodedWrapped = safeDecode(wrapped);
          if (decodedWrapped.startsWith('magnet:?')) return decodedWrapped;
        }
      } catch {
        // ignore malformed wrapper URLs
      }
    }
  }

  return '';
}

export function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getMagnetParam(magnetLink, key) {
  if (!magnetLink) return '';

  const query = magnetLink.includes('?')
    ? magnetLink.slice(magnetLink.indexOf('?') + 1)
    : '';

  const params = new URLSearchParams(query);
  return safeDecode(params.get(key) || '');
}

export function getMagnetDisplayName(magnetLink) {
  return cleanText(getMagnetParam(magnetLink, 'dn'));
}

export function getMagnetTrackers(magnetLink) {
  if (!magnetLink) return [];

  const query = magnetLink.includes('?')
    ? magnetLink.slice(magnetLink.indexOf('?') + 1)
    : '';

  const params = new URLSearchParams(query);

  return uniqueStrings(
    params.getAll('tr').map(value => safeDecode(value))
  );
}

export function comparableName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
