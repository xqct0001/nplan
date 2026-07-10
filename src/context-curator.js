import { collectContext } from './context.js';
import { isContextPathExcluded, mergeContextPolicy } from './context-policy.js';
import { detectRequestConflicts } from './conflicts.js';
import { makeEvidenceItem } from './provenance.js';

export function curateContext(request, context = {}, options = {}) {
  const policy = mergeContextPolicy(options.policy || context.context_policy || {});
  const collected = context.source_map
    ? normalizeProvidedContext(context)
    : collectContext(context.root || process.cwd(), { policy });
  const eligibleSources = (collected.source_map || []).filter(
    (source) => !isContextPathExcluded(source.relative_path, policy.user_exclusions)
  );
  const rankedSources = rankSources(eligibleSources, request, policy);
  const selectedSources = rankedSources.slice(0, policy.max_sources);
  const droppedSources = rankedSources.slice(policy.max_sources).map((source) => source.source_id);
  const evidence = selectedSources
    .map((source) => makeEvidenceItem(source, { maxChars: policy.max_evidence_chars_per_source }))
    .filter(Boolean);
  const conflictReport =
    context.conflict_report ||
    detectRequestConflicts({ request, context, sources: selectedSources, evidence });
  const contextReport = {
    source_count: selectedSources.length,
    evidence_count: evidence.length,
    dropped_source_count: droppedSources.length,
    budget: {
      max_sources: policy.max_sources,
      max_evidence_chars_per_source: policy.max_evidence_chars_per_source
    },
    warnings: [
      ...((context.context_report && context.context_report.warnings) || []),
      ...(droppedSources.length ? ['context_sources_dropped_by_budget'] : [])
    ]
  };

  return {
    ...context,
    context_policy: policy,
    root: collected.root,
    files: selectedSources.map((source) => source.path),
    instruction_files:
      context.instruction_files ||
      selectedSources.filter((source) => source.kind === 'instruction').map((source) => source.path),
    project_notes: context.project_notes || collected.project_notes || [],
    source_map: selectedSources,
    evidence_map: evidence,
    context_pack: {
      sources: selectedSources,
      evidence,
      dropped_sources: droppedSources,
      budget: contextReport.budget,
      warnings: contextReport.warnings
    },
    context_report: contextReport,
    conflict_report: conflictReport
  };
}

function normalizeProvidedContext(context) {
  return {
    root: context.root || process.cwd(),
    project_notes: context.project_notes || [],
    source_map: context.source_map || []
  };
}

function rankSources(sources, request, policy) {
  const terms = requestTerms(request);
  return [...sources].sort((left, right) => {
    const score = sourceScore(right, terms, policy) - sourceScore(left, terms, policy);
    return score || left.relative_path.localeCompare(right.relative_path);
  });
}

function sourceScore(source, terms, policy) {
  const priority = policy.source_priority[source.kind] || policy.source_priority.unknown || 0;
  const focusBoost = coreSourceBoost(source, terms, policy);
  const knowledge = source.knowledge || {};
  const haystack = [
    source.relative_path,
    source.kind,
    knowledge.type,
    knowledge.title,
    knowledge.description,
    ...(knowledge.tags || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const termScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 2 : 0), 0);
  return priority + focusBoost + termScore;
}

function requestTerms(request) {
  return String(request || '')
    .toLowerCase()
    .split(/[^a-z0-9_\u4e00-\u9fa5]+/u)
    .filter((term) => term.length >= 2)
    .slice(0, 20);
}

function coreSourceBoost(source, terms, policy) {
  const relativePath = String(source.relative_path || '').replace(/\\/g, '/');
  const corePaths = new Set(policy.core_source_paths || []);
  if (!corePaths.has(relativePath)) return 0;

  if (hasAnyTerm(terms, PROJECT_WIDE_TERMS)) return 80;
  if (relativePath.endsWith('planning.js') && hasAnyTerm(terms, PLANNING_TERMS)) return 70;
  if (relativePath.endsWith('validation.js') && hasAnyTerm(terms, VALIDATION_TERMS)) return 70;
  if (relativePath.endsWith('schemas.js') && hasAnyTerm(terms, SCHEMA_TERMS)) return 70;
  if (relativePath.endsWith('understanding.js') && hasAnyTerm(terms, UNDERSTANDING_TERMS)) return 70;
  return 0;
}

function hasAnyTerm(terms, candidates) {
  return terms.some((term) => candidates.some((candidate) => term.includes(candidate)));
}

const PROJECT_WIDE_TERMS = [
  'project',
  'repo',
  'repository',
  'module',
  'overall',
  'evaluate',
  'assessment',
  'review',
  'gap',
  'gaps',
  '不足',
  '整体',
  '整體',
  '项目',
  '項目',
  '仓库',
  '倉庫',
  '评估',
  '評估',
  '审查',
  '審查'
];

const PLANNING_TERMS = ['plan', 'planning', 'planner', 'dag', '规划', '規劃', '计划', '計劃', '分解'];
const VALIDATION_TERMS = ['validate', 'validation', 'validator', 'verify', '校验', '校驗', '验证', '驗證'];
const SCHEMA_TERMS = ['schema', 'schemas', 'contract', '字段', '结构', '結構', '模式'];
const UNDERSTANDING_TERMS = ['understand', 'understanding', 'intent', '语义', '語義', '理解', '意图', '意圖'];
