;; A file-reading component, as a core WebAssembly module (text form).
;;
;; The whole security argument is in the first line: this module IMPORTS
;; `host.read_byte`. That import is the ONLY way it can reach the outside
;; world — it has no syscalls, no ambient filesystem, nothing. If the host
;; doesn't wire that import, the module cannot even instantiate. The capability
;; is not "checked and denied" — without the grant it does not exist.
;;
;; Contrast the TS code-tool: there, "no filesystem" is something pathguard
;; ENFORCES on every call. Here, "no filesystem" is the DEFAULT, and a scoped
;; grant is the exception the host chooses to make.
(module
  (import "host" "read_byte" (func $read (param i32 i32) (result i32)))

  ;; checksum4(slot) = (byte0 + byte1 + byte2 + byte3) & 0xFF
  ;; Four mediated reads through the granted capability, then pure arithmetic.
  (func (export "checksum4") (param $slot i32) (result i32)
    local.get $slot i32.const 0 call $read
    local.get $slot i32.const 1 call $read i32.add
    local.get $slot i32.const 2 call $read i32.add
    local.get $slot i32.const 3 call $read i32.add
    i32.const 255 i32.and))
