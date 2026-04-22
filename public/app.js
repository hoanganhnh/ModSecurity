(function () {
  const endpointSelect = document.getElementById('endpointSelect');
  const methodSelect = document.getElementById('methodSelect');
  const requestHint = document.getElementById('requestHint');
  const requestFields = document.getElementById('requestFields');
  const sendBtn = document.getElementById('sendBtn');

  const decisionPill = document.getElementById('decisionPill');
  const decisionText = document.getElementById('decisionText');
  const ruleIds = document.getElementById('ruleIds');
  const requestId = document.getElementById('requestId');
  const timeline = document.getElementById('timeline');

  const metricTotal = document.getElementById('metricTotal');
  const metricBlocked = document.getElementById('metricBlocked');
  const metricAllowed = document.getElementById('metricAllowed');
  const metricFiltered = document.getElementById('metricFiltered');
  const statsEndpointFilter = document.getElementById('statsEndpointFilter');
  const statsDecisionFilter = document.getElementById('statsDecisionFilter');
  const topRuleIds = document.getElementById('topRuleIds');
  const endpointDistribution = document.getElementById('endpointDistribution');
  const latestEvents = document.getElementById('latestEvents');
  const elkStatus = document.getElementById('elkStatus');
  const elkLink = document.getElementById('elkLink');

  const auditLogTerminal = document.getElementById('auditLogTerminal');
  const auditLogEmpty = document.getElementById('auditLogEmpty');
  const auditLogCount = document.getElementById('auditLogCount');
  const auditLiveDot = document.getElementById('auditLiveDot');
  const auditClearBtn = document.getElementById('auditClearBtn');
  const accessLogTerminal = document.getElementById('accessLogTerminal');
  const accessLogEmpty = document.getElementById('accessLogEmpty');
  const accessLogCount = document.getElementById('accessLogCount');
  const accessLiveDot = document.getElementById('accessLiveDot');
  const accessClearBtn = document.getElementById('accessClearBtn');

  const REQUEST_SPECS = {
    search: {
      path: '/api/search',
      label: '/api/search',
      defaultMethod: 'GET',
      methods: {
        GET: {
          hint: 'Search products with query string `q`.',
          transport: 'query',
          fields: [{ name: 'q', label: 'Query', input: 'textarea', defaultValue: 'normal-search' }]
        },
        POST: {
          hint: 'Use the existing POST compatibility flow with `{ endpoint, payload }`.',
          transport: 'body',
          fields: [{ name: 'payload', label: 'Payload', input: 'textarea', defaultValue: 'q=normal-search' }]
        }
      }
    },
    login: {
      path: '/api/login',
      label: '/api/login',
      defaultMethod: 'POST',
      methods: {
        POST: {
          hint: 'Authenticate with JSON body `{ username, password }`.',
          transport: 'body',
          fields: [
            { name: 'username', label: 'Username', input: 'text', defaultValue: 'demo-user' },
            { name: 'password', label: 'Password', input: 'password', defaultValue: 'safe-password' }
          ]
        }
      }
    },
    comment: {
      path: '/api/comment',
      label: '/api/comment',
      defaultMethod: 'POST',
      methods: {
        POST: {
          hint: 'Create a comment with JSON body `{ content, productId }`.',
          transport: 'body',
          fields: [
            { name: 'content', label: 'Comment content', input: 'textarea', defaultValue: 'Nice demo product.' },
            { name: 'productId', label: 'Product ID', input: 'number', defaultValue: '1' }
          ]
        }
      }
    },
    files: {
      path: '/api/files',
      label: '/api/files',
      defaultMethod: 'GET',
      methods: {
        GET: {
          hint: 'Inspect a file via query string `file`.',
          transport: 'query',
          fields: [{ name: 'file', label: 'File query', input: 'text', defaultValue: 'manual.pdf' }]
        }
      }
    },
    admin: {
      path: '/api/admin',
      label: '/api/admin',
      defaultMethod: 'GET',
      methods: {
        GET: {
          hint: 'Call admin endpoint with optional `x-admin-token` header.',
          transport: 'header',
          fields: [{ name: 'x-admin-token', label: 'x-admin-token', input: 'text', defaultValue: '' }]
        }
      }
    }
  };

  const scenarios = {
    sqli: {
      endpointKey: 'login',
      method: 'POST',
      values: { username: "' OR 1=1 --", password: 'safe-password' }
    },
    xss: {
      endpointKey: 'comment',
      method: 'POST',
      values: { content: '<script>alert(1)</script>', productId: '1' }
    },
    lfi: {
      endpointKey: 'files',
      method: 'GET',
      values: { file: '../../../../etc/passwd' }
    },
    path: {
      endpointKey: 'files',
      method: 'GET',
      values: { file: '..%2f..%2f..%2fsecret.txt' }
    }
  };

  let logsPaused = { audit: false, access: false };
  let lastAccessFingerprint = '';
  let lastAuditFingerprint = '';
  let statsRequestCounter = 0;
  let logsRequestCounter = 0;

  function renderList(node, lines) {
    node.innerHTML = '';
    lines.forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      node.appendChild(li);
    });
  }

  function setDecision(isBlocked, text, ids) {
    decisionPill.textContent = isBlocked ? 'BLOCK' : 'ALLOW';
    decisionPill.className = `status-pill ${isBlocked ? 'status-block' : 'status-allow'}`;
    decisionText.textContent = text;
    ruleIds.textContent = ids.length > 0 ? ids.join(', ') : 'None';
  }

  function renderStats(stats) {
    metricTotal.textContent = String(stats.totals.totalRequests);
    metricBlocked.textContent = String(stats.totals.blockedRequests);
    metricAllowed.textContent = String(stats.totals.allowedRequests);
    metricFiltered.textContent = String(stats.filtered.totalEvents);
    if (elkStatus) {
      elkStatus.textContent = stats.elk?.enabled ? `ELK enabled · index ${stats.elk.indexPattern}` : 'ELK unavailable';
    }
    if (elkLink) {
      elkLink.hidden = !stats.elk?.dashboardUrl;
      if (stats.elk?.dashboardUrl) {
        elkLink.href = stats.elk.dashboardUrl;
      }
    }

    renderList(
      topRuleIds,
      stats.topRuleIds.length > 0
        ? stats.topRuleIds.map((entry) => `${entry.ruleId}: ${entry.count}`)
        : ['No rule matches yet.']
    );

    renderList(
      endpointDistribution,
      stats.endpointDistribution.length > 0
        ? stats.endpointDistribution.map((entry) => `${entry.endpoint}: ${entry.count}`)
        : ['No endpoint distribution data yet.']
    );

    renderList(
      latestEvents,
      stats.latestEvents.length > 0
        ? stats.latestEvents.map((event) => {
            const rules = event.matchedRuleIds.length > 0 ? event.matchedRuleIds.join(',') : '-';
            return `${event.timestamp} ${event.decision} ${event.endpoint} rules=${rules}`;
          })
        : ['No events yet.']
    );
  }

  function getCurrentSpec() {
    return REQUEST_SPECS[endpointSelect.value] || REQUEST_SPECS.search;
  }

  function getCurrentMethodSpec() {
    const spec = getCurrentSpec();
    return spec.methods[methodSelect.value] || spec.methods[spec.defaultMethod];
  }

  function buildFieldId(fieldName) {
    return `field-${fieldName}`;
  }

  function buildRequestBody(spec, values) {
    if (spec.path === '/api/search' && methodSelect.value === 'POST') {
      return JSON.stringify({ endpoint: spec.path, payload: values.payload });
    }

    const body = {};
    Object.entries(values).forEach(([key, value]) => {
      body[key] = key === 'productId' ? Number(value) : value;
    });
    return JSON.stringify(body);
  }

  function buildRequest() {
    const spec = getCurrentSpec();
    const methodSpec = getCurrentMethodSpec();
    const values = readFieldValues();
    const headers = {};
    const options = { method: methodSelect.value, headers };
    let url = spec.path;

    if (methodSpec.transport === 'query') {
      const query = new URLSearchParams();
      Object.entries(values).forEach(([key, value]) => {
        query.set(key, value);
      });
      url = `${spec.path}?${query.toString()}`;
    }

    if (methodSpec.transport === 'body') {
      headers['content-type'] = 'application/json';
      options.body = buildRequestBody(spec, values);
    }

    if (methodSpec.transport === 'header' && values['x-admin-token']) {
      headers['x-admin-token'] = values['x-admin-token'];
    }

    return {
      endpoint: spec.path,
      method: methodSelect.value,
      url,
      options
    };
  }

  function renderEndpointOptions() {
    endpointSelect.innerHTML = '';
    Object.entries(REQUEST_SPECS).forEach(([key, spec]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = spec.label;
      endpointSelect.appendChild(option);
    });
    endpointSelect.value = 'search';
  }

  function renderMethodOptions() {
    const spec = getCurrentSpec();
    methodSelect.innerHTML = '';
    Object.keys(spec.methods).forEach((method) => {
      const option = document.createElement('option');
      option.value = method;
      option.textContent = method;
      methodSelect.appendChild(option);
    });
    methodSelect.value = spec.defaultMethod;
  }

  function renderRequestFields() {
    const methodSpec = getCurrentMethodSpec();
    requestFields.innerHTML = '';
    requestHint.textContent = methodSpec.hint;

    methodSpec.fields.forEach((field) => {
      const wrapper = document.createElement('div');
      const label = document.createElement('label');
      const fieldId = buildFieldId(field.name);
      label.htmlFor = fieldId;
      label.textContent = field.label;

      const input = document.createElement(field.input === 'textarea' ? 'textarea' : 'input');
      input.id = fieldId;
      input.name = field.name;
      if (field.input !== 'textarea') {
        input.type = field.input;
      }
      input.value = field.defaultValue;

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      requestFields.appendChild(wrapper);
    });
  }

  function readFieldValues() {
    const methodSpec = getCurrentMethodSpec();
    return methodSpec.fields.reduce((values, field) => {
      const input = document.getElementById(buildFieldId(field.name));
      values[field.name] = input ? input.value : '';
      return values;
    }, {});
  }

  async function refreshDashboard() {
    const endpoint = statsEndpointFilter.value;
    const decision = statsDecisionFilter.value;
    const query = new URLSearchParams({ endpoint, decision });
    const requestNumber = ++statsRequestCounter;

    try {
      const response = await fetch(`/api/stats/security?${query.toString()}`);
      if (!response.ok || requestNumber !== statsRequestCounter) {
        return;
      }
      const stats = await response.json();
      if (requestNumber !== statsRequestCounter) {
        return;
      }
      renderStats(stats);
    } catch (_error) {
      // no-op; keep last successful dashboard state
    }
  }

  function statusClass(code) {
    if (code >= 500) return 's5xx';
    if (code >= 400) return 's4xx';
    if (code >= 300) return 's3xx';
    return 's2xx';
  }

  function formatTime(ts) {
    if (!ts) return '--:--:--';
    try {
      const date = new Date(ts);
      if (Number.isNaN(date.getTime())) return ts.substring(11, 19) || ts;
      return date.toLocaleTimeString('en-GB', { hour12: false });
    } catch (_error) {
      return ts;
    }
  }

  function createAccessEntry(entry) {
    if (entry.raw) {
      const el = document.createElement('div');
      el.className = 'log-entry';
      const rawSpan = document.createElement('span');
      rawSpan.className = 'log-uri';
      const truncated = entry.raw.length > 150 ? entry.raw.substring(0, 150) + '…' : entry.raw;
      rawSpan.textContent = truncated;
      rawSpan.title = entry.raw.substring(0, 500);
      el.appendChild(rawSpan);
      return el;
    }

    const el = document.createElement('div');
    el.className = 'log-entry';

    const ts = document.createElement('span');
    ts.className = 'log-ts';
    ts.textContent = formatTime(entry.timestamp);

    const method = document.createElement('span');
    method.className = 'log-method';
    method.textContent = entry.method;

    const status = document.createElement('span');
    status.className = `log-status ${statusClass(entry.status)}`;
    status.textContent = String(entry.status);

    const uri = document.createElement('span');
    uri.className = 'log-uri';
    uri.textContent = entry.uri;
    uri.title = entry.uri;

    const meta = document.createElement('span');
    meta.className = 'log-meta';
    const timeMs = typeof entry.requestTime === 'number' ? Math.round(entry.requestTime * 1000) : 0;
    meta.textContent = `${timeMs}ms`;

    el.appendChild(ts);
    el.appendChild(method);
    el.appendChild(status);
    el.appendChild(uri);
    el.appendChild(meta);

    return el;
  }

  function createAuditEntry(entry) {
    if (entry.raw) {
      const el = document.createElement('div');
      el.className = 'log-entry';
      const rawSpan = document.createElement('span');
      rawSpan.className = 'log-uri';
      const truncated = entry.raw.length > 150 ? entry.raw.substring(0, 150) + '…' : entry.raw;
      rawSpan.textContent = truncated;
      rawSpan.title = entry.raw.substring(0, 500);
      el.appendChild(rawSpan);
      return el;
    }

    const el = document.createElement('div');
    el.className = 'log-entry';

    const ts = document.createElement('span');
    ts.className = 'log-ts';
    ts.textContent = formatTime(entry.timestamp);

    const action = document.createElement('span');
    action.className = entry.action === 'FLAGGED' ? 'log-action-flagged' : 'log-action-pass';
    action.style.fontWeight = '700';
    action.style.minWidth = '55px';
    action.style.flexShrink = '0';
    action.textContent = entry.action || 'PASS';

    const method = document.createElement('span');
    method.className = 'log-method';
    method.textContent = entry.method;

    const uri = document.createElement('span');
    uri.className = 'log-uri';
    uri.title = entry.uri;

    if (entry.ruleIds && entry.ruleIds.length > 0) {
      const rulesSpan = document.createElement('span');
      rulesSpan.className = 'log-rules';
      rulesSpan.textContent = `[${entry.ruleIds.join(', ')}] `;
      uri.appendChild(rulesSpan);
    }

    uri.appendChild(document.createTextNode(entry.uri));

    if (entry.messages && entry.messages.length > 0) {
      const msgSpan = document.createElement('span');
      msgSpan.style.color = '#64748b';
      msgSpan.textContent = ` — ${entry.messages[0]}`;
      uri.appendChild(msgSpan);
    }

    el.appendChild(ts);
    el.appendChild(action);
    el.appendChild(method);
    el.appendChild(uri);

    return el;
  }

  function fingerprint(entries) {
    if (!entries || entries.length === 0) return '';
    return entries.map((entry) => `${entry.timestamp || ''}${entry.uri || ''}${entry.status || ''}${entry.method || ''}`).join('|');
  }

  function renderLogTerminal(container, emptyEl, countEl, entries, createFn) {
    if (!entries || entries.length === 0) {
      emptyEl.style.display = '';
      countEl.textContent = '0 entries';
      return;
    }

    emptyEl.style.display = 'none';
    countEl.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
    container.innerHTML = '';
    container.appendChild(emptyEl);
    emptyEl.style.display = 'none';

    entries.forEach((entry) => {
      container.appendChild(createFn(entry));
    });

    container.scrollTop = container.scrollHeight;
  }

  async function refreshLogs() {
    const requestNumber = ++logsRequestCounter;

    try {
      const response = await fetch('/api/logs/preview?limit=20');
      if (!response.ok || requestNumber !== logsRequestCounter) {
        return;
      }

      const data = await response.json();
      if (requestNumber !== logsRequestCounter) {
        return;
      }

      auditLiveDot.classList.remove('disconnected');
      accessLiveDot.classList.remove('disconnected');

      if (!logsPaused.access) {
        const newAccessFingerprint = fingerprint(data.access?.entries);
        if (newAccessFingerprint !== lastAccessFingerprint) {
          lastAccessFingerprint = newAccessFingerprint;
          renderLogTerminal(
            accessLogTerminal,
            accessLogEmpty,
            accessLogCount,
            data.access?.entries || [],
            createAccessEntry
          );
        }
      }

      if (!logsPaused.audit) {
        const newAuditFingerprint = fingerprint(data.audit?.entries);
        if (newAuditFingerprint !== lastAuditFingerprint) {
          lastAuditFingerprint = newAuditFingerprint;
          renderLogTerminal(
            auditLogTerminal,
            auditLogEmpty,
            auditLogCount,
            data.audit?.entries || [],
            createAuditEntry
          );
        }
      }
    } catch (_error) {
      auditLiveDot.classList.add('disconnected');
      accessLiveDot.classList.add('disconnected');
    }
  }

  async function sendRequest() {
    const request = buildRequest();
    sendBtn.disabled = true;

    try {
      const response = await fetch(request.url, request.options);
      const contentType = response.headers.get('content-type') || '';
      const reqId = response.headers.get('x-request-id') || '-';
      requestId.textContent = reqId;

      if (!contentType.includes('application/json')) {
        setDecision(true, `gateway returned ${response.status}`, []);
        renderList(timeline, [
          'Request sent to Nginx',
          'ModSecurity/CRS inspection occurred at gateway',
          `Gateway returned status ${response.status}`
        ]);
        fetch('/api/stats/gateway-block', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            endpoint: request.endpoint,
            method: request.method,
            statusCode: response.status
          })
        }).catch(() => {});
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setDecision(true, data.error?.message || `request failed (${response.status})`, []);
        renderList(timeline, [
          'Request sent',
          'Request failed before demo decision rendering'
        ]);
        requestId.textContent = data.requestId || reqId;
        return;
      }

      setDecision(data.decision === 'BLOCK', data.reason, data.matchedRuleIds || []);
      renderList(timeline, data.timeline || []);
      requestId.textContent = data.requestId || reqId;
    } catch (_error) {
      setDecision(true, 'network error while sending request', []);
      requestId.textContent = '-';
      renderList(timeline, ['Request failed due to network/runtime error']);
    } finally {
      sendBtn.disabled = false;
      setTimeout(refreshDashboard, 300);
      setTimeout(refreshLogs, 500);
    }
  }

  function applyScenario(key) {
    const scenario = scenarios[key];
    if (!scenario) {
      return;
    }

    endpointSelect.value = scenario.endpointKey;
    renderMethodOptions();
    methodSelect.value = scenario.method;
    renderRequestFields();

    Object.entries(scenario.values).forEach(([fieldName, value]) => {
      const input = document.getElementById(buildFieldId(fieldName));
      if (input) {
        input.value = value;
      }
    });

    const firstField = requestFields.querySelector('input, textarea');
    if (firstField) {
      firstField.focus();
    }
  }

  auditClearBtn.addEventListener('click', () => {
    auditLogTerminal.innerHTML = '';
    auditLogTerminal.appendChild(auditLogEmpty);
    auditLogEmpty.style.display = '';
    auditLogCount.textContent = '0 entries';
    lastAuditFingerprint = '';
  });

  accessClearBtn.addEventListener('click', () => {
    accessLogTerminal.innerHTML = '';
    accessLogTerminal.appendChild(accessLogEmpty);
    accessLogEmpty.style.display = '';
    accessLogCount.textContent = '0 entries';
    lastAccessFingerprint = '';
  });

  document.querySelectorAll('[data-scenario]').forEach((button) => {
    button.addEventListener('click', () => {
      applyScenario(button.getAttribute('data-scenario'));
    });
  });

  endpointSelect.addEventListener('change', () => {
    renderMethodOptions();
    renderRequestFields();
  });
  methodSelect.addEventListener('change', renderRequestFields);
  sendBtn.addEventListener('click', sendRequest);
  statsEndpointFilter.addEventListener('change', refreshDashboard);
  statsDecisionFilter.addEventListener('change', refreshDashboard);

  renderEndpointOptions();
  renderMethodOptions();
  renderRequestFields();
  refreshDashboard();
  setInterval(refreshDashboard, 2000);
  refreshLogs();
  setInterval(refreshLogs, 3000);
})();
