import mysql from 'mysql2';
import { AsyncLocalStorage } from 'node:async_hooks';
import 'dotenv/config';

const sqlTransactionContext = new AsyncLocalStorage();
const poolCache = new Map();

const databaseConfigs = {
  55: {
    host: process.env.MYSQLHOST,
    port: process.env.MYSQLPORT,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPWD,
  },
  57: {
    host: process.env.MYSQL57HOST,
    port: process.env.MYSQL57PORT,
    user: process.env.MYSQL57USER,
    password: process.env.MYSQL57PWD,
  },
  80: {
    host: process.env.MYSQL8HOST,
    port: process.env.MYSQL8PORT,
    user: process.env.MYSQL8USER,
    password: process.env.MYSQL8PWD,
  },
};

const poolOptions = {
  waitForConnections: true,
  connectionLimit: 50,
  maxIdle: 30,
  idleTimeout: 60000,
  queueLimit: 0,
};

function getPool(db, dbsrc) {
  const databaseConfig = databaseConfigs[dbsrc];

  if (!databaseConfig) {
    throw new Error(`Unsupported database source: ${dbsrc}`);
  }

  const poolKey = JSON.stringify([dbsrc, db]);

  if (!poolCache.has(poolKey)) {
    const connectionPool = mysql.createPool({
      ...databaseConfig,
      ...poolOptions,
      database: db,
    });

    poolCache.set(poolKey, connectionPool);
  }

  return poolCache.get(poolKey);
}

export const pool = db => getPool(db, 55);
export const personalPool = db => getPool(db, 57);
export const apolloPool = db => getPool(db, 80);

export const formatSQL = (sql, parameters) => mysql.format(sql, parameters);

export async function closeDatabasePools() {
  const openPools = [...poolCache.values()];
  poolCache.clear();

  await Promise.all(
    openPools.map(connectionPool => connectionPool.promise().end()),
  );
}

function getTransactionConnection(db, dbsrc) {
  const activeTransaction = sqlTransactionContext.getStore();

  if (activeTransaction?.db !== db || activeTransaction?.dbsrc !== dbsrc) {
    return null;
  }

  return activeTransaction.connection;
}

function normalizeQueryResult(result) {
  if (Array.isArray(result)) {
    return {
      success: true,
      rowCount: result.length,
      data: result,
    };
  }

  return {
    success: true,
    rowCount: result.affectedRows ?? 0,
    insertId: result.insertId ?? null,
    data: result,
  };
}

function normalizeQueryError(error) {
  return {
    success: false,
    error: {
      message: error.sqlMessage,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sql: error.sql,
    },
  };
}

export async function executeSQL(sql, db, dbsrc, params = []) {
  const transactionConnection = getTransactionConnection(db, dbsrc);

  try {
    const queryResult = transactionConnection
      ? await transactionConnection.query(sql, params)
      : await getPool(db, dbsrc).promise().query(sql, params);

    const [result] = queryResult;
    return normalizeQueryResult(result);
  } catch (error) {
    if (error.sqlState === '45000') {
      return normalizeQueryError(error);
    }

    throw error;
  }
}

export async function withSQLTransaction(db, dbsrc, action) {
  const connectionPool = getPool(db, dbsrc);
  let transactionConnection;
  let transactionStarted = false;

  try {
    transactionConnection = await connectionPool.promise().getConnection();
    await transactionConnection.beginTransaction();
    transactionStarted = true;

    return await sqlTransactionContext.run(
      { db, dbsrc, connection: transactionConnection },
      async () => {
        const result = await action();
        await transactionConnection.commit();
        transactionStarted = false;
        return result;
      },
    );
  } catch (error) {
    if (transactionConnection && transactionStarted) {
      try {
        await transactionConnection.rollback();
        transactionStarted = false;
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'The transaction failed and the rollback also failed.',
          { cause: error },
        );
      }
    }

    throw error;
  } finally {
    if (transactionConnection) {
      transactionConnection.release();
    }
  }
}
