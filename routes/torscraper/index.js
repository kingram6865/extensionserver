import { saveDom } from './saveDom.js';
import { scraperSources } from './scraperSources.js';
import { parseScrapedPages } from './parseScrapedPages.js';
import { promoteParsedTorrents } from './promoteParsedTorrents.js';

export const scraperRoutes = [
  saveDom,
  scraperSources,
  parseScrapedPages,
  promoteParsedTorrents,
];
