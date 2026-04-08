const { query } = require('../database/postgres-client');

async function searchProducts(searchTerm) {
  const result = await query(
    `SELECT id, name, price, description
     FROM products
     WHERE name ILIKE '%' || $1 || '%'
        OR description ILIKE '%' || $1 || '%'
     ORDER BY id ASC
     LIMIT 20`,
    [searchTerm]
  );

  return result.rows;
}

async function findProductById(id) {
  const result = await query(
    `SELECT id, name, price, description
     FROM products
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  searchProducts,
  findProductById
};
