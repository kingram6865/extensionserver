const assert = require('node:assert/strict');
const test = require('node:test');
const { executeSQL } = require('../db/connect');

const TEST_DB = process.env.EOE_TEST_DB;
const SOURCE = 80;
const TABLE_SUFFIX = `${process.pid}_${Date.now()}`;
const tokenTable = `eoe_test_tokens_${TABLE_SUFFIX}`;
const scopeTable = `eoe_test_scopes_${TABLE_SUFFIX}`;
const stateTable = `eoe_test_states_${TABLE_SUFFIX}`;

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

    assert.ok(firstToken.data.insertId);
    assert.ok(secondToken.data.insertId);
    assert.notEqual(firstToken.data.insertId, secondToken.data.insertId);

    const insertScopeSql = `INSERT INTO ${scopeTable} (token_objid, scope_name) VALUES (?, ?)`;
    const scopeParameters = [firstToken.data.insertId, 'scope.one'];
    const scopeInsert = await executeSQL(insertScopeSql, TEST_DB, SOURCE, scopeParameters);
    assert.equal(scopeInsert.data.affectedRows, 1);

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
  const insertStateSql = `
    INSERT INTO ${stateTable} (state_hash, expires_at, status)
    VALUES (?, ?, ?)
  `;
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
    const activeExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const activeStateInsert = await executeSQL(insertStateSql, TEST_DB, SOURCE, [
      activeHash,
      activeExpiry,
      'pending',
    ]);
    assert.equal(activeStateInsert.data.affectedRows, 1);

    const claimResults = await Promise.all([
      executeSQL(claimStateSql, TEST_DB, SOURCE, [activeHash]),
      executeSQL(claimStateSql, TEST_DB, SOURCE, [activeHash]),
    ]);

    assert.deepEqual(
      claimResults.map(result => result.data.affectedRows).sort(),
      [0, 1]
    );

    const claimedState = await executeSQL(selectStateSql, TEST_DB, SOURCE, [activeHash]);
    assert.equal(claimedState.data[0].status, 'processing');

    const expiredHash = `expired_${TABLE_SUFFIX}`.padEnd(64, 'b');
    const expiredDate = new Date(Date.now() - 60 * 1000);
    const expiredStateInsert = await executeSQL(insertStateSql, TEST_DB, SOURCE, [
      expiredHash,
      expiredDate,
      'pending',
    ]);
    assert.equal(expiredStateInsert.data.affectedRows, 1);

    const expiredClaim = await executeSQL(claimStateSql, TEST_DB, SOURCE, [expiredHash]);
    assert.equal(expiredClaim.data.affectedRows, 0);

    const retainedExpiredState = await executeSQL(selectStateSql, TEST_DB, SOURCE, [expiredHash]);
    assert.equal(retainedExpiredState.data.length, 1);
    assert.equal(retainedExpiredState.data[0].status, 'pending');
    assert.ok(retainedExpiredState.data[0].entry_date);
  } finally {
    await executeSQL(dropStateTableSql, TEST_DB, SOURCE);
  }
});
