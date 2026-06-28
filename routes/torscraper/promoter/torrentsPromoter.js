import { executeSQL } from '../../../db/dbconnect2';
import { reuse } from '../../../db/dbFunctions';
import { mapParsedTorrentToDownloaded } from './torrentsDownloadedMapper.js';
import { isDuplicateError } from './helpers.js';

const DBCONFIG = { DB: 'torrents', SRC: 55 };

export async function fetchParsedRows(options) {
  if (options.mode === 'single' || options.mode === 'list') {
    const idPlaceholders = options.ids.map(() => '?').join(', ');
    const orderPlaceholders = options.ids.map(() => '?').join(', ');

    const SQL = `
      SELECT *
      FROM scraped_page_torrents
      WHERE scraped_page_id IN (${idPlaceholders})
      ORDER BY FIELD(scraped_page_id, ${orderPlaceholders})
    `;

    return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [
      ...options.ids,
      ...options.ids
    ]);
  }

  if (options.mode === 'range') {
    const SQL = `
      SELECT *
      FROM scraped_page_torrents
      WHERE scraped_page_id BETWEEN ? AND ?
      ORDER BY scraped_page_id
    `;

    return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [
      options.range.start,
      options.range.end
    ]);
  }

  const SQL = `
    SELECT spt.*
    FROM scraped_page_torrents spt
    ORDER BY spt.objid
    LIMIT ?
  `;

  return executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [options.limit]);
}

export async function findExistingTorrent(mapped) {
  if (mapped.hash) {
    const SQL = `
      SELECT objid
      FROM torrents_downloaded
      WHERE hash = ?
      LIMIT 1
    `;

    const byHash = await executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [
      mapped.hash
    ]);

    if (byHash.data?.length) return byHash.data[0];
  }

  if (mapped.source_url) {
    const SQL = `
      SELECT objid
      FROM torrents_downloaded
      WHERE source_url = ?
      LIMIT 1
    `;

    const byUrl = await executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, [
      mapped.source_url
    ]);

    if (byUrl.data?.length) return byUrl.data[0];
  }

  return null;
}

function getInsertId(result) {
  return result.data?.insertId ?? result.insertId ?? null;
}

export async function insertTorrent(mapped) {
  let SQL;
  let values;

  const reused = await reuse();

  if (reused.length > 0) {
    const objid = reused[0].objid;

    SQL = `
      UPDATE torrents_downloaded
      SET
        download_name = ?,
        source_url = ?,
        magnet_link = ?,
        files = ?,
        total_megabytes = ?,
        seeds = ?,
        peers = ?,
        info = ?,
        general_category = ?,
        specific_category = ?,
        trackers = ?,
        contents = ?,
        single_file = ?,
        download_status = 'new',
        availability = 0,
        share_ratio = 0,
        active = 0,
        archive_status = '',
        pieces = 0,
        piece_sizes_kb = 0,
        last_update = NOW()
      WHERE objid = ?
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
        single_file
      )
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

export async function promoteParsedRows(rows, { dryRun }) {
  const promotedRows = [];

  for (const row of rows) {
    const mapped = mapParsedTorrentToDownloaded(row);
    const existing = await findExistingTorrent(mapped);

    if (dryRun) {
      promotedRows.push({
        scrapedPageId: row.scraped_page_id,
        action: existing ? 'dry_run_possible_duplicate' : 'dry_run_insert',
        existingObjid: existing?.objid || null,
        mapped
      });

      continue;
    }

    if (existing) {
      promotedRows.push({
        scrapedPageId: row.scraped_page_id,
        action: 'blocked_duplicate',
        existingObjid: existing.objid,
        insertId: null,
        mapped
      });

      continue;
    }

    try {
      const insertResult = await insertTorrent(mapped);
      const insertId = getInsertId(insertResult);

      promotedRows.push({
        scrapedPageId: row.scraped_page_id,
        action: insertId ? 'insert' : 'insert_attempted',
        insertId,
        existingObjid: null,
        mapped
      });
    } catch (err) {
      if (!isDuplicateError(err)) {
        throw err;
      }

      const duplicate = await findExistingTorrent(mapped);

      promotedRows.push({
        scrapedPageId: row.scraped_page_id,
        action: 'blocked_duplicate',
        existingObjid: duplicate?.objid || null,
        insertId: null,
        error: err.message || String(err),
        mapped
      });
    }
  }

  return promotedRows;
}
