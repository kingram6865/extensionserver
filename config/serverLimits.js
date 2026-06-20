const DEFAULT_JSON_LIMIT = '15mb';

export function parseByteSize(value) {
  const raw = String(value || '').trim().toLowerCase();

  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);

  if (!match) {
    throw new Error(`Invalid JSON_LIMIT value: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2] || 'b';

  const multipliers = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  return Math.floor(amount * multipliers[unit]);
}

export function getJsonLimitValue() {
  return process.env.JSON_LIMIT || DEFAULT_JSON_LIMIT;
}

export function getJsonLimitInfo() {
  const jsonLimit = getJsonLimitValue();

  return {
    jsonLimit,
    jsonLimitBytes: parseByteSize(jsonLimit),
  };
}
