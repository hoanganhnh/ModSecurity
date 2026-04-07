const path = require('node:path');
const express = require('express');

const { demoRoutes } = require('./routes/demo-routes');
const { requestIdMiddleware } = require('./middleware/request-id-middleware');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '64kb' }));
  app.use(requestIdMiddleware);
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(demoRoutes);

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

  app.listen(port, () => {
    process.stdout.write(`demo-app listening on ${port}\n`);
  });
}

module.exports = { createApp };
