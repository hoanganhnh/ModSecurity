const { query } = require('../database/postgres-client');

async function createComment({ userId, productId, content }) {
  const result = await query(
    `INSERT INTO comments (user_id, product_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, user_id AS "userId", product_id AS "productId", content, created_at AS "createdAt"`,
    [userId, productId, content]
  );

  return result.rows[0];
}

module.exports = {
  createComment
};
