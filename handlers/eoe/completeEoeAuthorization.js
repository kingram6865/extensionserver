import axios from 'axios';
import crypto from 'crypto';
import { executeSQL } from '../../db/connect';

const DB = 'eveonline';
const SOURCE = 80;
const CALLBACK_URL = process.env.EVE_REDIRECT_URI || 'https://sdl.org/eoe';
const SSO_METADATA_URL = 'https://login.eveonline.com/.well-known/oauth-authorization-server';
const SSO_VERIFY_URL = 'https://login.eveonline.com/v2/oauth/verify';

function getVerifiedScopes(value) {
  if (Array.isArray(value)) {
    return value.filter(
      scope => typeof scope === 'string' && scope.length > 0
    );
  }

  if (typeof value === 'string') {
    return value.trim().split(/\s+/).filter(Boolean);
  }

  return [];
}

function getTokenExpiry(expiresIn) {
  const expiresInSeconds = Number(expiresIn);

  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('EVE SSO returned an invalid token lifetime');
  }

  return new Date(Date.now() + expiresInSeconds * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

export async function completeEoeAuthorizationHandler(req, res) {
  let stateHash;
  let stateClaimed = false;
  let failureStage = 'state_validation';

  try {
    const { code, state } = req.body || {};

    if (
      typeof code !== 'string' || !code ||
      typeof state !== 'string' || !state
    ) {
      return res.status(400).json({
        error: 'Authorization code and state are required',
      });
    }

    const clientId = process.env.EVE_CLIENT_ID;
    const clientSecret = process.env.EVE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(503).json({
        error: 'EVE SSO client configuration is incomplete',
      });
    }

    stateHash = crypto
      .createHash('sha256')
      .update(state)
      .digest('hex');

    const stateClaimSql = `
      UPDATE eoe_oauth_states
      SET status = 'processing',
          consumed_at = UTC_TIMESTAMP()
      WHERE state_hash = ?
        AND status = 'pending'
        AND expires_at > UTC_TIMESTAMP()
    `;

    const stateClaim = await executeSQL(
      stateClaimSql,
      DB,
      SOURCE,
      [stateHash]
    );

    if (!stateClaim.success || stateClaim.data?.affectedRows !== 1) {
      return res.status(400).json({
        error: 'Authorization state is invalid, expired, or already used',
      });
    }

    stateClaimed = true;
    failureStage = 'token_exchange';

    const { data: metadata } = await axios.get(SSO_METADATA_URL, {
      timeout: 10000,
    });

    if (!metadata.token_endpoint) {
      throw new Error('EVE SSO metadata has no token endpoint');
    }

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK_URL,
    }).toString();

    const { data: tokenResult } = await axios.post(
      metadata.token_endpoint,
      tokenBody,
      {
        auth: {
          username: clientId,
          password: clientSecret,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      }
    );

    if (!tokenResult.access_token) {
      throw new Error('EVE SSO did not return an access token');
    }

    failureStage = 'identity_verification';

    const { data: identity } = await axios.get(SSO_VERIFY_URL, {
      headers: {
        Authorization: `Bearer ${tokenResult.access_token}`,
      },
      timeout: 10000,
    });

    const characterId = Number(identity.CharacterID);
    const characterName = identity.CharacterName;
    const scopes = getVerifiedScopes(identity.Scopes);

    if (
      !Number.isSafeInteger(characterId) ||
      characterId <= 0 ||
      typeof characterName !== 'string'
    ) {
      throw new Error('EVE SSO returned an invalid character identity');
    }

    failureStage = 'token_persistence';

    const expiresAt = getTokenExpiry(tokenResult.expires_in);

    const tokenInsertSql = `
      INSERT INTO eoe_character_tokens
        (character_id, character_name, access_token, refresh_token,
         token_type, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const tokenInsert = await executeSQL(
      tokenInsertSql,
      DB,
      SOURCE,
      [
        characterId,
        characterName,
        tokenResult.access_token,
        tokenResult.refresh_token || null,
        tokenResult.token_type || 'Bearer',
        expiresAt,
      ]
    );

    const tokenObjid = tokenInsert.data?.insertId;

    if (!tokenInsert.success || !tokenObjid) {
      throw new Error('Unable to save EVE character token');
    }

    if (scopes.length > 0) {
      const scopeValues = scopes.map(() => '(?, ?)').join(', ');
      const scopeParams = scopes.flatMap(scope => [tokenObjid, scope]);

      const scopeInsertSql = `
        INSERT INTO eoe_character_token_scopes
          (token_objid, scope_name)
        VALUES ${scopeValues}
      `;

      const scopeInsert = await executeSQL(
        scopeInsertSql,
        DB,
        SOURCE,
        scopeParams
      );

      if (!scopeInsert.success) {
        throw new Error('Unable to save EVE character scopes');
      }
    }

    failureStage = 'state_completion';

    const stateCompleteSql = `
      UPDATE eoe_oauth_states
      SET status = 'completed',
          completed_at = UTC_TIMESTAMP(),
          failure_stage = NULL
      WHERE state_hash = ?
        AND status = 'processing'
    `;

    const stateComplete = await executeSQL(stateCompleteSql, DB, SOURCE, [stateHash]);

    if (
      !stateComplete.success ||
      stateComplete.data?.affectedRows !== 1
    ) {
      throw new Error('Unable to record EVE authorization completion');
    }

    return res.json({
      authenticated: true,
      character: { id: characterId, name: characterName },
      scopes,
      expiresAt,
    });
  } catch (err) {
    if (stateClaimed && stateHash) {
      try {
        const stateFailureSql = `
          UPDATE eoe_oauth_states
          SET status = 'failed',
              failed_at = UTC_TIMESTAMP(),
              failure_stage = ?
          WHERE state_hash = ?
            AND status = 'processing'
        `;

        await executeSQL(stateFailureSql, DB, SOURCE, [failureStage, stateHash] );
      } catch (stateError) {
        req.log?.error('eoe.auth.state.record.fail', {
          status: stateError.response?.status || 500,
        });
      }
    }

    req.log?.error('eoe.auth.callback.fail', {
      status: err.response?.status || 500,
    });

    return res.status(502).json({
      error: 'Unable to complete EVE authorization',
    });
  }
}
