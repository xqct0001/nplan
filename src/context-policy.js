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
  parser_version: 'local-text-v1',
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
    }
  };
}
