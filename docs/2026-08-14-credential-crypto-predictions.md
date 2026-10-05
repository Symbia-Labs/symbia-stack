# CredentialCrypto — predictions (MAP)

*Registered before measuring. Covers `@symbia/crypto/src/credential-crypto.ts`
(L1/L2/L3 of the wallet-lift proposal). Test: `npm run test:security:credcrypto`.*

## deriveKek (KEK derivation, scrypt)

| # | prediction |
|---|---|
| K1 | Deterministic: same secret+salt+params ⇒ identical 32-byte key |
| K2 | Different salt ⇒ different key |
| K3 | Output is exactly 32 bytes |
| K4 | `generateSalt()` returns distinct values across calls |

## wrap / unwrap (envelope DEK↔KEK)

| # | prediction |
|---|---|
| W1 | `unwrap(wrap(dek, kek), kek)` equals `dek` (round-trip) |
| W2 | `unwrap` with a wrong KEK throws (GCM auth) |
| W3 | Tampered wrapped ciphertext throws |
| W4 | `generateDek()` returns 32 random bytes, distinct across calls |

## Session (envelope token wraps master key)

| # | prediction |
|---|---|
| S1 | `resolveSession(session, token)` returns the original master key |
| S2 | Wrong token ⇒ throws (rejected before/at GCM) |
| S3 | Expired session ⇒ throws |
| S4 | The stored session record does **not** contain the raw token (only a hash) |
| S5 | `tokenHash === sha256(token)` |
| S6 | Two `createSession` calls ⇒ different tokens and sessionIds |
| S7 | A tampered `encryptedMasterKey` ⇒ throws even with the right token |

## SecretString

| # | prediction |
|---|---|
| SS1 | `toString()` and `toJSON()` return `"[secret]"` (redacted) |
| SS2 | `use(fn)` passes the real plaintext to `fn` |
| SS3 | `destroy()` zeroes the backing buffer |

## Non-goals (stated up front)

- True memory zeroization is out of reach in Node (proposal §3/§7); SS3 checks
  the buffer is filled, not that no GC copy survives.
- This does not change the at-rest format of existing credentials (that is the
  reviewed L1-full migration); it adds the primitives behind the interface.

---

## Measured (14 Aug 2026)

**19/19 held on first measurement** — K1–K4, W1–W4, S1–S7, SS1–SS3 all as
registered, no broken predictions. Test: `npm run test:security:credcrypto`
(and wired into `npm run test:security`). Verified natively with
`node --experimental-strip-types` (the repo's `tsx`/esbuild binary was
platform-mismatched locally; CI's `npm ci` restores it).
