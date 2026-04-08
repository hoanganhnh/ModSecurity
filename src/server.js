const path = require('node:path');
const express = require('express');

const { demoRoutes } = require('./routes/demo-routes');
const { apiRoutes } = require('./routes/api-routes');
const { requestIdMiddleware } = require('./middleware/request-id-middleware');
const { ensureDatabaseReady, closePool } = require('./database/postgres-client');
const { bootstrapDatabase } = require('./database/bootstrap-database');
const { logInfo, logWarn, logError } = require('./logging/application-logger');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '64kb' }));
  app.use(requestIdMiddleware);
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (req.path === '/api/stats/security' || req.path.startsWith('/assets/')) {
        return;
      }

      const responseDecision = res.locals.securityDecision || null;
      const responseRuleIds = Array.isArray(res.locals.matchedRuleIds) ? res.locals.matchedRuleIds : [];
      const logger = responseDecision === 'BLOCK' ? logWarn : logInfo;

      logger('http.request.completed', {
        requestId: req.requestId || null,
        endpoint: req.path,
        method: req.method,
        decision: responseDecision,
        statusCode: res.statusCode,
        matchedRuleIds: responseRuleIds
      });
    });

    next();
  });
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(demoRoutes);
  app.use(apiRoutes);

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `route not found: ${req.method} ${req.path}`
      },
      requestId: req.requestId || null
    });
  });

  app.use((err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'invalid JSON body'
        },
        requestId: req.requestId || null
      });
    }

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'unexpected server error'
      },
      requestId: req.requestId || null
    });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.APP_PORT || 3000);
  const app = createApp();

  ensureDatabaseReady()
    .then(() => bootstrapDatabase())
    .then(() => {
      app.listen(port, () => {
        logInfo('server.started', {
          port,
          requestId: null,
          endpoint: null,
          decision: null,
          statusCode: null,
          matchedRuleIds: []
        });
      });
    })
    .catch((error) => {
      logError('server.startup_failed', {
        requestId: null,
        endpoint: null,
        decision: null,
        statusCode: 500,
        matchedRuleIds: [],
        message: error.message
      });
      closePool().finally(() => {
        process.exit(1);
      });
    });
}

module.exports = { createApp };
