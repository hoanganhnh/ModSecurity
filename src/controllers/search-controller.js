const {
  classifyPayload,
  buildDecisionPayload,
  badRequest,
  serviceUnavailable,
  asNonEmptyString
} = require('./security-response-utils');
const { searchProducts } = require('../repositories/products-repository');

async function searchGetHandler(req, res) {
  const requestId = req.requestId;
  const q = asNonEmptyString(req.query?.q);

  if (!q || q.length > 4096) {
    return badRequest(res, requestId, 'INVALID_QUERY', 'q must be a non-empty query string up to 4096 chars');
  }

  const payload = `q=${q}`;
  const matches = classifyPayload(payload);

  if (matches.length > 0) {
    const blockedResponse = buildDecisionPayload({
      requestId,
      endpoint: '/api/search',
      payload,
      matches,
      method: 'GET',
      res
    });
    return res.status(200).json(blockedResponse);
  }

  try {
    const products = await searchProducts(q);
    const response = buildDecisionPayload({
      requestId,
      endpoint: '/api/search',
      payload,
      matches: [],
      method: 'GET',
      res
    });

    response.results = products;

    return res.status(200).json(response);
  } catch (_error) {
    return serviceUnavailable(res, requestId);
  }
}

function searchPostCompatHandler(req, res) {
  const requestId = req.requestId;
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '/api/search';
  const payload = asNonEmptyString(req.body?.payload);

  if (!payload || payload.length > 4096) {
    return badRequest(res, requestId, 'INVALID_PAYLOAD', 'payload must be a non-empty string up to 4096 chars');
  }

  const matches = classifyPayload(payload);
  const response = buildDecisionPayload({
    requestId,
    endpoint,
    payload,
    matches,
    method: 'POST',
    res
  });

  return res.status(200).json(response);
}

module.exports = {
  searchGetHandler,
  searchPostCompatHandler
};