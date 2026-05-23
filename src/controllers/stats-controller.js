const { getSecurityStats, recordSecurityEvent } = require('../services/security-events-store');

const ALLOWED_ENDPOINTS = new Set([
  'all',
  '/api/login',
  '/api/search',
  '/api/comment',
  '/api/files',
  '/api/admin'
]);

const ALLOWED_DECISIONS = new Set(['all', 'ALLOW', 'BLOCK']);

function normalizeEndpointFilter(value) {
  return ALLOWED_ENDPOINTS.has(value) ? value : 'all';
}

function normalizeDecisionFilter(value) {
  return ALLOWED_DECISIONS.has(value) ? value : 'all';
}

function getSecurityStatsHandler(req, res) {
  const endpoint = normalizeEndpointFilter(typeof req.query.endpoint === 'string' ? req.query.endpoint : 'all');
  const decision = normalizeDecisionFilter(typeof req.query.decision === 'string' ? req.query.decision : 'all');

  const stats = getSecurityStats({ endpoint, decision });

  const defaultDashboardUrl = 'http://localhost:5601/app/discover';
  const dashboardUrl = process.env.KIBANA_DASHBOARD_URL || defaultDashboardUrl;
  const indexPattern = process.env.ELK_INDEX_PATTERN || 'modsecurity-demo-*';
  const elkEnabled = process.env.ELK_ENABLED === '1';

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    requestId: req.requestId || null,
    filters: { endpoint, decision },
    elk: {
      enabled: elkEnabled,
      indexPattern,
      dashboardUrl: elkEnabled ? dashboardUrl : null
    },
    ...stats
  });
}

function reportGatewayBlockHandler(req, res) {
  const endpoint = typeof req.body.endpoint === 'string' ? req.body.endpoint : '/unknown';
  const method = typeof req.body.method === 'string' ? req.body.method : 'GET';
  const statusCode = typeof req.body.statusCode === 'number' ? req.body.statusCode : 403;

  recordSecurityEvent({
    timestamp: new Date().toISOString(),
    requestId: req.requestId || null,
    endpoint,
    decision: 'BLOCK',
    matchedRuleIds: ['GATEWAY']
  });

  return res.status(200).json({ recorded: true });
}

module.exports = {
  getSecurityStatsHandler,
  reportGatewayBlockHandler
};
