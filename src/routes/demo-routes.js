const express = require('express');
const { healthHandler } = require('../controllers/demo-controller');
const { getSecurityStatsHandler } = require('../controllers/stats-controller');

const router = express.Router();

router.get('/health', healthHandler);
router.get('/api/stats/security', getSecurityStatsHandler);

module.exports = { demoRoutes: router };
