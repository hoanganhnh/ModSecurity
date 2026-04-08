const {
  classifyPayload,
  buildDecisionPayload,
  badRequest,
  asNonEmptyString
} = require('./security-response-utils');

function filesHandler(req, res) {
  const requestId = req.requestId;
  const file = asNonEmptyString(req.query?.file);

  if (!file || file.length > 1024) {
    return badRequest(res, requestId, 'INVALID_FILE_QUERY', 'file must be a non-empty query string up to 1024 chars');
  }

  const payload = `file=${file}`;
  const matches = classifyPayload(payload);
  const response = buildDecisionPayload({
    requestId,
    endpoint: '/api/files',
    payload,
    matches,
    method: 'GET',
    res
  });

  return res.status(200).json(response);
}

module.exports = { filesHandler };