import { collectContext } from './context.js';
import { mergeContextPolicy } from './context-policy.js';
import { detectRequestConflicts } from './conflicts.js';
import { makeEvidenceItem } from './provenance.js';

export function curateContext(request, context = {}, options = {}) {
  const policy = mergeContextPolicy(options.policy || context.context_policy || {});
  const collected = context.source_map
    ? normalizeProvidedContext(context)
    : collectContext(context.root || process.cwd(), { policy });
  const rankedSources = rankSources(collected.source_map || [], request, policy);
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
  return priority + termScore;
}

function requestTerms(request) {
  return String(request || '')
    .toLowerCase()
    .split(/[^a-z0-9_\u4e00-\u9fa5]+/u)
    .filter((term) => term.length >= 2)
    .slice(0, 20);
}
