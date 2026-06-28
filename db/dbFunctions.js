import { executeSQL } from "./dbconnect2";
const DBCONFIG = { DB: 'torrents', SRC: 55 };

export async function reuse() {
  let SQL = "SELECT objid FROM torrents_downloaded WHERE download_status = 'reuse'";
  let reuseList = await executeSQL(SQL, DBCONFIG.DB, DBCONFIG.SRC);
  return reuseList;
}
