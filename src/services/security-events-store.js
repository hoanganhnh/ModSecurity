const rawMaxEvents = Number(process.env.SECURITY_EVENTS_MAX || 200);
const MAX_EVENTS = Number.isInteger(rawMaxEvents) && rawMaxEvents > 0 ? rawMaxEvents : 200;

const state = {
  totalRequests: 0,
  blockedRequests: 0,
  allowedRequests: 0,
  events: []
};

function trimEvents() {
  if (state.events.length <= MAX_EVENTS) {
    return;
  }

  state.events.splice(0, state.events.length - MAX_EVENTS);
}

function sanitizeEvent(event) {
  return {
    timestamp: event.timestamp,
    requestId: event.requestId,
    endpoint: event.endpoint,
    decision: event.decision,
    matchedRuleIds: Array.isArray(event.matchedRuleIds) ? event.matchedRuleIds.slice(0, 5) : []
  };
}

function recordSecurityEvent(event) {
  const normalizedDecision = event.decision === 'BLOCK' ? 'BLOCK' : 'ALLOW';

  state.totalRequests += 1;
  if (normalizedDecision === 'BLOCK') {
    state.blockedRequests += 1;
  } else {
    state.allowedRequests += 1;
  }

  state.events.push(sanitizeEvent({
    ...event,
    decision: normalizedDecision,
    timestamp: event.timestamp || new Date().toISOString()
  }));
  trimEvents();
}

function toRuleHistogram(events) {
  const counts = new Map();

  events.forEach((event) => {
    event.matchedRuleIds.forEach((ruleId) => {
      counts.set(ruleId, (counts.get(ruleId) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ruleId, count]) => ({ ruleId, count }));
}

function getSecurityStats({ endpoint = 'all', decision = 'all' } = {}) {
  const endpointFilter = endpoint === 'all' ? null : endpoint;
  const decisionFilter = decision === 'all' ? null : decision;

  const filteredEvents = state.events.filter((event) => {
    const endpointMatches = endpointFilter ? event.endpoint === endpointFilter : true;
    const decisionMatches = decisionFilter ? event.decision === decisionFilter : true;
    return endpointMatches && decisionMatches;
  });

  const endpointDistributionMap = new Map();
  filteredEvents.forEach((event) => {
    endpointDistributionMap.set(event.endpoint, (endpointDistributionMap.get(event.endpoint) || 0) + 1);
  });

  const endpointDistribution = [...endpointDistributionMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([endpointName, count]) => ({ endpoint: endpointName, count }));

  return {
    totals: {
      totalRequests: state.totalRequests,
      blockedRequests: state.blockedRequests,
      allowedRequests: state.allowedRequests
    },
    filtered: {
      totalEvents: filteredEvents.length,
      blockedEvents: filteredEvents.filter((event) => event.decision === 'BLOCK').length,
      allowedEvents: filteredEvents.filter((event) => event.decision === 'ALLOW').length
    },
    topRuleIds: toRuleHistogram(filteredEvents),
    endpointDistribution,
    latestEvents: filteredEvents.slice(-20).reverse()
  };
}

module.exports = {
  recordSecurityEvent,
  getSecurityStats
};
