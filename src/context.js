import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { isContextPathExcluded, mergeContextPolicy } from './context-policy.js';
import { makeSourceRef } from './provenance.js';

const INSTRUCTION_NAMES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md'];

export function collectContext(root = process.cwd(), options = {}) {
  const policy = mergeContextPolicy(options.policy || {});
  const resolvedRoot = resolve(root);
  const rootEntry = existingEntry(resolvedRoot);
  const realRoot = rootEntry?.stat.isDirectory() ? rootEntry.realPath : resolvedRoot;
  const candidates = discoverContextFiles(resolvedRoot, realRoot, policy);
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

function discoverContextFiles(root, realRoot, policy) {
  const files = new Set();
  for (const name of policy.root_files) {
    const path = resolve(root, name);
    const entry = safeEntry(realRoot, path);
    if (
      pathWithinRoot(root, path) &&
      !pathIsExcluded(root, path, policy.user_exclusions) &&
      entry?.stat.isFile() &&
      !pathIsExcluded(realRoot, entry.realPath, policy.user_exclusions)
    ) {
      files.add(path);
    }
  }
  for (const dir of policy.scan_dirs) {
    const path = resolve(root, dir);
    const entry = safeEntry(realRoot, path);
    if (
      pathWithinRoot(root, path) &&
      !pathIsExcluded(root, path, policy.user_exclusions) &&
      entry?.stat.isDirectory() &&
      !pathIsExcluded(realRoot, entry.realPath, policy.user_exclusions)
    ) {
      for (const file of walkTextFiles(root, realRoot, path, policy, new Set())) {
        files.add(file);
      }
    }
  }
  return [...files];
}

function walkTextFiles(root, realRoot, dir, policy, visitedDirectories) {
  const directory = safeEntry(realRoot, dir);
  if (!directory?.stat.isDirectory()) return [];
  const directoryKey = comparableRealPath(directory.realPath);
  if (visitedDirectories.has(directoryKey)) return [];
  visitedDirectories.add(directoryKey);

  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const target = safeEntry(realRoot, path);
    if (
      !pathWithinRoot(root, path) ||
      pathIsExcluded(root, path, policy.user_exclusions) ||
      !target ||
      pathIsExcluded(realRoot, target.realPath, policy.user_exclusions)
    ) {
      continue;
    }
    if (target.stat.isDirectory()) {
      if (!policy.ignore_dirs.includes(entry.name)) {
        files.push(...walkTextFiles(root, realRoot, path, policy, visitedDirectories));
      }
    } else if (target.stat.isFile() && policy.allowed_extensions.includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function pathWithinRoot(root, candidate) {
  const path = relative(root, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function relativePath(root, candidate) {
  return relative(root, candidate).replace(/\\/g, '/');
}

function pathIsExcluded(root, candidate, exclusions) {
  const path = relativePath(root, candidate);
  return path ? isContextPathExcluded(path, exclusions) : false;
}

function safeEntry(realRoot, candidate) {
  const entry = existingEntry(candidate);
  if (!entry || entry.linkStat.isSymbolicLink()) return null;
  return pathWithinRoot(realRoot, entry.realPath) ? entry : null;
}

function existingEntry(path) {
  try {
    const linkStat = lstatSync(path);
    const realPath = realpathSync.native(path);
    return {
      linkStat,
      realPath,
      stat: linkStat.isSymbolicLink() ? statSync(path) : linkStat
    };
  } catch {
    return null;
  }
}

function comparableRealPath(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}
