import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { logger } from '../../utils/logger';

// Mock console methods
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

let logOutput: string[] = [];
let warnOutput: string[] = [];
let errorOutput: string[] = [];

describe('logger', () => {
  beforeEach(() => {
    logOutput = [];
    warnOutput = [];
    errorOutput = [];

    console.log = (...args: unknown[]) => {
      logOutput.push(args.join(' '));
    };
    console.warn = (...args: unknown[]) => {
      warnOutput.push(args.join(' '));
    };
    console.error = (...args: unknown[]) => {
      errorOutput.push(args.join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;

    delete process.env.LOG_LEVEL;
  });

  test('affiche des logs d\'information', () => {
    logger.info('TestTag', 'message info');
    expect(logOutput.length).toBeGreaterThan(0);
    expect(logOutput[0]).toContain('TestTag');
    expect(logOutput[0]).toContain('message info');
    expect(logOutput[0]).toContain('INFO');
  });

  test('affiche des messages de succes', () => {
    logger.success('TestTag', 'operation complete');
    expect(logOutput.length).toBeGreaterThan(0);
    expect(logOutput[0]).toContain('OK');
    expect(logOutput[0]).toContain('TestTag');
  });

  test('affiche des avertissements', () => {
    logger.warn('TestTag', 'attention requise');
    expect(warnOutput.length).toBeGreaterThan(0);
    expect(warnOutput[0]).toContain('WARN');
    expect(warnOutput[0]).toContain('TestTag');
  });

  test('affiche des erreurs', () => {
    logger.error('TestTag', 'erreur critique');
    expect(errorOutput.length).toBeGreaterThan(0);
    expect(errorOutput[0]).toContain('ERROR');
    expect(errorOutput[0]).toContain('TestTag');
  });

  test('affiche debug quand LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'debug';
    logger.debug('TestTag', 'message debug');
    expect(logOutput.length).toBeGreaterThan(0);
    expect(logOutput[0]).toContain('DEBUG');
  });

  test('n\'affiche pas debug quand LOG_LEVEL n\'est pas debug', () => {
    process.env.LOG_LEVEL = 'info';
    logger.debug('TestTag', 'message debug');
    expect(logOutput.length).toBe(0);
  });

  test('n\'affiche pas debug sans LOG_LEVEL', () => {
    logger.debug('TestTag', 'message debug');
    expect(logOutput.length).toBe(0);
  });

  test('formate les logs avec timestamp, couleurs et tag', () => {
    logger.info('Bot', 'Démarrage');
    expect(logOutput[0]).toContain('[');
    expect(logOutput[0]).toContain('Bot');
    expect(logOutput[0]).toContain('Démarrage');
  });

  test('supporte plusieurs arguments', () => {
    logger.info('Tag', 'arg1', 'arg2', 'arg3');
    expect(logOutput[0]).toContain('arg1');
    expect(logOutput[0]).toContain('arg2');
    expect(logOutput[0]).toContain('arg3');
  });
});
