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

      expect(source).toMatch(/(?:export\s+)?const\s+\w*[Dd]ata\s*=/);
      expect(source).toMatch(/(?:export\s+)?(?:async\s+)?function\s+\w*[Ee]xecute\w*\s*\(/);

      const commandName = extractSlashCommandName(source);
      expect(commandName).not.toBeNull();

      if (!commandName) continue;
      expect(names.has(commandName), `Commande dupliquée "${commandName}" dans ${relativePath}`).toBeFalse();
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

  test("Le registre des commandes importe toutes les commandes déclarées", () => {
    const registryPath = listSourceFiles('.').find((file) => file.replace(/\\/g, '/').endsWith('/commands.ts'));
    expect(registryPath).toBeDefined();
    if (!registryPath) return;

    const registrySource = readModuleSource(registryPath);
    const commandFiles = listSourceFiles('commands');

    const unregistered = new Set(['backup']);

    for (const file of commandFiles) {
      const normalized = file.replace(/\\/g, '/');
      const match = normalized.match(/commands\/([^/]+)\/([^/]+)\.ts$/);
      if (!match) continue;
      const [, category, baseName] = match;
      if (unregistered.has(baseName)) continue;

      const importPath = `./commands/${category}/${baseName}.js`;
      expect(registrySource, `Commande ${baseName} non importée dans le registre`).toContain(importPath);
    }
  });
});
