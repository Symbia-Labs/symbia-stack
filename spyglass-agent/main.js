/**
 * Native spyglass — Electron main.
 *
 * A transparent, always-on-top, full-desktop aperture that floats over ANY
 * application — the ring drags over other apps and captures the real pixels
 * under it, the one thing a web page cannot do.
 *
 * The window is click-through by default (setIgnoreMouseEvents), so it behaves
 * like a loupe hovering over your work; the renderer flips it interactive only
 * while the cursor is over the ring or toolbar. Every capture is hashed, so
 * even standalone the frame carries a receipt — provenance from the first byte.
 *
 * Later milestones join this process to the Symbia mesh and push the frame down
 * the vision path. Where pixels may go (the pixel-gap) is enforced there, not
 * at capture.
 */
const { app, BrowserWindow, ipcMain, desktopCapturer, screen, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

let overlay = null;

function createOverlay() {
  const primary = screen.getPrimaryDisplay();
  const { x, y, width, height } = primary.bounds;

  overlay = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Click-through by default so the desktop underneath stays fully usable while
  // the loupe floats. `forward:true` keeps mousemove flowing to the renderer,
  // which flips the window interactive ONLY while the cursor is over the ring or
  // HUD — so you can grab the ring, and click straight through everywhere else.
  overlay.setIgnoreMouseEvents(true, { forward: true });
  // There is no on-screen chrome, so the renderer's account of what it did is
  // the only running record. Forward it to stdout rather than leaving it in a
  // devtools window nobody has open.
  overlay.webContents.on('console-message', (_e, _level, message) => {
    console.log(message);
  });
  overlay.loadFile('overlay.html');
}

ipcMain.on('interactive', (_evt, yes) => {
  if (overlay) overlay.setIgnoreMouseEvents(!yes, { forward: true });
});

ipcMain.handle('screen-source', async () => {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 0, height: 0 },
  });
  const match =
    sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];
  return {
    sourceId: match?.id ?? null,
    width: primary.size.width,
    height: primary.size.height,
    scaleFactor: primary.scaleFactor,
  };
});

// Save + hash the frame. The digest is the receipt: the exact bytes captured,
// committed to, before anything downstream ever looks at them.
ipcMain.handle('save-frame', async (_evt, dataUrl) => {
  const img = nativeImage.createFromDataURL(dataUrl);
  const png = img.toPNG();
  const digest = crypto.createHash('sha256').update(png).digest('hex');
  const dir = path.join(os.tmpdir(), 'symbia-spyglass');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `frame-${digest.slice(0, 12)}.png`);
  fs.writeFileSync(file, png);
  return { file, bytes: png.length, digest };
});

// --- video: scan-and-append ------------------------------------------------
// A clip is not stored to be reconstructed from its ledger; it is stored so it
// can be stamped reliably. Each recorder segment is hashed as it arrives and
// chained to its parent — chain(n) = sha256(chain(n-1) || digest(n)) — so the
// head commits to every byte in order. Altering, dropping or reordering any
// segment breaks the chain from that point forward, and the break is local:
// the surviving prefix stays verifiable.
//
// The sidecar is GKS Lineage, and it obeys the primitive's rules: append-only,
// strictly ordered, identity-scoped, parent-linked, verifiable by checksum, and
// NON-EPISTEMIC. The payload carries digests, byte counts and geometry — never
// a frame, never a sample. Reading the whole ledger tells you exactly what was
// captured and in what order, and shows you none of it.
//
// JSONL, per the project's dev-persistence constraint.
const clips = new Map();

function lineageLine(ev) {
  // Deterministic key ordering — the serialization must hash the same way
  // everywhere, so key order is fixed here rather than left to the object.
  return JSON.stringify({
    event_id: ev.event_id,
    timestamp: ev.timestamp,
    actor_identity: ev.actor_identity,
    event_type: ev.event_type,
    payload: ev.payload,
    continuity_context: ev.continuity_context,
    parent_links: ev.parent_links,
    checksum: ev.checksum,
    signature: ev.signature ?? null,
  }) + '\n';
}

// Each TRACK carries its own chain, and each track is written to its own file.
// The alternative — one chain over a muxed container — is simpler and useless
// for the thing that matters: with separate chains you can hand someone the
// video and prove the audio belonged to the same capture without handing over
// the audio. The close event binds the track heads together, so the binding is
// checkable by a party who holds only one of them. That is the Observer
// boundary expressed in files rather than in policy.
const TRACK_FILES = { video: 'clip.webm', audio: 'audio.webm' };
const GENESIS = '0'.repeat(64);

