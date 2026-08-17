# Repo separation audit — symbia-stack and Symbia Imagine

Measured 16 Aug 2026 on `fix/2026-08-06-api-gaps` at `312f036`. Requested by
Brian: confirm symbia-stack is up to date, and confirm the boundary between the
public repo and the private Imagine repo. No files were moved. The one change
made is recorded in §7.

## 1. What was measured

All counts come from `git ls-files` and `git grep` against the working copy at
`312f036`, not from reading the directory tree. Byte counts are `wc -c` on the
checked-out files.

## 2. Sync state

| ref | commit |
|---|---|
| local `HEAD` | `312f036` |
| `origin/fix/2026-08-06-api-gaps` | `312f036` |
| `sidecar/fix/2026-08-06-api-gaps` | `c001a03` |
| `origin/main` | `0f65842` |
| `sidecar/main` | `5d94452` |

The working branch is level with `origin`. It is 2 commits ahead of `sidecar`
(`8541bde`, `312f036`). `HEAD` is 144 commits ahead of `origin/main` and
`origin/main` carries 2 commits that are not on `HEAD`.

Working tree is clean apart from untracked `.plugin-build/` (3.4 MB of plugin
packaging output, not gitignored).

Until this audit, the branch's upstream was `sidecar`, not `origin`. A bare
`git push` on this branch pushed the whole symbia-stack repository to
`Symbia-Labs/sidecar`.

Secrets: `.env`, `.env.fresh`, `.mcp.json`, and `.identity/` are gitignored and
untracked. `.ec2-last-sync` is tracked and contains one commit sha.

Not established: the GitHub visibility of either repo. `api.github.com` returned
an empty body for `Symbia-Labs/symbia-stack` and for the org listing, which does
not distinguish "private" from "request blocked." Every statement below about
what is public is conditional on that being confirmed.

## 3. Where Imagine currently lives

There is no separate Imagine repository in this checkout. Imagine is four
directories inside symbia-stack:

| path | tracked files |
|---|---|
| `plugin/symbia-imagine/` | 58 |
| `experiments/imagine-usecase|import|security/` | 39 |
| `imagine/` | 35 |
| `docs/*imagine*.md` | 3 |

44 of the 404 commits on this branch touch that set.

`imagine/` is the sidecar's development home. `sidecar.mjs`,
`host.mjs`, `shim.mjs`, and `session-ledger.mjs` are byte-identical between
`imagine/` and `plugin/symbia-imagine/sidecar/`. Both copies are
tracked.

## 4. The declared boundary contradicts the file layout

`plugin/symbia-imagine/.claude-plugin/plugin.json` declares:

```json
"homepage":   "https://github.com/Symbia-Labs/sidecar",
"repository": "https://github.com/Symbia-Labs/sidecar",
"license":    "UNLICENSED"
```

The repository root `LICENSE` is MIT, `Copyright (c) 2026 Symbia Labs`.

An UNLICENSED plugin naming a different repository as its origin sits inside an
MIT-licensed repository. The `sidecar` remote that the plugin names is
configured here and holds the same three branch names as `origin`. The two
remotes hold the same repository content, pushed twice.

The boundary is currently enforced by which remote name is typed at push time.

## 5. What extraction would cost

`plugin/symbia-imagine/services/*.mjs` is 1,812,825 bytes across ten files. Each
is an esbuild bundle of a platform service, produced by
`imagine/01-bundle-routes.sh` from `../../<svc>/server/src/`.

`plugin/symbia-imagine/sidecar/vendor-libs.sh` copies 14 `@symbia/*` libraries
out of `<repo>/node_modules/@symbia/<name>` — workspace symlinks that resolve to
`<repo>/symbia-<name>/dist`. Its own comment states this "works on a machine
with a symbia-stack checkout and nowhere else."

Two consequences follow.

The plugin directory is a build output of symbia-stack, not independent source.
A private `symbia-imagine` repository containing this tree could not rebuild
itself; producing a new plugin version would require a symbia-stack checkout
adjacent to it, and the build step would cross the repo boundary each time.

The plugin already ships the platform in compiled form. If symbia-stack is
public, those 1.8 MB add no secret and the private repo protects only the
sidecar layer — `sidecar.mjs`, `session-ledger.mjs`, `host.mjs`, `shim.mjs`, and
the three skills. If symbia-stack is private, the question of what the public
repo contains has not been answered anywhere in this checkout.

No `package.json` script, and no workflow in `.github/`, references
`plugin/symbia-imagine` or `.plugin-build`. The packaging step is run by hand.

## 6. Platform references to Imagine

`git grep -i imagine` outside the four Imagine directories returns 18 tracked
files. Seventeen are comments and documentation: catalog routes, catalog service,
catalog schema, directory routes, identity service, models routes, and runtime
index each cite a measurement taken in the sidecar as the reason a line exists.
Removing Imagine from the repo would leave those comments referring to something
no longer present. It would not change behaviour.

One is executable coupling. `symbia-mcp-server/src/index.ts:98` sends an
`x-imagine-token` header when `HOST_TOKEN` is set, and the tool description at
line 652 describes the response carrying an operating mode. The MCP server ships
in symbia-stack and knows about the Imagine host's auth scheme.

## 7. Change made

The working branch upstream was repointed from
`sidecar/fix/2026-08-06-api-gaps` to `origin/fix/2026-08-06-api-gaps`, so a bare
`git push` now targets symbia-stack.

The push itself was not run. The audit environment has no git credential helper
and https fetch and push to GitHub both fail there. The local ref for `origin`
already equalled `HEAD`, so there was nothing pending at last fetch; confirm
with `git fetch origin && git status` from a terminal that can authenticate.

`sidecar` was left 2 commits behind on purpose. Pushing to it before the boundary
is decided would publish two more commits of the whole platform into the repo
the plugin names as its own.

## 8. Decisions this audit does not make

Whether Imagine moves to its own repository, and whether history moves with it,
was deferred pending this inventory. Two facts bear on it that were not known
before: the plugin tree is a build artifact rather than source (§5), and the
license and repository metadata already claim a separation the file layout does
not implement (§4).

Whether `imagine/` is the source of record and
`plugin/symbia-imagine/sidecar/` the copy, or the reverse, was not determined.
The four files are identical today, so nothing distinguishes them by content.
