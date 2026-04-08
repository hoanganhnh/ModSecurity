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

test('GET /health returns ok and request-id header', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.ok(response.headers.get('x-request-id'));
});

test('request-id middleware does not trust inbound x-request-id', async (t) => {
  const previousProxyToken = process.env.ELK_PROXY_TOKEN;
  process.env.ELK_PROXY_TOKEN = 'trusted-proxy-token';
  t.after(() => {
    if (previousProxyToken === undefined) {
      delete process.env.ELK_PROXY_TOKEN;
      return;
    }
    process.env.ELK_PROXY_TOKEN = previousProxyToken;
  });

  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/health`, {
    headers: { 'x-request-id': 'attacker-controlled-id' }
  });

  const returnedRequestId = response.headers.get('x-request-id');
  assert.ok(returnedRequestId);
  assert.notEqual(returnedRequestId, 'attacker-controlled-id');
});

test('POST /api/search returns ALLOW for benign payload', async (t) => {
  const previousProxyToken = process.env.ELK_PROXY_TOKEN;
  process.env.ELK_PROXY_TOKEN = 'trusted-proxy-token';
  t.after(() => {
    if (previousProxyToken === undefined) {
      delete process.env.ELK_PROXY_TOKEN;
      return;
    }
    process.env.ELK_PROXY_TOKEN = previousProxyToken;
  });

  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'gateway-generated-request-id',
      'x-elk-proxy-token': 'trusted-proxy-token'
    },
    body: JSON.stringify({
      endpoint: '/api/search',
      payload: 'q=normal-search'
    })
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.decision, 'ALLOW');
  assert.deepEqual(body.matchedRuleIds, []);
  assert.equal(body.requestId, 'gateway-generated-request-id');
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

test('POST /api/login returns auth result or DB unavailable', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo-user', password: 'safe-password' })
  });

  const body = await response.json();

  if (response.status === 503) {
    assert.equal(body.error.code, 'DB_UNAVAILABLE');
    return;
  }

  assert.equal(response.status, 200);
  assert.equal(body.endpoint, '/api/login');
  assert.equal(body.decision, 'ALLOW');
  assert.equal(body.payload, undefined);
  assert.ok(body.requestId);
});

test('GET /api/search returns results or DB unavailable', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/search?q=normal-search`);
  const body = await response.json();

  if (response.status === 503) {
    assert.equal(body.error.code, 'DB_UNAVAILABLE');
    return;
  }

  assert.equal(response.status, 200);
  assert.equal(body.endpoint, '/api/search');
  assert.equal(body.decision, 'ALLOW');
  assert.ok(Array.isArray(body.results));
});

test('POST /api/comment validates content boundary', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/comment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: '' })
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_COMMENT_INPUT');
});

test('GET /api/files returns BLOCK for traversal query', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/files?file=../../etc/passwd`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.decision, 'BLOCK');
  assert.ok(body.matchedRuleIds.includes('930120'));
});

test('GET /api/admin returns 503 when admin token is not configured', async (t) => {
  const previousToken = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  t.after(() => {
    if (previousToken === undefined) {
      delete process.env.ADMIN_TOKEN;
      return;
    }
    process.env.ADMIN_TOKEN = previousToken;
  });

  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/admin`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.decision, 'BLOCK');
  assert.ok(body.matchedRuleIds.includes('APP-ADMIN-000'));
});

test('GET /api/admin enforces x-admin-token when configured', async (t) => {
  const previousToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'demo-admin';
  t.after(() => {
    if (previousToken === undefined) {
      delete process.env.ADMIN_TOKEN;
      return;
    }
    process.env.ADMIN_TOKEN = previousToken;
  });

  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const denied = await fetch(`${baseUrl}/api/admin`);
  const deniedBody = await denied.json();

  assert.equal(denied.status, 403);
  assert.equal(deniedBody.decision, 'BLOCK');

  const allowed = await fetch(`${baseUrl}/api/admin`, {
    headers: { 'x-admin-token': 'demo-admin' }
  });
  const allowedBody = await allowed.json();

  assert.equal(allowed.status, 200);
  assert.equal(allowedBody.decision, 'ALLOW');
});

test('GET /api/stats/security returns counters and latest events', async (t) => {
  const previousElkEnabled = process.env.ELK_ENABLED;
  process.env.ELK_ENABLED = '1';
  t.after(() => {
    if (previousElkEnabled === undefined) {
      delete process.env.ELK_ENABLED;
      return;
    }
    process.env.ELK_ENABLED = previousElkEnabled;
  });

  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: '/api/search', payload: "q=' OR 1=1 --" })
  });

  await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: '/api/search', payload: 'q=normal-search' })
  });

  const response = await fetch(`${baseUrl}/api/stats/security`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(body.totals.totalRequests >= 2);
  assert.ok(body.totals.blockedRequests >= 1);
  assert.ok(body.totals.allowedRequests >= 1);
  assert.ok(Array.isArray(body.latestEvents));
  assert.ok(Array.isArray(body.topRuleIds));
  assert.equal(body.elk.enabled, true);
  assert.equal(body.elk.indexPattern, 'modsecurity-demo-*');
  assert.equal(body.elk.dashboardUrl, 'http://localhost:5601/app/discover');
});

test('GET /api/stats/security normalizes invalid filters', async (t) => {
  const previousElkEnabled = process.env.ELK_ENABLED;
  delete process.env.ELK_ENABLED;
  t.after(() => {
    if (previousElkEnabled === undefined) {
      delete process.env.ELK_ENABLED;
      return;
    }
    process.env.ELK_ENABLED = previousElkEnabled;
  });

  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/stats/security?endpoint=/not-allowed&decision=DROP`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.filters.endpoint, 'all');
  assert.equal(body.filters.decision, 'all');
  assert.equal(body.elk.enabled, false);
  assert.equal(body.elk.dashboardUrl, null);
});
