const DEFAULT_EXTERNAL_TIMEOUT_MS = 8_000;

/**
 * Fetch borné pour les API et médias externes. Un fournisseur indisponible ne
 * doit jamais immobiliser une route dashboard ou un worker indéfiniment.
 */
export function fetchExternal(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
