const DEFAULT_LIMIT = 5;
const MAX_BATCH_SIZE = 10;

export function clampLimit(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_LIMIT;
  }

  const n = Number.parseInt(value, 10);

  if (Number.isNaN(n)) return DEFAULT_LIMIT;

  return Math.max(1, Math.min(n, MAX_BATCH_SIZE));
}

export function requestError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function toPositiveInteger(value, fieldName) {
  const n = Number(value);

  if (!Number.isInteger(n) || n < 1) {
    throw requestError(`${fieldName} must be a positive integer.`);
  }

  return n;
}

function normalizeIdInput(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string' && value.includes(',')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [value];
}

function normalizePageIds(value, fieldName) {
  const rawIds = normalizeIdInput(value);

  if (!rawIds.length) {
    throw requestError(`${fieldName} must contain at least one page id.`);
  }

  const ids = rawIds.map((id, index) =>
    toPositiveInteger(id, `${fieldName}[${index}]`)
  );

  return [...new Set(ids)];
}

function parsePageIdRange(body) {
  const range =
    body?.scrapedPageRange ??
    body?.pageIdRange ??
    body?.pageRange ??
    null;

  const startValue =
    body?.scrapedPageIdStart ??
    body?.pageIdStart ??
    range?.start ??
    range?.from ??
    null;

  const endValue =
    body?.scrapedPageIdEnd ??
    body?.pageIdEnd ??
    range?.end ??
    range?.to ??
    null;

  if (!hasValue(startValue) && !hasValue(endValue)) {
    return null;
  }

  if (!hasValue(startValue) || !hasValue(endValue)) {
    throw requestError('Page id range requires both start and end values.');
  }

  const start = toPositiveInteger(startValue, 'pageIdRange.start');
  const end = toPositiveInteger(endValue, 'pageIdRange.end');

  if (end < start) {
    throw requestError('pageIdRange.end must be greater than or equal to pageIdRange.start.');
  }

  const size = end - start + 1;

  if (size > MAX_BATCH_SIZE) {
    throw requestError(`Page id range cannot exceed ${MAX_BATCH_SIZE} rows.`);
  }

  return { start, end };
}

export function parsePromoteRequest(body = {}) {
  const singlePageId = body?.scrapedPageId ?? body?.pageId ?? null;
  const pageIdList = body?.scrapedPageIds ?? body?.pageIds ?? null;
  const pageIdRange = parsePageIdRange(body);

  const selectorCount = [
    hasValue(singlePageId),
    hasValue(pageIdList),
    pageIdRange !== null
  ].filter(Boolean).length;

  if (selectorCount > 1) {
    throw requestError(
      'Use only one page selector: pageId, pageIds, or pageIdRange.'
    );
  }

  const dryRun = body?.dryRun === true;
  const limit = clampLimit(body?.limit);

  if (hasValue(singlePageId)) {
    const ids = normalizePageIds(singlePageId, 'pageId');

    if (ids.length !== 1) {
      throw requestError('pageId accepts only one id. Use pageIds for multiple ids.');
    }

    return {
      mode: 'single',
      ids,
      dryRun,
      limit
    };
  }

  if (hasValue(pageIdList)) {
    const ids = normalizePageIds(pageIdList, 'pageIds');

    if (ids.length > MAX_BATCH_SIZE) {
      throw requestError(`pageIds cannot exceed ${MAX_BATCH_SIZE} ids.`);
    }

    return {
      mode: 'list',
      ids,
      dryRun,
      limit
    };
  }

  if (pageIdRange) {
    return {
      mode: 'range',
      range: pageIdRange,
      dryRun,
      limit
    };
  }

  return {
    mode: 'limit',
    dryRun,
    limit
  };
}

export function summarizePromotedRows(rows) {
  return rows.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {});
}

export function getMissingPageIds(options, rows) {
  if (!['single', 'list'].includes(options.mode)) {
    return [];
  }

  const found = new Set(
    rows.map((row) => Number(row.scraped_page_id))
  );

  return options.ids.filter((id) => !found.has(id));
}

export function isDuplicateError(err) {
  const message = err.message || String(err);

  return (
    err.code === 'ER_DUP_ENTRY' ||
    /duplicate/i.test(message) ||
    /already exists/i.test(message) ||
    /exists/i.test(message)
  );
}
