const express = require('express');
const { loginHandler } = require('../controllers/login-controller');
const { searchGetHandler, searchPostCompatHandler } = require('../controllers/search-controller');
const { commentHandler } = require('../controllers/comment-controller');
const { filesHandler } = require('../controllers/files-controller');
const { adminHandler } = require('../controllers/admin-controller');

const router = express.Router();

router.post('/api/login', loginHandler);
router.get('/api/search', searchGetHandler);
router.post('/api/search', searchPostCompatHandler);
router.post('/api/comment', commentHandler);
router.get('/api/files', filesHandler);
router.get('/api/admin', adminHandler);

module.exports = { apiRoutes: router };