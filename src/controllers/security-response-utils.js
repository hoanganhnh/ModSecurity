const { recordSecurityEvent } = require('../services/security-events-store');
const { logSecurityDecision } = require('../logging/application-logger');

const checks = [
  { regex: /\bor\s+1=1\b|--|union\s+select/i, ruleId: '942100', reason: 'SQL injection pattern' },
  { regex: /<script|onerror=|javascript:/i, ruleId: '941100', reason: 'XSS pattern' },
  { regex: /\.\.\/|\.\.\\|etc\/passwd|%2e%2e%2f|%2e%2e\/|\.\.%2f|%2f%2e%2e|%2e%2e%5c/i, ruleId: '930120', reason: 'Path traversal/LFI pattern' }
];

function classifyPayload(payload) {
  return checks.filter((check) => check.regex.test(payload));
}

function buildDecisionPayload({ requestId, endpoint, payload, matches, method, statusCode = 200, res }) {
  const decision = matches.length > 0 ? 'BLOCK' : 'ALLOW';
  const timestamp = new Date().toISOString();

  const timeline = decision === 'BLOCK'
    ? [
        'Request sent to Nginx',
        'ModSecurity inspected request data',
        `OWASP CRS matched rule ${matches[0].ruleId}`,
        'Request marked as blocked'
      ]
    : [
        'Request sent to Nginx',
        'ModSecurity inspected request data',
        'No blocking CRS rule matched',
        `Backend returned ${statusCode} response`
      ];

  const response = {
    requestId,
    timestamp,
    endpoint,
    decision,
    matchedRuleIds: matches.map((match) => match.ruleId),
    reason: matches[0]?.reason || 'No blocking signature matched',
    timeline,
    logs: {
      audit: decision === 'BLOCK'
        ? [`[audit] id="${matches[0].ruleId}" msg="${matches[0].reason}" action="block"`]
        : ['[audit] msg="inbound anomaly score below threshold" action="pass"'],
      access: decision === 'BLOCK'
        ? [`[access] 403 ${method} ${endpoint}`]
        : [`[access] ${statusCode} ${method} ${endpoint}`]
    }
  };

  if (res) {
    res.locals.securityDecision = decision;
    res.locals.matchedRuleIds = response.matchedRuleIds;
  }

  recordSecurityEvent({
    timestamp,
    requestId,
    endpoint,
    decision,
    matchedRuleIds: response.matchedRuleIds
  });

  logSecurityDecision({
    requestId,
    endpoint,
    method,
    decision,
    statusCode,
    matchedRuleIds: response.matchedRuleIds
  });

  return response;
}

function badRequest(res, requestId, code, message) {
  return res.status(400).json({
    error: { code, message },
    requestId
  });
}

function serviceUnavailable(res, requestId, message = 'database is temporarily unavailable') {
  return res.status(503).json({
    error: {
      code: 'DB_UNAVAILABLE',
      message
    },
    requestId
  });
}

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

module.exports = {
  classifyPayload,
  buildDecisionPayload,
  badRequest,
  serviceUnavailable,
  asNonEmptyString,
  asPositiveInteger
};