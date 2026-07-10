import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

import { isContextPathExcluded, mergeContextPolicy } from './context-policy.js';
import { makeSourceRef } from './provenance.js';

const INSTRUCTION_NAMES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md'];

export function collectContext(root = process.cwd(), options = {}) {
  const policy = mergeContextPolicy(options.policy || {});
  const resolvedRoot = resolve(root);
  const candidates = discoverContextFiles(resolvedRoot, policy);
  const sourceMap = candidates
    .map((filePath) =>
      makeSourceRef(filePath, { root: resolvedRoot, parserVersion: policy.parser_version })
    )
    .filter(Boolean)
    .sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  const files = sourceMap.map((source) => source.path);
  const instructionFiles = sourceMap
    .filter((source) => INSTRUCTION_NAMES.includes(source.relative_path.split('/').pop()))
    .map((source) => source.path);
  return {
    root: resolvedRoot,
    files,
    instruction_files: instructionFiles,
    project_notes: [],
    source_map: sourceMap
  };
}

function discoverContextFiles(root, policy) {
  const files = new Set();
  for (const name of policy.root_files) {
    const path = resolve(root, name);
    if (
      pathWithinRoot(root, path) &&
      !isContextPathExcluded(relativePath(root, path), policy.user_exclusions) &&
      existsSync(path) &&
      statSync(path).isFile()
    ) {
      files.add(path);
    }
  }
  for (const dir of policy.scan_dirs) {
    const path = resolve(root, dir);
    if (pathWithinRoot(root, path) && existsSync(path) && statSync(path).isDirectory()) {
      for (const file of walkTextFiles(root, path, policy)) files.add(file);
    }
  }
  return [...files];
}

function walkTextFiles(root, dir, policy) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const relativeFilePath = relativePath(root, path);
    if (!pathWithinRoot(root, path) || isContextPathExcluded(relativeFilePath, policy.user_exclusions)) {
      continue;
    }
    if (entry.isDirectory()) {
      if (!policy.ignore_dirs.includes(entry.name)) files.push(...walkTextFiles(root, path, policy));
    } else if (entry.isFile() && policy.allowed_extensions.includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function pathWithinRoot(root, candidate) {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function relativePath(root, candidate) {
  return relative(root, candidate).replace(/\\/g, '/');
}
