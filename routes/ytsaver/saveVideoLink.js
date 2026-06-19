import { executeSQL } from "../../db/connect";
import { validateVideoId } from "../../utilities/youtube";

export const saveVideoLink = {
  path: "/ytsaver/save",
  method: "post",
  handler: async (req, res, next) => {
    let apiVideoData
    // req.log?.info('ytsaver.save.ok', { videoId: apiVideoData?.id });
    try {
      apiVideoData = await validateVideoId(req.body)
      // req.log?.info('ytsaver.save.ok', { videoId: apiVideoData?.id });
      return res.json(apiVideoData);
    } catch (err) {
      req.log?.error('ytsaver.save.fail', { error: err.message });
      next(err);
    }
  }
}
