const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const { closeDatabasePools, executeSQL, withSQLTransaction } = require('../db/connect');

const TEST_DB = process.env.EOE_TEST_DB;
const SOURCE = 80;
const TABLE_SUFFIX = `${process.pid}_${Date.now()}`;
const tokenTable = `eoe_test_tokens_${TABLE_SUFFIX}`;
const scopeTable = `eoe_test_scopes_${TABLE_SUFFIX}`;
const stateTable = `eoe_test_states_${TABLE_SUFFIX}`;
const transactionTable = `eoe_test_transaction_${TABLE_SUFFIX}`;

after(async () => {
  await closeDatabasePools();
});

test('MySQL enforces the EOE token and scope key relationships', { skip: !TEST_DB }, async () => {
  assert.match(TEST_DB, /(?:^|_)test(?:_|$)/i, 'EOE_TEST_DB must identify a test database');

  const createTokenTableSql = `
    CREATE TABLE ${tokenTable} (
      objid BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      character_id BIGINT UNSIGNED NOT NULL,
      entry_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (objid),
      KEY ix_test_character_id (character_id)
    )
  `;
  const createScopeTableSql = `
    CREATE TABLE ${scopeTable} (
      objid BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      token_objid BIGINT UNSIGNED NOT NULL,
      scope_name VARCHAR(255) NOT NULL,
      entry_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (objid),
      UNIQUE KEY uq_test_token_scope (token_objid, scope_name),
      CONSTRAINT fk_test_token_scope_${TABLE_SUFFIX}
        FOREIGN KEY (token_objid)
        REFERENCES ${tokenTable} (objid)
        ON DELETE CASCADE
    )
  `;
  const dropScopeTableSql = `DROP TABLE IF EXISTS ${scopeTable}`;
  const dropTokenTableSql = `DROP TABLE IF EXISTS ${tokenTable}`;

  try {
    await executeSQL(createTokenTableSql, TEST_DB, SOURCE);
    await executeSQL(createScopeTableSql, TEST_DB, SOURCE);

    const insertTokenSql = `INSERT INTO ${tokenTable} (character_id) VALUES (?)`;
    const firstToken = await executeSQL(insertTokenSql, TEST_DB, SOURCE, [123456]);
    const secondToken = await executeSQL(insertTokenSql, TEST_DB, SOURCE, [123456]);

    // Check the normalized INSERT result fields.
    assert.equal(firstToken.rowCount, 1);
    assert.equal(secondToken.rowCount, 1);
    assert.ok(firstToken.insertId);
    assert.ok(secondToken.insertId);
    assert.notEqual(firstToken.insertId, secondToken.insertId);

    const insertScopeSql = `INSERT INTO ${scopeTable} (token_objid, scope_name) VALUES (?, ?)`;

    // Use executeSQL's top-level insertId.
    const scopeParameters = [firstToken.insertId, 'scope.one'];
    const scopeInsert = await executeSQL(insertScopeSql, TEST_DB, SOURCE, scopeParameters);

    // Check the normalized affected-row count.
    assert.equal(scopeInsert.rowCount, 1);

    await assert.rejects(
      executeSQL(insertScopeSql, TEST_DB, SOURCE, scopeParameters)
    );

    await assert.rejects(
      executeSQL(insertScopeSql, TEST_DB, SOURCE, [999999999, 'scope.invalid'])
    );
  } finally {
    await executeSQL(dropScopeTableSql, TEST_DB, SOURCE);
    await executeSQL(dropTokenTableSql, TEST_DB, SOURCE);
  }
});

