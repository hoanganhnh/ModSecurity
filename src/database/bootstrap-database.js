const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { query } = require('./postgres-client');

async function loadSql(fileName) {
  const filePath = path.join(__dirname, fileName);
  return readFile(filePath, 'utf8');
}

async function bootstrapDatabase() {
  const [schemaSql, seedSql] = await Promise.all([
    loadSql('schema.sql'),
    loadSql('seed.sql')
  ]);

  await query(schemaSql);
  await query(seedSql);
}

module.exports = {
  bootstrapDatabase
};
