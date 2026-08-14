# Proposal: lift the MCP-Wallet credential model into Identity

*14 Aug 2026. Reviews Identity's credential/auth handling against `~/Repos/mcp-wallet`
(`wallet-core`), and proposes which of the wallet's proven mechanisms to lift into
Identity. Motivated by two things that keep biting: the recurring "credentials
confusion" (the A2 vault-key saga, the Anthropic key round-trip, org-wide vs
personal) and the `symbia-mcp-server` auth leftover that makes a Claude
Desktop / Cowork quickstart brittle.*

---

## 1. Identity today — what it actually does

**Vault** (`@symbia/crypto/src/vault.ts`, used by `identity/server/src/routes.ts`):

- **One service-wide key.** Every user's/org's credential is encrypted under a
  single `CREDENTIAL_ENCRYPTION_KEY`, HKDF-SHA256 → 32-byte AES key, AES-256-GCM.
  Compromise of that one env value exposes **every** stored credential in the
  deployment. (Pre-A2 it was worse — a hardcoded fallback; A2 fixed the fallback
  and added HKDF + legacy migration, but the *single-key* shape remains.)
- **Plaintext egress.** `GET /api/internal/credentials/:principal/:provider`
  decrypts and **returns the raw provider key** to the Integrations service,
  which then calls the provider. The secret leaves the vault in cleartext on
  every model call. `isProxy` today only means "org-wide key, not your own"
  (`routes.ts:3318`) — it is a *usage-tracking* flag, not an isolation boundary.
- **No per-principal key material.** There is no user-derived or per-org data
  key; scoping is entirely RLS + application checks, not cryptographic.

**Auth for machine clients** (`symbia-mcp-server/src/index.ts`):

- Logs in with `SYMBIA_EMAIL` / `SYMBIA_PASSWORD` (default `gap-probe@symbia.test`),
  holds the JWT, sends `Bearer`. Password lives in env/config; the probe account
  must be seeded and kept in sync; it is a plain org member, so with RLS it is
  **walled out of system-org telemetry** (why `query_logs` returns empty).

These three — one key for everyone, plaintext egress, password-in-config — are
the root of the confusion. None is a small bug; together they are a model.

## 2. What the wallet already solved (and how)

`mcp-wallet/crates/wallet-core`:

| Concern | Wallet mechanism | File |
|---|---|---|
| Key derivation | **Argon2id** (memory-hard) from a password + stored salt | `crypto/key_derivation.rs` |
| Cipher | AES-256-GCM, random nonce, `EncryptedData{iv,ct+tag}` | `crypto/encryption.rs` |
| Secret hygiene | `MasterKey` / `SecretString`, **zeroize on drop** | `crypto/secure_memory.rs` |
| Machine access **without a password** | **Session token** — a random 32-byte token that *wraps the master key* (envelope); expiring, revocable, cleared on lock | `session.rs` |
| At-rest + hardware backing | Encrypted file + **OS keychain** (Keychain/DPAPI/Secret Service) | `storage/keychain.rs`, `storage/encrypted_file.rs` |
| Zero-knowledge | The key is **never returned**; the wallet holds it and proxies the call | `credential/manager.rs`, INTENT.md |

The session model is the key idea: `token → decrypts master key → decrypts
credential`. The process that talks to the AI holds a **token**, never the
password, and locking the wallet makes every issued token dead.

## 3. What to lift — ranked, each tied to a problem it fixes

### L1 — Envelope keys: a wrapped master key instead of one flat service key  *(fixes: single-point compromise; the A2 "one key for everyone")*
Adopt the wallet's envelope shape server-side: a random **data-encryption key
(DEK)** encrypts a credential; the DEK is **wrapped** by a key-encryption key
(KEK). Scope the KEK per-org (derived from the org id + the service master via
Argon2id/HKDF) so one org's credentials cannot be decrypted with another org's
KEK, and rotating a KEK re-wraps only DEKs, never touches ciphertext. This is
the cryptographic backstop RLS currently stands in for alone.
Effort: **medium**. Risk: medium (migration — see §5).

### L2 — Session tokens for machine clients  *(fixes: the `symbia-mcp-server` password leftover; quickstart brittleness)*
Port `session.rs` to Identity: `POST /api/auth/session` (authenticated once)
mints a random opaque token that server-side unwraps a scoped, short-lived
capability — expiry + `session_id` for revocation, exactly the wallet's fields.
`symbia-mcp-server` (and Cowork/Claude Desktop configs) then carry a **token, not
`SYMBIA_PASSWORD`**. This is also the natural home for the observability grant:
mint the probe session with `cap:telemetry.global-read` so log tools work
out of the box (the capability + RLS bypass already exist in `symbia-db/rls.ts`).
Effort: **small-medium**. Risk: low (additive; email/password stays as a
dev-only fallback).

