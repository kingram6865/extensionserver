import { startEoeAuthorizationHandler } from '../../handlers/eoe/startEoeAuthorization.js';

export const startEoeAuthorization = {
  path: '/eoe/auth/start',
  method: 'get',
  handler: startEoeAuthorizationHandler,
}
