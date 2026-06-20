import mysql from 'mysql2'
import 'dotenv/config';

// Default: MySQL 5.5 Instance
const DBCONFIG = {
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPWD,
}

// MySQL 8 instance
const DBCONFIG2 = {
  host: process.env.MYSQL8HOST,
  port: process.env.MYSQL8PORT,
  user: process.env.MYSQL8USER,
  password: process.env.MYSQL8PWD,
}

// MySQL 5.7 instance
const DBCONFIG3 = {
  host: process.env.MYSQL57HOST,
  port: process.env.MYSQL57PORT,
  user: process.env.MYSQL57USER,
  password: process.env.MYSQL57PWD,
}

const pools = {};

function getPool(dbsrc, db) {
  const key = `${dbsrc}:${db}`
  if (!pools[key]) {
    let baseConfig;
    switch(dbsrc) {
      case 55:
        baseConfig = DBCONFIG;
        break;
      case 57:
        baseConfig = DBCONFIG3;
        break;
      case 80:
        baseConfig = DBCONFIG2;
        break;
      default:
        throw new Error(`No pool config for dbsrc ${dbsrc}`)
    }

    pools[key] = mysql.createPool({ ...baseConfig, database: db, waitForConnections: true, connectionLimit: 10, })
  }

  return pools[key];
}

export async function executeSQL(sql, db, dbsrc, params = []) {
  const pool = getPool(dbsrc, db);

  try {
    const [rows] = await pool.promise().query(sql, params);

    // INSERT / UPDATE / DELETE (non-array result)
    if (!Array.isArray(rows)) {
      return {
        success: true,
        rowCount: rows.affectedRows ?? 0,
        insertId: rows.insertId ?? null,
        data: rows
      };
    }

    return { success: true, rowCount: rows.length, data: rows };
  } catch (err) {
    // Query Error keys: [ 'message', 'code', 'errno', 'sql', 'sqlState', 'sqlMessage' ]
    if (err.sqlState === '45000') {
      return {
        success: false,
        error: {
          message: err.sqlMessage,
          code: err.code,
          errno: err.errno,
          sqlState: err.sqlState,
          sql: err.sql,
        }
      };
    }
    throw err;
  }
}
