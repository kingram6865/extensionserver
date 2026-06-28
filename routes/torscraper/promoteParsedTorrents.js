import { getMissingPageIds, parsePromoteRequest, summarizePromotedRows } from './helpers/promotionHelpers.js';
import { fetchParsedRows, promoteParsedRows } from './promoter/torrentsPromoter.js';

export const promoteParsedTorrents = {
  path: '/scraper/promote/torrents',
  method: 'post',
  handler: async (req, res, next) => {
    try {
      const options = parsePromoteRequest(req.body || {});
      const result = await fetchParsedRows(options);
      const rows = result.data || [];
      const promotedRows = await promoteParsedRows(rows, { dryRun: options.dryRun });

      const missingPageIds = getMissingPageIds(options, rows);
      const summary = summarizePromotedRows(promotedRows);

      return res.status(200).json({
        ok: true,
        dryRun: options.dryRun,
        mode: options.mode,
        count: promotedRows.length,
        missingPageIds,
        summary,
        rows: promotedRows
      });
    } catch (err) {
      req.log?.error('scraper.promote.torrents.fail', { error: err.message });

      if (err.statusCode) {
        return res.status(err.statusCode).json({
          ok: false,
          error: err.message
        });
      }

      next(err);
    }
  }
};
