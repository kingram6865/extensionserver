function parsePositiveInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function normalizePageSelector(body = {}) {
  const pageId = parsePositiveInt(body.pageId);

  if (pageId) {
    return {
      mode: 'single',
      pageIds: [pageId]
    };
  }

  if (Array.isArray(body.pageIds) && body.pageIds.length) {
    const pageIds = [...new Set(
      body.pageIds
        .map(parsePositiveInt)
        .filter(Boolean)
    )];

    return {
      mode: 'list',
      pageIds
    };
  }

  const rangeStart = parsePositiveInt(body.pageIdStart ?? body.pageRange?.start);
  const rangeEnd = parsePositiveInt(body.pageIdEnd ?? body.pageRange?.end);

  if (rangeStart && rangeEnd) {
    const start = Math.min(rangeStart, rangeEnd);
    const end = Math.max(rangeStart, rangeEnd);

    return {
      mode: 'range',
      pageIdStart: start,
      pageIdEnd: end
    };
  }

  return {
    mode: 'unparsed'
  };
}

export function buildPlaceholders(values) {
  return values.map(() => '?').join(', ');
}
