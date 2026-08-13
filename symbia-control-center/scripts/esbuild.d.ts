/**
 * Minimal esbuild declarations for the build scripts.
 *
 * Why this exists (13 Aug 2026): no `esbuild` package is installed anywhere
 * in this tree — only the platform binaries (`@esbuild/...`) are on disk, so
 * TypeScript has no types to resolve and `npm run check` failed on the
 * scripts. This shim types exactly the surface build.ts and
 * check-reachability.ts use. If a real `esbuild` install lands, delete this
 * file; the real types win.
 */
declare module 'esbuild' {
  export interface OnResolveArgs {
    path: string;
    importer: string;
    resolveDir: string;
    kind: string;
  }

  export interface PluginBuild {
    onResolve(
      options: { filter: RegExp; namespace?: string },
      callback: (args: OnResolveArgs) => { path?: string; external?: boolean; namespace?: string } | null | undefined
    ): void;
    onLoad(
      options: { filter: RegExp; namespace?: string },
      callback: (args: OnResolveArgs) => { contents?: string; loader?: string } | null | undefined
    ): void;
  }

  export interface Plugin {
    name: string;
    setup(build: PluginBuild): void | Promise<void>;
  }

  export interface BuildOptions {
    entryPoints?: string[] | Record<string, string>;
    bundle?: boolean;
    outfile?: string;
    outdir?: string;
    format?: string;
    platform?: string;
    target?: string | string[];
    sourcemap?: boolean | string;
    minify?: boolean;
    metafile?: boolean;
    define?: Record<string, string>;
    loader?: Record<string, string>;
    plugins?: Plugin[];
    external?: string[];
    logLevel?: string;
    jsx?: string;
    [key: string]: unknown;
  }

  export interface Metafile {
    inputs: Record<string, { bytes: number; imports: Array<{ path: string }> }>;
    outputs: Record<string, unknown>;
  }

  export interface BuildResult {
    errors: unknown[];
    warnings: unknown[];
    metafile?: Metafile;
    [key: string]: unknown;
  }

  export function build(options: BuildOptions): Promise<BuildResult>;
}
