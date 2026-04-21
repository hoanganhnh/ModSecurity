const fs = require('node:fs');
const path = require('node:path');

const LOGS_BASE = path.join(process.cwd(), 'logs');
const ACCESS_LOG_PATH = path.join(LOGS_BASE, 'nginx', 'access.log');
const AUDIT_LOG_PATH = path.join(LOGS_BASE, 'modsecurity', 'audit.log');

const DEFAULT_TAIL_LINES = 15;
const MAX_TAIL_LINES = 50;
const MAX_READ_BYTES = 64 * 1024;

function tailFile(filePath, maxLines) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      return [];
    }

    const readSize = Math.min(stat.size, MAX_READ_BYTES);
    const start = Math.max(0, stat.size - readSize);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, start);
    fs.closeSync(fd);

    const content = buffer.toString('utf8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    return lines.slice(-maxLines);
  } catch (_error) {
    return [];
  }
}

function parseAccessLogLine(line) {
  try {
    const entry = JSON.parse(line);
    return {
      timestamp: entry.timestamp || null,
      method: entry.method || '-',
      uri: entry.uri || '-',
      status: entry.status || 0,
      bytesSent: entry.bytesSent || 0,
      remoteAddr: entry.remoteAddr || '-',
      userAgent: entry.userAgent || '-',
      requestTime: entry.requestTime || 0,
      upstreamStatus: entry.upstreamStatus || '-'
    };
  } catch (_error) {
    return { raw: line };
  }
}

function parseAuditLogEntry(line) {
  try {
    const entry = JSON.parse(line);
    const transaction = entry.transaction || {};

    // ModSecurity v3 JSON: messages is an array of objects
    // Each: { message: "...", details: { ruleId: "942100", severity: "2", ... } }
    const messages = Array.isArray(transaction.messages)
      ? transaction.messages
      : [];

    const ruleIds = messages
      .map((msg) => msg?.details?.ruleId || null)
      .filter(Boolean);

    const severities = messages
      .map((msg) => msg?.details?.severity || null)
      .filter(Boolean);

    const summaries = messages
      .slice(0, 5)
      .map((msg) => msg?.message || 'unknown rule');

    const httpCode = transaction.response?.http_code
      || transaction.response?.status
      || 0;

    return {
      timestamp: transaction.time_stamp || transaction.time || null,
      clientIp: transaction.client_ip || '-',
      method: transaction.request?.method || '-',
      uri: transaction.request?.uri || '-',
      httpVersion: transaction.request?.http_version || '-',
      host: transaction.host_ip || '-',
      responseCode: httpCode,
      ruleIds,
      severities,
      messages: summaries,
      producer: transaction.producer?.modsecurity || null,
      action: ruleIds.length > 0 ? 'FLAGGED' : 'PASS'
    };
  } catch (_error) {
    return null;
  }
}

function getLogsPreviewHandler(req, res) {
  const limitParam = Number(req.query?.limit);
  const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= MAX_TAIL_LINES
    ? limitParam
    : DEFAULT_TAIL_LINES;

  const accessLines = tailFile(ACCESS_LOG_PATH, limit);
  const auditLines = tailFile(AUDIT_LOG_PATH, limit);

  const accessEntries = accessLines
    .map(parseAccessLogLine)
    .filter((entry) => {
      if (entry.uri && entry.uri.startsWith('/api/logs/')) {
        return false;
      }
      if (entry.uri && entry.uri.startsWith('/api/stats/')) {
        return false;
      }
      return true;
    })
    .reverse();

  const auditEntries = auditLines
    .map(parseAuditLogEntry)
    .filter((entry) => entry !== null)
    .reverse();

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    requestId: req.requestId || null,
    access: {
      source: 'nginx/access.log',
      count: accessEntries.length,
      entries: accessEntries
    },
    audit: {
      source: 'modsecurity/audit.log',
      count: auditEntries.length,
      entries: auditEntries
    }
  });
}

module.exports = { getLogsPreviewHandler };
