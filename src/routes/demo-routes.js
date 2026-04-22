const express = require('express');
const { healthHandler } = require('../controllers/demo-controller');
const { getSecurityStatsHandler, reportGatewayBlockHandler } = require('../controllers/stats-controller');
const { getLogsPreviewHandler } = require('../controllers/logs-controller');

const router = express.Router();

router.get('/health', healthHandler);
router.get('/api/stats/security', getSecurityStatsHandler);
router.post('/api/stats/gateway-block', reportGatewayBlockHandler);
router.get('/api/logs/preview', getLogsPreviewHandler);

module.exports = { demoRoutes: router };
