export const DEFAULT_CONTEXT_POLICY = {
  max_sources: 24,
  max_evidence_chars_per_source: 1200,
  allowed_extensions: ['.md', '.js', '.json', '.toml'],
  root_files: [
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    'README.md',
    'README.zh-CN.md',
    'package.json',
    'config.example.toml'
  ],
  scan_dirs: ['docs', 'DOC', 'src', 'test'],
  ignore_dirs: ['.git', 'node_modules', '.nplan', '.codegraph', 'knowledge-catalog'],
  user_exclusions: [],
  parser_version: 'local-text-v1',
  core_source_paths: [
    'src/planning.js',
    'src/validation.js',
    'src/schemas.js',
    'src/understanding.js'
  ],
  source_priority: {
    instruction: 100,
    readme: 90,
    knowledge: 85,
    spec: 80,
    source: 70,
    test: 60,
    document: 50,
    config: 40,
    unknown: 10
  }
};

export function mergeContextPolicy(overrides = {}) {
  return {
    ...DEFAULT_CONTEXT_POLICY,
    ...overrides,
    source_priority: {
      ...DEFAULT_CONTEXT_POLICY.source_priority,
      ...(overrides.source_priority || {})
    },
    user_exclusions: normalizeUserExclusions(
      overrides.user_exclusions || DEFAULT_CONTEXT_POLICY.user_exclusions
    )
  };
}

export function normalizeUserExclusions(exclusions = []) {
  if (!Array.isArray(exclusions)) {
    throw new TypeError('context policy user_exclusions must be an array');
  }
  const normalized = exclusions.map((value) => normalizeProjectRelativePath(value));
  return [...new Set(normalized)].sort();
}

export function isContextPathExcluded(relativePath, exclusions = []) {
  let candidate;
  try {
    candidate = normalizeProjectRelativePath(relativePath);
  } catch {
    return true;
  }
  const comparableCandidate = comparablePath(candidate);
  return normalizeUserExclusions(exclusions).some((exclusion) => {
    const comparableExclusion = comparablePath(exclusion);
    return (
      comparableCandidate === comparableExclusion ||
      comparableCandidate.startsWith(`${comparableExclusion}/`)
    );
  });
}

function normalizeProjectRelativePath(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new TypeError('context exclusions must contain non-empty project-relative paths');
  if (/^(?:[a-z]:|[\\/]{1,2})/i.test(raw)) {
    throw new TypeError('context exclusions must use project-relative paths');
  }
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
  const parts = normalized.split('/');
  if (!normalized || parts.some((part) => !part || part === '..')) {
    throw new TypeError('context exclusions must stay within project-relative paths');
  }
  const projectRelative = parts.filter((part) => part !== '.').join('/');
  if (!projectRelative) {
    throw new TypeError('context exclusions must contain non-empty project-relative paths');
  }
  return projectRelative;
}

function comparablePath(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
