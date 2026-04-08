const fs = require('node:fs');
const path = require('node:path');

const LOG_FILE_PATH = process.env.APP_LOG_FILE || path.join(process.cwd(), 'logs', 'demo-app', 'application.log');

let isDirectoryReady = false;

function ensureLogDirectory() {
  if (isDirectoryReady) {
    return;
  }

  fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
  isDirectoryReady = true;
}

function stringifyEntry(entry) {
  return JSON.stringify({
    '@timestamp': entry['@timestamp'] || new Date().toISOString(),
    serviceName: 'demo-app',
    ...entry
  });
}

function writeEntry(entry, stream = process.stdout) {
  const line = `${stringifyEntry(entry)}\n`;

  try {
    ensureLogDirectory();
    fs.appendFile(LOG_FILE_PATH, line, () => {
      // best-effort file logging for local demo
    });
  } catch (_error) {
    // best-effort file logging for local demo
  }

  stream.write(line);
}

function logInfo(eventName, fields = {}) {
  writeEntry({
    level: 'info',
    eventName,
    ...fields
  });
}

function logWarn(eventName, fields = {}) {
  writeEntry({
    level: 'warn',
    eventName,
    ...fields
  });
}

function logError(eventName, fields = {}) {
  writeEntry({
    level: 'error',
    eventName,
    ...fields
  }, process.stderr);
}

function logSecurityDecision({ requestId, endpoint, method, decision, statusCode, matchedRuleIds = [] }) {
  const log = decision === 'BLOCK' ? logWarn : logInfo;

  log('security.decision', {
    requestId,
    endpoint,
    method,
    decision,
    statusCode,
    matchedRuleIds
  });
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  logSecurityDecision
};
