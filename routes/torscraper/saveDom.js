import { validateDomPayload } from './validateDomPayload';
import { executeSQL } from '../../db/dbconnect2';
const DBCONFIG = {DB: 'torrents', SRC: 55};

export const saveDom = {
  path: '/scraper/save/dom',
  method: 'post',
  handler: async (req, res, next) => {
    const SQL = `INSERT IGNORE INTO scraped_pages (source, page_url, page_url_sha256, page_title,
      content_selector, content_html, content_sha256, parsed, parse_error)
      VALUES (?,?,SHA2(?, 256),?,?,?,SHA2(?, 256),0,NULL)`;

    const SELECT_SQL = `SELECT objid FROM scraped_pages WHERE source = ?
      AND page_url_sha256 = SHA2(?, 256) AND content_sha256 = SHA2(?, 256) LIMIT 1`;

    try {
      const validation = validateDomPayload(req.body);
      if (!validation.ok) {
        return res.status(400).json({
          ok: false,
          success: false,
          accepted: false,
          errors: validation.errors
        });
      }

      const payload = validation.payload;

      const values = [
        payload.source,
        payload.url,
        payload.url,
        payload.pageTitle || null,
        'document.documentElement.outerHTML',
        payload.dom,
        payload.dom
      ];

      const selectValues = [ payload.source, payload.url, payload.dom ];
      const result = await executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC, values);

      const rows = result.data || result;
      const affectedRows = rows.affectedRows ?? result.rowCount ?? 0;
      const inserted = affectedRows === 1;
      const alreadyExists = affectedRows === 0;
      const existing = await executeSQL(SELECT_SQL, DBCONFIG.DB, DBCONFIG.SRC, selectValues);

      const finalResult = {
        ...result,
        ok: true ,
        alreadyExists,
        inserted,
        savedPageId: existing.data?.[0]?.objid ?? null
      };

      if (inserted) {
        console.log(`torscraper Extension added objid: ${result.insertId} ${values[3]}`);
      }
      return res.status(inserted ? 201 : 200).json(finalResult);

      // return res.status(202).json({
      //   ok: true,
      //   accepted: true,
      //   message: 'DOM payload accepted',
      //   source: payload.source,
      //   pageType: payload.pageType,
      //   url: payload.url,
      //   hostname: payload.hostname,
      //   pathname: payload.pathname,
      //   domLength: payload.domLength,
      //   capturedAt: payload.capturedAt,
      //   receivedAt: new Date().toISOString()
      // });
    } catch (err) {
      req.log?.error('scraper.save.dom.fail', { error: err.message });
      next(err);
    }
  }
}