// --- instrument identity ---------------------------------------------------
// The chain proves a clip is intact. It says nothing about where the clip came
// from: `actor_identity` derived from a hostname is a claim the app makes about
// itself, and anyone can write that string. A signature is what turns the
// ledger from an assertion into evidence for someone who does not trust the
// process that produced it.
//
// This key identifies the INSTRUMENT, not the operator — the claim is "this
// spyglass captured these bytes in this order", which is what a camera can
// honestly say. An operator, when there is one, belongs in the payload as an
// attribute, not as the signer.
//
// Generated ONCE, on first run, and persisted. A key regenerated each boot
// would make every session a stranger and give up the only thing a local key
// buys: continuity. What it does NOT buy is identity — see ATTESTATION below.
const KEY_DIR = path.join(app.getPath('userData'), 'identity');
const KEY_FILE = path.join(KEY_DIR, 'instrument.key.pem');
const PUB_FILE = path.join(KEY_DIR, 'instrument.pub.pem');
// Identity events live in their own append-only ledger. A clip records the
// level it was captured under; this records when the level changed. Keeping
// them separate is what stops a rotation from being mistaken for a property of
// clips that predate it.
const ID_LEDGER = path.join(KEY_DIR, 'lineage.jsonl');
// Written by scripts/import-genesis.js. Absent = never rotated.
const ANCHOR_FILE = path.join(KEY_DIR, 'genesis.json');
const ANCHOR_PUB = path.join(KEY_DIR, 'genesis.pub.pem');
const CERT_FILE = path.join(KEY_DIR, 'instrument-cert.json');
const CERT_SIG = path.join(KEY_DIR, 'instrument-cert.sig');

// Attestation is three-valued and recorded at capture time. It is never a
// boolean, because "signed" and "trusted" are different claims and collapsing
// them is how a pseudonym gets read as an identity.
//
//   unsigned          no key; the ledger asserts, nothing attests
//   self-attested     locally generated key, no external claim about who
//   attested          key chains to an imported, trusted genesis
//   hardware-attested key that cannot be exported from the machine
//
// Importing a genesis writes a rotation event and must NOT upgrade clips
// already recorded. GKS identity §6: rotation preserves lineage, the old
// identity remains, and no epistemic continuity is implied.
//
// That rule is enforced by arithmetic rather than by remembering to obey it.
// Rotation generates a NEW instrument key and the genesis certifies only that
// one; the old key is retained but was never certified by anybody. So a clip
// signed under self-attestation cannot be upgraded even by a verifier that
// wants to — the genesis simply says nothing about the key that signed it.
let instrument = null;

// Resolved at startup from what is actually on disk and verified, never
// asserted. Absent or invalid certificate ⇒ self-attested.
let ATTESTATION = 'self-attested';
let anchor = null;

function appendIdentityEvent(ev) {
  fs.appendFileSync(ID_LEDGER, lineageLine(ev));
}

// A certificate is only worth the check that was actually run against it. This
// re-verifies on every boot rather than trusting that import-time verification
// happened: the file could have been swapped since.
function loadAttestation(inst) {
  if (!fs.existsSync(CERT_FILE) || !fs.existsSync(CERT_SIG) || !fs.existsSync(ANCHOR_PUB)) return;
  try {
    const certRaw = fs.readFileSync(CERT_FILE);
    const sig = fs.readFileSync(CERT_SIG);
    const genesisKey = crypto.createPublicKey(fs.readFileSync(ANCHOR_PUB));
    if (!crypto.verify(null, certRaw, genesisKey, sig)) {
      console.warn('[spyglass] instrument certificate does not verify against the genesis — staying self-attested');
      return;
    }
    const cert = JSON.parse(certRaw.toString());
    // The certificate must bind THIS key. A certificate for some other
    // instrument would otherwise launder any key into attested.
    if (cert.instrument_public_key.trim() !== inst.publicKeyPem.trim()) {
      console.warn('[spyglass] certificate is for a different instrument key — staying self-attested');
      return;
    }
    anchor = {
      id: cert.genesis_id, epoch: cert.genesis_epoch,
      fingerprint: cert.genesis_fingerprint, issued_at: cert.issued_at,
    };
    ATTESTATION = 'attested';
  } catch (err) {
    console.warn('[spyglass] attestation check failed, staying self-attested: ' + (err && err.message || err));
  }
}

