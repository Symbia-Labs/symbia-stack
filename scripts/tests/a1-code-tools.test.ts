/**
 * A1 regression: code-tool confinement (docs/2026-08-13-adversarial-analysis.md).
 * Run from repo root: `npm run test:security:a1` (cwd must be assistants/ for
 * module resolution — the npm script handles that).
 *
 * Covers: caller-supplied rootPath ignored, no permission escalation,
 * traversal/symlink/sibling-prefix escapes rejected, blockedPaths enforced
 * (including grep recursion), and that the removed bash tool is unavailable.
 */
import { CodeToolInvokeHandler, WorkspaceCreateHandler } from '../../assistants/server/src/engine/actions/code-tool-invoke.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const ctx = { conversationId: 'test-conv', context: {} } as never;
let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, JSON.stringify(detail) ?? ''); }
}

async function main() {
  const create = new WorkspaceCreateHandler();
  const invoke = new CodeToolInvokeHandler();

  // 1. Malicious create: rootPath '/', execute true, blockedPaths cleared
  const r1 = await create.execute({ params: { rootPath: '/', permissions: { blockedPaths: [] } } } as never, ctx) as { success: boolean; output: { workspaceId: string; rootPath: string; permissions: { blockedPaths: string[] } } };
  check('create succeeds', r1.success === true, r1);
  const ws = r1.output;
  check('rootPath not caller-controlled', ws.rootPath !== '/' && ws.rootPath.includes('symbia-workspaces'), ws.rootPath);
  check('no execute permission exists', !('execute' in ws.permissions), ws.permissions);
  check('default blockedPaths preserved', ws.permissions.blockedPaths.includes('**/.env*'), ws.permissions.blockedPaths);

  const wsId = ws.workspaceId;
  const run = async (tool: string, params: Record<string, unknown>) =>
    await invoke.execute({ params: { tool, params, workspaceId: wsId } } as never, ctx) as { success: boolean; error?: string; output?: { result: { content?: string; matches?: unknown[] } } };

  // 2. Traversal escape
  const r2 = await run('file-read', { path: '../../../../etc/passwd' });
  check('read traversal blocked', r2.success === false && /escapes/.test(r2.error ?? ''), r2);

  // 3. Blocked path write (.env at workspace root)
  const r3 = await run('file-write', { path: '.env', content: 'x' });
  check('.env write blocked', r3.success === false && /blocked/.test(r3.error ?? ''), r3);

  // 4. Normal write + read work
  const r4 = await run('file-write', { path: 'hello.txt', content: 'hi' });
  check('normal write ok', r4.success === true, r4);
  const r5 = await run('file-read', { path: 'hello.txt' });
  check('normal read ok', r5.success === true && r5.output?.result.content === 'hi', r5);

  // 5. Symlink escape
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
  await fs.writeFile(path.join(outside, 'secret.txt'), 'SECRET');
  await fs.symlink(outside, path.join(ws.rootPath, 'link'));
  const r6 = await run('file-read', { path: 'link/secret.txt' });
  check('symlink escape blocked', r6.success === false && /escapes/.test(r6.error ?? ''), r6);

  // 6. Sibling-prefix escape (root /tmp/foo vs /tmp/foo-evil)
  const sibling = ws.rootPath + '-evil';
  await fs.mkdir(sibling, { recursive: true });
  await fs.writeFile(path.join(sibling, 'x.txt'), 'EVIL');
  const r7 = await run('file-read', { path: '../' + path.basename(sibling) + '/x.txt' });
  check('sibling-prefix escape blocked', r7.success === false, r7);

  // 7. Bash tool removed — invoking it is an unknown tool
  const r8 = await run('bash', { command: 'id' });
  check('bash tool removed', r8.success === false && /unknown tool/i.test(r8.error ?? ''), r8);

  // 8. grep skips blocked files
  await fs.mkdir(path.join(ws.rootPath, 'secrets'), { recursive: true });
  await fs.writeFile(path.join(ws.rootPath, 'secrets', 'k.txt'), 'TOPSECRET');
  const r9 = await run('grep', { pattern: 'TOPSECRET' });
  check('grep skips blocked dirs', r9.success === true && r9.output?.result.matches?.length === 0, r9?.output?.result);

  console.log(`\nA1: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
