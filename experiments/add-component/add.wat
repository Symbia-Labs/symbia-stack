;; The add component, as a core WebAssembly module (text form).
;;
;; f64 in / f64 out, because a Symbia FlowValue number is a JS number, and a
;; JS number *is* an IEEE-754 f64 — so this module and the TypeScript handler
;; compute bit-identical results, no marshalling caveat for the scalar case.
;;
;; This is the whole component: one exported function, no imports. "No imports"
;; is the security story in one line — this module cannot touch the filesystem,
;; the network, the clock, or the environment, because it never asked the host
;; for any of them. Capability = import. It has none.
(module
  (func (export "add") (param f64 f64) (result f64)
    local.get 0
    local.get 1
    f64.add))
