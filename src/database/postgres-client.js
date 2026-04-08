const { Pool } = require('pg');
const { logError } = require('../logging/application-logger');

let pool;

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPoolConfig() {
  return {
    host: process.env.DB_HOST || 'postgres',
    port: asNumber(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME || 'modsecurity',
    user: process.env.DB_USER || 'modsecurity',
    password: process.env.DB_PASSWORD || 'modsecurity',
    max: asNumber(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: asNumber(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: asNumber(process.env.DB_POOL_CONNECT_TIMEOUT_MS, 5000)
  };
}

function getPool() {
  if (!pool) {
    pool = new Pool(getPoolConfig());
    pool.on('error', (error) => {
      logError('database.pool_error', {
        requestId: null,
        endpoint: null,
        decision: null,
        statusCode: 500,
        matchedRuleIds: [],
        message: error.message
      });
    });
  }

  return pool;
}

async function query(text, values = []) {
  return getPool().query(text, values);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDatabaseReady({ retries = 20, delayMs = 1000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await wait(delayMs);
      }
    }
  }

  throw lastError;
}

async function closePool() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = undefined;
}

module.exports = {
  query,
  ensureDatabaseReady,
  closePool
};
