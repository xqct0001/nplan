export function parseKnowledgeDocument(text) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: source, conformant: false, links: [] };
  }

  const frontmatter = parseFrontmatter(match[1]);
  const body = source.slice(match[0].length);
  return {
    frontmatter,
    body,
    conformant: Boolean(frontmatter.type),
    links: extractMarkdownLinks(body)
  };
}

export function knowledgeMetadataForText(text, relativePath = '') {
  const document = parseKnowledgeDocument(text);
  if (!document.conformant) return null;
  const title = stringValue(document.frontmatter.title) || titleFromPath(relativePath);
  return {
    concept_id: conceptIdFromPath(relativePath),
    type: stringValue(document.frontmatter.type),
    title,
    description: stringValue(document.frontmatter.description),
    resource: stringValue(document.frontmatter.resource),
    tags: arrayValue(document.frontmatter.tags),
    timestamp: stringValue(document.frontmatter.timestamp),
    links: document.links
  };
}

export function parseFrontmatter(value) {
  const result = {};
  for (const rawLine of String(value || '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    result[key] = parseFrontmatterValue(rawValue);
  }
  return result;
}

export function extractMarkdownLinks(markdown) {
  const links = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(String(markdown || '')))) {
    links.push({
      label: match[1].trim(),
      target: match[2].trim(),
      kind: linkKind(match[2].trim())
    });
  }
  return links;
}

function parseFrontmatterValue(value) {
  if (!value) return '';
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  return unquote(value);
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function unquote(value) {
  return String(value || '').replace(/^["']|["']$/g, '');
}

function conceptIdFromPath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/\.md$/i, '');
}

function titleFromPath(path) {
  const name = conceptIdFromPath(path).split('/').pop() || 'Untitled';
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function linkKind(target) {
  if (/^https?:\/\//i.test(target)) return 'external';
  if (target.startsWith('/')) return 'bundle';
  return 'relative';
}
