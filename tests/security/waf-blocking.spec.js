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

test('classifies SQLi-like payload as BLOCK with CRS-style id', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: "q=' OR 1=1 --" })
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.decision, 'BLOCK');
  assert.ok(body.matchedRuleIds.includes('942100'));
});

test('classifies XSS-like payload as BLOCK with CRS-style id', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: 'comment=<script>alert(1)</script>' })
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.decision, 'BLOCK');
  assert.ok(body.matchedRuleIds.includes('941100'));
});
