const { createHash } = require('node:crypto');
const {
  classifyPayload,
  buildDecisionPayload,
  badRequest,
  serviceUnavailable,
  asNonEmptyString
} = require('./security-response-utils');
const { findUserByUsername } = require('../repositories/users-repository');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function loginHandler(req, res) {
  const requestId = req.requestId;
  const username = asNonEmptyString(req.body?.username);
  const password = asNonEmptyString(req.body?.password);

  if (!username || !password || username.length > 128 || password.length > 256) {
    return badRequest(res, requestId, 'INVALID_LOGIN_INPUT', 'username and password are required');
  }

  const payload = `username=${username}&password=<redacted>`;
  const matches = classifyPayload(payload);

  if (matches.length > 0) {
    const blockedResponse = buildDecisionPayload({
      requestId,
      endpoint: '/api/login',
      payload,
      matches,
      method: 'POST',
      res
    });
    return res.status(200).json(blockedResponse);
  }

  try {
    const user = await findUserByUsername(username);
    const isValidPassword = user && user.password_hash === sha256(password);

    if (!isValidPassword) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'username or password is invalid'
        },
        requestId
      });
    }

    const response = buildDecisionPayload({
      requestId,
      endpoint: '/api/login',
      payload,
      matches: [],
      method: 'POST',
      res
    });

    response.auth = {
      userId: user.id,
      username: user.username,
      role: user.role
    };

    return res.status(200).json(response);
  } catch (_error) {
    return serviceUnavailable(res, requestId);
  }
}

module.exports = { loginHandler };