/**
 * Serve the built app.
 *
 * Two responsibilities: hand out dist/, and fall back to index.html for
 * client-side routes so a deep link survives a page reload.
 *
 * The fallback is load-bearing rather than cosmetic. The console's panel routes
 * (/overview, /network, /logs, /chat, …) were added under marker
 * SYMBIA_MARKER_C5_DEEPLINK_20260805 specifically so views would be linkable.
 * Vite's dev server did this fallback implicitly, which meant nobody had to
 * think about it; without it here, every one of those URLs 404s on reload and
 * the deep-linking work silently stops working in the only environment that
 * ships.
 */
import express, { type Express, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Requests that must 404 rather than fall through to index.html. */
function isAssetRequest(url: string): boolean {
  return (
    url.startsWith('/svc/') ||
    url.startsWith('/vendor/') ||
    url.startsWith('/health') ||
    path.extname(url) !== ''
  );
}

export function mountStatic(app: Express, distDir: string): void {
  if (!existsSync(path.join(distDir, 'index.html'))) {
    // Refuse to start rather than serve 404s that look like a routing bug.
    // "Not built" and "built but broken" are different states and should not
    // present identically.
    throw new Error(
      `No index.html in ${distDir}. Run \`npm run build\` in symbia-control-center first.`
    );
  }

  // Hashed assets could be immutable, but nothing is content-hashed yet, so
  // no-cache is the honest header. A stale bundle impersonating a fix has cost
  // this project several hours already.
  app.use(
    express.static(distDir, {
      index: false,
      etag: true,
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
    })
  );

  app.get(/.*/, (req: Request, res: Response, next) => {
    if (isAssetRequest(req.url)) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}
