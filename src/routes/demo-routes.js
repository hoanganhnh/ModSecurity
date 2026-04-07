const express = require('express');
const { healthHandler, searchHandler } = require('../controllers/demo-controller');

const router = express.Router();

router.get('/health', healthHandler);
router.post('/api/search', searchHandler);

module.exports = { demoRoutes: router };
