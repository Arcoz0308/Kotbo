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
      }
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
    'https://cdn.jsdelivr.net/gh/felixhao28/JSCPP/dist/JSCPP.es5.min.js',
    'https://unpkg.com/jscpp@2.5.3/dist/JSCPP.es5.min.js',
  ];

  const assetPromises = new Map<string, Promise<void>>();

  function ensureStylesheet(url: string): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve();
    const cacheKey = `css:${url}`;
    const cached = assetPromises.get(cacheKey);
    if (cached) return cached;

    const existing = document.querySelector(`link[data-kotbo-asset="${url}"]`) as HTMLLinkElement | null;
    if (existing) {
      const alreadyLoaded = existing.dataset.loaded === 'true';
      if (alreadyLoaded) {
        const ready = Promise.resolve();
        assetPromises.set(cacheKey, ready);
        return ready;
      }
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
    if (existing) {
      const alreadyLoaded = existing.dataset.loaded === 'true';
      if (alreadyLoaded) {
        const ready = Promise.resolve();
        assetPromises.set(cacheKey, ready);
        return ready;
      }
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

    let lastError: Error | null = null;
    for (const url of JSCPP_SCRIPT_CANDIDATES) {
      try {
        await ensureScript(url);
        if (window.JSCPP?.run) return window.JSCPP;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error('Impossible de charger le runtime C.');
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

  function modeForLanguage(language: IdeLanguage): string {
    if (language === 'python') return 'python';
    if (language === 'c') return 'text/x-csrc';
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

  function normalizeInitialLanguage(candidate: string | undefined, sourceCode: string): IdeLanguage {
    const normalized = normalizeIdeLanguage(candidate);
    if (candidate && candidate.trim()) return normalized;
    return detectIdeLanguageFromCode(sourceCode);
  }

  let {
    initialCode = '',
    initialLanguage = 'javascript',
    height = 320,
    showPopoutButton = false,
    popoutLabel = 'Ouvrir dans une fenêtre',
  } = $props<{
    initialCode?: string;
    initialLanguage?: string;
    height?: number;
    showPopoutButton?: boolean;
    popoutLabel?: string;
  }>();

  const dispatch = createEventDispatcher<{ popout: { code: string; language: IdeLanguage } }>();

  let code = $state(initialCode);
  let language = $state<IdeLanguage>(normalizeInitialLanguage(initialLanguage, initialCode));
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
      consoleLines = [...consoleLines, { id: nextConsoleId++, kind, text: line, time: timestamp }].slice(-300);
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
    let aggregated = '';

    const result = jscpp.run(source, input, {
      stdio: {
        write: (chunk: string) => {
          aggregated += chunk;
        },
      },
    });

    if (aggregated.trim().length > 0) {
      await appendConsole('stdout', aggregated.trimEnd());
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
      runtimeHint = 'Runtime C base sur JSCPP (subset C/C++ orienté algorithmique).';
    } else if (nextLanguage === 'python') {
      runtimeHint = 'Python execute via Pyodide (WebAssembly, navigateur).';
    } else {
      runtimeHint = 'JavaScript execute en Web Worker isole.';
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

    onLanguageChange(language);
  });

  onDestroy(() => {
    destroyed = true;
    editor?.toTextArea();
    editor = null;
  });
</script>

<div class="daily-ide-wrapper rounded-xl border border-outline-variant/25 bg-surface-container-low p-3 space-y-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <label for="daily-ide-language" class="text-[10px] font-black uppercase tracking-[0.16em] text-on-surface-variant/70">Langage</label>
      <select
        id="daily-ide-language"
        class="rounded-lg border border-outline-variant/30 bg-surface px-2 py-1 text-xs font-bold text-on-surface"
        bind:value={language}
        onchange={(event) => onLanguageChange((event.currentTarget as HTMLSelectElement).value as IdeLanguage)}
      >
        <option value="javascript">JavaScript</option>
        <option value="python">Python</option>
        <option value="c">C / C++</option>
      </select>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg border border-outline-variant/30 bg-surface text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant"
        onclick={clearConsole}
      >
        Console clear
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] font-black uppercase tracking-[0.12em] disabled:opacity-60"
        onclick={runCode}
        disabled={isRunning}
      >
        {isRunning ? 'Execution...' : 'Run'}
      </button>
      {#if showPopoutButton}
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.12em]"
          onclick={handlePopout}
        >
          {popoutLabel}
        </button>
      {/if}
    </div>
  </div>

  {#if runtimeHint}
    <p class="text-[10px] font-bold text-on-surface-variant">{runtimeHint}</p>
  {/if}

  {#if bootError}
    <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-700">{bootError}</div>
  {/if}

  <div class="daily-ide-editor rounded-lg border border-outline-variant/30 overflow-hidden" style={`height: ${height}px;`}>
    <textarea
      bind:this={textareaRef}
      class="fallback-editor"
      value={code}
      oninput={onFallbackInput}
      spellcheck="false"
    ></textarea>
  </div>

  {#if language === 'c'}
    <div class="space-y-1">
      <label for="daily-ide-stdin" class="text-[10px] font-black uppercase tracking-[0.16em] text-on-surface-variant/70">STDIN (optionnel)</label>
      <textarea
        id="daily-ide-stdin"
        rows="2"
        bind:value={stdin}
        placeholder="Entree standard pour scanf / cin"
        class="w-full rounded-lg border border-outline-variant/30 bg-surface px-3 py-2 text-xs font-mono text-on-surface"
      ></textarea>
    </div>
  {/if}

  <div class="daily-ide-console rounded-lg border border-slate-800 bg-slate-950 p-3">
    <div class="mb-2 flex items-center justify-between">
      <p class="text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">Console</p>
      <p class="text-[10px] font-bold text-slate-400">{consoleLines.length} ligne(s)</p>
    </div>
    <div class="console-scroll" bind:this={consoleRef}>
      {#if consoleLines.length === 0}
        <p class="text-[11px] text-slate-400 font-mono">Aucune sortie pour le moment.</p>
      {:else}
        {#each consoleLines as line}
          <p class={`console-line ${line.kind}`}><span class="time">[{line.time}]</span> {line.text}</p>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .daily-ide-wrapper :global(.CodeMirror) {
    height: 100%;
    font-size: 12px;
    line-height: 1.55;
    font-family: 'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .daily-ide-wrapper :global(.CodeMirror-gutters) {
    border-right: 1px solid rgba(148, 163, 184, 0.2);
  }

  .fallback-editor {
    width: 100%;
    height: 100%;
    border: none;
    resize: none;
    padding: 0.75rem;
    background: #0f172a;
    color: #e2e8f0;
    font-size: 12px;
    line-height: 1.55;
    font-family: 'Fira Code', 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .fallback-editor:focus {
    outline: none;
  }

  .daily-ide-console {
    min-height: 130px;
  }

  .console-scroll {
    max-height: 180px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
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
    color: #94a3b8;
    margin-right: 0.35rem;
  }

  .console-line.info {
    color: #cbd5e1;
  }

  .console-line.stdout {
    color: #e2e8f0;
  }

  .console-line.stderr {
    color: #fbbf24;
  }

  .console-line.error {
    color: #fca5a5;
  }

  .console-line.result {
    color: #6ee7b7;
  }
</style>
