import { executeSQL } from "../../db/connect";

export const saveVideoLink = {
  path: "/ytsaver/save",
  method: "post",
  handler: async (req, res) => {
    const { videoid, time, complete } = req.body
    const SQL = 'INSERT INTO ytsaver (videoid, time, complete) VALUES (?,?,?)'
    let results = await executeSQL(SQL, 'test', 80, [videoid, time, `${complete}`]);
    return res.json(results);
  }
}