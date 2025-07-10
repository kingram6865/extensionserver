import { executeSQL } from "../../db/connect";
import { validateVideoId } from "../../utilities/youtube";

export const saveVideoLink = {
  path: "/ytsaver/save",
  method: "post",
  handler: async (req, res) => {
    let apiVideoData = await validateVideoId(req.body)
    return res.json(apiVideoData);
  }
}