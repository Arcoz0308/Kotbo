<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { detectIdeLanguageFromCode, normalizeIdeLanguage, type IdeLanguage } from '../dailyAlgoIde';

  type ConsoleKind = 'info' | 'stdout' | 'stderr' | 'error' | 'result';
  type ConsoleEntry = { id: number; kind: ConsoleKind; text: string; time: string };

  type CodeMirrorEditor = {
    getValue: () => string;
    setValue: (value: string) => void;
    setOption: (name: string, value: unknown) => void;
    on: (event: string, listener: () => void) => void;
    toTextArea: () => void;
  };

  type JSCPPGlobal = {
    run: (code: string, input?: string, config?: { stdio?: { write?: (chunk: string) => void } }) => unknown;
  };

  type PyodideInstance = {
    runPythonAsync: (code: string) => Promise<unknown>;
    setStdout?: (cfg: { batched: (text: string) => void }) => void;
    setStderr?: (cfg: { batched: (text: string) => void }) => void;
  };

  type CodeMirrorGlobal = {
    fromTextArea: (
      textarea: HTMLTextAreaElement,
      options: {
        lineNumbers?: boolean;
        mode?: string;
        theme?: string;
        indentUnit?: number;
        tabSize?: number;
        lineWrapping?: boolean;
      },
    ) => CodeMirrorEditor;
  };

  declare global {
    interface Window {
      CodeMirror?: CodeMirrorGlobal;
      JSCPP?: JSCPPGlobal;
      loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideInstance>;
      __kotboPyodidePromise?: Promise<PyodideInstance>;
    }
  }

  const CODEMIRROR_CSS = [
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/material-darker.min.css',
  ];

  const CODEMIRROR_JS = [
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/clike/clike.min.js',
  ];

  const PYODIDE_SCRIPT = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js';
  const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
  const JSCPP_SCRIPT_CANDIDATES = [
    'https://cdn.jsdelivr.net/npm/jscpp@2.5.3/dist/JSCPP.es5.min.js',
    'https://cdn.jsdelivr.net/npm/jscpp@latest/dist/JSCPP.es5.min.js',
    'https://unpkg.com/jscpp@2.5.3/dist/JSCPP.es5.min.js',
    'https://unpkg.com/jscpp@latest/dist/JSCPP.es5.min.js',
  ];

  const assetPromises = new Map<string, Promise<void>>();

  function ensureStylesheet(url: string): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve();
    const cacheKey = `css:${url}`;
    const cached = assetPromises.get(cacheKey);
    if (cached) return cached;

    const existing = document.querySelector(`link[data-kotbo-asset="${url}"]`) as HTMLLinkElement | null;
    if (existing?.dataset.loaded === 'true') {
      const ready = Promise.resolve();
      assetPromises.set(cacheKey, ready);
      return ready;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const link = existing ?? document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.dataset.kotboAsset = url;
      link.onload = () => {
        link.dataset.loaded = 'true';
        resolve();
      };
      link.onerror = () => reject(new Error(`Impossible de charger ${url}`));
      if (!existing) document.head.appendChild(link);
    });

    assetPromises.set(cacheKey, promise);
    return promise;
  }

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

  async function ensureCodeMirror(): Promise<void> {
    for (const cssUrl of CODEMIRROR_CSS) {
      await ensureStylesheet(cssUrl);
    }
    for (const scriptUrl of CODEMIRROR_JS) {
      await ensureScript(scriptUrl);
    }
    if (!window.CodeMirror) {
      throw new Error('CodeMirror est indisponible.');
    }
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
    throw new Error(`Impossible de charger le runtime C.${details}`);
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

  function modeForLanguage(nextLanguage: IdeLanguage): string {
    if (nextLanguage === 'python') return 'python';
    if (nextLanguage === 'c') return 'text/x-csrc';
    return 'javascript';
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

  function heightValueToCss(heightInput: number | string): string {
    if (typeof heightInput === 'number') return `${heightInput}px`;
    const trimmed = heightInput.trim();
    if (/^\d+$/.test(trimmed)) return `${trimmed}px`;
    return trimmed;
  }

  let {
    initialCode = '',
    initialLanguage = 'javascript',
    height = 520,
    showPopoutButton = false,
    popoutLabel = 'Ouvrir dans une fenetre',
    fileLabel = 'solution',
  } = $props<{
    initialCode?: string;
    initialLanguage?: string;
    height?: number | string;
    showPopoutButton?: boolean;
    popoutLabel?: string;
    fileLabel?: string;
  }>();

  const dispatch = createEventDispatcher<{ popout: { code: string; language: IdeLanguage } }>();

  let code = $state('');
  let language = $state<IdeLanguage>('javascript');
  let stdin = $state('');
  let isRunning = $state(false);
  let bootError = $state('');
  let runtimeHint = $state('');
  let consoleLines = $state<ConsoleEntry[]>([]);

  let nextConsoleId = 0;
  let textareaRef: HTMLTextAreaElement | null = null;
  let consoleRef: HTMLDivElement | null = null;
  let editor: CodeMirrorEditor | null = null;
  let destroyed = false;

  async function appendConsole(kind: ConsoleKind, text: string) {
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const chunks = normalizedText.split('\n');
    const timestamp = nowLabel();

    for (const chunk of chunks) {
      const line = chunk.length > 0 ? chunk : ' ';
      consoleLines = [...consoleLines, { id: nextConsoleId++, kind, text: line, time: timestamp }].slice(-500);
    }

    await tick();
    if (consoleRef) {
      consoleRef.scrollTop = consoleRef.scrollHeight;
    }
  }

  function clearConsole() {
    consoleLines = [];
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
        appendConsole('error', 'Execution JavaScript interrompue (timeout 8s).');
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
          appendConsole('stdout', payload);
          return;
        }
        if (kind === 'stderr') {
          appendConsole('stderr', payload);
          return;
        }
        if (kind === 'result') {
          appendConsole('result', payload);
          return;
        }

        appendConsole('error', payload);
      };

      worker.onerror = (error) => {
        clearTimeout(timeout);
        appendConsole('error', error.message || 'Erreur JavaScript inconnue.');
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
        appendConsole('stdout', text);
      },
    });

    pyodide.setStderr?.({
      batched: (text: string) => {
        appendConsole('stderr', text);
      },
    });

    const result = await pyodide.runPythonAsync(source);
    if (typeof result !== 'undefined') {
      await appendConsole('result', stringifyChunk(result));
    }
  }

  async function runC(source: string, input: string): Promise<void> {
    const jscpp = await ensureJSCPP();
    let outputBuffer = '';

    const result = jscpp.run(source, input, {
      stdio: {
        write: (chunk: string) => {
          outputBuffer += chunk;
        },
      },
    });

    if (outputBuffer.trim().length > 0) {
      await appendConsole('stdout', outputBuffer.trimEnd());
    }

    if (typeof result !== 'undefined' && String(result).trim().length > 0) {
      await appendConsole('result', stringifyChunk(result));
    }
  }

  async function runCode() {
    const source = editor?.getValue() ?? code;
    code = source;

    if (!source.trim()) {
      await appendConsole('info', 'Aucun code a executer.');
      return;
    }

    isRunning = true;
    await appendConsole('info', `Execution ${language.toUpperCase()}...`);

    try {
      if (language === 'javascript') {
        await runJavaScript(source);
      } else if (language === 'python') {
        await runPython(source);
      } else {
        await runC(source, stdin);
      }

      await appendConsole('info', 'Execution terminee.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await appendConsole('error', message);
    } finally {
      isRunning = false;
    }
  }

  function onLanguageChange(nextLanguage: IdeLanguage) {
    language = nextLanguage;
    if (editor) {
      editor.setOption('mode', modeForLanguage(nextLanguage));
    }

    if (nextLanguage === 'c') {
      runtimeHint = 'C/C++ execute dans le navigateur via JSCPP (subset).';
    } else if (nextLanguage === 'python') {
      runtimeHint = 'Python execute dans le navigateur via Pyodide (WASM).';
    } else {
      runtimeHint = 'JavaScript execute dans un Web Worker isole.';
    }
  }

  function handlePopout() {
    dispatch('popout', {
      code: editor?.getValue() ?? code,
      language,
    });
  }

  function onFallbackInput(event: Event) {
    if (editor) return;
    code = (event.currentTarget as HTMLTextAreaElement).value;
  }

  onMount(async () => {
    code = initialCode;
    language = normalizedLanguage(initialLanguage, initialCode);
    onLanguageChange(language);

    try {
      await ensureCodeMirror();

      if (destroyed || !textareaRef || !window.CodeMirror) return;

      editor = window.CodeMirror.fromTextArea(textareaRef, {
        lineNumbers: true,
        mode: modeForLanguage(language),
        theme: 'material-darker',
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true,
      });

      editor.setValue(code);
      editor.on('change', () => {
        code = editor?.getValue() ?? '';
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      bootError = `Mode degrade (textarea): ${message}`;
    }
  });

  onDestroy(() => {
    destroyed = true;
    editor?.toTextArea();
    editor = null;
  });
</script>

<div class="daily-ide-shell rounded-xl border border-slate-700/70 bg-slate-900 text-slate-100 overflow-hidden">
  <div class="ide-toolbar">
    <div class="ide-file">{fileLabel}.{language === 'python' ? 'py' : language === 'c' ? 'c' : 'js'}</div>

    <div class="ide-controls">
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

      <button type="button" class="ide-btn ghost" onclick={clearConsole}>Clear</button>
      <button type="button" class="ide-btn run" onclick={runCode} disabled={isRunning}>
        {isRunning ? 'Execution...' : 'Run'}
      </button>

      {#if showPopoutButton}
        <button type="button" class="ide-btn ghost" onclick={handlePopout}>{popoutLabel}</button>
      {/if}
    </div>
  </div>

  {#if runtimeHint}
    <div class="ide-hint">{runtimeHint}</div>
  {/if}

  {#if bootError}
    <div class="ide-error">{bootError}</div>
  {/if}

  <div class="daily-ide-editor" style={`height: ${heightValueToCss(height)};`}>
    <textarea
      bind:this={textareaRef}
      class="fallback-editor"
      value={code}
      oninput={onFallbackInput}
      spellcheck="false"
    ></textarea>
  </div>

  {#if language === 'c'}
    <div class="stdin-zone">
      <label for="daily-ide-stdin" class="ide-label">STDIN (optionnel)</label>
      <textarea
        id="daily-ide-stdin"
        rows="2"
        bind:value={stdin}
        placeholder="Entree standard pour scanf / cin"
        class="stdin-input"
      ></textarea>
    </div>
  {/if}

  <div class="daily-ide-console">
    <div class="console-head">
      <p class="console-title">Console</p>
      <p class="console-count">{consoleLines.length} ligne(s)</p>
    </div>

    <div class="console-scroll" bind:this={consoleRef}>
      {#if consoleLines.length === 0}
        <p class="console-empty">Aucune sortie pour le moment.</p>
      {:else}
        {#each consoleLines as line}
          <p class={`console-line ${line.kind}`}><span class="time">[{line.time}]</span> {line.text}</p>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .daily-ide-shell :global(.CodeMirror) {
    height: 100%;
    font-size: 13px;
    line-height: 1.6;
    font-family: 'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .daily-ide-shell :global(.CodeMirror-gutters) {
    border-right: 1px solid rgba(100, 116, 139, 0.35);
    background: #0b1220;
  }

  .ide-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.7rem 0.8rem;
    border-bottom: 1px solid rgba(100, 116, 139, 0.45);
    background: linear-gradient(180deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95));
  }

  .ide-file {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #cbd5e1;
    border: 1px solid rgba(100, 116, 139, 0.6);
    border-radius: 0.55rem;
    padding: 0.28rem 0.55rem;
    background: rgba(15, 23, 42, 0.7);
  }

  .ide-controls {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .ide-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .ide-select {
    border: 1px solid rgba(100, 116, 139, 0.75);
    border-radius: 0.55rem;
    background: rgba(15, 23, 42, 0.85);
    color: #f8fafc;
    padding: 0.3rem 0.5rem;
    font-size: 11px;
    font-weight: 700;
  }

  .ide-btn {
    border-radius: 0.55rem;
    padding: 0.38rem 0.65rem;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    border: 1px solid transparent;
    cursor: pointer;
  }

  .ide-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .ide-btn.run {
    background: #059669;
    color: #ecfdf5;
    border-color: rgba(16, 185, 129, 0.7);
  }

  .ide-btn.ghost {
    background: rgba(15, 23, 42, 0.8);
    color: #cbd5e1;
    border-color: rgba(100, 116, 139, 0.75);
  }

  .ide-hint {
    border-bottom: 1px solid rgba(100, 116, 139, 0.3);
    color: #93c5fd;
    background: rgba(15, 23, 42, 0.78);
    font-size: 11px;
    font-weight: 700;
    padding: 0.45rem 0.8rem;
  }

  .ide-error {
    border-bottom: 1px solid rgba(220, 38, 38, 0.4);
    color: #fecaca;
    background: rgba(127, 29, 29, 0.45);
    font-size: 11px;
    font-weight: 700;
    padding: 0.45rem 0.8rem;
  }

  .daily-ide-editor {
    border-bottom: 1px solid rgba(100, 116, 139, 0.35);
  }

  .fallback-editor {
    width: 100%;
    height: 100%;
    border: none;
    resize: none;
    padding: 0.85rem;
    background: #0f172a;
    color: #e2e8f0;
    font-size: 13px;
    line-height: 1.6;
    font-family: 'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .fallback-editor:focus {
    outline: none;
  }

  .stdin-zone {
    border-bottom: 1px solid rgba(100, 116, 139, 0.35);
    background: rgba(2, 6, 23, 0.8);
    padding: 0.7rem 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .stdin-input {
    border: 1px solid rgba(100, 116, 139, 0.75);
    border-radius: 0.7rem;
    background: rgba(15, 23, 42, 0.9);
    color: #e2e8f0;
    padding: 0.5rem 0.7rem;
    font-size: 12px;
    line-height: 1.5;
    font-family: 'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .daily-ide-console {
    min-height: 210px;
    background: #020617;
    padding: 0.65rem 0.8rem 0.8rem;
  }

  .console-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }

  .console-title {
    margin: 0;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: #94a3b8;
  }

  .console-count {
    margin: 0;
    font-size: 10px;
    color: #64748b;
    font-weight: 700;
  }

  .console-scroll {
    max-height: 260px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
  }

  .console-empty {
    margin: 0;
    font-size: 11px;
    color: #64748b;
    font-family: 'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .console-line {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11px;
    line-height: 1.45;
    font-family: 'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .console-line .time {
    color: #64748b;
    margin-right: 0.35rem;
  }

  .console-line.info {
    color: #cbd5e1;
  }

  .console-line.stdout {
    color: #f8fafc;
  }

  .console-line.stderr {
    color: #fcd34d;
  }

  .console-line.error {
    color: #fca5a5;
  }

  .console-line.result {
    color: #6ee7b7;
  }
</style>
