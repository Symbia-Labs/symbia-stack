import fs from 'node:fs';
import { generateIdentity } from '@symbia/crypto';
import { retrieve } from '@symbia/lineage';
const url = process.argv[2];
const out = process.argv[3] || '/tmp/obs/content.bin';
const id = generateIdentity();
const ledger = fs.createWriteStream('/tmp/obs/lineage.jsonl');
const body = fs.createWriteStream(out);
const r = await retrieve({
  url, identity: id, level: 'self-attested',
  sink: (l) => ledger.write(l),
  onData: (c) => body.write(c),
});
ledger.end(); body.end();
console.log(JSON.stringify({ id: r.observation_id, status: r.source.status,
  final: r.source.url_final, redirects: r.source.redirects.length,
  bytes: r.bytes, chunks: r.chunks, complete: r.complete,
  tls_subject: r.source.tls?.subject, tls_issuer: r.source.tls?.issuer }, null, 2));
