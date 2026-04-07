function classifyPayload(payload) {
  const checks = [
    { regex: /\bor\s+1=1\b|--|union\s+select/i, ruleId: '942100', reason: 'SQL injection pattern' },
    { regex: /<script|onerror=|javascript:/i, ruleId: '941100', reason: 'XSS pattern' },
    { regex: /\.\.\/|etc\/passwd|%2f%2e%2e/i, ruleId: '930120', reason: 'Path traversal/LFI pattern' }
  ];

  const matches = checks.filter((check) => check.regex.test(payload));
  return matches;
}

function healthHandler(_req, res) {
  res.status(200).json({ status: 'ok' });
}

function searchHandler(req, res) {
  const requestId = req.requestId;
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '/api/search';
  const payload = req.body?.payload;

  if (typeof payload !== 'string' || payload.length === 0 || payload.length > 4096) {
    return res.status(400).json({
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'payload must be a non-empty string up to 4096 chars'
      },
      requestId
    });
  }

  const matches = classifyPayload(payload);
  const decision = matches.length > 0 ? 'BLOCK' : 'ALLOW';
  const now = new Date().toISOString();

  const timeline = decision === 'BLOCK'
    ? [
        'Request sent to Nginx',
        'ModSecurity inspected request body',
        `OWASP CRS matched rule ${matches[0].ruleId}`,
        'Request blocked before backend processing'
      ]
    : [
        'Request sent to Nginx',
        'ModSecurity inspected request body',
        'No blocking CRS rule matched',
        'Backend returned 200 response'
      ];

  return res.status(200).json({
    requestId,
    timestamp: now,
    endpoint,
    payload,
    decision,
    matchedRuleIds: matches.map((match) => match.ruleId),
    reason: matches[0]?.reason || 'No blocking signature matched',
    timeline,
    logs: {
      audit: decision === 'BLOCK'
        ? [`[audit] id="${matches[0].ruleId}" msg="${matches[0].reason}" action="block"`]
        : ['[audit] msg="inbound anomaly score below threshold" action="pass"'],
      access: decision === 'BLOCK'
        ? [`[access] 403 POST ${endpoint}`]
        : [`[access] 200 POST ${endpoint}`]
    }
  });
}

module.exports = {
  healthHandler,
  searchHandler
};
