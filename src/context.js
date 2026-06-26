import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const INSTRUCTION_NAMES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'README.md'];

export function collectContext(root = process.cwd()) {
  const files = INSTRUCTION_NAMES.map((name) => resolve(root, name)).filter((path) =>
    existsSync(path)
  );
  return { files, instruction_files: files, project_notes: [] };
}
