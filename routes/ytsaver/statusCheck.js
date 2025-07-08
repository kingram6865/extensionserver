import { executeSQL } from "../../db/connect";

export const statusCheck = {
  path: "/ytsaver/status",
  method: "post",
  handler: async (req, res) => {
    const SQL = 'SELECT objid, caption, description FROM youtube_downloads WHERE videoid = ?';
    let result = await executeSQL(SQL, 'random_facts', 55, [req.videoid]);
    return res.json(result);
  }
}