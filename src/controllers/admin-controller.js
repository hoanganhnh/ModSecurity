const { timingSafeEqual } = require('node:crypto');
const { buildDecisionPayload } = require('./security-response-utils');

function isValidAdminToken(providedToken, expectedToken) {
  if (typeof providedToken !== 'string' || typeof expectedToken !== 'string') {
    return false;
  }

  const providedBuffer = Buffer.from(providedToken);
  const expectedBuffer = Buffer.from(expectedToken);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function adminHandler(req, res) {
  const requestId = req.requestId;
  const providedToken = req.header('x-admin-token');
  const expectedToken = process.env.ADMIN_TOKEN;

  if (!expectedToken) {
    const response = buildDecisionPayload({
      requestId,
      endpoint: '/api/admin',
      payload: 'x-admin-token=<not-configured>',
      matches: [{ ruleId: 'APP-ADMIN-000', reason: 'Admin token is not configured' }],
      method: 'GET',
      statusCode: 503,
      res
    });

    return res.status(503).json(response);
  }

  if (!isValidAdminToken(providedToken, expectedToken)) {
    const response = buildDecisionPayload({
      requestId,
      endpoint: '/api/admin',
      payload: 'x-admin-token=<missing-or-invalid>',
      matches: [{ ruleId: 'APP-ADMIN-001', reason: 'Missing or invalid admin token' }],
      method: 'GET',
      statusCode: 403,
      res
    });

    return res.status(403).json(response);
  }

  const response = buildDecisionPayload({
    requestId,
    endpoint: '/api/admin',
    payload: 'x-admin-token=<redacted>',
    matches: [],
    method: 'GET',
    res
  });

  return res.status(200).json(response);
}

module.exports = { adminHandler };