function loadInstrument() {
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  let privateKey, publicKey, fresh = false;
  if (fs.existsSync(KEY_FILE)) {
    privateKey = crypto.createPrivateKey(fs.readFileSync(KEY_FILE));
    publicKey = crypto.createPublicKey(privateKey);
  } else {
    ({ privateKey, publicKey } = crypto.generateKeyPairSync('ed25519'));
    fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync(PUB_FILE, publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o644 });
    fresh = true;
    console.log('[spyglass] generated instrument key (first run) → ' + KEY_FILE);
  }
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  // The instrument id is derived from the public key, so it cannot be claimed
  // by anyone who does not hold the private half.
  const fingerprint = crypto.createHash('sha256').update(spki).digest('hex');
  instrument = {
    privateKey, publicKey,
    fingerprint,
    id: `spyglass:instrument:${fingerprint.slice(0, 16)}`,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString().trim(),
  };
  if (fresh) {
    appendIdentityEvent({
      event_id: `event:identity:${fingerprint.slice(0, 16)}:created`,
      timestamp: new Date().toISOString(),
      actor_identity: instrument.id,
      event_type: 'identity.created',
      payload: { instrument: instrument.id, algorithm: 'ed25519', level: 'self-attested' },
      continuity_context: { instrument: instrument.id },
      parent_links: [],
      checksum: `sha256:${fingerprint}`,
      signature: null,
    });
  }
  loadAttestation(instrument);
  return instrument;
}

