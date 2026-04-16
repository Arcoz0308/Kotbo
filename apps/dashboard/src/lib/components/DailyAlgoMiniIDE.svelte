<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import * as monaco from 'monaco-editor';
  import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
  import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
  import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
  import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
  import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { detectIdeLanguageFromCode, normalizeIdeLanguage, type IdeLanguage } from '../dailyAlgoIde';

  type JSCPPGlobal = {
    run: (code: string, input?: string, config?: { stdio?: { write?: (chunk: string) => void } }) => unknown;
  };

  type PyodideInstance = {
    runPythonAsync: (code: string) => Promise<unknown>;
    setStdout?: (cfg: { batched: (text: string) => void }) => void;
    setStderr?: (cfg: { batched: (text: string) => void }) => void;
  };

  declare global {
    interface Window {
      JSCPP?: JSCPPGlobal;
      loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideInstance>;
      __kotboPyodidePromise?: Promise<PyodideInstance>;
      MonacoEnvironment?: {
        getWorker?: (_moduleId: string, label: string) => Worker;
      };
    }
  }

  if (typeof window !== 'undefined' && !window.MonacoEnvironment?.getWorker) {
    window.MonacoEnvironment = {
      getWorker(_moduleId: string, label: string) {
        if (label === 'json') return new jsonWorker();
        if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
        if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
        if (label === 'typescript' || label === 'javascript') return new tsWorker();
        return new editorWorker();
      },
    };
  }

  const PYODIDE_SCRIPT = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js';
  const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
  const JSCPP_SCRIPT_CANDIDATES = [
    `${import.meta.env.BASE_URL}vendor/JSCPP.es5.min.js`,
    'https://raw.githubusercontent.com/felixhao28/JSCPP/gh-pages/dist/JSCPP.es5.min.js',
  ];

  const assetPromises = new Map<string, Promise<void>>();

  function ensureScript(url: string): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve();
    const cacheKey = `js:${url}`;
    const cached = assetPromises.get(cacheKey);
    if (cached) return cached;

    const existing = document.querySelector(`script[data-kotbo-asset="${url}"]`) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === 'true') {
      const ready = Promise.resolve();
      assetPromises.set(cacheKey, ready);
      return ready;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const script = existing ?? document.createElement('script');
      script.src = url;
      script.async = true;
      script.dataset.kotboAsset = url;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error(`Impossible de charger ${url}`));
      if (!existing) document.head.appendChild(script);
    });

    assetPromises.set(cacheKey, promise);
    return promise;
  }

  async function ensureJSCPP(): Promise<JSCPPGlobal> {
    if (window.JSCPP?.run) return window.JSCPP;

    const loadErrors: string[] = [];

    for (const url of JSCPP_SCRIPT_CANDIDATES) {
      try {
        await ensureScript(url);
        if (window.JSCPP?.run) return window.JSCPP;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        loadErrors.push(`${url} (${message})`);
      }
    }

    const details = loadErrors.length > 0 ? ` Sources testees: ${loadErrors.join(' | ')}` : '';
    throw new Error(`Impossible de charger le runtime C (JSCPP).${details}`);
  }

  async function ensurePyodide(): Promise<PyodideInstance> {
    if (!window.__kotboPyodidePromise) {
      window.__kotboPyodidePromise = (async () => {
        if (!window.loadPyodide) {
          await ensureScript(PYODIDE_SCRIPT);
        }
        if (!window.loadPyodide) {
          throw new Error('Pyodide indisponible.');
        }
        return window.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
      })();
    }

    return window.__kotboPyodidePromise;
  }

  function nowLabel(): string {
    return new Date().toLocaleTimeString('fr-FR', { hour12: false });
  }

  function stringifyChunk(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
      return String(value);
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function normalizedLanguage(languageInput: string | undefined, sourceCode: string): IdeLanguage {
    const normalized = normalizeIdeLanguage(languageInput);
    if (languageInput && languageInput.trim()) return normalized;
    return detectIdeLanguageFromCode(sourceCode);
  }

  function monacoLanguage(languageInput: IdeLanguage): string {
    if (languageInput === 'python') return 'python';
    if (languageInput === 'c') return 'cpp';
    return 'javascript';
  }

  function extensionForLanguage(languageInput: IdeLanguage): string {
    if (languageInput === 'python') return 'py';
    if (languageInput === 'c') return 'c';
    return 'js';
  }

  function hasCMainFunction(source: string): boolean {
    return /\bmain\s*\(/.test(source);
  }

  function stripCommonIndentation(source: string): string {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const nonEmpty = lines.filter((line) => line.trim().length > 0);
    if (nonEmpty.length === 0) return source;

    const minIndent = nonEmpty.reduce((min, line) => {
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      return Math.min(min, indent);
    }, Number.POSITIVE_INFINITY);

    return lines.map((line) => line.slice(Math.min(minIndent, line.length))).join('\n');
  }

  function wrapCSnippetWithMain(source: string): string {
    const snippet = stripCommonIndentation(source.trim());
    const body = snippet
      .split('\n')
      .map((line) => (line.trim().length > 0 ? `  ${line}` : ''))
      .join('\n');

    return [
      '#include <iostream>',
      '#include <stdio.h>',
      '#include <stdlib.h>',
      '#include <string.h>',
      'using namespace std;',
      '',
      'int main() {',
      body,
      '  return 0;',
      '}',
      '',
    ].join('\n');
  }

  function heightValueToCss(heightInput: number | string): string {
    if (typeof heightInput === 'number') return `${heightInput}px`;
    const trimmed = heightInput.trim();
    if (/^\d+$/.test(trimmed)) return `${trimmed}px`;
    return trimmed;
  }

  let {
    initialCode = '',
    initialLanguage = 'javascript',
    height = 560,
    showPopoutButton = false,
    popoutLabel = 'Ouvrir dans une fenetre',
    fileLabel = 'solution',
    languagePersistenceKey = '',
  } = $props<{
    initialCode?: string;
    initialLanguage?: string;
    height?: number | string;
    showPopoutButton?: boolean;
    popoutLabel?: string;
    fileLabel?: string;
    languagePersistenceKey?: string;
  }>();

  const dispatch = createEventDispatcher<{ popout: { code: string; language: IdeLanguage } }>();

  let code = $state('');
  let language = $state<IdeLanguage>('javascript');
  let stdin = $state('');
  let isRunning = $state(false);
  let bootError = $state('');
  let runtimeHint = $state('');
  let terminalLineCount = $state(0);

  let cursorLine = $state(1);
  let cursorColumn = $state(1);
  let lineCount = $state(1);

  let editorContainer: HTMLDivElement | null = null;
  let terminalContainer: HTMLDivElement | null = null;

  let editor: monaco.editor.IStandaloneCodeEditor | null = null;
  let terminal: Terminal | null = null;
  let fitAddon: FitAddon | null = null;
  let editorDisposables: monaco.IDisposable[] = [];
  let terminalResizeObserver: ResizeObserver | null = null;
  let removeWindowResizeListener: (() => void) | null = null;

  function storageLanguageKey(): string | null {
    if (!languagePersistenceKey || !languagePersistenceKey.trim()) return null;
    return `kotbo:daily-ide:language:${languagePersistenceKey.trim()}`;
  }

  function readPersistedLanguage(fallback: IdeLanguage): IdeLanguage {
    if (typeof window === 'undefined') return fallback;
    const key = storageLanguageKey();
    if (!key) return fallback;
    const saved = window.localStorage.getItem(key);
    if (!saved) return fallback;
    return normalizeIdeLanguage(saved);
  }

  function persistLanguage(nextLanguage: IdeLanguage) {
    if (typeof window === 'undefined') return;
    const key = storageLanguageKey();
    if (!key) return;
    window.localStorage.setItem(key, nextLanguage);
  }

  function writeTerminal(kind: 'info' | 'stdout' | 'stderr' | 'error' | 'result', text: string) {
    if (!terminal) return;
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const tag =
      kind === 'stderr' ? 'WARN' :
      kind === 'error' ? 'ERROR' :
      kind === 'result' ? 'RESULT' :
      kind === 'stdout' ? 'OUT' :
      'INFO';

    for (const line of lines) {
      const printed = line.length > 0 ? line : ' ';
      terminal.writeln(`[${nowLabel()}] ${tag}: ${printed}`);
      terminalLineCount += 1;
    }
  }

  function resetTerminal() {
    if (!terminal) return;
    terminal.clear();
    terminalLineCount = 0;
    writeTerminal('info', 'Kotbo IDE ready.');
    writeTerminal('info', 'Execution client-side: JS Worker, Python Pyodide, C JSCPP.');
  }

  function clearTerminal() {
    resetTerminal();
  }

  function updateRuntimeHint(nextLanguage: IdeLanguage) {
    if (nextLanguage === 'c') {
      runtimeHint = 'C/C++ execute dans le navigateur via JSCPP local (aucun serveur de compilation).';
      return;
    }
    if (nextLanguage === 'python') {
      runtimeHint = 'Python execute dans le navigateur via Pyodide (WASM).';
      return;
    }
    runtimeHint = 'JavaScript execute dans un Web Worker isole.';
  }

  function updateModelLanguage(nextLanguage: IdeLanguage) {
    const model = editor?.getModel();
    if (!model) return;
    monaco.editor.setModelLanguage(model, monacoLanguage(nextLanguage));
  }

  function updateEditorStats() {
    const model = editor?.getModel();
    lineCount = model?.getLineCount() ?? 1;
    const pos = editor?.getPosition();
    cursorLine = pos?.lineNumber ?? 1;
    cursorColumn = pos?.column ?? 1;
  }

  function onLanguageChange(nextLanguage: IdeLanguage, persist = true) {
    language = nextLanguage;
    updateRuntimeHint(nextLanguage);
    updateModelLanguage(nextLanguage);

    if (persist) persistLanguage(nextLanguage);
  }

  async function runJavaScript(source: string): Promise<void> {
    const workerSource = `
      const asText = (value) => {
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
        try { return JSON.stringify(value, null, 2); } catch { return String(value); }
      };

      const send = (kind, payload) => postMessage({ kind, payload });

      self.onmessage = async (event) => {
        const code = String(event?.data?.code ?? '');
        try {
          const scopedConsole = {
            log: (...args) => send('stdout', args.map(asText).join(' ')),
            info: (...args) => send('stdout', args.map(asText).join(' ')),
            warn: (...args) => send('stderr', args.map(asText).join(' ')),
            error: (...args) => send('error', args.map(asText).join(' ')),
          };

          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
          const fn = new AsyncFunction('console', code);
          const result = await fn(scopedConsole);

          if (typeof result !== 'undefined') {
            send('result', asText(result));
          }

          send('done', 'ok');
        } catch (error) {
          const message = error && error.stack ? error.stack : String(error);
          send('error', message);
          send('done', 'error');
        }
      };
    `;

    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const objectUrl = URL.createObjectURL(blob);
    const worker = new Worker(objectUrl);

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        writeTerminal('error', 'Execution JavaScript interrompue (timeout 8s).');
        worker.terminate();
        resolve();
      }, 8000);

      worker.onmessage = (event: MessageEvent<{ kind: string; payload: string }>) => {
        const { kind, payload } = event.data;

        if (kind === 'done') {
          clearTimeout(timeout);
          worker.terminate();
          resolve();
          return;
        }

        if (kind === 'stdout') {
          writeTerminal('stdout', payload);
          return;
        }
        if (kind === 'stderr') {
          writeTerminal('stderr', payload);
          return;
        }
        if (kind === 'result') {
          writeTerminal('result', payload);
          return;
        }

        writeTerminal('error', payload);
      };

      worker.onerror = (error) => {
        clearTimeout(timeout);
        writeTerminal('error', error.message || 'Erreur JavaScript inconnue.');
        worker.terminate();
        resolve();
      };

      worker.postMessage({ code: source });
    });

    URL.revokeObjectURL(objectUrl);
  }

  async function runPython(source: string): Promise<void> {
    const pyodide = await ensurePyodide();

    pyodide.setStdout?.({
      batched: (text: string) => {
        writeTerminal('stdout', text);
      },
    });

    pyodide.setStderr?.({
      batched: (text: string) => {
        writeTerminal('stderr', text);
      },
    });

    const result = await pyodide.runPythonAsync(source);
    if (typeof result !== 'undefined') {
      writeTerminal('result', stringifyChunk(result));
    }
  }

  async function runC(source: string, input: string): Promise<void> {
    const jscpp = await ensureJSCPP();
    let outputBuffer = '';

    const execute = (program: string) => {
      outputBuffer = '';
      const result = jscpp.run(program, input, {
        stdio: {
          write: (chunk: string) => {
            outputBuffer += chunk;
          },
        },
      });

      if (outputBuffer.trim().length > 0) {
        writeTerminal('stdout', outputBuffer.trimEnd());
      }

      if (typeof result !== 'undefined' && String(result).trim().length > 0) {
        writeTerminal('result', stringifyChunk(result));
      }
    };

    try {
      execute(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const mainMissing = /method main is not defined in \$global/i.test(message);

      if (!mainMissing || hasCMainFunction(source)) {
        throw error;
      }

      writeTerminal('info', 'Aucune fonction main detectee: tentative automatique avec un wrapper int main().');

      try {
        execute(wrapCSnippetWithMain(source));
      } catch {
        throw error;
      }
    }
  }

  async function runCode() {
    const executionLanguage = language;
    const source = editor?.getValue() ?? code;
    code = source;

    if (!source.trim()) {
      writeTerminal('info', 'Aucun code a executer.');
      return;
    }

    isRunning = true;
    writeTerminal('info', `Execution ${executionLanguage.toUpperCase()}...`);

    try {
      if (executionLanguage === 'javascript') {
        await runJavaScript(source);
      } else if (executionLanguage === 'python') {
        await runPython(source);
      } else {
        await runC(source, stdin);
      }

      writeTerminal('info', 'Execution terminee.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeTerminal('error', message);
    } finally {
      isRunning = false;
    }
  }

  function handlePopout() {
    dispatch('popout', {
      code: editor?.getValue() ?? code,
      language,
    });
  }

  function fitTerminal() {
    fitAddon?.fit();
  }

  onMount(() => {
    try {
      monaco.editor.defineTheme('kotbo-vscode', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A9955' },
          { token: 'keyword', foreground: 'C586C0' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'type.identifier', foreground: '4EC9B0' },
        ],
        colors: {
          'editor.background': '#1e1e1e',
          'editorGutter.background': '#1e1e1e',
          'editorLineNumber.foreground': '#858585',
          'editorLineNumber.activeForeground': '#c6c6c6',
          'editorCursor.foreground': '#d4d4d4',
          'editor.selectionBackground': '#264f78',
          'editor.inactiveSelectionBackground': '#3a3d41',
          'editor.lineHighlightBackground': '#2a2d2e',
        },
      });

      code = initialCode;
      language = readPersistedLanguage(normalizedLanguage(initialLanguage, initialCode));
      updateRuntimeHint(language);

      if (editorContainer) {
        editor = monaco.editor.create(editorContainer, {
          value: code,
          language: monacoLanguage(language),
          theme: 'kotbo-vscode',
          automaticLayout: true,
          minimap: { enabled: true, renderCharacters: false, maxColumn: 100 },
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
          fontLigatures: true,
          fontSize: 13,
          lineHeight: 20,
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
          roundedSelection: false,
          tabSize: 2,
          insertSpaces: true,
          guides: {
            indentation: true,
            bracketPairs: true,
          },
        });

        editorDisposables.push(
          editor.onDidChangeModelContent(() => {
            code = editor?.getValue() ?? '';
            updateEditorStats();
          }),
          editor.onDidChangeCursorPosition(() => {
            updateEditorStats();
          }),
        );

        updateEditorStats();
      }

      if (terminalContainer) {
        terminal = new Terminal({
          convertEol: true,
          cursorBlink: true,
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
          theme: {
            background: '#181818',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            selectionBackground: '#264f78',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#ffffff',
          },
          scrollback: 3000,
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(terminalContainer);

        fitTerminal();

        const onWindowResize = () => fitTerminal();
        window.addEventListener('resize', onWindowResize);
        removeWindowResizeListener = () => window.removeEventListener('resize', onWindowResize);

        if (typeof ResizeObserver !== 'undefined') {
          terminalResizeObserver = new ResizeObserver(() => fitTerminal());
          terminalResizeObserver.observe(terminalContainer);
        }

        resetTerminal();
      }

      onLanguageChange(language, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bootError = `Impossible d'initialiser Monaco/xterm: ${message}`;
    }
  });

  onDestroy(() => {
    for (const disposable of editorDisposables) {
      disposable.dispose();
    }
    editorDisposables = [];

    removeWindowResizeListener?.();
    removeWindowResizeListener = null;

    terminalResizeObserver?.disconnect();
    terminalResizeObserver = null;

    editor?.dispose();
    terminal?.dispose();
    fitAddon?.dispose();

    editor = null;
    terminal = null;
    fitAddon = null;
  });
</script>

<div class="ide-root" style={`height: ${heightValueToCss(height)};`}>
  <div class="ide-titlebar">
    <div class="titlebar-left">
      <p class="titlebar-path">daily-algo / {fileLabel}.{extensionForLanguage(language)}</p>
    </div>

    <div class="titlebar-actions">
      <label for="daily-ide-language" class="ide-label">Langage</label>
      <select
        id="daily-ide-language"
        class="ide-select"
        bind:value={language}
        onchange={(event) => onLanguageChange((event.currentTarget as HTMLSelectElement).value as IdeLanguage)}
      >
        <option value="javascript">JavaScript</option>
        <option value="python">Python</option>
        <option value="c">C / C++</option>
      </select>

      <button type="button" class="ide-btn ghost" onclick={clearTerminal}>Clear</button>
      <button type="button" class="ide-btn run" onclick={runCode} disabled={isRunning}>
        {isRunning ? 'Execution...' : 'Run'}
      </button>

      {#if showPopoutButton}
        <button type="button" class="ide-btn ghost" onclick={handlePopout}>{popoutLabel}</button>
      {/if}
    </div>
  </div>

  {#if bootError}
    <div class="ide-banner error">{bootError}</div>
  {:else if runtimeHint}
    <div class="ide-banner hint">{runtimeHint}</div>
  {/if}

  <div class="ide-shell">
    <aside class="sidebar">
      <div class="sidebar-head">Explorer</div>
      <div class="tree-root">
        <p class="tree-folder">DAILY-ALGO</p>
        <p class="tree-file active">{fileLabel}.{extensionForLanguage(language)}</p>
        <p class="tree-meta">Langage: {language.toUpperCase()}</p>
        <p class="tree-meta">Lignes: {lineCount}</p>
        <p class="tree-meta">Runtime: {language === 'javascript' ? 'JS Worker' : language === 'python' ? 'Pyodide' : 'JSCPP'}</p>
        <p class="tree-meta">Terminal: {terminalLineCount} lignes</p>
      </div>

      {#if language === 'c'}
        <div class="stdin-zone">
          <label for="daily-ide-stdin" class="ide-label">STDIN (optionnel)</label>
          <textarea
            id="daily-ide-stdin"
            rows="4"
            bind:value={stdin}
            placeholder="Entree standard pour scanf / cin"
            class="stdin-input"
          ></textarea>
        </div>
      {/if}
    </aside>

    <section class="workbench">
      <div class="editor-tabs">
        <div class="editor-tab active">{fileLabel}.{extensionForLanguage(language)}</div>
      </div>

      <div class="editor-stage">
        <div bind:this={editorContainer} class="monaco-host"></div>
      </div>

      <div class="panel-stage">
        <div class="panel-head">
          <div class="panel-tabs">
            <span class="panel-tab active">Terminal</span>
          </div>
          <button type="button" class="panel-clear" onclick={clearTerminal}>Clear</button>
        </div>
        <div bind:this={terminalContainer} class="terminal-host"></div>
      </div>

      <footer class="statusbar">
        <span>{language.toUpperCase()}</span>
        <span>Ln {cursorLine}, Col {cursorColumn}</span>
        <span>{lineCount} lignes</span>
      </footer>
    </section>
  </div>
</div>

<style>
  .ide-root {
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--outline-variant, #343434) 80%, #000 20%);
    border-radius: 0.9rem;
    overflow: hidden;
    background: #1e1e1e;
    color: #d4d4d4;
    min-height: 420px;
  }

  .ide-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.5rem 0.65rem;
    border-bottom: 1px solid #2d2d30;
    background: #3c3c3c;
  }

  .titlebar-left {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .titlebar-path {
    margin: 0;
    font-size: 11px;
    color: #d4d4d4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: min(40vw, 360px);
    font-weight: 700;
  }

  .titlebar-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .ide-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
  }

  .ide-select {
    border: 1px solid #4f4f52;
    border-radius: 0.4rem;
    background: #1f1f1f;
    color: #d4d4d4;
    padding: 0.32rem 0.46rem;
    font-size: 11px;
    font-weight: 700;
  }

  .ide-btn {
    border-radius: 0.4rem;
    padding: 0.35rem 0.6rem;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.11em;
    border: 1px solid transparent;
    cursor: pointer;
  }

  .ide-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .ide-btn.run {
    background: #0e639c;
    color: #ffffff;
    border-color: #1177bb;
  }

  .ide-btn.ghost {
    background: #2d2d2d;
    color: #d4d4d4;
    border-color: #454545;
  }

  .ide-banner {
    padding: 0.35rem 0.65rem;
    border-bottom: 1px solid #2d2d30;
    font-size: 11px;
    font-weight: 700;
  }

  .ide-banner.hint {
    background: #202737;
    color: #9cdcfe;
  }

  .ide-banner.error {
    background: rgba(127, 29, 29, 0.45);
    color: #fecdd3;
  }

  .ide-shell {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
    background: #1e1e1e;
  }

  .sidebar {
    border-right: 1px solid #2d2d30;
    background: #252526;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
  }

  .sidebar-head {
    border-bottom: 1px solid #2d2d30;
    padding: 0.55rem 0.65rem;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #9ca3af;
  }

  .tree-root {
    padding: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.38rem;
  }

  .tree-folder,
  .tree-file,
  .tree-meta {
    margin: 0;
    font-size: 11px;
  }

  .tree-folder {
    color: #c8c8c8;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .tree-file {
    color: #d4d4d4;
    font-weight: 700;
    padding: 0.3rem 0.45rem;
    border-radius: 0.45rem;
    border: 1px solid #3a3a3f;
    background: #1e1e1e;
  }

  .tree-file.active {
    border-color: #0e639c;
    background: color-mix(in srgb, #0e639c 18%, transparent);
  }

  .tree-meta {
    color: #9ca3af;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
  }

  .stdin-zone {
    padding: 0.7rem;
    border-top: 1px solid #2d2d30;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .stdin-input {
    border: 1px solid #454545;
    border-radius: 0.55rem;
    background: #1f1f1f;
    color: #d4d4d4;
    padding: 0.5rem 0.65rem;
    font-size: 12px;
    line-height: 1.5;
    font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
    resize: vertical;
  }

  .workbench {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) minmax(170px, 30%) auto;
    background: #1e1e1e;
  }

  .editor-tabs {
    border-bottom: 1px solid #2d2d30;
    background: #2d2d2d;
    padding: 0.28rem 0.35rem 0;
    display: flex;
    align-items: flex-end;
    gap: 0.3rem;
  }

  .editor-tab {
    border: 1px solid #3d3d40;
    border-bottom-color: #2d2d30;
    border-radius: 0.5rem 0.5rem 0 0;
    background: #252526;
    color: #b4b4b4;
    padding: 0.32rem 0.6rem;
    font-size: 11px;
    font-weight: 700;
  }

  .editor-tab.active {
    background: #1e1e1e;
    color: #ffffff;
    border-bottom-color: #1e1e1e;
  }

  .editor-stage {
    min-height: 0;
    border-bottom: 1px solid #2d2d30;
  }

  .monaco-host {
    width: 100%;
    height: 100%;
  }

  .panel-stage {
    min-height: 0;
    background: #181818;
    display: flex;
    flex-direction: column;
  }

  .panel-head {
    border-bottom: 1px solid #2d2d30;
    background: #252526;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
    padding: 0.33rem 0.48rem;
  }

  .panel-tabs {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .panel-tab {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: #9ca3af;
    padding: 0.24rem 0.42rem;
    border-radius: 0.35rem;
  }

  .panel-tab.active {
    background: #1e1e1e;
    color: #ffffff;
  }

  .panel-clear {
    border: 1px solid #454545;
    background: #2d2d2d;
    color: #d4d4d4;
    border-radius: 0.35rem;
    padding: 0.2rem 0.4rem;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    font-weight: 800;
  }

  .terminal-host {
    flex: 1;
    min-height: 0;
    padding: 0.28rem;
  }

  .terminal-host :global(.xterm-viewport) {
    scrollbar-width: thin;
  }

  .statusbar {
    border-top: 1px solid #1177bb;
    background: #0e639c;
    color: #ffffff;
    padding: 0.22rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.6rem;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  @media (max-width: 1100px) {
    .ide-shell {
      grid-template-columns: minmax(160px, 210px) minmax(0, 1fr);
    }
  }

  @media (max-width: 920px) {
    .ide-root {
      min-height: 380px;
    }

    .ide-titlebar {
      padding: 0.45rem 0.5rem;
    }

    .titlebar-path {
      max-width: 38vw;
      font-size: 10px;
    }

    .ide-shell {
      grid-template-columns: 1fr;
      grid-template-rows: auto;
      position: relative;
    }

    .sidebar {
      border-right: none;
      border-bottom: 1px solid #2d2d30;
      max-height: 34vh;
    }

    .workbench {
      grid-template-rows: auto minmax(260px, 1fr) minmax(140px, 34%) auto;
    }

    .statusbar {
      justify-content: space-between;
      gap: 0.35rem;
      padding: 0.24rem 0.35rem;
      font-size: 9px;
    }
  }
</style>
