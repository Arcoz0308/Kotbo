import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC_ROOT = path.resolve(import.meta.dir, '..', '..');

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (!entry.endsWith('.ts')) continue;
    if (entry.endsWith('.test.ts')) continue;
    files.push(fullPath);
  }

  return files;
}

export function listSourceFiles(segment: string): string[] {
  return walk(path.join(SRC_ROOT, segment)).sort();
}

export function toProjectPath(absolutePath: string): string {
  return absolutePath.replace(/\\/g, '/').split('/src/')[1] ?? absolutePath;
}

export function readModuleSource(absolutePath: string): string {
  return readFileSync(absolutePath, 'utf8');
}

export function extractSlashCommandName(source: string): string | null {
  const match = source.match(/\.setName\((['"])(?<name>[^'"]+)\1\)/);
  return match?.groups?.name ?? null;
}
