const IRREVERSIBLE_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\boverwrite\b/i,
  /\bdeploy\b/i,
  /\bsend\b/i,
  /\bpurchase\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+commit\b/i,
  /\brm\s+-/i,
  /删除/,
  /移除/,
  /覆盖/,
  /部署/,
  /发送/,
  /购买/,
  /提交/
];

const OFFLINE_PATTERNS = [
  /\boffline\b/i,
  /\bno\s+network\b/i,
  /离线/,
  /不联网/,
  /无网络/,
  /禁止联网/,
  /完全本地/
];

export function detectRequestConflicts({ request = '', context = {}, sources = [], evidence = [] } = {}) {
  const blocking = [];
  const nonBlocking = [];
  const resolutions = [];

  if (matchesAny(request, IRREVERSIBLE_PATTERNS)) {
    blocking.push({
      code: 'irreversible_action_requested',
      message: 'The request appears to include an irreversible or execution action.',
      evidence_ref: 'surface_request'
    });
    resolutions.push({
      code: 'request_user_confirmation',
      message: 'Ask for explicit confirmation before any execution-capable downstream agent acts.'
    });
  }

  if (matchesAny(request, OFFLINE_PATTERNS)) {
    nonBlocking.push({
      code: 'offline_requirement_removed',
      message: 'Offline-only behavior is not a supported constraint; configured model/network providers may be used.',
      evidence_ref: 'surface_request'
    });
    resolutions.push({
      code: 'use_configured_provider_policy',
      message: 'Ignore offline-only wording and rely on configured provider and explicit authorization rules.'
    });
  }

  if (!sources.length) {
    nonBlocking.push({
      code: 'no_context_sources',
      message: 'No local context sources were found for evidence mapping.',
      evidence_ref: null
    });
  }

  const knownSourceIds = new Set(sources.map((source) => source.source_id));
  const danglingEvidence = evidence.filter((item) => !knownSourceIds.has(item.source_id));
  if (danglingEvidence.length) {
    blocking.push({
      code: 'evidence_without_source',
      message: 'Some evidence items reference missing sources.',
      evidence_ref: danglingEvidence.map((item) => item.evidence_id).join(',')
    });
  }

  return { blocking, non_blocking: nonBlocking, resolutions };
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(String(text || '')));
}
