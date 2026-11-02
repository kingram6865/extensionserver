import { executeSQL } from "../../db/connect";
const DB = { db: 'facebook', src: 55 };
const SQL = "SELECT * FROM watch_links";

export const getFbVideos = {
  path: "/fb/video",
  method: "get",
  handler: async (req, res) => {
    const result = await executeSQL(SQL, DB.db, DB.src);
    res.json(result.data);
  }
}
