import { mapTorrentCategory } from './categoryMap.js';

function truncate(value, max) {
  if (value === null || value === undefined) return null;

  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function intOrZero(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonArray(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function extractBtihHash(magnetLink) {
  if (!magnetLink) return null;

  const query = magnetLink.includes('?')
    ? magnetLink.slice(magnetLink.indexOf('?') + 1)
    : '';

  const params = new URLSearchParams(query);
  const xtValues = params.getAll('xt');

  const btih = xtValues
    .map(value => decodeURIComponent(value || ''))
    .find(value => value.toLowerCase().startsWith('urn:btih:'));

  if (!btih) return null;

  const rawHash = btih.slice('urn:btih:'.length).trim();

  // Most common form: 40-character hex SHA1 infohash.
  if (/^[a-f0-9]{40}$/i.test(rawHash)) {
    return rawHash.toUpperCase();
  }

  // Base32 btih exists, but torrents_downloaded.hash is CHAR(40),
  // so do not store the 32-char base32 value here unless you add conversion.
  return null;
}

export function mapParsedTorrentToDownloaded(row) {
  const contents = parseJsonArray(row.contents_json);
  const trackers = parseJsonArray(row.trackers_json);
  const categories = mapTorrentCategory(row.category, row.torrent_name);
  const parsedFileCount = numberOrNull(row.num_files);
  const contentFileCount = contents.length ? contents.length : null;
  const files = parsedFileCount ?? contentFileCount;
  const totalMegabytes = numberOrNull(row.mbytes);

  return {
    download_name: truncate(row.torrent_name || 'Unknown torrent', 255),
    source_url: truncate(row.source_url, 255),
    magnet_link: truncate(row.magnet_link, 3000),

    files,
    total_megabytes: totalMegabytes,

    seeds: intOrZero(row.seeds),
    peers: intOrZero(row.peers),

    info: row.info || null,

    general_category: categories.general_category,
    specific_category: categories.specific_category,

    trackers: JSON.stringify(trackers),
    contents: JSON.stringify(contents),

    single_file: files === null ? null : files === 1 ? 1 : 0,
    hash: extractBtihHash(row.magnet_link)
  };
}
