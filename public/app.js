(function () {
  const endpointField = document.getElementById('endpoint');
  const payloadField = document.getElementById('payload');
  const sendBtn = document.getElementById('sendBtn');

  const decisionPill = document.getElementById('decisionPill');
  const decisionText = document.getElementById('decisionText');
  const ruleIds = document.getElementById('ruleIds');
  const requestId = document.getElementById('requestId');
  const timeline = document.getElementById('timeline');
  const auditLogs = document.getElementById('auditLogs');
  const accessLogs = document.getElementById('accessLogs');

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

  const scenarios = {
    sqli: "q=' OR 1=1 --",
    xss: 'comment=<script>alert(1)</script>',
    lfi: 'file=../../../../etc/passwd',
    path: 'path=..%2f..%2f..%2fsecret.txt'
  };

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

  let statsRequestCounter = 0;

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

  async function sendRequest() {
    const endpoint = endpointField.value.trim() || '/api/search';
    const payload = payloadField.value;

    sendBtn.disabled = true;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint, payload })
      });

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
        renderList(auditLogs, ['[audit] non-json gateway response']);
        renderList(accessLogs, [`[access] ${response.status} POST ${endpoint}`]);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setDecision(true, data.error?.message || `request failed (${response.status})`, []);
        renderList(timeline, [
          'Request sent',
          'Request failed before demo decision rendering'
        ]);
        renderList(auditLogs, ['[audit] request rejected']);
        renderList(accessLogs, [`[access] ${response.status} POST ${endpoint}`]);
        requestId.textContent = data.requestId || reqId;
        return;
      }

      setDecision(data.decision === 'BLOCK', data.reason, data.matchedRuleIds || []);
      renderList(timeline, data.timeline || []);
      renderList(auditLogs, data.logs?.audit || []);
      renderList(accessLogs, data.logs?.access || []);
      requestId.textContent = data.requestId || reqId;
    } catch (_error) {
      setDecision(true, 'network error while sending request', []);
      requestId.textContent = '-';
      renderList(timeline, ['Request failed due to network/runtime error']);
      renderList(auditLogs, ['[audit] unavailable']);
      renderList(accessLogs, ['[access] unavailable']);
    } finally {
      sendBtn.disabled = false;
    }
  }

  document.querySelectorAll('[data-scenario]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-scenario');
      payloadField.value = scenarios[key] || '';
      payloadField.focus();
    });
  });

  sendBtn.addEventListener('click', sendRequest);
  statsEndpointFilter.addEventListener('change', refreshDashboard);
  statsDecisionFilter.addEventListener('change', refreshDashboard);

  refreshDashboard();
  setInterval(refreshDashboard, 2000);
})();
