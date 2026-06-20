import { getJsonLimitInfo } from "../../config/serverLimits.js";
import { executeSQL } from "../../db/dbconnect2";

async function constructRulesRelationship(input) {
  const SQL = "SELECT page_type, path_regex FROM torrent_site_page_rules WHERE site_id = ?";
  const results = input.map(async site => {
    const siteResults = await executeSQL(SQL, 'torrents', 55, [site.objid])
    const pageRules = siteResults.data
      .filter(rule => rule.page_type && rule.path_regex)
      .map(rule => ({
        pageType: rule.page_type,
        pathRegex: rule.path_regex,
      }));

    return {...site, pageRules };
  })

  return Promise.all(results);
}

export const scraperSources = {
  path: '/scraper/sources',
  method: 'get',
  handler: async (req, res, next) => {
    try {
      const SQL = "SELECT * FROM torrent_sites WHERE current_status = 'active' AND scrape_source = 1";
      const firstResult = await executeSQL(SQL, 'torrents', 55)
      const results = await constructRulesRelationship(firstResult.data);

      res.status(200).json({
        ok: true,
        limits: getJsonLimitInfo(),
        sources: results,
      });
    } catch (err) {
      req.log?.error('Could not retrieve sources', { error: err.message });
      next(err);
    }
  }
}