test('MySQL allows one state claim and retains expired state rows', { skip: !TEST_DB }, async () => {
  assert.match(TEST_DB, /(?:^|_)test(?:_|$)/i, 'EOE_TEST_DB must identify a test database');

  const createStateTableSql = `
    CREATE TABLE ${stateTable} (
      objid BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      state_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
      entry_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      consumed_at DATETIME NULL,
      completed_at DATETIME NULL,
      failed_at DATETIME NULL,
      failure_stage VARCHAR(32) NULL,
      PRIMARY KEY (objid),
      UNIQUE KEY uq_test_state_hash (state_hash),
      KEY ix_test_state_expiry (expires_at)
    )
  `;

  const insertActiveStateSql = `
    INSERT INTO ${stateTable} (state_hash, expires_at, status)
    VALUES (?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE), ?)`;

  const insertExpiredStateSql = `
  INSERT INTO ${stateTable} (state_hash, expires_at, status)
  VALUES (?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE), ?)`;

  const claimStateSql = `
    UPDATE ${stateTable}
    SET status = 'processing', consumed_at = UTC_TIMESTAMP()
    WHERE state_hash = ? AND status = 'pending' AND expires_at > UTC_TIMESTAMP()
  `;
  const selectStateSql = `
    SELECT status, expires_at, entry_date
    FROM ${stateTable}
    WHERE state_hash = ?
  `;

  const dropStateTableSql = `DROP TABLE IF EXISTS ${stateTable}`;

  try {
    await executeSQL(createStateTableSql, TEST_DB, SOURCE);

    const activeHash = `active_${TABLE_SUFFIX}`.padEnd(64, 'a');

    const activeStateInsert = await executeSQL(insertActiveStateSql, TEST_DB, SOURCE, [
      activeHash,
      'pending',
    ]);

    // INSERT rowCount is now checked at the top level.
    assert.equal(activeStateInsert.rowCount, 1);

    const claimResults = await Promise.all([
      executeSQL(claimStateSql, TEST_DB, SOURCE, [activeHash]),
      executeSQL(claimStateSql, TEST_DB, SOURCE, [activeHash]),
    ]);

    // Check affected-row counts for both concurrent UPDATE calls.
    assert.deepEqual(claimResults.map(result => result.rowCount).sort(), [0, 1]);

    const claimedState = await executeSQL(selectStateSql, TEST_DB, SOURCE, [activeHash]);

    // SELECT rowCount is the number of returned rows.
    assert.equal(claimedState.rowCount, 1);
    assert.equal(claimedState.data[0].status, 'processing');

    const expiredHash = `expired_${TABLE_SUFFIX}`.padEnd(64, 'b');

    const expiredStateInsert = await executeSQL(insertExpiredStateSql, TEST_DB, SOURCE, [
      expiredHash,
      'pending',
    ]);

    // Check INSERT rowCount at the top level.
    assert.equal(expiredStateInsert.rowCount, 1);

    const expiredClaim = await executeSQL(claimStateSql, TEST_DB, SOURCE, [expiredHash]);

    // No rows were affected by the expired-state UPDATE.
    assert.equal(expiredClaim.rowCount, 0);

    const retainedExpiredState = await executeSQL(selectStateSql, TEST_DB, SOURCE, [expiredHash]);

    // Check normalized SELECT rowCount.
    assert.equal(retainedExpiredState.rowCount, 1);
    assert.equal(retainedExpiredState.data.length, 1);
    assert.equal(retainedExpiredState.data[0].status, 'pending');
    assert.ok(retainedExpiredState.data[0].entry_date);
  } finally {
    await executeSQL(dropStateTableSql, TEST_DB, SOURCE);
  }
});

test('executeSQL calls commit or roll back as one transaction', { skip: !TEST_DB }, async () => {
  assert.match(TEST_DB, /(?:^|_)test(?:_|$)/i, 'EOE_TEST_DB must identify a test database');

  const createTransactionTableSql = `
    CREATE TABLE ${transactionTable} (
      objid BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      test_value VARCHAR(32) NOT NULL,
      entry_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (objid),
      UNIQUE KEY uq_test_transaction_value (test_value)
    )
  `;
  const insertTransactionRowSql = `INSERT INTO ${transactionTable} (test_value) VALUES (?)`;
  const selectTransactionCountSql = `SELECT COUNT(*) AS row_count FROM ${transactionTable}`;
  const dropTransactionTableSql = `DROP TABLE IF EXISTS ${transactionTable}`;

  try {
    await executeSQL(createTransactionTableSql, TEST_DB, SOURCE);

    await withSQLTransaction(TEST_DB, SOURCE, async () => {
      await executeSQL(insertTransactionRowSql, TEST_DB, SOURCE, ['committed-one']);
      await executeSQL(insertTransactionRowSql, TEST_DB, SOURCE, ['committed-two']);
    });

    const committedRows = await executeSQL(selectTransactionCountSql, TEST_DB, SOURCE);

    // The SELECT returns one aggregate row; its value is still two.
    assert.equal(committedRows.rowCount, 1);
    assert.equal(committedRows.data[0].row_count, 2);

    await assert.rejects(
      withSQLTransaction(TEST_DB, SOURCE, async () => {
        await executeSQL(insertTransactionRowSql, TEST_DB, SOURCE, ['rolled-back']);
        await executeSQL(insertTransactionRowSql, TEST_DB, SOURCE, ['rolled-back']);
      })
    );

    const rowsAfterRollback = await executeSQL(selectTransactionCountSql, TEST_DB, SOURCE);

    // Check the SELECT result count after rollback.
    assert.equal(rowsAfterRollback.rowCount, 1);
    assert.equal(rowsAfterRollback.data[0].row_count, 2);
  } finally {
    await executeSQL(dropTransactionTableSql, TEST_DB, SOURCE);
  }
});
