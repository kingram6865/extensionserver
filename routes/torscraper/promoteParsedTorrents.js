import { executeSQL } from '../../db/dbconnect2';
import { reuse } from '../../db/dbFunctions';
import { mapParsedTorrentToDownloaded } from './promoter/torrentsDownloadedMapper.js';

const DBCONFIG = { DB: 'torrents', SRC: 55 };

function clampLimit(value) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return 25;
  return Math.max(1, Math.min(n, 500));
}

async function fetchParsedRows({ scrapedPageId, limit }) {
  if (scrapedPageId) {
    const SQL = ` SELECT * FROM scraped_page_torrents WHERE scraped_page_id = ? LIMIT 1`;
    return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [scrapedPageId]);
  }

  const SQL = `SELECT spt.* FROM scraped_page_torrents spt ORDER BY spt.objid LIMIT ?`;
  return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [limit]);
}

async function findExistingTorrent(mapped) {
  if (mapped.hash) {
    const SQL = "SELECT objid FROM torrents_downloaded WHERE hash = ? LIMIT 1";
    const byHash = await executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [mapped.hash]);

    if (byHash.data?.length) return byHash.data[0];
  }

  if (mapped.source_url) {
    const SQL = "SELECT objid FROM torrents_downloaded WHERE source_url = ? LIMIT 1";
    const byUrl = await executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [mapped.source_url]);

    if (byUrl.data?.length) return byUrl.data[0];
  }

  return null;
}

async function insertTorrent(mapped) {
  let SQL, values;
  let reused = await reuse();

  if (reused.length > 0) {
    const objid = reused[0].objid;

    SQL = `UPDATE torrents_downloaded SET
      download_name=?,
      source_url=?,
      magnet_link=?,
      contents=?,
      files=?,
      total_megabytes=?,
      seeds=?,
      peers=?,
      info=?,
      general_category=?,
      specific_category=?,
      trackers=?,
      single_file=?,
      download_status='new',
      availability=0,
      share_ratio=0,
      active=0,
      archive_status='',
      pieces=0,
      piece_sizes_kb=0,
      last_update=NOW()
      WHERE objid = ?`;

    values = [
      mapped.download_name,
      mapped.source_url,
      mapped.magnet_link,
      mapped.contents,
      mapped.files,
      mapped.total_megabytes,
      mapped.seeds,
      mapped.peers,
      mapped.info,
      mapped.general_category,
      mapped.specific_category,
      mapped.trackers,
      mapped.single_file,
      objid
    ];

  } else {
    SQL = `
      INSERT INTO torrents_downloaded (
        download_name,
        source_url,
        magnet_link,
        files,
        total_megabytes,
        seeds,
        peers,
        info,
        general_category,
        specific_category,
        trackers,
        contents,
        single_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    values = [
      mapped.download_name,
      mapped.source_url,
      mapped.magnet_link,
      mapped.files,
      mapped.total_megabytes,
      mapped.seeds,
      mapped.peers,
      mapped.info,
      mapped.general_category,
      mapped.specific_category,
      mapped.trackers,
      mapped.contents,
      mapped.single_file
    ];
  }

  return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, values);
}

export const promoteParsedTorrents = {
  path: '/scraper/promote/torrents',
  method: 'post',
  handler: async (req, res, next) => {
    try {
      const scrapedPageId = req.body?.scrapedPageId
        ? Number.parseInt(req.body.scrapedPageId, 10)
        : null;

      const limit = clampLimit(req.body?.limit);
      const dryRun = req.body?.dryRun === true;

      const result = await fetchParsedRows({ scrapedPageId, limit });
      const rows = result.data || [];

      const promotedRows = [];

      for (const row of rows) {
        const mapped = mapParsedTorrentToDownloaded(row);

        if (dryRun) {
          const existing = await findExistingTorrent(mapped);

          promotedRows.push({
            scrapedPageId: row.scraped_page_id,
            action: existing ? 'dry_run_possible_duplicate' : 'dry_run_insert',
            existingObjid: existing?.objid || null,
            mapped
          });

          continue;
        }

        try {
          const insertResult = await insertTorrent(mapped);
          const insertId = insertResult.data?.insertId || insertResult.insertId || null;

          promotedRows.push({
            scrapedPageId: row.scraped_page_id,
            action: insertId ? 'insert' : 'insert_attempted',
            insertId,
            mapped
          });
        } catch (err) {
          const message = err.message || String(err);
          const duplicateLike =
            err.code === 'ER_DUP_ENTRY' ||
            /duplicate/i.test(message) ||
            /already exists/i.test(message) ||
            /exists/i.test(message);

          if (!duplicateLike) {
            throw err;
          }

          promotedRows.push({
            scrapedPageId: row.scraped_page_id,
            action: 'blocked_duplicate',
            insertId: null,
            error: message,
            mapped
          });
        }
      }

      const summary = promotedRows.reduce((acc, row) => {
        acc[row.action] = (acc[row.action] || 0) + 1;
        return acc;
      }, {});

      return res.status(200).json({
        ok: true,
        dryRun,
        count: promotedRows.length,
        summary,
        rows: promotedRows
      });
    } catch (err) {
      req.log?.error('scraper.promote.torrents.fail', { error: err.message });
      next(err);
    }
  }
};
