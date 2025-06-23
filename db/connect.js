import mysql from 'mysql2'
import 'dotenv/config';

// Default: Mysql 5.5 Instances
const DBCONFIG = {
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPWD,
}

// MySQL 8
const DBCONFIG2 = {
  host: process.env.MYSQL8HOST,
  port: process.env.MYSQL8PORT,
  user: process.env.MYSQL8USER,
  password: process.env.MYSQL8PWD,
}

// MySQL 57: Personal Info
const DBCONFIG3 = {
  host: process.env.MYSQL57HOST,
  port: process.env.MYSQL57PORT,
  user: process.env.MYSQL57USER,
  password: process.env.MYSQL57PWD,
}

export const pool = (db) => mysql.createPool({...DBCONFIG, database: db, waitForConnections: true})
export const apolloPool = (db) => mysql.createPool({...DBCONFIG2, database: db, waitForConnections: true})
export const personalPool = (db) => mysql.createPool({...DBCONFIG3, database: db, waitForConnections: true})
export const formatSQL = (SQL, parameters) => mysql.format(SQL, parameters)

export async function executeSQL(sql, db, dbsrc, data = []) {
  let conn;

  switch (dbsrc) {
    case 55:
      conn = pool(db);
      break;
    case 57:
      conn = personalPool(db);
      break;
    case 80:
      conn = apolloPool(db);
      break;
  }

  if (data.length > 0) {
    sql = mysql.format(sql, data);
  }

  try {
    const [rows, fields] = await conn.promise().query(sql);
    return {success: true, data: rows, fields: (fields?.length > 0) ? fields : []};
  } catch (err) {
    // Query Error keys: [ 'message', 'code', 'errno', 'sql', 'sqlState', 'sqlMessage' ]
    if (err.sqlState === '45000') {
      return { success: false, error: {message: err.sqlMessage, sql: err.sql} };
    }
    throw err;
  }
}

