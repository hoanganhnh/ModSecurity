const { query } = require('../database/postgres-client');

async function findUserByUsername(username) {
  const result = await query(
    `SELECT id, username, password_hash, role
     FROM users
     WHERE username = $1
     LIMIT 1`,
    [username]
  );

  return result.rows[0] || null;
}

module.exports = {
  findUserByUsername
};
