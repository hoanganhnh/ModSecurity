const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../../src/server');

function startServer() {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

test('GET /health returns ok', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
});

test('POST /api/search returns ALLOW for benign payload', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: '/api/search',
      payload: 'q=normal-search'
    })
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.decision, 'ALLOW');
  assert.deepEqual(body.matchedRuleIds, []);
  assert.ok(body.requestId);
  assert.equal(typeof body.timestamp, 'string');
});

test('POST /api/search validates payload boundary', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: '' })
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_PAYLOAD');
});
