import {
  cleanText,
  firstText,
  firstHtml,
  parseInteger,
  normalizeSizeToMBytes,
  uniqueStrings
} from './helpers.js';

function torrentProjectContents(document) {
  return Array.from(document.querySelectorAll('#torrentcontentfilessize .torrent_cont'))
    .map(node => {
      const clone = node.cloneNode(true);

      clone.querySelector('.file')?.remove();
      clone.querySelector('.file_size_search')?.remove();

      return cleanText(clone.textContent || '');
    })
    .filter(Boolean);
}

function torrentProjectSeedsPeers(document) {
  const text = document.querySelector('#seeders-leechers')?.textContent || '';

  return {
    seeds: parseInteger(text.match(/seeders:\s*[\d,]+/i)?.[0]),
    peers: parseInteger(text.match(/leechers:\s*[\d,]+/i)?.[0])
  };
}

function torrentQuestContents(document) {
  return Array.from(document.querySelectorAll('#files-box .f-avi'))
    .map(node => cleanText(node.textContent || ''))
    .filter(Boolean);
}

function torrentQuestStats(document) {
  const col2 = document.querySelector('dl.col2');
  const dd = col2 ? Array.from(col2.querySelectorAll('dd')) : [];

  return {
    seeds: parseInteger(dd[2]?.textContent),
    peers: parseInteger(dd[3]?.textContent)
  };
}

function torrentQuestMeta(document) {
  const col1 = document.querySelector('dl.col1');
  const dd = col1 ? Array.from(col1.querySelectorAll('dd')) : [];

  return {
    category: cleanText(dd[1]?.textContent || ''),
    numFiles: parseInteger(dd[2]?.textContent),
    mBytes: normalizeSizeToMBytes(dd[3]?.textContent),
    info: dd[4]?.innerHTML?.trim() || ''
  };
}

function solidTorrentsContents(document) {
  const fileNodes = Array.from(document.querySelectorAll(
    '#file-tree .file-node p.text-sm, #file-tree .file-node [title], .file-name'
  ));

  return uniqueStrings(
    fileNodes.map(node => node.getAttribute('title') || node.textContent)
  );
}

function solidTorrentsStats(document) {
  const bodyText = cleanText(document.body?.textContent || '');

  return {
    seeds: parseInteger(bodyText.match(/[\d,]+\s*Seeders/i)?.[0]),
    peers:
      parseInteger(bodyText.match(/[\d,]+\s*Leechers/i)?.[0]) ??
      parseInteger(bodyText.match(/[\d,]+\s*Peers/i)?.[0])
  };
}

function solidTorrentsSize(document) {
  const bodyText = cleanText(document.body?.textContent || '');

  const sizeText =
    bodyText.match(/([\d,.]+\s*(?:TB|GB|MB|KB))\s*Size/i)?.[1] ||
    bodyText.match(/\bfiles\b\s*[•\-]\s*([\d,.]+\s*(?:TB|GB|MB|KB))/i)?.[1] ||
    '';

  return normalizeSizeToMBytes(sizeText);
}

export const parserProfiles = [
  {
    name: 'torrentproject',
    match: ({ source, hostname }) =>
      source === 'torrentproject' || hostname.includes('torrentproject'),

    selectors: {
      torrentName: ['h1', 'title'],
      size: ['#torrent-size'],
      info: ['#torrent-desc', '#description', '.description'],
      category: ['#torrent-category', '.category']
    },

    extract: document => {
      const stats = torrentProjectSeedsPeers(document);

      return {
        mBytes: normalizeSizeToMBytes(firstText(document, ['#torrent-size'])),
        seeds: stats.seeds,
        peers: stats.peers,
        contents: torrentProjectContents(document),
        trackers: uniqueStrings(
          Array.from(document.querySelectorAll('.ttracker'))
            .map(node => node.textContent)
        )
      };
    }
  },

  {
    name: 'torrentquest',
    match: ({ source, hostname }) =>
      source === 'torrentquest' || hostname.includes('torrentquest'),

    selectors: {
      torrentName: ['.header-content', 'h1', 'title'],
      info: ['#info', '.description']
    },

    extract: document => {
      const meta = torrentQuestMeta(document);
      const stats = torrentQuestStats(document);

      return {
        ...meta,
        ...stats,
        contents: torrentQuestContents(document)
      };
    }
  },

  {
    name: 'solidtorrents',
    match: ({ source, hostname }) =>
      source === 'solidtorrents' || hostname.includes('solidtorrents'),

    selectors: {
      torrentName: ['h1', 'main h1', '.view-box h1', 'title'],
      info: ['.view-box', '.info', '.description'],
      category: ['[class*="category"] a', 'a[href*="category"]']
    },

    extract: document => {
      const stats = solidTorrentsStats(document);

      return {
        mBytes: solidTorrentsSize(document),
        seeds: stats.seeds,
        peers: stats.peers,
        contents: solidTorrentsContents(document)
      };
    }
  },

  {
    name: 'generic',
    match: () => true,

    selectors: {
      torrentName: ['h1', '.title', 'title'],
      size: ['#torrent-size', '.size', '[class*="size"]'],
      info: ['#description', '.description', '.info'],
      category: ['.category', '[class*="category"]']
    },

    extract: () => ({})
  }
];

export function selectParserProfile({ source, pageUrl }) {
  const url = new URL(pageUrl);

  return parserProfiles.find(profile =>
    profile.match({
      source,
      hostname: url.hostname,
      pathname: url.pathname,
      url
    })
  );
}
