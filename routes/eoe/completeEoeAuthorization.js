import { completeEoeAuthorizationHandler } from '../../handlers/eoe/completeEoeAuthorization.js';

export const completeEoeAuthorization = {
  path: '/eoe/auth/callback',
  method: 'post',
  handler: completeEoeAuthorizationHandler,
}