### L3 — Argon2id for key derivation  *(fixes: weak KDF from a dev-string env)*
Replace/augment the vault's HKDF-from-`CREDENTIAL_ENCRYPTION_KEY` with **Argon2id**
(`@node-rs/argon2`) + a stored per-deployment salt, mirroring
`key_derivation.rs`. Memory-hard derivation makes a leaked env value far less
useful. Slots cleanly under L1 as the KEK derivation.
Effort: **small**. Risk: low.

### L4 — Zero-knowledge egress: stop returning plaintext keys  *(fixes: secret leaves the vault on every call; the Anthropic round-trip)*
The deepest and highest-value: follow the wallet's "never hand out the key"
rule. Instead of `/internal/credentials` returning the raw provider key,
Integrations asks Identity (or a small vault-proxy) to **perform or sign the
provider request**, or issues a **single-use scoped token**. The provider key
never leaves the vault process. This is what `isProxy` should have meant.
Effort: **large**. Risk: medium (touches the Integrations provider adapters).
Recommend as a phase 2 once L1–L3 land.

### L5 — Secret hygiene types  *(fixes: accidental secret logging)*
Adopt a `SecretString` discipline in TS (a wrapper whose `toString`/JSON is
redacted, cleared after use). Node can't zeroize like Rust, but the wrapper
stops the accidental `console.log(key)` class. Complements the new
`@symbia/redact` lib already in the tree.
Effort: **small**. Risk: low.

### Not lifted
- **OS keychain backing** (`storage/keychain.rs`) is a *desktop* concern. A
  headless multi-tenant server has no user keychain; the server master key
  belongs in a KMS/HSM/`Secrets Manager`, not Keychain. Keychain stays in the
  wallet app (and in a future desktop control-plane if one holds the master key).

## 4. Recommended sequence

1. **L3 + L2** first — Argon2id KEK derivation and session tokens. Small, additive,
   and L2 immediately de-brittles the MCP quickstart *and* fixes the telemetry
   blindness (probe session carries `cap:telemetry.global-read`).
2. **L1** — envelope DEK/KEK with per-org KEKs, with a migration that re-wraps
   existing `v2:` ciphertext (read old → decrypt → write DEK-wrapped).
3. **L4** — zero-knowledge egress, once the envelope exists to build on.
4. **L5** — fold the `SecretString` type in as the above land.

## 5. Migration & compatibility

- Ciphertexts stay versioned (the A2 `v2:` prefix already exists). Add `v3:` for
  DEK-wrapped values; `decryptSecret` reads v3 → v2 → legacy, same ladder it
  reads today. No flag day.
- L2 is purely additive: sessions are a new endpoint; nothing existing breaks.
- The Anthropic incident earlier today is the worked example: with L4, that key
  would never have transited Integrations in cleartext, and with L2 the MCP
  probe would have observed the failure in logs instead of coming up empty.

## 6. Honest caveats

- This is a real crypto-model change; L1/L4 want a review by someone other than
  the author before shipping. The proposal is the *design*, not a license to
  refactor the vault unreviewed.
- Argon2id parameters (m/t/p cost) must be chosen for a *server* (throughput)
  not a desktop (one unlock); do not copy the wallet's costs blindly.
- None of this removes RLS; it makes RLS the *second* line, not the only one.

## 7. WASM trajectory — build TS behind an interface, swap in `wallet-core` later

The honest weakness of a pure-TS implementation is memory zeroization (§3, L5):
Node cannot wipe a `string`. The eventual answer is not "try harder in TS" — it
is **WASM**. `wallet-core` is already Rust with `zeroize`; `wasm-pack` compiles
it to a module that runs the *same audited crypto* in the browser, in Node, and
in the desktop app — one core instead of three parallel implementations — and
brings the zeroization guarantee back for free. This also converges with the two
other WASM threads already on the board: the A1 code-execution sandbox and the
component-runtime proposal. Crypto core, sandbox, and runtime all want the same
Rust→WASM substrate.

**So the near-term TS work is not throwaway — provided it is built behind a
seam.** Define L2/L3 as one small, stable interface:

```
interface CredentialCrypto {
  deriveKek(secret, salt, params): Promise<Key>;   // Argon2id/scrypt now → wasm later
  wrap(dek, kek): Bytes;  unwrap(wrapped, kek): Bytes;   // envelope
  createSession(masterKey, ttl): Session;               // session.rs, ported
  resolveSession(session, token): MasterKey;
}
```

Implement it once in `@symbia/crypto` with native `node:crypto` today. When the
`wallet-core`→WASM module lands, it implements the *same* interface and the swap
is a wiring change, not a rewrite — and the zeroize gap disappears with it.

**The trap to avoid is the opposite of a seam:** scattering `createCipheriv`
calls inline across Identity again is exactly how the vault reached the A2 mess.
One interface, one implementation to swap. Designing for the WASM swap from day
one costs almost nothing and is the difference between "TS now, WASM later" being
a drop-in versus a second migration.

Non-goal: this does not commit us to WASM now. It commits us to *not painting
ourselves out of it* — the interface is the whole ask.
