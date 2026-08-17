# experiments/

Throwaway spikes. **Nothing here is platform code**, nothing here is imported by
a service, and nothing here is covered by `npm run check` or `build` (this
folder is not a workspace). Each spike exists to test one claim and is safe to
delete.

| spike | claim tested | result |
|---|---|---|
| `add-component/` | a no-capability component is substrate-interchangeable between TS and wasm | agree bit-for-bit; dispatcher can't tell them apart |
| `file-tool-component/` | a capability-needing component is safer as wasm: authority = import, grant is host-mediated and pathguard-scoped | no-import → can't instantiate; escaping/blocked paths → wasm traps |

See `docs/proposals/wasm-runtime.md` for what these are evidence *for*, and
what they do not prove (ergonomics past scalars).
