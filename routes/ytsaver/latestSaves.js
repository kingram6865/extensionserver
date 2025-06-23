import { executeSQL } from "../../db/connect";
import { formatDateString } from "../../utilities/tools";

export const latestSaves = {
  path: "/ytsave",
  method: "get",
  handler: async (req, res) => {
    // Select list of saved links between start and end date. End date is optional (defaults to NOW())
    const [start, end] = req.params;
    // Make sure query parameters are dates

    const oldest = formatDateString(start)
    const latest = formatDateString(end)
    const sql = "SELECT * from youtube_downloads WHERE entry_date >= ? AND entry_date <= ?"

    try {
      const results = await executeSQL(sql, test, 55, [oldest, latest]);
      res.json(results);
    } catch(err) {
      res.status(500).send('Server Error')
    }
  }
}