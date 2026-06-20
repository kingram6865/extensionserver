const MAX_DOM_CHARS = Number.parseInt(process.env.SCRAPER_DOM_MAX_CHARS || '12000000', 10);

function cleanString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseHttpUrl(value) {
  const url = cleanString(value);

  if (!url) return { ok: false, value: null, error: 'url is required' };

  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, value: null, error: 'url must use http or https' };
    }

    return { ok: true, value: parsed, error: null };
  } catch {
    return { ok: false, value: null, error: 'url must be valid' };
  }
}

export function validateDomPayload(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['request body must be an object'], payload: null };
  }

  const urlResult = parseHttpUrl(body.url || body.pageUrl || body.sourceUrl);
  const dom = cleanString(body.dom || body.html);
  const source = cleanString(body.source);
  const pageType = cleanString(body.pageType);
  const capturedAt = cleanString(body.capturedAt);

  if (!urlResult.ok) {
    errors.push(urlResult.error);
  }

  if (!dom) {
    errors.push('dom is required');
  } else if (dom.length > MAX_DOM_CHARS) {
    errors.push(`dom exceeds maximum length of ${MAX_DOM_CHARS}`);
  }

  if (errors.length) {
    return { ok: false, errors, payload: null };
  }

  const parsedUrl = urlResult.value;

  return {
    ok: true,
    errors: [],
    payload: {
      source,
      pageType,
      url: parsedUrl.toString(),
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname,
      dom,
      domLength: dom.length,
      capturedAt
    }
  };
}
