// Global Window augmentations used by DailyAlgoMiniIDE.svelte
// Declare these here so `declare global {}` is always at module top-level.

export {};

type JSCPPGlobal = {
  run: (code: string, input?: string, config?: { stdio?: { write?: (chunk: string) => void } }) => unknown;
};

type PyodideInstance = {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout?: (cfg: { batched: (text: string) => void }) => void;
  setStderr?: (cfg: { batched: (text: string) => void }) => void;
};

type TypeScriptCompiler = {
  ModuleKind: { ES2020: number };
  ScriptTarget: { ES2020: number };
  transpileModule: (
    sourceText: string,
    transpileOptions?: {
      compilerOptions?: {
        module?: number;
        target?: number;
        strict?: boolean;
        sourceMap?: boolean;
      };
      reportDiagnostics?: boolean;
    },
  ) => {
    outputText: string;
    diagnostics?: Array<{ messageText: string | { messageText: string } }>;
  };
  flattenDiagnosticMessageText: (messageText: unknown, newLine: string) => string;
};

type FengariGlobal = {
  load: (source: string, chunkName?: string) => () => unknown;
};

type SqlJsDatabase = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  close: () => void;
};

type SqlJsModule = {
  Database: new () => SqlJsDatabase;
};

declare global {
  interface Window {
    JSCPP?: JSCPPGlobal;
    ts?: TypeScriptCompiler;
    fengari?: FengariGlobal;
    initSqlJs?: (options: { locateFile: (file: string) => string }) => Promise<SqlJsModule>;
    loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideInstance>;
    __kotboPyodidePromise?: Promise<PyodideInstance>;
    __kotboSqlJsPromise?: Promise<SqlJsModule>;
    __kotboLuaPrint?: (message: string) => void;
    MonacoEnvironment?: {
      getWorker?: (_moduleId: string, label: string) => Worker;
    };
  }
}
