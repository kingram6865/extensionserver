import { executeSQL } from '../../db/dbconnect2';
import { parseSavedPage } from './parser/parseSavedPage.js';

const DBCONFIG = { DB: 'torrents', SRC: 55 };

function clampLimit(value) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return 25;
  return Math.max(1, Math.min(n, 500));
}

async function fetchRows({ pageId, limit }) {
  if (pageId) {
    const SQL = `
      SELECT objid, source, page_url, page_title, content_html
      FROM scraped_pages
      WHERE objid = ?
      LIMIT 1
    `;

    return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [pageId]);
  }

  const SQL = `
    SELECT objid, source, page_url, page_title, content_html
    FROM scraped_pages
    WHERE parsed = 0
    ORDER BY objid
    LIMIT ?
  `;

  return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [limit]);
}

async function saveParsedResult(scrapedPageId, parsed) {
  const SQL = `
    INSERT INTO scraped_page_torrents (
      scraped_page_id,
      source,
      source_url,
      torrent_name,
      magnet_link,
      num_files,
      mbytes,
      seeds,
      peers,
      info,
      category,
      trackers_json,
      contents_json,
      parser_profile,
      parser_warnings_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      torrent_name = VALUES(torrent_name),
      magnet_link = VALUES(magnet_link),
      num_files = VALUES(num_files),
      mbytes = VALUES(mbytes),
      seeds = VALUES(seeds),
      peers = VALUES(peers),
      info = VALUES(info),
      category = VALUES(category),
      trackers_json = VALUES(trackers_json),
      contents_json = VALUES(contents_json),
      parser_profile = VALUES(parser_profile),
      parser_warnings_json = VALUES(parser_warnings_json),
      last_update = CURRENT_TIMESTAMP
  `;

  const values = [
    scrapedPageId,
    parsed.source,
    parsed.source_url,
    parsed.torrent_name,
    parsed.magnet_link,
    parsed.numFiles,
    parsed.mBytes,
    parsed.seeds,
    parsed.peers,
    parsed.info,
    parsed.category,
    JSON.stringify(parsed.trackers || []),
    JSON.stringify(parsed.contents || []),
    parsed.parserProfile,
    JSON.stringify(parsed.warnings || [])
  ];

  return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, values);
}

async function markParsed(scrapedPageId, { parsed, error }) {
  const SQL = `
    UPDATE scraped_pages
    SET parsed = ?, parse_error = ?
    WHERE objid = ?
  `;

  const parsedValue = parsed ? 1 : 2;
  return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [
    parsedValue,
    error || null,
    scrapedPageId
  ]);
}

export const parseScrapedPages = {
  path: '/scraper/parse/pages',
  method: 'post',
  handler: async (req, res, next) => {
    try {
      const pageId = req.body?.pageId ? Number.parseInt(req.body.pageId, 10) : null;
      const limit = clampLimit(req.body?.limit);
      const dryRun = req.body?.dryRun === true;

      const result = await fetchRows({ pageId, limit });
      const rows = result.data || [];

      const parsedRows = [];

      for (const row of rows) {
        try {
          const parsed = parseSavedPage(row);
          parsedRows.push({
            scrapedPageId: row.objid,
            ok: true,
            parsed
          });

          if (!dryRun) {
            await saveParsedResult(row.objid, parsed);
            await markParsed(row.objid, { parsed: true });
          }
        } catch (err) {
          parsedRows.push({
            scrapedPageId: row.objid,
            ok: false,
            error: err.message
          });

          if (!dryRun) {
            await markParsed(row.objid, {
              parsed: false,
              error: err.message
            });
          }
        }
      }

      return res.status(200).json({
        ok: true,
        dryRun,
        count: parsedRows.length,
        rows: parsedRows
      });
    } catch (err) {
      req.log?.error('scraper.parse.pages.fail', { error: err.message });
      next(err);
    }
  }
};
