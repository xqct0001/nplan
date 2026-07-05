import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname, relative } from 'node:path';

import { knowledgeMetadataForText } from './okf.js';

export function hashText(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function readTextFile(filePath, maxBytes = 256_000) {
  const buffer = readFileSync(filePath);
  const slice = buffer.subarray(0, maxBytes);
  if (slice.includes(0)) return '';
  return slice.toString('utf8');
}

export function sourceKindForPath(filePath, knowledge = null) {
  const name = basename(filePath).toLowerCase();
  const ext = extname(filePath).toLowerCase();
  const normalized = normalizePath(filePath).toLowerCase();
  if (knowledge) return 'knowledge';
  if (['agents.md', 'claude.md', 'gemini.md'].includes(name)) return 'instruction';
  if (name.startsWith('readme')) return 'readme';
  if (hasPathSegment(normalized, 'docs')) return 'spec';
  if (hasPathSegment(normalized, 'doc')) return 'document';
  if (hasPathSegment(normalized, 'test')) return 'test';
  if (ext === '.js') return 'source';
  if (['.json', '.toml'].includes(ext)) return 'config';
  return 'unknown';
}

export function makeSourceRef(filePath, { root = process.cwd(), parserVersion = 'local-text-v1' } = {}) {
  const stat = statSync(filePath);
  if (!stat.isFile()) return null;
  const text = readTextFile(filePath);
  if (!text) return null;
  const hash = hashText(text);
  const relativePath = normalizePath(relative(root, filePath) || basename(filePath));
  const knowledge = knowledgeMetadataForText(text, relativePath);
  const lineCount = text.split(/\r?\n/).length;
  return {
    source_id: `src_${hash.slice(0, 12)}`,
    kind: sourceKindForPath(relativePath, knowledge),
    path: filePath,
    relative_path: relativePath,
    hash: `sha256:${hash}`,
    mtime: stat.mtime.toISOString(),
    size_bytes: stat.size,
    parser_version: parserVersion,
    span: { start_line: 1, end_line: lineCount },
    ...(knowledge ? { knowledge } : {})
  };
}

export function makeEvidenceItem(source, { maxChars = 1200 } = {}) {
  const text = excerptText(evidenceTextForSource(source), maxChars);
  if (!text) return null;
  const endLine = Math.max(1, text.split(/\r?\n/).length);
  return {
    evidence_id: `ev_${source.source_id}_${hashText(text).slice(0, 8)}`,
    source_id: source.source_id,
    span: { start_line: 1, end_line: endLine },
    text,
    claim_type: source.knowledge ? 'knowledge_concept_excerpt' : 'source_excerpt',
    confidence: 1
  };
}

function evidenceTextForSource(source) {
  const text = readTextFile(source.path);
  if (!source.knowledge) return text;
  const parts = [
    `Concept: ${source.knowledge.title}`,
    `Type: ${source.knowledge.type}`,
    source.knowledge.description ? `Description: ${source.knowledge.description}` : '',
    source.knowledge.tags?.length ? `Tags: ${source.knowledge.tags.join(', ')}` : '',
    '',
    text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
  ];
  return parts.filter((part) => part !== '').join('\n');
}

function excerptText(text, maxChars) {
  const compact = String(text || '').replace(/\r\n/g, '\n').trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars).trimEnd()}\n...`;
}

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

function hasPathSegment(path, segment) {
  return path.split('/').includes(segment.toLowerCase());
}
