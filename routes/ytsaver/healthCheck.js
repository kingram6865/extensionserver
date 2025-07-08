import { executeSQL } from "../../db/connect";
import { formatDateString } from "../../utilities/tools";

export const healthCheck = {
  path: "/health",
  method: "get",
  handler: async (req, res) => {
    const currentTime = new Date();
    const SQL = "SELECT COUNT(*) as 'Videos Archived Today' FROM youtube_downloads WHERE entry_date >= ?"
    try {
      const results = await executeSQL(SQL, 'random_facts', 55, [formatDateString(currentTime).dateOnly])
      if (results.success) {
        return res.json({info: "Extensions Server Health Check", ...results.data[0]});
      } else {
        return res.json(results.error)
      }
    } catch (err) {
      console.log(err)
    }
  }
}