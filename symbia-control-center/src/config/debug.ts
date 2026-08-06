/**
 * Debug logging switch.
 *
 * This replaces 44 occurrences of `import.meta.env.DEV` across 10 files.
 *
 * That flag was not merely removed with Vite — it was actively wrong. Measured
 * in the running page it evaluated FALSE even under `npm run dev`, because
 * NODE_ENV leaked in from the shell environment. Code that gated a URL choice
 * on it took the production branch while a developer watched it fail, and the
 * same defect was fixed in config/services.ts and then found unfixed in
 * config/endpoints.ts hours later.
 *
 * The replacement is deliberately NOT a build-time constant. A build flag can
 * disagree with the environment it runs in, which is the entire failure above.
 * This is read from the URL, so it is decided by the page you are actually
 * looking at, and can be turned on in a deployed console without a rebuild:
 *
 *     http://localhost:8000/logs?debug
 *
 * Nothing about application behaviour may depend on this. It gates console
 * output and nothing else. If a branch needs to know where it is running, it
 * must ask a service — see App.tsx, which asks identity whether login is
 * disabled rather than reading a flag that claims to know.
 */
export const DEBUG =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debug');

/** Console logging that is off unless ?debug is in the URL. */
export const debugLog = (...args: unknown[]): void => {
  if (DEBUG) console.log(...args);
};
