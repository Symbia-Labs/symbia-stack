/**
 * Path Validator — now a re-export of @symbia/pathguard.
 *
 * Consolidated 13 Aug 2026: this file held the original (correct) validator,
 * the assistants engine grew a second copy without the checks, and the A1
 * hardening briefly added a third. One security concern, one implementation:
 * the logic lives in @symbia/pathguard now. This shim keeps runtime's import
 * paths stable; do not add logic here.
 *
 * Note one merged behavior fix: `**` with a leading `**\/` now also matches
 * zero segments, so `**\/.env*` blocks a root-level `.env` (the old copy
 * required at least one directory segment and let root-level files through).
 */

export {
  resolveSafePath,
  getRelativePath,
  isPathBlocked,
  isPathAllowed,
  matchGlob,
  validatePath,
  resolveConfinedPath,
  type PathPolicy,
  type PathValidationResult,
} from '@symbia/pathguard';
