const { randomUUID } = require('node:crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function requestIdMiddleware(req, res, next) {
  const incomingRequestId = req.header('x-request-id');
  const externalRequestId = REQUEST_ID_PATTERN.test(incomingRequestId || '') ? incomingRequestId : null;
  const trustedProxyToken = req.header('x-elk-proxy-token');
  const expectedProxyToken = process.env.ELK_PROXY_TOKEN || null;
  const trustedProxyRequestId = expectedProxyToken && trustedProxyToken === expectedProxyToken && externalRequestId
    ? externalRequestId
    : null;
  const requestId = trustedProxyRequestId || randomUUID();

  req.requestId = requestId;
  req.externalRequestId = externalRequestId;
  res.setHeader('x-request-id', requestId);

  next();
}

module.exports = { requestIdMiddleware };
