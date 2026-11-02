import { executeSQL } from "../../db/connect";
const DB = { db: 'facebook', src: 55 };
const SQL = "INSERT INTO watch_links (link) VALUES (?)";

function getVideoId(urlString) {
  const url = new URL(urlString);

  const videoId =
    url.searchParams.get('v') ||
    url.pathname.match(/^\/(?:watch|reel)\/(\d+)\/?$/)?.[1];

  return videoId && /^\d+$/.test(videoId) ? videoId : null;
}

export const saveFbVideoUrl = {
  path: "/fb/video/save",
  method: "post",
  handler: async (req, res, next) => {
    let fbVideoInfo = req.body;

    const data = fbVideoInfo.url.replace(/&[^\r\n]*|\/\?__[^\r\n]*/g, '');
    const videoId = getVideoId(data);

    try {
      const result = await executeSQL(SQL, DB.db, DB.src, [data])
      if (!result.success) {
        console.log(`Failed to add ${data}`);
        req.log?.warn("fbvideo.save.rejected", { error: result.error.message });
        return res.status(409).json({
          failedAdd: data,
          message: result.error.message,
        });
      }

      console.log("New FB Video [objid]: ", result.data?.insertId, `, Video ID: ${videoId}`);
      req.log?.info("fbvideo.save.ok", { objid: result.data?.insertId });
      return res.json({
        added: data,
        message: `objid: ${result.data?.insertId} for ${videoId}`,
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        req.log?.info("fbvideo.save.duplicate", { sqlMessage: err.sqlMessage });
        return res.status(409).json({ added: data, message: err.sqlMessage });
      }

      req.log?.error("fbvideo.save.fail", { error: err.code ?? String(err) });
      return next(err);
    }
  }
}
