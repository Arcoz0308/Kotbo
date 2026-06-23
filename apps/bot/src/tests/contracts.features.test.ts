import { describe, expect, test } from 'bun:test';
import {
  extractSlashCommandName,
  listSourceFiles,
  readModuleSource,
  toProjectPath,
} from './helpers/moduleContracts';

describe('Contrats des features', () => {
  test('Toutes les commandes exposent data + execute et ont un nom unique', () => {
    const commandFiles = listSourceFiles('commands');
    expect(commandFiles.length).toBeGreaterThan(0);

    const names = new Set<string>();

    for (const file of commandFiles) {
      const source = readModuleSource(file);
      const relativePath = toProjectPath(file);

      expect(source).toMatch(/export\s+const\s+data\s*=/);
      expect(source).toMatch(/export\s+(async\s+)?function\s+execute\s*\(/);

      const commandName = extractSlashCommandName(source);
      expect(commandName).not.toBeNull();

      if (!commandName) continue;
      expect(names.has(commandName), `Commande dupliquée \"${commandName}\" dans ${relativePath}`).toBeFalse();
      names.add(commandName);
    }
  });

  test('Handlers, events, panels, services et utils exportent des symboles', () => {
    const folders = ['handlers', 'events', 'panels', 'services', 'utils'];

    for (const folder of folders) {
      const files = listSourceFiles(folder);
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const source = readModuleSource(file);
        const relativePath = toProjectPath(file);
        expect(source, `Aucun export trouvé dans ${relativePath}`).toMatch(/export\s+(const|function|async\s+function|interface|type|class)/);
      }
    }
  });

  test("Le point d\'entrée du bot charge toutes les commandes déclarées", () => {
    const entryPath = listSourceFiles('.').find((file) => file.replace(/\\/g, '/').endsWith('/index.ts'));
    expect(entryPath).toBeDefined();
    if (!entryPath) return;

    const entrySource = readModuleSource(entryPath);
    const commandFiles = listSourceFiles('commands');

    for (const file of commandFiles) {
      const baseName = file.replace(/\\/g, '/').split('/').pop()?.replace('.ts', '');
      if (!baseName) continue;

      if (baseName === 'news-rattrapage') {
        expect(entrySource).toContain('newsRecoveryCmd');
        continue;
      }

      const symbol = `${baseName}Cmd`;
      expect(entrySource).toContain(symbol);
    }
  });
});