// Recursively key-sorted serialization, so the bytes signed depend on the
// event's CONTENT and not on the order a particular JSON library happened to
// write it in. Anyone re-serializing the event reproduces these bytes.
function canonicalize(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

// Sign a digest over the WHOLE event, minus the signature field itself.
//
// This replaces signing the chain value alone, which was a real hole and is
// worth recording rather than quietly correcting: the open event's chain value
// is the constant genesis, Ed25519 is deterministic, so its signature was
// byte-identical for every clip a key ever produced. It attested nothing about
// any particular clip — and because the payload was outside the signed bytes,
// `attestation.level` could be rewritten from self-attested to attested and the
// signature still verified. The one field the whole non-retroactivity design
// rests on was the one nothing was protecting.
//
// Signing the canonical event covers payload, parents and checksum together, so
// it is strictly stronger than what it replaces.
function signEvent(ev) {
  if (!instrument) return null;
  const { signature, ...rest } = ev;
  const digest = crypto.createHash('sha256').update(canonicalize(rest)).digest();
  return 'ed25519:' + crypto.sign(null, digest, instrument.privateKey).toString('base64');
}

function advance(chainHex, digestHex) {
  return crypto.createHash('sha256')
    .update(Buffer.from(chainHex, 'hex'))
    .update(Buffer.from(digestHex, 'hex'))
    .digest('hex');
}

ipcMain.handle('clip-open', async (_evt, meta) => {
  const clipId = crypto.randomBytes(8).toString('hex');
  const dir = path.join(os.tmpdir(), 'symbia-spyglass', `clip-${clipId}`);
  fs.mkdirSync(dir, { recursive: true });
  const clip = {
    clipId,
    dir,
    ledger: path.join(dir, 'lineage.jsonl'),
    actor: instrument.id,
    tracks: new Map(),
    startedAt: Date.now(),
  };
  clip.ledgerFd = fs.openSync(clip.ledger, 'a');

  const declared = (meta?.tracks ?? []).map((t) => {
    const file = path.join(dir, TRACK_FILES[t.id] ?? `${t.id}.webm`);
    clip.tracks.set(t.id, {
      id: t.id, file, fd: fs.openSync(file, 'a'),
      seq: 0, bytes: 0,
      // Genesis: the chain starts from the zero hash, so segment 1 has a parent
      // like every other segment and no segment is a special case.
      chain: GENESIS, lastEventId: null,
    });
    return t;
  });

  const ev = {
    event_id: `event:${clipId}:0`,
    timestamp: new Date().toISOString(),
    actor_identity: clip.actor,
    event_type: 'capture.clip.open',
    payload: {
      clip_id: clipId,
      aperture: meta?.aperture ?? null, // ring geometry in points
      // Each track declares what it is and where it came from. Source bindings
      // are structural — device labels and a salted id hash, never a sample.
      tracks: declared,
      // The verifying key travels with the ledger. On its own this proves only
      // that one holder of one private key produced every event here; what that
      // holder IS depends entirely on `level`, which is why the level is
      // recorded rather than implied.
      attestation: {
        level: ATTESTATION,
        instrument: instrument.id,
        public_key: instrument.publicKeyPem,
        algorithm: 'ed25519',
        // Named so a verifier can tell what a signature here actually covers.
        // v1 signed the chain value alone and left the payload unprotected.
        signature_scheme: 'canonical-event-v2',
        // Present only when a genesis has certified THIS key. Its absence in a
        // clip is not an omission; it is the record that at capture time
        // nothing vouched for the instrument.
        genesis: anchor,
        // Stated in the artifact so it cannot be lost in a UI that renders a
        // signature as a tick.
        means: ATTESTATION === 'attested'
          ? 'Signed by a key that ' + anchor.id + ' certified. Proves these '
            + 'events came from an instrument that genesis vouched for and have '
            + 'not been altered since. Trust is only as good as that genesis '
            + 'and how it was obtained.'
          : 'Signed by a key generated on this machine. Proves these events '
            + 'were produced by one holder of that key and have not been '
            + 'altered since. Does NOT establish which machine, which person, '
            + 'or any external trust.',
      },
    },
    continuity_context: { clip: clipId },
    parent_links: [],
    checksum: `sha256:${GENESIS}`,
  };
  ev.signature = signEvent(ev);
  fs.writeSync(clip.ledgerFd, lineageLine(ev));
  clip.openEventId = ev.event_id;
  for (const t of clip.tracks.values()) t.lastEventId = ev.event_id;
  clips.set(clipId, clip);
  return {
    clipId, dir, ledger: clip.ledger,
    files: Object.fromEntries([...clip.tracks].map(([id, t]) => [id, t.file])),
  };
});

ipcMain.handle('clip-chunk', async (_evt, clipId, trackId, bytes) => {
  const clip = clips.get(clipId);
  if (!clip) throw new Error('unknown clip: ' + clipId);
  const track = clip.tracks.get(trackId);
  if (!track) throw new Error('unknown track: ' + trackId + ' on clip ' + clipId);

  const buf = Buffer.from(bytes);
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  track.chain = advance(track.chain, digest);
  track.seq += 1;
  track.bytes += buf.length;
  fs.writeSync(track.fd, buf);

  const ev = {
    event_id: `event:${clip.clipId}:${trackId}:${track.seq}`,
    timestamp: new Date().toISOString(),
    actor_identity: clip.actor,
    event_type: 'capture.segment',
    payload: {
      clip_id: clip.clipId,
      track: trackId,
      seq: track.seq,
      bytes: buf.length,
      digest: `sha256:${digest}`,
      offset: track.bytes - buf.length,
    },
    continuity_context: { clip: clip.clipId, track: trackId },
    // Parents run within the track: a track is a chain, and the clip is a
    // binding over chains, not one interleaved sequence.
    parent_links: [track.lastEventId],
    checksum: `sha256:${track.chain}`,
  };
  // Every segment is signed, not just the close event. Ed25519 costs tens of
  // microseconds against one segment per second, and signing only at close
  // would leave a clip that died mid-recording entirely unattested — the
  // signature would be weaker than the chain it signs. This way a crashed clip
  // stays attested up to its last written second.
  ev.signature = signEvent(ev);
  fs.writeSync(clip.ledgerFd, lineageLine(ev));
  track.lastEventId = ev.event_id;
  return { track: trackId, seq: track.seq, bytes: buf.length, digest, chain: track.chain };
});

ipcMain.handle('clip-close', async (_evt, clipId) => {
  const clip = clips.get(clipId);
  if (!clip) throw new Error('unknown clip: ' + clipId);
  const durationMs = Date.now() - clip.startedAt;
  const ids = [...clip.tracks.keys()].sort(); // deterministic order for the binding

  const tracks = {};
  for (const id of ids) {
    const t = clip.tracks.get(id);
    tracks[id] = { segments: t.seq, bytes: t.bytes, chain_head: `sha256:${t.chain}` };
  }
  // The binding commits to every track head, in a fixed order. Someone holding
  // one track, its chain, and this value can confirm the other track belonged
  // to the same capture — and still cannot hear or see it.
  const binding = crypto.createHash('sha256');
  for (const id of ids) binding.update(id).update(Buffer.from(clip.tracks.get(id).chain, 'hex'));
  const bindingHex = binding.digest('hex');

  const ev = {
    event_id: `event:${clip.clipId}:close`,
    timestamp: new Date().toISOString(),
    actor_identity: clip.actor,
    event_type: 'capture.clip.close',
    payload: {
      clip_id: clip.clipId,
      duration_ms: durationMs,
      tracks,
      binding: `sha256:${bindingHex}`,
      attestation: { level: ATTESTATION, instrument: instrument.id },
    },
    continuity_context: { clip: clip.clipId },
    parent_links: ids.map((id) => clip.tracks.get(id).lastEventId),
    checksum: `sha256:${bindingHex}`,
  };
  ev.signature = signEvent(ev);
  fs.writeSync(clip.ledgerFd, lineageLine(ev));
  for (const t of clip.tracks.values()) fs.closeSync(t.fd);
  fs.closeSync(clip.ledgerFd);
  clips.delete(clipId);
  return { clipId: clip.clipId, dir: clip.dir, ledger: clip.ledger, durationMs, tracks, binding: bindingHex };
});

ipcMain.on('quit', () => app.quit());

app.whenReady().then(() => {
  const inst = loadInstrument();
  console.log('[spyglass] instrument ' + inst.id + ' (' + ATTESTATION + ')');
  createOverlay();
});
app.on('window-all-closed', () => app.quit());
