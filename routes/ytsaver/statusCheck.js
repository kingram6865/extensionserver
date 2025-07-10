import { executeSQL } from "../../db/connect";

export const statusCheck = {
  path: "/ytsaver/status",
  method: "post",
  handler: async (req, res) => {
    const SQL = "SELECT objid, caption, description FROM youtube_downloads WHERE videoid = ?";
    let result = await executeSQL(SQL, 'random_facts', 55, [req.body.videoid]);
    res.json(result.data[0])
  }
}