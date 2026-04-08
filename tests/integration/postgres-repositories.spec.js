const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureDatabaseReady,
  closePool,
  query
} = require('../../src/database/postgres-client');
const { bootstrapDatabase } = require('../../src/database/bootstrap-database');
const { findUserByUsername } = require('../../src/repositories/users-repository');
const {
  searchProducts,
  findProductById
} = require('../../src/repositories/products-repository');
const { createComment } = require('../../src/repositories/comments-repository');

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === '1';

const dbTest = shouldRun ? test : test.skip;

dbTest('findUserByUsername returns seeded user', async () => {
  await ensureDatabaseReady({ retries: 5, delayMs: 250 });
  await bootstrapDatabase();

  const user = await findUserByUsername('demo-user');

  assert.ok(user);
  assert.equal(user.username, 'demo-user');
  assert.equal(user.role, 'user');
});

dbTest('searchProducts and findProductById return seeded products', async () => {
  await ensureDatabaseReady({ retries: 5, delayMs: 250 });
  await bootstrapDatabase();

  const products = await searchProducts('modsecurity');
  assert.ok(products.length >= 1);

  const first = await findProductById(products[0].id);
  assert.ok(first);
  assert.equal(first.id, products[0].id);
});

dbTest('createComment inserts row with parameterized values', async () => {
  await ensureDatabaseReady({ retries: 5, delayMs: 250 });
  await bootstrapDatabase();

  const user = await findUserByUsername('demo-user');
  const products = await searchProducts('starter');

  const comment = await createComment({
    userId: user.id,
    productId: products[0].id,
    content: 'integration comment payload'
  });

  assert.ok(comment.id);
  assert.equal(comment.userId, user.id);
  assert.equal(comment.productId, products[0].id);
  assert.equal(comment.content, 'integration comment payload');

  const verification = await query(
    'SELECT id, content FROM comments WHERE id = $1',
    [comment.id]
  );
  assert.equal(verification.rows.length, 1);
  assert.equal(verification.rows[0].content, 'integration comment payload');
});

test.after(async () => {
  if (shouldRun) {
    await closePool();
  }
});
