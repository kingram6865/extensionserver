import axios from 'axios';
import {
  createDocument,
  cleanText,
  firstText,
  firstHtml,
  findMagnetLink,
  getMagnetDisplayName,
  getMagnetTrackers,
  comparableName,
  normalizeSizeToMBytes,
  parseInteger,
  uniqueStrings,
  nullIfBlank,
} from './helpers.js';

import { selectParserProfile } from './profiles.js';

function pickTorrentName({ magnetName, headingName, pageTitle }) {
  return cleanText(magnetName || headingName || pageTitle || '');
}

function buildWarnings({ magnetLink, magnetName, headingName, pageTitle }) {
  const warnings = [];

  if (!magnetLink) {
    warnings.push('missing_magnet');
  }

  if (!magnetName && magnetLink) {
    warnings.push('missing_magnet_dn');
  }

  const magnetComparable = comparableName(magnetName);
  const headingComparable = comparableName(headingName);
  const titleComparable = comparableName(pageTitle);

  if (
    magnetComparable &&
    headingComparable &&
    !headingComparable.includes(magnetComparable) &&
    !magnetComparable.includes(headingComparable)
  ) {
    warnings.push('magnet_dn_heading_mismatch');
  }

  if (
    magnetComparable &&
    titleComparable &&
    !titleComparable.includes(magnetComparable) &&
    !magnetComparable.includes(titleComparable)
  ) {
    warnings.push('magnet_dn_title_mismatch');
  }

  return warnings;
}

export async function parseSavedPage(row) {
  if (!row?.content_html) {
    throw new Error('scraped_pages row is missing content_html');
  }

  if (!row?.page_url) {
    throw new Error('scraped_pages row is missing page_url');
  }

  const profile = selectParserProfile({ source: row.source, pageUrl: row.page_url });
  const document = createDocument(row.content_html, row.page_url);
  const magnetLink = findMagnetLink(document);
  const magnetName = getMagnetDisplayName(magnetLink);
  const headingName = firstText(document, profile.selectors?.torrentName || []);
  const pageTitle = cleanText(row.page_title || document.title || '');
  const profileData = profile.extract
    ? await Promise.resolve(profile.extract(document, row))
    : {};
  const genericTrackers = getMagnetTrackers(magnetLink);
  const mBytes = profileData.mBytes ?? normalizeSizeToMBytes(firstText(document, profile.selectors?.size || []));
  const extractedInfo = profileData.info ?? firstHtml(document, profile.selectors?.info || []);
  const info = nullIfBlank(extractedInfo);
  const extractedCategory = profileData.category ?? firstText(document, profile.selectors?.category || []);
  const category = nullIfBlank(extractedCategory);
  const contents = Array.isArray(profileData.contents) ? profileData.contents : [];
  const trackers = uniqueStrings([...genericTrackers, ...(profileData.trackers || [])]);
  const parsed = {
    torrent_name: pickTorrentName({ magnetName, headingName, pageTitle }),
    source_url: row.page_url,
    magnet_link: magnetLink || null,
    numFiles: profileData.numFiles ?? (contents.length ? contents.length : null),
    mBytes,
    seeds: profileData.seeds ?? null,
    peers: profileData.peers ?? null,
    info,
    category,
    trackers,
    contents,
    source: row.source,
    parserProfile: profile.name,
    warnings: buildWarnings({ magnetLink, magnetName, headingName, pageTitle })
  };

  return parsed;
}
