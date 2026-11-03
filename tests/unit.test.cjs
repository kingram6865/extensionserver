process.env.EVE_CLIENT_ID = 'test-client-id';
process.env.EVE_CLIENT_SECRET = 'test-client-secret';
process.env.EVE_SCOPES = 'scope.one scope.two';
process.env.EVE_REDIRECT_URI = 'https://sdl.org/eoe';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const axios = require('axios');
const database = require('../db/connect');
const { startEoeAuthorizationHandler } = require('../handlers/eoe/startEoeAuthorization');
const { completeEoeAuthorizationHandler } = require('../handlers/eoe/completeEoeAuthorization');

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createRequest(body = {}) {
  return { body, log: { error() {} } };
}

test('start authorization stores a hashed state and returns the authorization URL', async t => {
  let databaseCall;
  t.mock.method(database, 'executeSQL', async (...args) => {
    databaseCall = args;
    return { success: true, data: { affectedRows: 1 } };
  });
  t.mock.method(axios, 'get', async () => ({
    data: { authorization_endpoint: 'https://login.eveonline.com/v2/oauth/authorize' },
  }));

  const response = createResponse();
  await startEoeAuthorizationHandler(createRequest(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(databaseCall[1], 'eveonline');
  assert.equal(databaseCall[2], 80);
  assert.match(databaseCall[0], /INSERT INTO eoe_oauth_states/);
  assert.equal(databaseCall[3][2], 'pending');
  assert.match(databaseCall[3][0], /^[a-f0-9]{64}$/);
  assert.ok(databaseCall[3][1] instanceof Date);

  const authorizationUrl = new URL(response.body.authorizationUrl);
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'test-client-id');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://sdl.org/eoe');
  assert.equal(authorizationUrl.searchParams.get('scope'), 'scope.one scope.two');
  assert.equal(authorizationUrl.searchParams.get('state'), response.body.state);
  assert.equal(databaseCall[3][0], crypto.createHash('sha256').update(response.body.state).digest('hex'));
  assert.notEqual(databaseCall[3][0], response.body.state);
});

test('start authorization rejects incomplete configuration without database access', async t => {
  const originalClientId = process.env.EVE_CLIENT_ID;
  process.env.EVE_CLIENT_ID = '';
  t.after(() => { process.env.EVE_CLIENT_ID = originalClientId; });

  const executeSQL = t.mock.method(database, 'executeSQL');
  const response = createResponse();
  await startEoeAuthorizationHandler(createRequest(), response);

  assert.equal(response.statusCode, 503);
  assert.equal(executeSQL.mock.callCount(), 0);
});

test('callback rejects an unavailable state before calling EVE SSO', async t => {
  t.mock.method(database, 'executeSQL', async () => ({
    success: true,
    data: { affectedRows: 0 },
  }));
  const get = t.mock.method(axios, 'get');
  const post = t.mock.method(axios, 'post');

  const response = createResponse();
  await completeEoeAuthorizationHandler(
    createRequest({ code: 'authorization-code', state: 'unknown-state' }),
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(get.mock.callCount(), 0);
  assert.equal(post.mock.callCount(), 0);
});

test('callback saves a token row and scopes using the returned token objid', async t => {
  const databaseCalls = [];
  t.mock.method(database, 'executeSQL', async (...args) => {
    databaseCalls.push(args);

    if (args[0].includes("SET status = 'processing'")) {
      return { success: true, data: { affectedRows: 1 } };
    }

    if (args[0].includes('INSERT INTO eoe_character_tokens')) {
      return { success: true, data: { insertId: 901 } };
    }

    return { success: true, data: { affectedRows: 1 } };
  });
  t.mock.method(axios, 'get', async url => {
    if (url.includes('.well-known')) {
      return { data: { token_endpoint: 'https://login.eveonline.com/v2/oauth/token' } };
    }

    return {
      data: {
        CharacterID: 123456,
        CharacterName: 'Test Capsuleer',
        Scopes: ['scope.one', 'scope.two'],
      },
    };
  });
  t.mock.method(axios, 'post', async () => ({
    data: {
      access_token: 'access-token-value',
      refresh_token: 'refresh-token-value',
      token_type: 'Bearer',
      expires_in: 1200,
    },
  }));

  const response = createResponse();
  await completeEoeAuthorizationHandler(
    createRequest({ code: 'authorization-code', state: 'valid-state' }),
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.character, { id: 123456, name: 'Test Capsuleer' });
  assert.deepEqual(response.body.scopes, ['scope.one', 'scope.two']);
  assert.equal(Object.hasOwn(response.body, 'access_token'), false);
  assert.equal(databaseCalls.length, 4);
  assert.ok(databaseCalls.every(call => call[1] === 'eveonline' && call[2] === 80));

  const tokenInsert = databaseCalls.find(call => call[0].includes('INSERT INTO eoe_character_tokens'));
  assert.equal(tokenInsert[3][0], 123456);

  const scopeInsert = databaseCalls.find(call => call[0].includes('INSERT INTO eoe_character_token_scopes'));
  assert.deepEqual(scopeInsert[3], [901, 'scope.one', 901, 'scope.two']);
  assert.match(scopeInsert[0], /token_objid, scope_name/);

  const stateComplete = databaseCalls.find(call => call[0].includes("SET status = 'completed'"));
  assert.ok(stateComplete);
});

test('callback records a failed token exchange while retaining the claimed state', async t => {
  const databaseCalls = [];
  t.mock.method(database, 'executeSQL', async (...args) => {
    databaseCalls.push(args);
    return { success: true, data: { affectedRows: 1 } };
  });
  t.mock.method(axios, 'get', async () => {
    throw new Error('SSO metadata request failed');
  });

  const response = createResponse();
  await completeEoeAuthorizationHandler(
    createRequest({ code: 'authorization-code', state: 'valid-state' }),
    response
  );

  assert.equal(response.statusCode, 502);
  assert.equal(databaseCalls.length, 2);
  assert.match(databaseCalls[0][0], /UPDATE eoe_oauth_states/);
  assert.match(databaseCalls[1][0], /SET status = 'failed'/);
  assert.deepEqual(databaseCalls[1][3], ['token_exchange', databaseCalls[0][3][0]]);
});
