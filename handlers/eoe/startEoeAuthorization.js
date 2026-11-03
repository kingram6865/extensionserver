import axios from 'axios';
import crypto from 'crypto';
import { executeSQL } from '../../db/connect';

const DB = 'eveonline';
const SOURCE = 80;
const CALLBACK_URL = process.env.EVE_REDIRECT_URI || 'https://sdl.org/eoe';
const SSO_METADATA_URL = 'https://login.eveonline.com/.well-known/oauth-authorization-server';
const STATE_TTL_MINUTES = 10;

export async function startEoeAuthorizationHandler(req, res) {
  try {
    const clientId = process.env.EVE_CLIENT_ID;
    const scopes = (process.env.EVE_SCOPES || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!clientId || scopes.length === 0) {
      return res.status(503).json({ error: 'EVE SSO client configuration is incomplete' });
    }

    const { data: metadata } = await axios.get(SSO_METADATA_URL, { timeout: 10000 });

    if (!metadata.authorization_endpoint) {
      throw new Error('EVE SSO metadata has no authorization endpoint');
    }

    const state = crypto.randomBytes(32).toString('base64url');
    const stateHash = crypto
      .createHash('sha256')
      .update(state)
      .digest('hex');
    const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000);

    const stateInsertSql = `
      INSERT INTO eoe_oauth_states
        (state_hash, expires_at, status)
      VALUES (?, ?, ?)
    `;

    const stateInsert = await executeSQL(stateInsertSql, DB, SOURCE, [stateHash, expiresAt, 'pending']);

    if (!stateInsert.success) {
      throw new Error('Unable to save EVE OAuth state');
    }

    const authorizationUrl = new URL(metadata.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: CALLBACK_URL,
      scope: scopes.join(' '),
      state,
    }).toString();

    return res.json({
      authorizationUrl: authorizationUrl.toString(),
      state,
    });
  } catch (err) {
    req.log?.error('eoe.auth.start.fail', {
      status: err.response?.status || 500,
    });

    return res.status(502).json({
      error: 'Unable to start EVE authorization',
    });
  }
}
